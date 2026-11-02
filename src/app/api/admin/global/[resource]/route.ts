import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getStaff } from "@/lib/server/auth";
import { getSettings, getTextOverrides, getTrucks, saveSettings, saveTexts, getTruck } from "@/lib/server/config";
import { ApiError, num, ok, readBody, route } from "@/lib/server/http";
import { createStaff, deleteStaff, listStaff, updateStaff } from "@/lib/server/admin-staff";
import { hydrateOrders } from "@/lib/server/logic";
import { bhParts, startOfDay } from "@/lib/time";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ resource: string }> };
type Method = "GET" | "POST" | "PUT" | "DELETE";

const orderDate = sql`coalesce(${orders.scheduledFor}, ${orders.createdAt})`;

async function handle(method: Method, req: Request, ctx: Ctx): Promise<Response> {
  const s = await getStaff();
  if (!s) throw new ApiError("unauthorized", 401);
  if (!s.isSuper) throw new ApiError("forbidden", 403);
  const { resource } = await ctx.params;
  const url = new URL(req.url);
  const body = method === "GET" || method === "DELETE" ? {} : await readBody(req);

  switch (resource) {
    case "settings": {
      if (method === "GET") return ok({ settings: await getSettings() });
      if (method === "PUT") {
        await saveSettings(body);
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
    case "staff": {
      if (method === "GET") return ok({ rows: await listStaff("all") });
      if (method === "POST") return ok({ row: await createStaff(s, body, "all") });
      if (method === "PUT") return ok(await updateStaff(s, body, "all"));
      if (method === "DELETE") {
        await deleteStaff(s, num(url.searchParams.get("id")), "all");
        return ok();
      }
      break;
    }
    case "overview": {
      const settings = await getSettings();
      const trucks = await getTrucks();
      const today = bhParts().date;
      const monthStart = `${today.slice(0, 8)}01`;
      const rows = await db
        .select()
        .from(orders)
        .where(and(ne(orders.status, "CANCELLED"), sql`${orderDate} >= ${startOfDay(monthStart).toISOString()}::timestamptz`, sql`not (${orders.paymentMethod} = 'card' and ${orders.paymentStatus} <> 'paid')`));
      const pending = await db
        .select({ truckId: orders.truckId, n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.status, "NOT_READY"), sql`${orderDate} <= now() + interval '1 hour'`, sql`not (${orders.paymentMethod} = 'card' and ${orders.paymentStatus} <> 'paid')`))
        .groupBy(orders.truckId);
      const stats = trucks.map((t) => {
        const mine = rows.filter((r) => r.truckId === t.id);
        const todays = mine.filter((r) => bhParts(r.scheduledFor ?? r.createdAt).date === today);
        return {
          id: t.id,
          slug: t.slug,
          nameEn: t.nameEn,
          nameAr: t.nameAr,
          status: t.status,
          ordersToday: todays.length,
          revenueToday: todays.reduce((a, r) => a + r.total, 0),
          ordersMonth: mine.length,
          revenueMonth: mine.reduce((a, r) => a + r.total, 0),
          pending: pending.find((p) => p.truckId === t.id)?.n ?? 0,
        };
      });
      void settings;
      return ok({ stats });
    }
    case "orders": {
      const settings = await getSettings();
      const slug = url.searchParams.get("truck");
      const t = slug && slug !== "all" ? await getTruck(slug) : null;
      const rows = await db
        .select()
        .from(orders)
        .where(t ? eq(orders.truckId, t.id) : undefined)
        .orderBy(desc(orders.createdAt))
        .limit(150);
      return ok({ orders: await hydrateOrders(rows, settings), now: new Date().toISOString() });
    }
  }
  throw new ApiError("not_found", 404);
}

export const GET = route((req: Request, ctx: Ctx) => handle("GET", req, ctx));
export const POST = route((req: Request, ctx: Ctx) => handle("POST", req, ctx));
export const PUT = route((req: Request, ctx: Ctx) => handle("PUT", req, ctx));
export const DELETE = route((req: Request, ctx: Ctx) => handle("DELETE", req, ctx));
