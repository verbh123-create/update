import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getCustomer } from "@/lib/server/auth";
import { getSettings, getTruck } from "@/lib/server/config";
import { ApiError, num, ok, readBody, route, str } from "@/lib/server/http";
import { atBahrain, addDays, dowOf, round3, toMin } from "@/lib/time";
import { createOrder, priceCart, resolveSlot, slotLabel } from "@/lib/server/logic";
import type { CartInput, Fulfillment, PayMethod } from "@/lib/types";

export const dynamic = "force-dynamic";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const POST = route(async (req: Request) => {
  const b = await readBody(req);
  const dry = b.dryRun === true;
  const me = await getCustomer();
  if (!dry && !me) throw new ApiError("unauthorized", 401);
  const t = await getTruck(str(b.truck, 20));
  if (!t) throw new ApiError("not_found", 404);
  const settings = await getSettings();

  const fulfillment: Fulfillment = b.fulfillment === "pickup" ? "pickup" : "delivery";
  const method: PayMethod = b.paymentMethod === "benefit" ? "benefit" : "cash";
  if ((method === "cash" && !t.payCash) || (method === "benefit" && !t.payBenefit)) throw new ApiError("payment_disabled");

  const slot = resolveSlot(t, str(b.slotId, 20) || undefined, { required: true, today: false })!;
  const start = str(b.startDate, 10);
  const end = str(b.endDate, 10);
  if (!DATE.test(start) || !DATE.test(end) || end < start) throw new ApiError("invalid_input");
  const days = [...new Set((Array.isArray(b.days) ? b.days : []).map(Number))].filter((d) => d >= 0 && d <= 6);
  if (!days.length) throw new ApiError("invalid_input");
  // Smart holiday restriction: a weekly closure day can never be scheduled.
  if (days.some((d) => t.hours[d]?.closed)) throw new ApiError("day_closed");

  const minLead = Date.now() + settings.cancelSubMin * 60_000;
  const dates: string[] = [];
  const skipped: string[] = [];
  let guard = 0;
  for (let d = start; d <= end && guard < 93; d = addDays(d, 1), guard++) {
    if (!days.includes(dowOf(d))) continue;
    if (t.closedDates.includes(d) || atBahrain(d, slot.from).getTime() < minLead) {
      skipped.push(d);
      continue;
    }
    dates.push(d);
  }
  if (!dates.length) throw new ApiError("no_deliveries");

  const regionId = num(b.regionId) || null;
  const address = str(b.address, 300);
  if (!dry && fulfillment === "delivery" && address.length < 3) throw new ApiError("address_required");

  const priced = await priceCart({
    truck: t,
    settings,
    cart: (Array.isArray(b.cart) ? b.cart : []) as CartInput[],
    kind: "subscription",
    fulfillment: dry && fulfillment === "delivery" && !regionId ? "pickup" : fulfillment,
    regionId,
    minutes: toMin(slot.from),
    subscriptionPercent: settings.subscriptionDiscount,
  });

  const summary = {
    count: dates.length,
    skipped,
    perDelivery: priced.total,
    perDeliverySubtotal: priced.subtotal,
    discountPerDelivery: priced.subscriptionDiscount,
    total: round3(priced.total * dates.length),
    saving: round3(priced.subscriptionDiscount * dates.length),
  };
  if (dry) return ok({ summary });

  const [sub] = await db
    .insert(subscriptions)
    .values({
      truckId: t.id,
      customerId: me!.id,
      startDate: start,
      endDate: end,
      days,
      slotLabel: slotLabel(slot),
      discountPercent: settings.subscriptionDiscount,
    })
    .returning();

  for (const d of dates) {
    await createOrder({
      truck: t,
      settings,
      kind: "subscription",
      customerId: me!.id,
      fulfillment,
      address: fulfillment === "delivery" ? address : "",
      priced,
      slotLabel: slotLabel(slot),
      paymentMethod: method,
      notes: str(b.notes, 400),
      scheduledFor: atBahrain(d, slot.from),
      subscriptionId: sub.id,
    });
  }
  return ok({ summary, subscriptionId: sub.id });
});
