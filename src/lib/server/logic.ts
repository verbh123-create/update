import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { trucks, categories, items, regions, coupons, banners, customers, drivers, orders } from "@/db/schema";
import type {
  CartInput,
  DayHours,
  Fulfillment,
  OrderLine,
  OrderView,
  PayMethod,
  PublicSettings,
} from "@/lib/types";
import { addDays, atBahrain, bhParts, dowOf, inWindow, round3, toMin } from "@/lib/time";
import { ApiError } from "./http";
import { randomToken } from "./auth";

export type TruckRow = typeof trucks.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ───────────── operating hours ───────────── */

function inShift(day: DayHours | undefined, minutes: number): boolean {
  if (!day || day.closed) return false;
  return day.shifts.some((s) => {
    const f = toMin(s.from);
    const e = toMin(s.to);
    if (f === e) return true;
    if (f < e) return minutes >= f && minutes < e;
    return minutes >= f;
  });
}
function inTail(day: DayHours | undefined, minutes: number): boolean {
  if (!day || day.closed) return false;
  return day.shifts.some((s) => toMin(s.from) > toMin(s.to) && minutes < toMin(s.to));
}

export type OpenInfo = { open: boolean; reason: "ok" | "closed" | "holiday" | "hours"; busy: boolean };

export function openState(t: TruckRow, now = new Date()): OpenInfo {
  const { date, minutes, dow } = bhParts(now);
  if (t.status === "closed") return { open: false, reason: "closed", busy: false };
  const busy = t.status === "busy";
  const tailOk = inTail(t.hours[(dow + 6) % 7], minutes) && !t.closedDates.includes(addDays(date, -1));
  const todayClosed = t.closedDates.includes(date) || !!t.hours[dow]?.closed;
  if (todayClosed && !tailOk) return { open: false, reason: "holiday", busy };
  if ((!todayClosed && inShift(t.hours[dow], minutes)) || tailOk) return { open: true, reason: "ok", busy };
  return { open: false, reason: "hours", busy };
}

export function dayOpen(t: TruckRow, date: string): boolean {
  return !t.closedDates.includes(date) && !t.hours[dowOf(date)]?.closed;
}

export function categoryAvailable(c: CategoryRow, minutes: number | null): boolean {
  if (!c.active) return false;
  if (minutes === null || !c.timeFrom || !c.timeTo) return true;
  return inWindow(minutes, c.timeFrom, c.timeTo);
}

/* ───────────── storefront data ───────────── */

export async function loadStorefront(t: TruckRow) {
  const { minutes, date } = bhParts();
  const [cats, its, regs, bans] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.truckId, t.id), eq(categories.active, true))).orderBy(categories.sort, categories.id),
    db.select().from(items).where(and(eq(items.truckId, t.id), eq(items.active, true))).orderBy(items.sort, items.id),
    db.select().from(regions).where(and(eq(regions.truckId, t.id), eq(regions.active, true))).orderBy(regions.nameEn),
    db.select().from(banners).where(and(eq(banners.active, true))),
  ]);
  const activeBanners = bans.filter(
    (b) => (b.truckId === null || b.truckId === t.id) && (!b.startsOn || b.startsOn <= date) && (!b.endsOn || b.endsOn >= date),
  );
  return {
    truck: {
      id: t.id,
      slug: t.slug,
      nameEn: t.nameEn,
      nameAr: t.nameAr,
      taglineEn: t.taglineEn,
      taglineAr: t.taglineAr,
      emoji: t.emoji,
      heroImageUrl: t.heroImageUrl,
      status: t.status,
      hours: t.hours,
      closedDates: t.closedDates,
      slots: t.deliverySlots,
      minOrder: t.minOrder,
      loyaltyThreshold: t.loyaltyThreshold,
      pay: {
        cash: t.payCash,
        benefit: t.payBenefit,
        card: t.payCard && !!t.gatewaySecretKey,
        benefitQrUrl: t.benefitQrUrl,
        benefitIban: t.benefitIban,
        benefitName: t.benefitName,
      },
    },
    open: openState(t),
    categories: cats.map((c) => ({
      id: c.id,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      imageUrl: c.imageUrl,
      timeFrom: c.timeFrom,
      timeTo: c.timeTo,
      availableNow: categoryAvailable(c, minutes),
    })),
    items: its.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      nameEn: i.nameEn,
      nameAr: i.nameAr,
      descEn: i.descEn,
      descAr: i.descAr,
      price: i.price,
      imageUrl: i.imageUrl,
      emoji: i.emoji,
      tags: i.tags,
      ingredients: i.ingredients,
      inStock: i.stock === null || i.stock > 0,
      loyaltyEligible: i.loyaltyEligible,
    })),
    regions: regs.map((r) => ({ id: r.id, nameEn: r.nameEn, nameAr: r.nameAr, fee: r.fee })),
    banners: activeBanners.map((b) => ({
      id: b.id,
      kind: b.kind,
      titleEn: b.titleEn,
      titleAr: b.titleAr,
      bodyEn: b.bodyEn,
      bodyAr: b.bodyAr,
      imageUrl: b.imageUrl,
    })),
  };
}
export type StorefrontData = Awaited<ReturnType<typeof loadStorefront>>;

/* ───────────── pricing ───────────── */

export type Priced = {
  lines: OrderLine[];
  subtotal: number;
  loyaltyDiscount: number;
  loyaltyRedeemed: number;
  loyaltyEarned: number;
  couponDiscount: number;
  couponId: number | null;
  couponCode: string;
  subscriptionDiscount: number;
  deliveryFee: number;
  regionId: number | null;
  regionName: string;
  total: number;
  stockUse: Map<number, number>;
};

export type PriceParams = {
  truck: TruckRow;
  settings: PublicSettings;
  cart: CartInput[];
  kind: "direct" | "subscription" | "pos";
  fulfillment: Fulfillment;
  regionId?: number | null;
  couponCode?: string;
  existingCouponId?: number | null;
  customerStamps?: number | null;
  useLoyalty?: boolean;
  minutes: number | null;
  subscriptionPercent?: number;
};

export async function priceCart(p: PriceParams): Promise<Priced> {
  const { truck } = p;
  if (!Array.isArray(p.cart) || !p.cart.length) throw new ApiError("empty_cart");
  if (p.cart.length > 60) throw new ApiError("invalid_input");
  const ids = [...new Set(p.cart.map((c) => Number(c.itemId)))].filter((n) => Number.isInteger(n));
  if (!ids.length) throw new ApiError("invalid_input");
  const [rows, cats] = await Promise.all([
    db.select().from(items).where(and(eq(items.truckId, truck.id), inArray(items.id, ids))),
    db.select().from(categories).where(eq(categories.truckId, truck.id)),
  ]);
  const itemMap = new Map(rows.map((r) => [r.id, r]));
  const catMap = new Map(cats.map((c) => [c.id, c]));

  const lines: OrderLine[] = [];
  const stockUse = new Map<number, number>();
  const units: { li: number; price: number }[] = [];

  for (const c of p.cart) {
    const it = itemMap.get(Number(c.itemId));
    const qty = Math.floor(Number(c.qty));
    if (!it || !it.active) throw new ApiError("item_unavailable");
    if (!(qty >= 1 && qty <= 50)) throw new ApiError("invalid_input");
    const cat = catMap.get(it.categoryId);
    if (!cat || !cat.active) throw new ApiError("item_unavailable");
    if (!categoryAvailable(cat, p.minutes)) throw new ApiError("category_unavailable");

    const removed = [...new Set((c.removed ?? []).map(Number))].filter((i) => it.ingredients[i]?.removable);
    const extras = [...new Set((c.extras ?? []).map(Number))].filter((i) => (it.ingredients[i]?.addPrice ?? 0) > 0);
    const extraNames = extras.map((i) => ({ en: it.ingredients[i].nameEn, ar: it.ingredients[i].nameAr, price: it.ingredients[i].addPrice }));
    const unitPrice = round3(it.price + extraNames.reduce((s, e) => s + e.price, 0));

    stockUse.set(it.id, (stockUse.get(it.id) ?? 0) + qty);
    if (p.kind !== "subscription" && it.stock !== null && (stockUse.get(it.id) ?? 0) > it.stock) throw new ApiError("out_of_stock");

    lines.push({
      itemId: it.id,
      nameEn: it.nameEn,
      nameAr: it.nameAr || it.nameEn,
      qty,
      unitPrice,
      removed,
      extras,
      removedNames: removed.map((i) => ({ en: it.ingredients[i].nameEn, ar: it.ingredients[i].nameAr })),
      extraNames,
      freeUnits: 0,
    });
    if (it.loyaltyEligible) for (let k = 0; k < qty; k++) units.push({ li: lines.length - 1, price: unitPrice });
  }

  const subtotal = round3(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  if (p.kind !== "pos" && subtotal < truck.minOrder) throw new ApiError("min_order", 400, { min: truck.minOrder });

  // loyalty: buy N, next one free (logged-in customers, direct orders only)
  let loyaltyDiscount = 0;
  let loyaltyRedeemed = 0;
  let loyaltyEarned = 0;
  if (p.settings.loyaltyEnabled && p.kind === "direct" && p.customerStamps !== null && p.customerStamps !== undefined) {
    const th = Math.max(1, truck.loyaltyThreshold);
    const credits = Math.floor(p.customerStamps / th);
    const freeCount = p.useLoyalty ? Math.min(credits, units.length) : 0;
    units.sort((a, b) => a.price - b.price);
    for (let i = 0; i < freeCount; i++) {
      loyaltyDiscount += units[i].price;
      lines[units[i].li].freeUnits++;
    }
    loyaltyRedeemed = freeCount;
    loyaltyEarned = units.length - freeCount;
    loyaltyDiscount = round3(loyaltyDiscount);
  }

  // coupon
  let couponDiscount = 0;
  let couponId: number | null = null;
  let couponCode = "";
  if (p.couponCode && p.kind !== "subscription") {
    const c = await findCoupon(truck, p.couponCode, round3(subtotal - loyaltyDiscount), p.existingCouponId ?? null);
    couponDiscount = c.discount;
    couponId = c.id;
    couponCode = c.code;
  }

  const subscriptionDiscount =
    p.kind === "subscription" ? round3((subtotal * Math.max(0, p.subscriptionPercent ?? 0)) / 100) : 0;

  // delivery
  let deliveryFee = 0;
  let regionId: number | null = null;
  let regionName = "";
  if (p.fulfillment === "delivery") {
    if (!p.regionId) throw new ApiError("region_required");
    const [r] = await db
      .select()
      .from(regions)
      .where(and(eq(regions.id, Number(p.regionId)), eq(regions.truckId, truck.id), eq(regions.active, true)))
      .limit(1);
    if (!r) throw new ApiError("region_required");
    deliveryFee = r.fee;
    regionId = r.id;
    regionName = r.nameEn;
  }

  const total = round3(Math.max(0, subtotal - loyaltyDiscount - couponDiscount - subscriptionDiscount) + deliveryFee);
  return {
    lines,
    subtotal,
    loyaltyDiscount,
    loyaltyRedeemed,
    loyaltyEarned,
    couponDiscount,
    couponId,
    couponCode,
    subscriptionDiscount,
    deliveryFee,
    regionId,
    regionName,
    total,
    stockUse,
  };
}

async function findCoupon(truck: TruckRow, code: string, base: number, existingId: number | null) {
  const { date } = bhParts();
  const [c] = await db.select().from(coupons).where(sql`lower(${coupons.code}) = ${code.trim().toLowerCase()}`).limit(1);
  if (!c || !c.active) throw new ApiError("invalid_coupon");
  if (c.truckId !== null && c.truckId !== truck.id) throw new ApiError("invalid_coupon");
  if (c.startsOn && c.startsOn > date) throw new ApiError("invalid_coupon");
  if (c.endsOn && c.endsOn < date) throw new ApiError("invalid_coupon");
  if (c.maxUses !== null && c.usedCount >= c.maxUses && c.id !== existingId) throw new ApiError("invalid_coupon");
  if (base < c.minOrder) throw new ApiError("invalid_coupon");
  const raw = c.type === "percent" ? (base * c.value) / 100 : c.value;
  return { id: c.id, code: c.code, discount: round3(Math.min(base, Math.max(0, raw))) };
}

/* ───────────── stock + loyalty helpers ───────────── */

async function applyStock(tx: Tx, map: Map<number, number>, dir: 1 | -1) {
  for (const [itemId, qty] of map) {
    if (dir === -1) {
      const r = await tx
        .update(items)
        .set({ stock: sql`${items.stock} - ${qty}` })
        .where(and(eq(items.id, itemId), sql`(${items.stock} is null or ${items.stock} >= ${qty})`))
        .returning({ id: items.id });
      if (!r.length) throw new ApiError("out_of_stock");
    } else {
      await tx
        .update(items)
        .set({ stock: sql`case when ${items.stock} is null then null else ${items.stock} + ${qty} end` })
        .where(eq(items.id, itemId));
    }
  }
}

async function adjustStamps(tx: Tx, customerId: number, truckId: number, delta: number) {
  if (!delta) return;
  const [c] = await tx.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!c) return;
  const key = String(truckId);
  const next = Math.max(0, (c.loyalty[key] ?? 0) + delta);
  await tx.update(customers).set({ loyalty: { ...c.loyalty, [key]: next } }).where(eq(customers.id, customerId));
}

const linesToStock = (lines: OrderLine[]) => {
  const m = new Map<number, number>();
  for (const l of lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty);
  return m;
};

/* ───────────── order lifecycle ───────────── */

export type NewOrder = {
  truck: TruckRow;
  settings: PublicSettings;
  kind: "direct" | "subscription" | "pos";
  customerId?: number | null;
  guest?: { name: string; phone: string; email: string };
  fulfillment: Fulfillment;
  address: string;
  priced: Priced;
  slotLabel: string;
  paymentMethod: PayMethod;
  paymentStatus?: "pending" | "paid";
  notes?: string;
  scheduledFor?: Date | null;
  subscriptionId?: number | null;
};

export async function createOrder(p: NewOrder): Promise<OrderRow> {
  const { priced: pr, truck } = p;
  return db.transaction(async (tx) => {
    if (p.kind !== "subscription") await applyStock(tx, pr.stockUse, -1);
    const [row] = await tx
      .insert(orders)
      .values({
        truckId: truck.id,
        accessToken: randomToken(12),
        kind: p.kind,
        customerId: p.customerId ?? null,
        guestName: p.guest?.name || null,
        guestPhone: p.guest?.phone || null,
        guestEmail: p.guest?.email || null,
        fulfillment: p.fulfillment,
        address: p.address,
        regionId: pr.regionId,
        regionName: pr.regionName,
        deliveryFee: pr.deliveryFee,
        deliverySlot: p.slotLabel,
        items: pr.lines,
        subtotal: pr.subtotal,
        couponCode: pr.couponCode,
        couponId: pr.couponId,
        couponDiscount: pr.couponDiscount,
        loyaltyDiscount: pr.loyaltyDiscount,
        subscriptionDiscount: pr.subscriptionDiscount,
        total: pr.total,
        paymentMethod: p.paymentMethod,
        paymentStatus: p.paymentStatus ?? "pending",
        scheduledFor: p.scheduledFor ?? null,
        subscriptionId: p.subscriptionId ?? null,
        loyaltyEarned: pr.loyaltyEarned,
        loyaltyRedeemed: pr.loyaltyRedeemed,
        notes: p.notes ?? "",
      })
      .returning();
    const prefix = truck.slug === "beverage" ? "B" : "F";
    const [done] = await tx
      .update(orders)
      .set({ orderNo: `${prefix}-${1000 + row.id}` })
      .where(eq(orders.id, row.id))
      .returning();
    if (pr.couponId) await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, pr.couponId));
    if (p.customerId && p.kind === "direct") {
      await adjustStamps(tx, p.customerId, truck.id, pr.loyaltyEarned - pr.loyaltyRedeemed * Math.max(1, truck.loyaltyThreshold));
    }
    return done;
  });
}

export async function cancelOrder(o: OrderRow, truck: TruckRow) {
  await db.transaction(async (tx) => {
    const upd = await tx
      .update(orders)
      .set({ status: "CANCELLED", cancelledAt: new Date() })
      .where(and(eq(orders.id, o.id), eq(orders.status, "NOT_READY")))
      .returning({ id: orders.id });
    if (!upd.length) throw new ApiError("completed_locked", 409);
    if (o.kind !== "subscription") await applyStock(tx, linesToStock(o.items), 1);
    if (o.couponId) await tx.update(coupons).set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` }).where(eq(coupons.id, o.couponId));
    if (o.customerId && o.kind === "direct") {
      await adjustStamps(tx, o.customerId, truck.id, -o.loyaltyEarned + o.loyaltyRedeemed * Math.max(1, truck.loyaltyThreshold));
    }
  });
}

export async function editOrderItems(o: OrderRow, truck: TruckRow, settings: PublicSettings, cart: CartInput[], patch: { notes?: string; address?: string; subscriptionPercent?: number }) {
  let stamps: number | null = null;
  if (o.customerId && o.kind === "direct") {
    const [c] = await db.select().from(customers).where(eq(customers.id, o.customerId)).limit(1);
    const th = Math.max(1, truck.loyaltyThreshold);
    stamps = Math.max(0, (c?.loyalty[String(truck.id)] ?? 0) - o.loyaltyEarned + o.loyaltyRedeemed * th);
  }
  const slotMinutes = o.scheduledFor ? bhParts(o.scheduledFor).minutes : bhParts().minutes;
  const priced = await priceCart({
    truck,
    settings,
    cart,
    kind: o.kind as "direct" | "subscription",
    fulfillment: o.fulfillment as Fulfillment,
    regionId: o.regionId,
    couponCode: o.couponCode || undefined,
    existingCouponId: o.couponId,
    customerStamps: stamps,
    useLoyalty: o.loyaltyRedeemed > 0,
    minutes: o.kind === "subscription" ? slotMinutes : null,
    subscriptionPercent: patch.subscriptionPercent,
  });
  return db.transaction(async (tx) => {
    if (o.kind !== "subscription") {
      await applyStock(tx, linesToStock(o.items), 1);
      await applyStock(tx, priced.stockUse, -1);
    }
    const [row] = await tx
      .update(orders)
      .set({
        items: priced.lines,
        subtotal: priced.subtotal,
        couponDiscount: priced.couponDiscount,
        loyaltyDiscount: priced.loyaltyDiscount,
        subscriptionDiscount: priced.subscriptionDiscount,
        total: priced.total,
        loyaltyEarned: priced.loyaltyEarned,
        loyaltyRedeemed: priced.loyaltyRedeemed,
        notes: patch.notes ?? o.notes,
        address: patch.address ?? o.address,
      })
      .where(and(eq(orders.id, o.id), eq(orders.status, "NOT_READY")))
      .returning();
    if (!row) throw new ApiError("completed_locked", 409);
    if (o.customerId && o.kind === "direct") {
      const th = Math.max(1, truck.loyaltyThreshold);
      const before = -o.loyaltyEarned + o.loyaltyRedeemed * th;
      const after = priced.loyaltyEarned - priced.loyaltyRedeemed * th;
      await adjustStamps(tx, o.customerId, truck.id, after + before);
    }
    return row;
  });
}

/* ───────────── serialization ───────────── */

export function modifyWindow(o: OrderRow, s: PublicSettings): Date | null {
  if (o.kind === "direct") return new Date(o.createdAt.getTime() + s.cancelDirectMin * 60_000);
  if (o.kind === "subscription" && o.scheduledFor) return new Date(o.scheduledFor.getTime() - s.cancelSubMin * 60_000);
  return null;
}

export async function hydrateOrders(rows: OrderRow[], s: PublicSettings, opts: { withToken?: boolean } = {}): Promise<OrderView[]> {
  if (!rows.length) return [];
  const custIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is number => x !== null))];
  const drvIds = [...new Set(rows.map((r) => r.driverId).filter((x): x is number => x !== null))];
  const [custs, drvs, trs] = await Promise.all([
    custIds.length ? db.select().from(customers).where(inArray(customers.id, custIds)) : Promise.resolve([]),
    drvIds.length ? db.select().from(drivers).where(inArray(drivers.id, drvIds)) : Promise.resolve([]),
    db.select({ id: trucks.id, slug: trucks.slug }).from(trucks),
  ]);
  const cm = new Map(custs.map((c) => [c.id, c]));
  const dm = new Map(drvs.map((d) => [d.id, d]));
  const tm = new Map(trs.map((t) => [t.id, t.slug]));
  const now = Date.now();
  return rows.map((o) => {
    const c = o.customerId ? cm.get(o.customerId) : undefined;
    const mu = modifyWindow(o, s);
    const cardPaid = o.paymentMethod === "card" && o.paymentStatus === "paid";
    return {
      id: o.id,
      truckId: o.truckId,
      truckSlug: tm.get(o.truckId) ?? "",
      orderNo: o.orderNo,
      accessToken: opts.withToken ? o.accessToken : undefined,
      kind: o.kind as OrderView["kind"],
      customerId: o.customerId,
      customerName: o.guestName ?? c?.name ?? null,
      customerPhone: o.guestPhone ?? c?.phone ?? null,
      fulfillment: o.fulfillment as Fulfillment,
      address: o.address,
      regionName: o.regionName,
      deliveryFee: o.deliveryFee,
      deliverySlot: o.deliverySlot,
      items: o.items,
      subtotal: o.subtotal,
      couponCode: o.couponCode,
      couponDiscount: o.couponDiscount,
      loyaltyDiscount: o.loyaltyDiscount,
      subscriptionDiscount: o.subscriptionDiscount,
      total: o.total,
      paymentMethod: o.paymentMethod as PayMethod,
      paymentStatus: o.paymentStatus as OrderView["paymentStatus"],
      status: o.status as OrderView["status"],
      deliveryState: o.deliveryState as OrderView["deliveryState"],
      driverId: o.driverId,
      driverName: o.driverId ? (dm.get(o.driverId)?.name ?? null) : null,
      driverCommission: o.driverCommission,
      driverPaid: o.driverPaid,
      scheduledFor: o.scheduledFor?.toISOString() ?? null,
      subscriptionId: o.subscriptionId,
      notes: o.notes,
      createdAt: o.createdAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      modifyUntil: mu?.toISOString() ?? null,
      canModify: o.status === "NOT_READY" && !!mu && now < mu.getTime() && !cardPaid,
    };
  });
}

/* ───────────── slots ───────────── */

export function resolveSlot(t: TruckRow, slotId: string | undefined, opts: { required: boolean; today: boolean }) {
  if (!slotId) {
    if (opts.required) throw new ApiError("slot_required");
    return null;
  }
  const slot = t.deliverySlots.find((s) => s.id === slotId);
  if (!slot) throw new ApiError("slot_required");
  if (opts.today && bhParts().minutes >= toMin(slot.to) && toMin(slot.to) > toMin(slot.from)) throw new ApiError("slot_passed");
  return slot;
}

export const slotLabel = (s: { from: string; to: string } | null) => (s ? `${s.from} - ${s.to}` : "");

export { atBahrain };
