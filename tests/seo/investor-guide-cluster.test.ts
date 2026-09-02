import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const guides = [
  ["src/app/guider/page.tsx", "/guider"],
  ["src/app/guider/hur-analyserar-man-en-aktie/page.tsx", "/guider/hur-analyserar-man-en-aktie"],
  ["src/app/guider/hur-varderar-man-en-aktie/page.tsx", "/guider/hur-varderar-man-en-aktie"],
  ["src/app/aktieanalys-verktyg/page.tsx", "/aktieanalys-verktyg"],
] as const;

describe("investor education SEO cluster", () => {
  it.each(guides)("ships useful server-rendered content for %s", (path, canonical) => {
    const page = read(path);
    expect(page).toContain("export const metadata");
    expect(page).toContain(`canonical: \"${canonical}\"`);
    expect(page).toContain("SeoHero");
    expect(page).toContain("SeoSection");
    expect(page).toContain("SeoJsonLd");
  });

  it("discovers the guide cluster in the root sitemap", () => {
    const sitemap = read("src/app/sitemap.ts");
    for (const canonical of guides.map(([, canonical]) => canonical)) {
      expect(sitemap).toContain(canonical);
    }
  });

  it("declares Swedish language for the guide cluster", () => {
    const config = read("next.config.ts");
    expect(config).toContain("/guider/:path*");
    expect(config).toContain("/aktieanalys-verktyg");
  });

  it("links evergreen guides into the public navigation graph", () => {
    const footer = read("src/components/app-shell/footer.tsx");
    expect(footer).toContain("/guider/hur-analyserar-man-en-aktie");
    expect(footer).toContain("/aktieanalys-verktyg");
  });
});
