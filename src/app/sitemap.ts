import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return [
    { url: base, lastModified: new Date() },
    { url: `${base}/pricing`, lastModified: new Date() },
    { url: `${base}/analyze`, lastModified: new Date() },
    { url: `${base}/docs/methodology`, lastModified: new Date() },
    { url: `${base}/legal/privacy`, lastModified: new Date() },
    { url: `${base}/legal/terms`, lastModified: new Date() }
  ];
}
