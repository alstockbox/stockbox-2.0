import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import { notifyIndexNow } from "@/lib/seo/indexnow";
import { publishAnalysisSnapshot } from "@/lib/seo/public-snapshots";

export const runtime = "nodejs";

const publishSchema = z.object({
  analysisId: z.string().uuid(),
  slug: z.string().trim().min(1).max(120).optional(),
  metaDescription: z.string().trim().min(40).max(180).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403 });

  const parsed = publishSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid SEO publication request.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const published = await publishAnalysisSnapshot(parsed.data);
  if (!published.ok) {
    return Response.json({ error: published.error }, { status: published.status });
  }

  revalidateTag(`public-stock-snapshot:${published.snapshot.slug}`, "max");
  revalidateTag("public-stock-list", "max");
  revalidatePath(`/aktier/${published.snapshot.slug}`);
  revalidatePath("/aktier");
  revalidatePath("/robots.txt");
  revalidatePath("/sitemap.xml");

  const baseUrl = getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  await notifyIndexNow([
    `${baseUrl}/aktier/${published.snapshot.slug}`,
    `${baseUrl}/aktier`,
  ]);

  return Response.json({
    ok: true,
    data: {
      slug: published.snapshot.slug,
      ticker: published.snapshot.ticker,
      companyName: published.snapshot.companyName,
      score: published.snapshot.score,
      confidence: published.snapshot.confidence,
      dataCoverage: published.snapshot.dataCoverage,
      updatedAt: published.snapshot.updatedAt,
    },
  });
}
