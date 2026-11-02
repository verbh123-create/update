import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { safeEqual } from "@/lib/server/auth";
import { getTruck } from "@/lib/server/config";
import { extractRef, fetchPaid } from "@/lib/server/gateway";
import { ApiError, ok, readBody, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Gulf payment gateway webhook (Tap / MyFatoorah). Configure this URL in the gateway dashboard:
//   https://YOUR-DOMAIN/api/payments/webhook/<beverage|food>[?secret=WEBHOOK_SECRET]
// The payload is never trusted: the charge is re-fetched from the gateway with the secret key.
export const POST = route(async (req: Request, ctx: { params: Promise<{ truck: string }> }) => {
  const t = await getTruck((await ctx.params).truck);
  if (!t) throw new ApiError("not_found", 404);
  if (t.gatewayWebhookSecret) {
    const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-webhook-secret") ?? "";
    if (!safeEqual(provided, t.gatewayWebhookSecret)) throw new ApiError("unauthorized", 401);
  }
  if (!t.gatewaySecretKey) throw new ApiError("payment_disabled");
  const body = await readBody(req);
  const ref = extractRef(t, body);
  if (!ref) throw new ApiError("invalid_input");
  const [o] = await db.select().from(orders).where(and(eq(orders.truckId, t.id), eq(orders.paymentRef, ref))).limit(1);
  if (!o) return ok();
  if (await fetchPaid(t, ref)) await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, o.id));
  return ok();
});
