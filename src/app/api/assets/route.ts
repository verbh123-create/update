import { db } from "@/db";
import { assets } from "@/db/schema";
import { getStaff } from "@/lib/server/auth";
import { ApiError, ok, route } from "@/lib/server/http";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 4 * 1024 * 1024;

// Upload an image from the admin file picker. Images live in PostgreSQL so deployments on
// read-only filesystems (Vercel) work out of the box.
export const POST = route(async (req: Request) => {
  const s = await getStaff();
  if (!s || (!s.isSuper && s.permissions.length === 0)) throw new ApiError("unauthorized", 401);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("invalid_input");
  if (!ALLOWED.includes(file.type)) throw new ApiError("invalid_input", 415);
  if (file.size > MAX_BYTES) throw new ApiError("invalid_input", 413);
  const buf = Buffer.from(await file.arrayBuffer());
  const [row] = await db
    .insert(assets)
    .values({ name: file.name.slice(0, 120), mime: file.type, data: buf.toString("base64") })
    .returning({ id: assets.id });
  return ok({ url: `/api/assets/${row.id}` });
});
