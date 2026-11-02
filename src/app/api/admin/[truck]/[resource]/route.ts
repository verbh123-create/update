import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { banners, categories, coupons, customers, drivers, items, orders, payouts, regions, trucks } from "@/db/schema";
import { canDo, getStaff, hashPassword } from "@/lib/server/auth";
import { getSettings, getTextOverrides, getTruck, saveTexts } from "@/lib/server/config";
import { ApiError, getOrigin, num, ok, readBody, route, str } from "@/lib/server/http";
import { cancelOrder, hydrateOrders } from "@/lib/server/logic";
import { createStaff, deleteStaff, listStaff, updateStaff } from "@/lib/server/admin-staff";
import { addDays, bhParts, startOfDay } from "@/lib/time";
import type { Ingredient, Permission } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ truck: string; resource: string }> };
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type FT = "s" | "ns" | "n" | "nn" | "b" | "tags" | "ing";

const PERM: Record<string, Permission> = {
  orders: "orders",
  drivers: "drivers",
  "driver-report": "drivers",
  payouts: "drivers",
  reports: "reports",
  categories: "menu",
  items: "menu",
  hours: "hours",
  regions: "regions",
  coupons: "promos",
  banners: "promos",
  payments: "payments",
  customers: "customers",
  staff: "employees",
  profile: "content",
  texts: "content",
};

const CRUD = {
  categories: { table: categories, order: [categories.sort, categories.id], fields: { nameEn: "s", nameAr: "s", imageUrl: "s", sort: "n", active: "b", timeFrom: "ns", timeTo: "ns" } },
  items: {
    table: items,
    order: [items.sort, items.id],
    fields: { categoryId: "n", nameEn: "s", nameAr: "s", descEn: "s", descAr: "s", price: "n", imageUrl: "s", emoji: "s", active: "b", tags: "tags", ingredients: "ing", stock: "nn", loyaltyEligible: "b", sort: "n" },
  },
  regions: { table: regions, order: [regions.nameEn], fields: { nameEn: "s", nameAr: "s", fee: "n", active: "b" } },
  coupons: { table: coupons, order: [desc(coupons.id)], fields: { code: "s", type: "s", value: "n", minOrder: "n", startsOn: "ns", endsOn: "ns", maxUses: "nn", active: "b" } },
  banners: { table: banners, order: [desc(banners.id)], fields: { kind: "s", titleEn: "s", titleAr: "s", bodyEn: "s", bodyAr: "s", imageUrl: "s", startsOn: "ns", endsOn: "ns", active: "b" } },
  drivers: { table: drivers, order: [drivers.id], fields: { name: "s", phone: "s", defaultCommission: "n", active: "b" } },
} as unknown as Record<string, { table: typeof items; order: never[]; fields: Record<string, FT> }>;

function coerce(t: FT, v: unknown): unknown {
  switch (t) {
    case "s":
      return str(v, 2000);
    case "ns": {
      const s = str(v, 40);
      return s || null;
    }
    case "n":
      return num(v);
    case "nn":
      return v === null || v === "" || v === undefined ? null : Math.max(0, Math.floor(num(v)));
    case "b":
      return v === true;
    case "tags":
      return (Array.isArray(v) ? v.map(String) : []).filter((x) => x === "spicy" || x === "fresh");
    case "ing":
      return (Array.isArray(v) ? v : []).slice(0, 40).map((x): Ingredient => {
        const o = (x ?? {}) as Record<string, unknown>;
        return { nameEn: str(o.nameEn, 80), nameAr: str(o.nameAr, 80), imageUrl: str(o.imageUrl, 300), removable: o.removable === true, addPrice: Math.max(0, num(o.addPrice)) };
      });
  }
}
function sanitize(body: Record<string, unknown>, fields: Record<string, FT>) {
  const out: Record<string, unknown> = {};
  for (const [k, t] of Object.entries(fields)) if (k in body) out[k] = coerce(t, body[k]);
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MASK = "••••••••";
const orderDate = sql`coalesce(${orders.scheduledFor}, ${orders.createdAt})`;
const inRange = (from: string, to: string) =>
  sql`${orderDate} >= ${startOfDay(from).toISOString()}::timestamptz and ${orderDate} < ${startOfDay(addDays(to, 1)).toISOString()}::timestamptz`;
const dateParam = (v: string | null, d: string) => (v && DATE.test(v) ? v : d);

async function handle(method: Method, req: Request, ctx: Ctx): Promise<Response> {
  const { truck: slug, resource } = await ctx.params;
  const t = await getTruck(slug);
  if (!t) throw new ApiError("not_found", 404);
  const s = await getStaff();
  if (!s) throw new ApiError("unauthorized", 401);
  const perm = PERM[resource];
  if (!perm) throw new ApiError("not_found", 404);
  if (!canDo(s, t.id, perm) && !(resource === "drivers" && method === "GET" && canDo(s, t.id, "orders"))) throw new ApiError("forbidden", 403);
  const settings = await getSettings();
  const url = new URL(req.url);
  const body = method === "GET" || method === "DELETE" ? {} : await readBody(req);

  /* ── generic CRUD resources ── */
  const crud = CRUD[resource];
  if (crud) {
    const tbl = crud.table;
    if (method === "GET") {
      const rows = await db.select().from(tbl).where(eq(tbl.truckId, t.id)).orderBy(...(crud.order as never[]));
      return ok({ rows });
    }
    if (method === "POST" || method === "PUT") {
      const values = sanitize(body, crud.fields);
      if (typeof values.code === "string") values.code = values.code.toUpperCase();
      if (resource === "items" && "categoryId" in values) {
        const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, Number(values.categoryId)), eq(categories.truckId, t.id))).limit(1);
        if (!c) throw new ApiError("invalid_input");
      }
      if (method === "POST") {
        if (resource === "items" && !values.categoryId) throw new ApiError("invalid_input");
        const [row] = await db.insert(tbl).values({ ...values, truckId: t.id } as typeof items.$inferInsert).returning();
        return ok({ row });
      }
      const id = num(body.id);
      if (!Object.keys(values).length) throw new ApiError("invalid_input");
      const [row] = await db.update(tbl).set(values as Partial<typeof items.$inferInsert>).where(and(eq(tbl.id, id), eq(tbl.truckId, t.id))).returning();
      if (!row) throw new ApiError("not_found", 404);
      return ok({ row });
    }
    if (method === "DELETE") {
      const id = num(url.searchParams.get("id"));
      if (resource === "categories") {
        const [x] = await db.select({ id: items.id }).from(items).where(eq(items.categoryId, id)).limit(1);
        if (x) throw new ApiError("category_not_empty");
      }
      await db.delete(tbl).where(and(eq(tbl.id, id), eq(tbl.truckId, t.id)));
      return ok();
    }
  }

  switch (resource) {
    case "orders": {
      if (method === "GET") {
        const date = url.searchParams.get("date");
        const rows = await db
          .select()
          .from(orders)
          .where(and(eq(orders.truckId, t.id), date && DATE.test(date) ? inRange(date, date) : undefined))
          .orderBy(desc(orders.createdAt))
          .limit(150);
        return ok({ orders: await hydrateOrders(rows, settings), now: new Date().toISOString() });
      }
      if (method === "PATCH") {
        const [o] = await db.select().from(orders).where(and(eq(orders.id, num(body.id)), eq(orders.truckId, t.id))).limit(1);
        if (!o) throw new ApiError("not_found", 404);
        if (body.action === "cancel") {
          await cancelOrder(o, t);
          return ok();
        }
        const patch: Partial<typeof orders.$inferInsert> = {};
        if ("driverId" in body) {
          if (o.driverPaid) throw new ApiError("invalid_input");
          const did = num(body.driverId);
          if (!did) {
            patch.driverId = null;
            patch.driverCommission = 0;
          } else {
            const [d] = await db.select().from(drivers).where(and(eq(drivers.id, did), eq(drivers.truckId, t.id))).limit(1);
            if (!d) throw new ApiError("invalid_input");
            patch.driverId = d.id;
            if (o.driverId !== d.id && !("driverCommission" in body)) patch.driverCommission = d.defaultCommission;
          }
        }
        if ("driverCommission" in body && patch.driverId !== null) {
          if (o.driverPaid) throw new ApiError("invalid_input");
          patch.driverCommission = Math.max(0, num(body.driverCommission));
        }
        if (typeof body.deliveryState === "string" && ["pending", "out", "delivered"].includes(body.deliveryState)) patch.deliveryState = body.deliveryState;
        if (typeof body.paymentStatus === "string" && ["pending", "paid", "failed"].includes(body.paymentStatus)) patch.paymentStatus = body.paymentStatus;
        if (Object.keys(patch).length) await db.update(orders).set(patch).where(eq(orders.id, o.id));
        const [fresh] = await db.select().from(orders).where(eq(orders.id, o.id)).limit(1);
        return ok({ order: (await hydrateOrders([fresh], settings))[0] });
      }
      break;
    }

    case "reports": {
      const today = bhParts().date;
      const from = dateParam(url.searchParams.get("from"), today);
      const to = dateParam(url.searchParams.get("to"), from);
      const rows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.truckId, t.id), ne(orders.status, "CANCELLED"), sql`not (${orders.paymentMethod} = 'card' and ${orders.paymentStatus} <> 'paid')`, inRange(from, to)))
        .orderBy(asc(orderDate))
        .limit(5000);
      const [{ cancelled }] = await db
        .select({ cancelled: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.truckId, t.id), eq(orders.status, "CANCELLED"), inRange(from, to)));
      const views = await hydrateOrders(rows, settings);
      const sum = { orders: views.length, cancelled, subtotal: 0, discounts: 0, deliveryFees: 0, revenue: 0, avg: 0, byPayment: {} as Record<string, number>, byKind: {} as Record<string, number> };
      const daily: Record<string, { date: string; orders: number; revenue: number }> = {};
      for (const o of views) {
        sum.subtotal += o.subtotal;
        sum.discounts += o.couponDiscount + o.loyaltyDiscount + o.subscriptionDiscount;
        sum.deliveryFees += o.deliveryFee;
        sum.revenue += o.total;
        sum.byPayment[o.paymentMethod] = (sum.byPayment[o.paymentMethod] ?? 0) + o.total;
        sum.byKind[o.kind] = (sum.byKind[o.kind] ?? 0) + o.total;
        const d = bhParts(new Date(o.scheduledFor ?? o.createdAt)).date;
        daily[d] ??= { date: d, orders: 0, revenue: 0 };
        daily[d].orders++;
        daily[d].revenue += o.total;
      }
      sum.avg = views.length ? sum.revenue / views.length : 0;
      return ok({ from, to, summary: sum, daily: Object.values(daily), orders: views });
    }

    case "driver-report": {
      const today = bhParts().date;
      const from = dateParam(url.searchParams.get("from"), today);
      const to = dateParam(url.searchParams.get("to"), from);
      const [drvs, rows] = await Promise.all([
        db.select().from(drivers).where(eq(drivers.truckId, t.id)).orderBy(drivers.id),
        db
          .select()
          .from(orders)
          .where(and(eq(orders.truckId, t.id), isNotNull(orders.driverId), eq(orders.deliveryState, "delivered"), ne(orders.status, "CANCELLED"), inRange(from, to)))
          .orderBy(asc(orderDate))
          .limit(5000),
      ]);
      const views = await hydrateOrders(rows, settings);
      const summary = drvs.map((d) => {
        const mine = rows.filter((r) => r.driverId === d.id);
        const total = mine.reduce((a, r) => a + r.driverCommission, 0);
        const paid = mine.filter((r) => r.driverPaid).reduce((a, r) => a + r.driverCommission, 0);
        return { driverId: d.id, name: d.name, deliveries: mine.length, commission: total, paid, unpaid: total - paid };
      });
      return ok({ from, to, drivers: summary, orders: views });
    }

    case "payouts": {
      if (method === "GET") {
        const rows = await db.select().from(payouts).where(eq(payouts.truckId, t.id)).orderBy(desc(payouts.id)).limit(50);
        const drvs = await db.select().from(drivers).where(eq(drivers.truckId, t.id));
        const dm = new Map(drvs.map((d) => [d.id, d.name]));
        return ok({ rows: rows.map((p) => ({ ...p, paidAt: p.paidAt.toISOString(), driverName: dm.get(p.driverId) ?? "" })) });
      }
      if (method === "POST") {
        const driverId = num(body.driverId);
        const from = dateParam(str(body.from, 10), bhParts().date);
        const to = dateParam(str(body.to, 10), from);
        const [d] = await db.select().from(drivers).where(and(eq(drivers.id, driverId), eq(drivers.truckId, t.id))).limit(1);
        if (!d) throw new ApiError("not_found", 404);
        const rows = await db
          .select()
          .from(orders)
          .where(and(eq(orders.truckId, t.id), eq(orders.driverId, driverId), eq(orders.driverPaid, false), eq(orders.deliveryState, "delivered"), ne(orders.status, "CANCELLED"), inRange(from, to)));
        if (!rows.length) throw new ApiError("no_deliveries");
        const amount = rows.reduce((a, r) => a + r.driverCommission, 0);
        const payout = await db.transaction(async (tx) => {
          const [p] = await tx.insert(payouts).values({ truckId: t.id, driverId, fromDate: from, toDate: to, amount, deliveries: rows.length, paidBy: s.username }).returning();
          await tx.update(orders).set({ driverPaid: true, payoutId: p.id }).where(inArray(orders.id, rows.map((r) => r.id)));
          return p;
        });
        return ok({ payout: { ...payout, paidAt: payout.paidAt.toISOString() } });
      }
      break;
    }

    case "hours": {
      if (method === "GET") {
        return ok({ status: t.status, hours: t.hours, closedDates: t.closedDates, deliverySlots: t.deliverySlots, minOrder: t.minOrder, loyaltyThreshold: t.loyaltyThreshold });
      }
      if (method === "PUT") {
        const patch: Partial<typeof trucks.$inferInsert> = {};
        if (body.status !== undefined) {
          if (!["open", "busy", "closed"].includes(String(body.status))) throw new ApiError("invalid_input");
          patch.status = String(body.status);
        }
        if (body.hours !== undefined) {
          const h = body.hours as { closed?: boolean; shifts?: { from?: string; to?: string }[] }[];
          if (!Array.isArray(h) || h.length !== 7) throw new ApiError("invalid_input");
          patch.hours = h.map((d) => ({
            closed: d.closed === true,
            shifts: (Array.isArray(d.shifts) ? d.shifts : []).slice(0, 4).map((x) => {
              if (!TIME.test(String(x.from)) || !TIME.test(String(x.to))) throw new ApiError("invalid_input");
              return { from: String(x.from), to: String(x.to) };
            }),
          }));
        }
        if (body.closedDates !== undefined) {
          const arr = (Array.isArray(body.closedDates) ? body.closedDates : []).map(String).filter((d) => DATE.test(d));
          patch.closedDates = [...new Set(arr)].sort().slice(0, 400);
        }
        if (body.deliverySlots !== undefined) {
          const arr = Array.isArray(body.deliverySlots) ? (body.deliverySlots as { id?: string; from?: string; to?: string }[]) : [];
          patch.deliverySlots = arr.slice(0, 20).map((x, i) => {
            if (!TIME.test(String(x.from)) || !TIME.test(String(x.to))) throw new ApiError("invalid_input");
            return { id: str(x.id, 20) || `s${Date.now().toString(36)}${i}`, from: String(x.from), to: String(x.to) };
          });
        }
        if (body.minOrder !== undefined) patch.minOrder = Math.max(0, num(body.minOrder));
        if (body.loyaltyThreshold !== undefined) patch.loyaltyThreshold = Math.min(100, Math.max(1, Math.floor(num(body.loyaltyThreshold, 10))));
        if (Object.keys(patch).length) await db.update(trucks).set(patch).where(eq(trucks.id, t.id));
        return ok();
      }
      break;
    }

    case "payments": {
      if (method === "GET") {
        return ok({
          payCash: t.payCash,
          payBenefit: t.payBenefit,
          payCard: t.payCard,
          benefitQrUrl: t.benefitQrUrl,
          benefitIban: t.benefitIban,
          benefitName: t.benefitName,
          gatewayProvider: t.gatewayProvider,
          gatewayMode: t.gatewayMode,
          gatewayPublicKey: t.gatewayPublicKey,
          gatewaySecretKey: t.gatewaySecretKey ? MASK : "",
          gatewayWebhookSecret: t.gatewayWebhookSecret ? MASK : "",
          webhookUrl: `${getOrigin(req)}/api/payments/webhook/${t.slug}${t.gatewayWebhookSecret ? "?secret=YOUR_WEBHOOK_SECRET" : ""}`,
        });
      }
      if (method === "PUT") {
        const patch: Partial<typeof trucks.$inferInsert> = {};
        if (body.payCash !== undefined) patch.payCash = body.payCash === true;
        if (body.payBenefit !== undefined) patch.payBenefit = body.payBenefit === true;
        if (body.payCard !== undefined) patch.payCard = body.payCard === true;
        if (body.benefitQrUrl !== undefined) patch.benefitQrUrl = str(body.benefitQrUrl, 300);
        if (body.benefitIban !== undefined) patch.benefitIban = str(body.benefitIban, 60);
        if (body.benefitName !== undefined) patch.benefitName = str(body.benefitName, 100);
        if (body.gatewayProvider !== undefined) patch.gatewayProvider = body.gatewayProvider === "myfatoorah" ? "myfatoorah" : "tap";
        if (body.gatewayMode !== undefined) patch.gatewayMode = body.gatewayMode === "live" ? "live" : "test";
        if (body.gatewayPublicKey !== undefined) patch.gatewayPublicKey = str(body.gatewayPublicKey, 400);
        if (body.gatewaySecretKey !== undefined && body.gatewaySecretKey !== MASK) patch.gatewaySecretKey = str(body.gatewaySecretKey, 600);
        if (body.gatewayWebhookSecret !== undefined && body.gatewayWebhookSecret !== MASK) patch.gatewayWebhookSecret = str(body.gatewayWebhookSecret, 200);
        if (Object.keys(patch).length) await db.update(trucks).set(patch).where(eq(trucks.id, t.id));
        return ok();
      }
      break;
    }

    case "customers": {
      if (method === "GET") {
        const [rows, stats] = await Promise.all([
          db.select().from(customers).orderBy(desc(customers.id)).limit(500),
          db
            .select({ id: orders.customerId, n: sql<number>`count(*)::int`, spent: sql<number>`coalesce(sum(${orders.total}), 0)::float` })
            .from(orders)
            .where(and(eq(orders.truckId, t.id), ne(orders.status, "CANCELLED"), isNotNull(orders.customerId)))
            .groupBy(orders.customerId),
        ]);
        const sm = new Map(stats.map((x) => [x.id, x]));
        return ok({
          rows: rows.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
            regionName: c.regionName,
            address: c.address,
            createdAt: c.createdAt.toISOString(),
            stamps: c.loyalty[String(t.id)] ?? 0,
            orders: sm.get(c.id)?.n ?? 0,
            spent: sm.get(c.id)?.spent ?? 0,
          })),
        });
      }
      if (method === "POST") {
        const pw = str(body.password, 200);
        if (pw.length < 6) throw new ApiError("weak_password");
        await db.update(customers).set({ passwordHash: await hashPassword(pw) }).where(eq(customers.id, num(body.id)));
        return ok();
      }
      break;
    }

    case "staff": {
      if (method === "GET") return ok({ rows: await listStaff(t.id) });
      if (method === "POST") return ok({ row: await createStaff(s, body, t.id) });
      if (method === "PUT") return ok(await updateStaff(s, body, t.id));
      if (method === "DELETE") {
        await deleteStaff(s, num(url.searchParams.get("id")), t.id);
        return ok();
      }
      break;
    }

    case "profile": {
      if (method === "GET") {
        return ok({ nameEn: t.nameEn, nameAr: t.nameAr, taglineEn: t.taglineEn, taglineAr: t.taglineAr, emoji: t.emoji, heroImageUrl: t.heroImageUrl, cardImageUrl: t.cardImageUrl });
      }
      if (method === "PUT") {
        const patch: Partial<typeof trucks.$inferInsert> = {};
        for (const k of ["nameEn", "nameAr", "taglineEn", "taglineAr", "emoji", "heroImageUrl", "cardImageUrl"] as const) {
          if (body[k] !== undefined) patch[k] = str(body[k], 300);
        }
        if (Object.keys(patch).length) await db.update(trucks).set(patch).where(eq(trucks.id, t.id));
        return ok();
      }
      break;
    }

    case "texts": {
      if (method === "GET") return ok({ overrides: await getTextOverrides() });
      if (method === "PUT") {
        await saveTexts(Array.isArray(body.changes) ? (body.changes as { key: string; lang: string; value: string }[]) : []);
        return ok();
      }
      break;
    }
  }
  throw new ApiError("not_found", 404);
}

export const GET = route((req: Request, ctx: Ctx) => handle("GET", req, ctx));
export const POST = route((req: Request, ctx: Ctx) => handle("POST", req, ctx));
export const PUT = route((req: Request, ctx: Ctx) => handle("PUT", req, ctx));
export const PATCH = route((req: Request, ctx: Ctx) => handle("PATCH", req, ctx));
export const DELETE = route((req: Request, ctx: Ctx) => handle("DELETE", req, ctx));
