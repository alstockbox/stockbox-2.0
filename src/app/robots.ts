import type { MetadataRoute } from "next";
import { getPublicStockSnapshotSitemapIds } from "@/lib/seo/public-snapshots";

const privatePaths = [
  "/admin", "/api", "/auth", "/dashboard", "/settings", "/affiliate",
  "/watchlist", "/portfolio", "/analysis", "/history", "/compare",
  "/batch", "/analyze", "/shared", "/redeem", "/r/", "/onboarding",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app").replace(/\/$/, "");
  const publicRule = { allow: "/", disallow: privatePaths };
  const stockSitemapIds = await getPublicStockSnapshotSitemapIds();

  return {
    rules: [
      { userAgent: "*", ...publicRule },
      { userAgent: "OAI-SearchBot", ...publicRule },
      { userAgent: "ChatGPT-User", ...publicRule },
    ],
    sitemap: [
      `${base}/sitemap.xml`,
      ...stockSitemapIds.map((id) => `${base}/aktier/sitemap/${id}.xml`),
    ],
    host: base,
  };
}
