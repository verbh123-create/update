import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, otps } from "@/db/schema";
import {
  clearSession,
  clientIp,
  getCustomer,
  hashCode,
  hashPassword,
  randomCode,
  rateLimit,
  safeEqual,
  setSession,
  verifyPassword,
} from "@/lib/server/auth";
import { ensureSeed } from "@/lib/server/config";
import { ApiError, ok, readBody, route, str } from "@/lib/server/http";
import { mailConfigured, otpEmail, sendMail } from "@/lib/server/mail";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone = (v: unknown) => str(v, 30).replace(/[^\d+]/g, "");
const phoneOk = (p: string) => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15;

async function issueOtp(email: string, purpose: "signup" | "reset", payload: Record<string, string> | null) {
  const code = randomCode();
  await db.delete(otps).where(and(eq(otps.email, email), eq(otps.purpose, purpose)));
  await db.insert(otps).values({
    email,
    purpose,
    codeHash: hashCode(code, email),
    payload,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  if (mailConfigured()) {
    const m = otpEmail(code, purpose);
    if (!(await sendMail(email, m.subject, m.html))) {
      await db.delete(otps).where(and(eq(otps.email, email), eq(otps.purpose, purpose)));
      throw new ApiError("mail_failed", 502);
    }
    return {};
  }
  console.log(`[otp] ${purpose} code for ${email}: ${code} (set RESEND_API_KEY to send real e-mails)`);
  return { devCode: code };
}

async function checkOtp(email: string, purpose: "signup" | "reset", code: string) {
  const [o] = await db
    .select()
    .from(otps)
    .where(and(eq(otps.email, email), eq(otps.purpose, purpose)))
    .orderBy(desc(otps.createdAt))
    .limit(1);
  if (!o) throw new ApiError("invalid_otp");
  if (o.expiresAt.getTime() < Date.now()) throw new ApiError("otp_expired");
  if (o.attempts >= 5) throw new ApiError("too_many", 429);
  if (!safeEqual(o.codeHash, hashCode(code, email))) {
    await db.update(otps).set({ attempts: o.attempts + 1 }).where(eq(otps.id, o.id));
    throw new ApiError("invalid_otp");
  }
  return o;
}

export const GET = route(async () => {
  const c = await getCustomer();
  return ok({ customer: c });
});

export const POST = route(async (req: Request) => {
  const b = await readBody(req);
  const action = str(b.action, 20);
  const ip = clientIp(req);
  await ensureSeed();

  if (action === "logout") {
    await clearSession("customer");
    return ok();
  }

  if (action === "register") {
    if (!rateLimit(`reg:${ip}`, 10, 15 * 60_000)) throw new ApiError("too_many", 429);
    const name = str(b.name, 80);
    const phone = cleanPhone(b.phone);
    const email = str(b.email, 120).toLowerCase();
    const password = str(b.password, 200);
    const regionName = str(b.regionName, 80);
    const address = str(b.address, 300);
    if (!name || !phoneOk(phone) || !EMAIL.test(email) || !regionName || address.length < 3) throw new ApiError("invalid_input");
    if (password.length < 6) throw new ApiError("weak_password");
    const [exists] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
    if (exists) throw new ApiError("email_exists", 409);
    const payload = { name, phone, regionName, address, passwordHash: await hashPassword(password) };
    return ok(await issueOtp(email, "signup", payload));
  }

  if (action === "verify") {
    const email = str(b.email, 120).toLowerCase();
    if (!rateLimit(`otp:${ip}:${email}`, 12, 15 * 60_000)) throw new ApiError("too_many", 429);
    const o = await checkOtp(email, "signup", str(b.code, 10));
    const p = o.payload;
    if (!p) throw new ApiError("invalid_otp");
    const [exists] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
    if (exists) throw new ApiError("email_exists", 409);
    const [c] = await db
      .insert(customers)
      .values({ name: p.name, phone: p.phone, email, passwordHash: p.passwordHash, regionName: p.regionName, address: p.address })
      .returning({ id: customers.id });
    await db.delete(otps).where(eq(otps.email, email));
    await setSession("customer", c.id, 30);
    return ok();
  }

  if (action === "resend") {
    const email = str(b.email, 120).toLowerCase();
    const purpose = b.purpose === "reset" ? "reset" : "signup";
    if (!rateLimit(`resend:${ip}:${email}`, 4, 15 * 60_000)) throw new ApiError("too_many", 429);
    if (purpose === "signup") {
      const [o] = await db.select().from(otps).where(and(eq(otps.email, email), eq(otps.purpose, "signup"))).orderBy(desc(otps.createdAt)).limit(1);
      if (!o?.payload) throw new ApiError("invalid_otp");
      return ok(await issueOtp(email, "signup", o.payload));
    }
    const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
    return ok(c ? await issueOtp(email, "reset", null) : {});
  }

  if (action === "login") {
    const id = str(b.id, 120).toLowerCase();
    const password = str(b.password, 200);
    if (!rateLimit(`login:${ip}:${id}`, 8, 10 * 60_000)) throw new ApiError("too_many", 429);
    const phone = cleanPhone(id);
    const [c] = await db
      .select()
      .from(customers)
      .where(phone.length >= 7 ? sql`${customers.email} = ${id} or ${customers.phone} = ${phone}` : eq(customers.email, id))
      .limit(1);
    if (!c || !(await verifyPassword(password, c.passwordHash))) throw new ApiError("invalid_credentials", 401);
    await setSession("customer", c.id, 30);
    return ok();
  }

  if (action === "forgot") {
    const email = str(b.email, 120).toLowerCase();
    if (!rateLimit(`forgot:${ip}:${email}`, 4, 15 * 60_000)) throw new ApiError("too_many", 429);
    const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
    return ok(c ? await issueOtp(email, "reset", null) : {});
  }

  if (action === "reset") {
    const email = str(b.email, 120).toLowerCase();
    const password = str(b.password, 200);
    if (password.length < 6) throw new ApiError("weak_password");
    if (!rateLimit(`rst:${ip}:${email}`, 10, 15 * 60_000)) throw new ApiError("too_many", 429);
    await checkOtp(email, "reset", str(b.code, 10));
    const [c] = await db
      .update(customers)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(customers.email, email))
      .returning({ id: customers.id });
    if (!c) throw new ApiError("invalid_otp");
    await db.delete(otps).where(eq(otps.email, email));
    await setSession("customer", c.id, 30);
    return ok();
  }

  throw new ApiError("invalid_input");
});

export const PATCH = route(async (req: Request) => {
  const me = await getCustomer();
  if (!me) throw new ApiError("unauthorized", 401);
  const b = await readBody(req);
  const patch: Partial<typeof customers.$inferInsert> = {};
  if (b.name !== undefined) {
    const v = str(b.name, 80);
    if (!v) throw new ApiError("invalid_input");
    patch.name = v;
  }
  if (b.phone !== undefined) {
    const v = cleanPhone(b.phone);
    if (!phoneOk(v)) throw new ApiError("invalid_input");
    patch.phone = v;
  }
  if (b.regionName !== undefined) patch.regionName = str(b.regionName, 80);
  if (b.address !== undefined) patch.address = str(b.address, 300);
  if (b.password) {
    const pw = str(b.password, 200);
    if (pw.length < 6) throw new ApiError("weak_password");
    patch.passwordHash = await hashPassword(pw);
  }
  if (Object.keys(patch).length) await db.update(customers).set(patch).where(eq(customers.id, me.id));
  return ok({ customer: await getCustomer() });
});
