import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/app-shell/nav";
import { AppFooter } from "@/components/app-shell/footer";
import { BrowserAnalytics } from "@/components/analytics/browser-analytics";
import { getServerEnv } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLegalSeller } from "@/lib/legal/commerce";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app"),
  title: {
    default: "StockBox | Aktieanalys & data-driven stock analysis",
    template: "%s | StockBox",
  },
  description:
    "StockBox är ett datadrivet verktyg för aktieanalys och equity research med värdering, tillväxt, lönsamhet, risk, synliga källor, datatäckning och konfidens.",
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  robots: {
    googleBot: {
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/images/stockbox-logo.png",
    shortcut: "/images/stockbox-logo.png",
    apple: "/images/stockbox-logo.png",
  },
  openGraph: {
    title: "StockBox | Aktieanalys & data-driven stock analysis",
    description:
      "Analysera aktier med verifierbara data, modellbaserade beräkningar, StockBox Score, synliga källor och ärlig hantering av saknad data.",
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
  twitter: {
    card: "summary_large_image",
    title: "StockBox | Aktieanalys & data-driven stock analysis",
    description: "Datadriven aktieanalys med StockBox Score, synliga källor, datatäckning och konfidens.",
    images: ["/images/stockbox-logo.png"],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07111f" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const navCopy = getP0Copy(locale).nav;
  const env = getServerEnv();
  const seller = getLegalSeller(env);
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app").replace(/\/$/, "");
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${baseUrl}/#organization`,
        name: "StockBox",
        legalName: seller.businessName || undefined,
        identifier: seller.organizationNumber || undefined,
        url: baseUrl,
        logo: `${baseUrl}/images/stockbox-logo.png`,
        email: seller.supportEmail || undefined,
        telephone: seller.supportPhone || undefined,
        taxID: seller.vatNumber || undefined,
        address: seller.postalAddress
          ? {
              "@type": "PostalAddress",
              streetAddress: seller.postalAddress,
              addressCountry: "SE",
            }
          : undefined,
        contactPoint: seller.supportEmail || seller.supportPhone
          ? {
              "@type": "ContactPoint",
              contactType: "customer support",
              email: seller.supportEmail || undefined,
              telephone: seller.supportPhone || undefined,
              availableLanguage: ["sv", "en"],
            }
          : undefined,
        sameAs: ["https://www.youtube.com/@Getstockbox", "https://www.tiktok.com/@alstockbox"],
      },
      { "@type": "WebSite", "@id": `${baseUrl}/#website`, name: "StockBox", url: baseUrl, publisher: { "@id": `${baseUrl}/#organization` } },
      {
        "@type": "SoftwareApplication",
        "@id": `${baseUrl}/#software`,
        name: "StockBox",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: baseUrl,
        description: "Data-driven stock analysis and equity research with visible data provenance, coverage and confidence.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "SEK" },
      },
    ],
  };

  return (
    <html lang={locale} className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[#f4efe5] focus:px-4 focus:py-2 focus:text-sm font-semibold text-[#07111f]">
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
