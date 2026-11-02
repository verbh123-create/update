import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, subscriptions, trucks } from "@/db/schema";
import { getCustomer } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/config";
import { ApiError, ok, route } from "@/lib/server/http";
import { cancelOrder, modifyWindow } from "@/lib/server/logic";

export const dynamic = "force-dynamic";

// Cancels every upcoming delivery that is still outside the 1-hour grace cut-off.
export const DELETE = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const me = await getCustomer();
  if (!me) throw new ApiError("unauthorized", 401);
  const id = Number((await ctx.params).id);
  const [sub] = await db.select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.customerId, me.id))).limit(1);
  if (!sub) throw new ApiError("not_found", 404);
  const [t] = await db.select().from(trucks).where(eq(trucks.id, sub.truckId)).limit(1);
  const settings = await getSettings();
  const rows = await db.select().from(orders).where(and(eq(orders.subscriptionId, id), eq(orders.status, "NOT_READY")));
  let cancelled = 0;
  for (const o of rows) {
    const mu = modifyWindow(o, settings);
    if (mu && Date.now() < mu.getTime()) {
      await cancelOrder(o, t);
      cancelled++;
    }
  }
  await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, id));
  return ok({ cancelled });
});
