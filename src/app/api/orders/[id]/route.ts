import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, subscriptions, trucks } from "@/db/schema";
import { getCustomer, safeEqual } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/config";
import { ApiError, ok, readBody, route, str } from "@/lib/server/http";
import { cancelOrder, editOrderItems, hydrateOrders, modifyWindow } from "@/lib/server/logic";
import type { CartInput } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function loadOwned(idStr: string, token: string) {
  const id = Number(idStr);
  if (!Number.isInteger(id)) throw new ApiError("not_found", 404);
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o) throw new ApiError("not_found", 404);
  const me = await getCustomer();
  const owner = (me && o.customerId === me.id) || (token && o.accessToken && safeEqual(token, o.accessToken));
  if (!owner) throw new ApiError("not_found", 404);
  const [t] = await db.select().from(trucks).where(eq(trucks.id, o.truckId)).limit(1);
  return { o, t };
}

async function assertWindow(o: typeof orders.$inferSelect) {
  if (o.status !== "NOT_READY") throw new ApiError("completed_locked", 409);
  const settings = await getSettings();
  const mu = modifyWindow(o, settings);
  const cardPaid = o.paymentMethod === "card" && o.paymentStatus === "paid";
  if (!mu || Date.now() >= mu.getTime() || cardPaid) throw new ApiError("grace_expired", 403);
  return settings;
}

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await readBody(req);
  const { o, t } = await loadOwned(id, str(b.token, 60));
  const settings = await assertWindow(o);

  const notes = b.notes !== undefined ? str(b.notes, 400) : undefined;
  const address = b.address !== undefined && o.fulfillment === "delivery" ? str(b.address, 300) : undefined;
  if (address !== undefined && address.length < 3) throw new ApiError("address_required");

  let row = o;
  if (Array.isArray(b.cart)) {
    const cart = (b.cart as CartInput[]).filter((c) => Number(c.qty) >= 1);
    if (!cart.length) throw new ApiError("empty_cart");
    let percent = 0;
    if (o.subscriptionId) {
      const [s] = await db.select().from(subscriptions).where(eq(subscriptions.id, o.subscriptionId)).limit(1);
      percent = s?.discountPercent ?? 0;
    }
    row = await editOrderItems(o, t, settings, cart, { notes, address, subscriptionPercent: percent });
  } else if (notes !== undefined || address !== undefined) {
    [row] = await db
      .update(orders)
      .set({ notes: notes ?? o.notes, address: address ?? o.address })
      .where(eq(orders.id, o.id))
      .returning();
  }
  const [view] = await hydrateOrders([row], settings);
  return ok({ order: view });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const { o, t } = await loadOwned(id, token);
  await assertWindow(o);
  await cancelOrder(o, t);
  return ok();
});
