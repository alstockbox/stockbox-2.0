import type { MetadataRoute } from "next";

const privatePaths = [
  "/admin", "/api", "/auth", "/dashboard", "/settings", "/affiliate",
  "/watchlist", "/portfolio", "/analysis", "/history", "/compare",
  "/batch", "/analyze", "/shared", "/redeem", "/r/", "/onboarding",
];

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app").replace(/\/$/, "");
  const publicRule = { allow: "/", disallow: privatePaths };
  return {
    rules: [
      { userAgent: "*", ...publicRule },
      { userAgent: "OAI-SearchBot", ...publicRule },
      { userAgent: "ChatGPT-User", ...publicRule },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
