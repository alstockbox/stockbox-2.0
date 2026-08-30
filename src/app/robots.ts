import type { MetadataRoute } from "next";

const privatePaths = [
  "/admin", "/api", "/auth", "/dashboard", "/settings", "/affiliate",
  "/watchlist", "/portfolio", "/analysis", "/history", "/compare",
  "/batch", "/analyze", "/shared", "/redeem", "/r/", "/onboarding",
];

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: privatePaths },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
