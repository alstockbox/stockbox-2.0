import type { MetadataRoute } from "next";

const staticEntries: Array<{
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}> = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/aktieanalys", changeFrequency: "monthly", priority: 0.95 },
  { path: "/aktieanalys-verktyg", changeFrequency: "monthly", priority: 0.9 },
  { path: "/ai-aktieanalys", changeFrequency: "monthly", priority: 0.9 },
  { path: "/fundamental-analys", changeFrequency: "monthly", priority: 0.9 },
  { path: "/guider", changeFrequency: "monthly", priority: 0.85 },
  { path: "/guider/hur-analyserar-man-en-aktie", changeFrequency: "monthly", priority: 0.9 },
  { path: "/guider/hur-varderar-man-en-aktie", changeFrequency: "monthly", priority: 0.9 },
  { path: "/guider/analysera-investmentbolag", changeFrequency: "monthly", priority: 0.9 },
  { path: "/nyckeltal", changeFrequency: "monthly", priority: 0.9 },
  { path: "/nyckeltal/pe-tal", changeFrequency: "monthly", priority: 0.85 },
  { path: "/nyckeltal/ev-ebitda", changeFrequency: "monthly", priority: 0.85 },
  { path: "/nyckeltal/roic", changeFrequency: "monthly", priority: 0.85 },
  { path: "/nyckeltal/fritt-kassaflode", changeFrequency: "monthly", priority: 0.85 },
  { path: "/aktier", changeFrequency: "daily", priority: 0.9 },
  { path: "/research-standard", changeFrequency: "monthly", priority: 0.8 },
  { path: "/product", changeFrequency: "monthly", priority: 0.7 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "yearly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/data-sources", changeFrequency: "monthly", priority: 0.75 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.65 },
  { path: "/sample-analysis", changeFrequency: "monthly", priority: 0.8 },
  { path: "/docs/methodology", changeFrequency: "monthly", priority: 0.8 },
  { path: "/changelog", changeFrequency: "weekly", priority: 0.5 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/withdraw", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/withdrawal-form", changeFrequency: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app").replace(/\/$/, "");
  return staticEntries.map((entry) => ({
    url: `${base}${entry.path}`,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
