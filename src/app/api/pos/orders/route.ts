import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { canDo, getStaff } from "@/lib/server/auth";
import { getSettings, getTruck } from "@/lib/server/config";
import { ApiError, num, ok, readBody, route, str } from "@/lib/server/http";
import { createOrder, hydrateOrders, priceCart } from "@/lib/server/logic";
import { bhParts, startOfDay } from "@/lib/time";
import type { CartInput, Fulfillment, PayMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

async function authorize(slug: string) {
  const t = await getTruck(slug);
  if (!t) throw new ApiError("not_found", 404);
  const s = await getStaff();
  if (!s) throw new ApiError("unauthorized", 401);
  if (!canDo(s, t.id, "pos")) throw new ApiError("forbidden", 403);
  return { t, s };
}

export const POST = route(async (req: Request) => {
  const b = await readBody(req);
  const { t } = await authorize(str(b.truck, 20));
  const settings = await getSettings();
  const fulfillment: Fulfillment = b.fulfillment === "delivery" ? "delivery" : b.fulfillment === "pickup" ? "pickup" : "dine_in";
  const method: PayMethod = b.paymentMethod === "benefit" ? "benefit" : b.paymentMethod === "card" ? "card" : "cash";
  const address = str(b.address, 300);
  if (fulfillment === "delivery" && address.length < 3) throw new ApiError("address_required");

  const priced = await priceCart({
    truck: t,
    settings,
    cart: (Array.isArray(b.cart) ? b.cart : []) as CartInput[],
    kind: "pos",
    fulfillment,
    regionId: num(b.regionId) || null,
    minutes: null,
  });
  const row = await createOrder({
    truck: t,
    settings,
    kind: "pos",
    guest: { name: str(b.customerName, 80) || "Walk-in", phone: str(b.phone, 30), email: "" },
    fulfillment,
    address: fulfillment === "delivery" ? address : "",
    priced,
    slotLabel: "",
    paymentMethod: method,
    paymentStatus: b.paid === true || method === "card" ? "paid" : "pending",
    notes: str(b.notes, 400),
  });
  const [view] = await hydrateOrders([row], settings);
  return ok({ order: view });
});

export const GET = route(async (req: Request) => {
  const { t } = await authorize(new URL(req.url).searchParams.get("truck") ?? "");
  const settings = await getSettings();
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.truckId, t.id), eq(orders.kind, "pos"), gte(orders.createdAt, startOfDay(bhParts().date))))
    .orderBy(desc(orders.createdAt))
    .limit(20);
  return ok({ orders: await hydrateOrders(rows, settings) });
});
