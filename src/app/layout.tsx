import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/app-shell/nav";
import { AppFooter } from "@/components/app-shell/footer";
import { getLocale } from "@/lib/i18n/server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "StockBox | Understand any stock faster",
    template: "%s | StockBox"
  },
  description:
    "StockBox turns filings, market data, scoring logic, and research workflows into a clear equity analysis workspace.",
  openGraph: {
    title: "StockBox",
    description: "Understand any stock faster.",
    type: "website"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07111f"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <AppNav />
        <main>{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
