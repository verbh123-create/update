import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getCustomer } from "@/lib/server/auth";
import { getSettings, getTruck } from "@/lib/server/config";
import { createCharge, gatewayReady } from "@/lib/server/gateway";
import { ApiError, getOrigin, num, ok, readBody, route, str } from "@/lib/server/http";
import { cancelOrder, createOrder, hydrateOrders, openState, priceCart, resolveSlot, slotLabel } from "@/lib/server/logic";
import { bhParts } from "@/lib/time";
import type { CartInput, Fulfillment, PayMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const cleanPhone = (v: unknown) => str(v, 30).replace(/[^\d+]/g, "");

export const POST = route(async (req: Request) => {
  const b = await readBody(req);
  const t = await getTruck(str(b.truck, 20));
  if (!t) throw new ApiError("not_found", 404);
  const settings = await getSettings();
  const dry = b.dryRun === true;
  const customer = b.asGuest ? null : await getCustomer();

  if (!dry) {
    const st = openState(t);
    if (!st.open) throw new ApiError(st.reason === "closed" ? "truck_closed" : st.reason === "holiday" ? "holiday" : "out_of_hours", 403);
  }

  const fulfillment: Fulfillment = b.fulfillment === "delivery" ? "delivery" : "pickup";
  const method: PayMethod = b.paymentMethod === "benefit" ? "benefit" : b.paymentMethod === "card" ? "card" : "cash";
  if (!dry) {
    if ((method === "cash" && !t.payCash) || (method === "benefit" && !t.payBenefit) || (method === "card" && !(t.payCard && gatewayReady(t)))) {
      throw new ApiError("payment_disabled");
    }
  }

  const regionId = num(b.regionId) || null;
  const address = str(b.address, 300);
  let slotText = "";
  if (!dry) {
    if (fulfillment === "delivery" && address.length < 3) throw new ApiError("address_required");
    const slot = resolveSlot(t, str(b.slotId, 20) || undefined, { required: fulfillment === "delivery", today: true });
    slotText = slotLabel(slot);
  }

  const priced = await priceCart({
    truck: t,
    settings,
    cart: (Array.isArray(b.cart) ? b.cart : []) as CartInput[],
    kind: "direct",
    fulfillment: dry && fulfillment === "delivery" && !regionId ? "pickup" : fulfillment,
    regionId,
    couponCode: str(b.coupon, 40) || undefined,
    customerStamps: customer ? (customer.loyalty[String(t.id)] ?? 0) : null,
    useLoyalty: b.useLoyalty === true,
    minutes: bhParts().minutes,
  });

  if (dry) {
    return ok({
      pricing: {
        subtotal: priced.subtotal,
        loyaltyDiscount: priced.loyaltyDiscount,
        couponDiscount: priced.couponDiscount,
        couponCode: priced.couponCode,
        deliveryFee: priced.deliveryFee,
        total: priced.total,
      },
    });
  }

  let guest: { name: string; phone: string; email: string } | undefined;
  if (!customer) {
    const g = (b.guest ?? {}) as Record<string, unknown>;
    const name = str(g.name, 80);
    const phone = cleanPhone(g.phone);
    if (!name || phone.replace(/\D/g, "").length < 7) throw new ApiError("contact_required");
    guest = { name, phone, email: str(g.email, 120) };
  }

  const row = await createOrder({
    truck: t,
    settings,
    kind: "direct",
    customerId: customer?.id ?? null,
    guest,
    fulfillment,
    address: fulfillment === "delivery" ? address : "",
    priced,
    slotLabel: slotText,
    paymentMethod: method,
    notes: str(b.notes, 400),
  });

  let paymentUrl: string | undefined;
  if (method === "card") {
    try {
      const origin = getOrigin(req);
      const secret = t.gatewayWebhookSecret ? `?secret=${encodeURIComponent(t.gatewayWebhookSecret)}` : "";
      const charge = await createCharge(t, {
        orderNo: row.orderNo,
        amount: row.total,
        name: customer?.name ?? guest?.name ?? "",
        phone: customer?.phone ?? guest?.phone ?? "",
        email: customer?.email ?? guest?.email ?? "",
        webhookUrl: `${origin}/api/payments/webhook/${t.slug}${secret}`,
        returnUrl: `${origin}/${t.slug}?pay=return&order=${row.orderNo}`,
      });
      paymentUrl = charge.url;
      await db.update(orders).set({ paymentRef: charge.ref }).where(eq(orders.id, row.id));
    } catch (e) {
      await cancelOrder(row, t).catch(() => undefined);
      throw e;
    }
  }

  const [view] = await hydrateOrders([row], settings, { withToken: true });
  return ok({ order: view, paymentUrl });
});

export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const slug = url.searchParams.get("truck");
  const t = slug ? await getTruck(slug) : null;
  const customer = await getCustomer();
  const settings = await getSettings();

  const conds = [];
  if (customer) conds.push(eq(orders.customerId, customer.id));
  for (const ref of (url.searchParams.get("refs") ?? "").split(",").slice(0, 30)) {
    const [id, token] = ref.split(":");
    if (Number.isInteger(Number(id)) && token) conds.push(and(eq(orders.id, Number(id)), eq(orders.accessToken, token)));
  }
  if (!conds.length) return ok({ orders: [] });
  const rows = await db
    .select()
    .from(orders)
    .where(and(or(...conds), t ? eq(orders.truckId, t.id) : undefined))
    .orderBy(desc(orders.createdAt))
    .limit(80);
  return ok({ orders: await hydrateOrders(rows, settings) });
});
