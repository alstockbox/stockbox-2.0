import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/app-shell/nav";
import { AppFooter } from "@/components/app-shell/footer";
import { BrowserAnalytics } from "@/components/analytics/browser-analytics";
import { getServerEnv } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app"),
  title: {
    default: "StockBox | Data-driven stock analysis",
    template: "%s | StockBox",
  },
  description:
    "StockBox turns filings, market data, scoring logic and research workflows into data-driven equity analysis with visible sources, coverage and confidence.",
  icons: {
    icon: "/images/stockbox-logo.png",
    shortcut: "/images/stockbox-logo.png",
    apple: "/images/stockbox-logo.png",
  },
  openGraph: {
    title: "StockBox | Data-driven stock analysis",
    description:
      "Understand any stock faster with visible sources, deterministic calculations and honest missing-data handling.",
    type: "website",
    siteName: "StockBox",
    images: [
      {
        url: "/images/stockbox-logo.png",
        width: 1254,
        height: 1254,
        alt: "StockBox official emblem",
      },
    ],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07111f" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const navCopy = getP0Copy(locale).nav;
  const env = getServerEnv();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app";
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${baseUrl}/#organization`, name: "StockBox", url: baseUrl, logo: `${baseUrl}/images/stockbox-logo.png` },
      { "@type": "WebSite", "@id": `${baseUrl}/#website`, name: "StockBox", url: baseUrl, publisher: { "@id": `${baseUrl}/#organization` } },
      {
        "@type": "SoftwareApplication",
        name: "StockBox",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: baseUrl,
        offers: { "@type": "Offer", price: "0", priceCurrency: "SEK" },
      },
    ],
  };

  return (
    <html lang={locale} className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[#f4efe5] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#07111f]">
          {navCopy.skipMain}
        </a>
        <AppNav />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <AppFooter />
        <BrowserAnalytics gaId={env.NEXT_PUBLIC_GA_ID || undefined} metaPixelId={env.NEXT_PUBLIC_META_PIXEL_ID || undefined} locale={locale} />
        <Analytics />
      </body>
    </html>
  );
}
