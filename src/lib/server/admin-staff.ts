import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { PERMISSIONS } from "@/lib/types";
import { ApiError, num, str } from "./http";
import { hashPassword, type StaffUser } from "./auth";

type Scope = number | "all";

const pub = (s: typeof staff.$inferSelect) => ({
  id: s.id,
  username: s.username,
  name: s.name,
  role: s.role,
  truckId: s.truckId,
  permissions: s.permissions,
  protected: s.protected,
  active: s.active,
});

function cleanPerms(v: unknown, user: StaffUser): string[] {
  const arr = Array.isArray(v) ? v.map(String) : [];
  return [...new Set(arr)]
    .filter((p) => (PERMISSIONS as readonly string[]).includes(p))
    .filter((p) => user.isSuper || user.permissions.includes(p));
}

export async function listStaff(scope: Scope) {
  const rows =
    scope === "all"
      ? await db.select().from(staff).orderBy(staff.id)
      : await db.select().from(staff).where(or(eq(staff.truckId, scope), eq(staff.role, "super"))).orderBy(staff.id);
  return rows.map(pub);
}

export async function createStaff(user: StaffUser, b: Record<string, unknown>, scope: Scope) {
  const username = str(b.username, 30).toLowerCase();
  const password = str(b.password, 200);
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new ApiError("invalid_input");
  if (password.length < 6) throw new ApiError("weak_password");
  const [exists] = await db.select({ id: staff.id }).from(staff).where(eq(staff.username, username)).limit(1);
  if (exists) throw new ApiError("email_exists", 409);
  let truckId: number | null;
  if (scope === "all") {
    if (!user.isSuper) throw new ApiError("forbidden", 403);
    truckId = b.truckId === null || b.truckId === "" || b.truckId === undefined ? null : num(b.truckId) || null;
  } else truckId = scope;
  const [row] = await db
    .insert(staff)
    .values({
      username,
      passwordHash: await hashPassword(password),
      name: str(b.name, 80),
      role: "staff",
      truckId,
      permissions: cleanPerms(b.permissions, user),
    })
    .returning();
  return pub(row);
}

export async function updateStaff(user: StaffUser, b: Record<string, unknown>, scope: Scope) {
  const [target] = await db.select().from(staff).where(eq(staff.id, num(b.id))).limit(1);
  if (!target) throw new ApiError("not_found", 404);
  const patch: Partial<typeof staff.$inferInsert> = {};

  if (target.protected) {
    // The protected super admin can only be edited by itself, and only name/password.
    if (target.id !== user.id) throw new ApiError("forbidden", 403);
    if (b.name !== undefined) patch.name = str(b.name, 80);
  } else {
    if (scope !== "all" && target.truckId !== scope) throw new ApiError("forbidden", 403);
    if (!user.isSuper && target.role === "super") throw new ApiError("forbidden", 403);
    if (b.name !== undefined) patch.name = str(b.name, 80);
    if (b.permissions !== undefined) patch.permissions = cleanPerms(b.permissions, user);
    if (b.active !== undefined) patch.active = b.active === true && true;
    if (scope === "all" && user.isSuper && b.truckId !== undefined) patch.truckId = num(b.truckId) || null;
  }
  if (b.password) {
    const pw = str(b.password, 200);
    if (pw.length < 6) throw new ApiError("weak_password");
    patch.passwordHash = await hashPassword(pw);
  }
  if (Object.keys(patch).length) await db.update(staff).set(patch).where(eq(staff.id, target.id));
  return { ok: true };
}

export async function deleteStaff(user: StaffUser, id: number, scope: Scope) {
  const [target] = await db.select().from(staff).where(eq(staff.id, id)).limit(1);
  if (!target) throw new ApiError("not_found", 404);
  if (target.protected || target.role === "super" || target.id === user.id) throw new ApiError("forbidden", 403);
  if (scope !== "all" && target.truckId !== scope) throw new ApiError("forbidden", 403);
  await db.delete(staff).where(and(eq(staff.id, id), eq(staff.protected, false)));
}
