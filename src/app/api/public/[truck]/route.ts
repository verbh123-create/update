import { getTruck } from "@/lib/server/config";
import { loadStorefront } from "@/lib/server/logic";
import { ApiError, ok, route } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ truck: string }> }) => {
  const { truck: slug } = await ctx.params;
  const t = await getTruck(slug);
  if (!t) throw new ApiError("not_found", 404);
  return ok({ data: await loadStorefront(t) });
});
