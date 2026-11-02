import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return new Response("Not found", { status: 404 });
  const [a] = await db.select().from(assets).where(eq(assets.id, n)).limit(1);
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(a.data, "base64")), {
    headers: {
      "Content-Type": a.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
