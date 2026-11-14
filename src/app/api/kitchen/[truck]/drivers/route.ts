import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { drivers } from "@/db/schema";
import { getTruck } from "@/lib/server/config";
import { ApiError, ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ truck: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  const { truck } = await ctx.params;
  const t = await getTruck(truck);
  if (!t) throw new ApiError("not_found", 404);

  const list = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.truckId, t.id), eq(drivers.active, true)));

  return ok({ drivers: list });
});