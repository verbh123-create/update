import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { clearSession, clientIp, getStaff, rateLimit, setSession, verifyPassword } from "@/lib/server/auth";
import { ensureSeed } from "@/lib/server/config";
import { ApiError, ok, readBody, route, str } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const s = await getStaff();
  return ok({ staff: s });
});

export const POST = route(async (req: Request) => {
  const b = await readBody(req);
  if (b.action === "logout") {
    await clearSession("staff");
    return ok();
  }
  await ensureSeed();
  const username = str(b.username, 60).toLowerCase();
  const password = str(b.password, 200);
  if (!username || !password) throw new ApiError("invalid_credentials", 401);
  if (!rateLimit(`staff:${clientIp(req)}:${username}`, 8, 10 * 60_000)) throw new ApiError("too_many", 429);
  const [s] = await db.select().from(staff).where(eq(staff.username, username)).limit(1);
  if (!s || !s.active || !(await verifyPassword(password, s.passwordHash))) throw new ApiError("invalid_credentials", 401);
  await setSession("staff", s.id, 3);
  return ok();
});
