import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://app.posthog.com",
    "https://*.posthog.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://www.facebook.com",
    ...(isProduction ? [] : ["http://localhost:*", "ws://localhost:*"]),
  ].join(" "),
  "frame-src 'self' https://checkout.stripe.com https://billing.stripe.com",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const privateIndexingPaths = [
  "/admin/:path*",
  "/api/:path*",
  "/auth/:path*",
  "/dashboard/:path*",
  "/settings/:path*",
  "/affiliate/:path*",
  "/watchlist/:path*",
  "/portfolio/:path*",
  "/analysis/:path*",
  "/history/:path*",
  "/compare/:path*",
  "/batch/:path*",
  "/analyze/:path*",
  "/shared/:path*",
  "/redeem/:path*",
  "/r/:path*",
  "/onboarding/:path*",
] as const;

const swedishSeoPaths = [
  "/aktieanalys",
  "/ai-aktieanalys",
  "/fundamental-analys",
  "/nyckeltal/:path*",
  "/aktier/:path*",
] as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  async redirects() {
    return [
      { source: "/methodology", destination: "/docs/methodology", permanent: true },
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/billing", destination: "/settings/billing", permanent: true },
      { source: "/comparison", destination: "/compare", permanent: true },
      { source: "/login", destination: "/auth/login", permanent: true },
      { source: "/signup", destination: "/auth/signup", permanent: true },
      {
        source: "/:path*",
        has: [{ type: "host", value: "getstockbox.app" }],
        destination: "https://www.getstockbox.app/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      ...privateIndexingPaths.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      ...swedishSeoPaths.map((source) => ({
        source,
        headers: [{ key: "Content-Language", value: "sv-SE" }],
      })),
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload"
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy
          },
        ]
      }
    ];
  }
};

export default nextConfig;
