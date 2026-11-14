import { eq } from "drizzle-orm";
import { db } from "@/db";
import { drivers } from "@/db/schema";
import { ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  // جلب جميع السائقين النشطين المشتركين للعمل في العربتين
  const list = await db
    .select()
    .from(drivers)
    .where(eq(drivers.active, true));

  return ok({ drivers: list });
});