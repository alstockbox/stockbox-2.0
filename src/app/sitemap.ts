import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const paths = [
    "", "/product", "/pricing", "/about", "/contact", "/data-sources", "/faq",
    "/sample-analysis", "/docs/methodology", "/changelog", "/legal/privacy", "/legal/terms", "/withdraw", "/legal/withdrawal-form",
  ];
  const staticEntries: MetadataRoute.Sitemap = paths.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/sample-analysis" || path === "/pricing" ? 0.8 : 0.6,
  }));

  const supabase = createAdminClient();
  if (!supabase) return staticEntries;
  const { data } = await supabase
    .from("acq_seo_pages")
    .select("slug,published_at,updated_at")
    .eq("status", "published")
    .not("slug", "is", null)
    .order("published_at", { ascending: false })
    .limit(200);

  const learningEntries: MetadataRoute.Sitemap = (data ?? []).map((page) => ({
    url: `${base}/learn/${page.slug}`,
    lastModified: new Date(page.updated_at || page.published_at || Date.now()),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticEntries, ...learningEntries];
}
