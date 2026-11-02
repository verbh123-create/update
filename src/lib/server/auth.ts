import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff, customers } from "@/db/schema";
import { ADMIN_PERMISSIONS, type Permission } from "@/lib/types";

// Set AUTH_SECRET in production. The fallback derives from DATABASE_URL so sessions are never unsigned.
const SECRET = process.env.AUTH_SECRET || `street-taste::${process.env.DATABASE_URL ?? "local"}`;

const scryptAsync = (pw: string, salt: string) =>
  new Promise<Buffer>((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(pw, salt);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const key = await scryptAsync(pw, salt);
  const a = Buffer.from(hash, "hex");
  return a.length === key.length && crypto.timingSafeEqual(a, key);
}

export const hashCode = (code: string, email: string) =>
  crypto.createHmac("sha256", SECRET).update(`${email.toLowerCase()}:${code}`).digest("hex");
export const randomToken = (bytes = 16) => crypto.randomBytes(bytes).toString("hex");
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

type Kind = "staff" | "customer";
const COOKIE: Record<Kind, string> = { staff: "st_staff", customer: "st_cust" };

function sign(payload: object): string {
  const b = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const s = crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
  return `${b}.${s}`;
}

function verifyToken(token: string): { id: number; exp: number } | null {
  const [b, s] = token.split(".");
  if (!b || !s) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
  if (!safeEqual(s, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(b, "base64url").toString());
    if (typeof p.id !== "number" || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export async function setSession(kind: Kind, id: number, days = 14) {
  const h = await headers();
  const secure = h.get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE[kind], sign({ id, exp: Date.now() + days * 86400_000 }), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: days * 86400,
  });
}

export async function clearSession(kind: Kind) {
  (await cookies()).delete(COOKIE[kind]);
}

export type StaffUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  truckId: number | null;
  permissions: string[];
  protected: boolean;
  isSuper: boolean;
};

export async function getStaff(): Promise<StaffUser | null> {
  const token = (await cookies()).get(COOKIE.staff)?.value;
  const p = token ? verifyToken(token) : null;
  if (!p) return null;
  const [s] = await db.select().from(staff).where(eq(staff.id, p.id)).limit(1);
  if (!s || !s.active) return null;
  return {
    id: s.id,
    username: s.username,
    name: s.name,
    role: s.role,
    truckId: s.truckId,
    permissions: s.permissions,
    protected: s.protected,
    isSuper: s.role === "super",
  };
}

export type CustomerUser = {
  id: number;
  name: string;
  phone: string;
  email: string;
  regionName: string;
  address: string;
  loyalty: Record<string, number>;
};

export async function getCustomer(): Promise<CustomerUser | null> {
  const token = (await cookies()).get(COOKIE.customer)?.value;
  const p = token ? verifyToken(token) : null;
  if (!p) return null;
  const [c] = await db.select().from(customers).where(eq(customers.id, p.id)).limit(1);
  if (!c) return null;
  return { id: c.id, name: c.name, phone: c.phone, email: c.email, regionName: c.regionName, address: c.address, loyalty: c.loyalty };
}

export function canDo(u: StaffUser | null, truckId: number | null, perm: Permission): boolean {
  if (!u) return false;
  if (u.isSuper) return true;
  if (u.truckId !== null && truckId !== null && u.truckId !== truckId) return false;
  if (u.truckId !== null && truckId === null) return false;
  return u.permissions.includes(perm);
}

export function canAdmin(u: StaffUser | null, truckId: number): boolean {
  if (!u) return false;
  if (u.isSuper) return true;
  if (u.truckId !== null && u.truckId !== truckId) return false;
  return ADMIN_PERMISSIONS.some((p) => u.permissions.includes(p));
}

const buckets = (globalThis as unknown as { __rl?: Map<string, number[]> }).__rl ?? new Map<string, number[]>();
(globalThis as unknown as { __rl?: Map<string, number[]> }).__rl = buckets;

/** Returns true when the action is allowed. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
