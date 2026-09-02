import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return [
    { url: base, lastModified: new Date() },
    { url: `${base}/login`, lastModified: new Date() },
    { url: `${base}/app`, lastModified: new Date() },
    { url: `${base}/app/analysis`, lastModified: new Date() },
    { url: `${base}/app/stockbox`, lastModified: new Date() },
    { url: `${base}/app/stockbox/portfolio`, lastModified: new Date() },
    { url: `${base}/app/stockbox/thesis`, lastModified: new Date() }
  ];
}
