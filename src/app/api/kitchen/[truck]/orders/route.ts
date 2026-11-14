import { and, desc, eq, gte, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, drivers } from "@/db/schema";
import { canDo, getStaff } from "@/lib/server/auth";
import { getSettings, getTruck } from "@/lib/server/config";
import { ApiError, num, ok, readBody, route } from "@/lib/server/http";
import { hydrateOrders } from "@/lib/server/logic";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ truck: string }> };

async function authorize(ctx: Ctx) {
  const t = await getTruck((await ctx.params).truck);
  if (!t) throw new ApiError("not_found", 404);
  const s = await getStaff();
  if (!s) throw new ApiError("unauthorized", 401);
  if (!canDo(s, t.id, "kitchen")) throw new ApiError("forbidden", 403);
  return t;
}

// Card orders stay hidden from the kitchen until the gateway confirms payment.
const visible = sql`not (${orders.paymentMethod} = 'card' and ${orders.paymentStatus} <> 'paid')`;

export const GET = route(async (req: Request, ctx: Ctx) => {
  const t = await authorize(ctx);
  const settings = await getSettings();
  const horizon = new Date(Date.now() + 72 * 3600_000);
  const pending = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.truckId, t.id),
        eq(orders.status, "NOT_READY"),
        visible,
        or(ne(orders.kind, "subscription"), lte(orders.scheduledFor, horizon)),
      ),
    )
    .orderBy(sql`coalesce(${orders.scheduledFor}, ${orders.createdAt})`)
    .limit(200);
  let done: typeof pending = [];
  if (new URL(req.url).searchParams.get("completed") === "1") {
    done = await db
      .select()
      .from(orders)
      .where(and(eq(orders.truckId, t.id), eq(orders.status, "COMPLETED"), gte(orders.completedAt, new Date(Date.now() - 3 * 3600_000))))
      .orderBy(desc(orders.completedAt))
      .limit(30);
  }
  return ok({
    orders: await hydrateOrders(pending, settings),
    completed: await hydrateOrders(done, settings),
    now: new Date().toISOString(),
  });
});

// NOT_READY -> COMPLETED is a one-way transition.
export const POST = route(async (req: Request, ctx: Ctx) => {
  const t = await authorize(ctx);
  const b = await readBody(req);
  const driverId = b.driverId ? Number(b.driverId) : null;
  const orderId = num(b.orderId);

  // جلب الطلب لمعرفة رسوم التوصيل للمنطقة في حال كانت العمولة تعتمد على المنطقة
  const [targetOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

  // جلب بيانات السائق وطريقة احتساب العمولة الخاصة به (ثابت أو حسب المنطقة)
  let driverCommission = 0;
  if (driverId) {
    const [drv] = await db.select().from(drivers).where(eq(drivers.id, driverId));
    if (drv) {
      if (drv.commissionType === "region" && targetOrder) {
        // العمولة تصبح مساوية لرسوم التوصيل الخاصة بالمنطقة للطلب
        driverCommission = Number(targetOrder.deliveryFee) || 0;
      } else {
        // العمولة مبلغ ثابت كما حدده المدير
        driverCommission = Number(drv.defaultCommission) || 0;
      }
    }
  }

  const [row] = await db
    .update(orders)
    .set({ 
      status: "COMPLETED", 
      completedAt: new Date(),
      driverId: driverId,
      deliveryState: "delivered",     // ضروري جداً لكي يعتمدها تقرير السائقين
      driverCommission: driverCommission // تسجيل العمولة المحسوبة للطلب
    })
    .where(and(eq(orders.id, orderId), eq(orders.truckId, t.id), eq(orders.status, "NOT_READY")))
    .returning({ id: orders.id });
    
  if (!row) throw new ApiError("completed_locked", 409);
  return ok();
});