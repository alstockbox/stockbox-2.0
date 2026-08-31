import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const paths = [
    "", "/pricing", "/about", "/contact", "/data-sources", "/faq",
    "/sample-analysis", "/docs/methodology", "/changelog", "/legal/privacy", "/legal/terms", "/withdraw",
  ];
  return paths.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/sample-analysis" || path === "/pricing" ? 0.8 : 0.6,
  }));
}
