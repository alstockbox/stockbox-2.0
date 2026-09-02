import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("ETF analysis SEO guide", () => {
  it("publishes a dedicated Swedish ETF analysis guide with truthful fund-specific methodology", () => {
    const page = read("src/app/guider/analysera-etf/page.tsx");
    expect(page).toContain("Hur analyserar man en ETF?");
    expect(page).toContain('canonical: "/guider/analysera-etf"');
    expect(page).toContain("SeoJsonLd");
    expect(page).toContain('"@type": "TechArticle"');
    expect(page).toContain("Expense ratio");
    expect(page).toContain("Tracking difference");
    expect(page).toContain("Likviditet");
    expect(page).toContain("Look-through");
    expect(page).toContain("Bond-ETF");
    expect(page).toContain("råvaru-ETF");
    expect(page).toContain("hävstång");
    expect(page).toContain("saknade faktorer");
  });

  it("connects ETF analysis into StockBox public discovery surfaces", () => {
    const guides = read("src/app/guider/page.tsx");
    const sitemap = read("src/app/sitemap.ts");
    const llms = read("src/app/llms.txt/route.ts");

    expect(guides).toContain('"/guider/analysera-etf"');
    expect(sitemap).toContain('path: "/guider/analysera-etf"');
    expect(llms).toContain("/guider/analysera-etf");
  });
});
