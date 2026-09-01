import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("crawler and entity SEO contract", () => {
  it("adds explicit noindex response headers to private application surfaces", () => {
    const config = read("next.config.ts");
    expect(config).toContain("X-Robots-Tag");
    expect(config).toContain("noindex, nofollow");
    for (const path of ["/admin/:path*", "/dashboard/:path*", "/analysis/:path*", "/settings/:path*", "/portfolio/:path*", "/watchlist/:path*"]) {
      expect(config).toContain(path);
    }
  });

  it("allows full search snippets and large image previews on public pages", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("maxImagePreview: \"large\"");
    expect(layout).toContain("maxSnippet: -1");
    expect(layout).toContain("maxVideoPreview: -1");
  });

  it("exposes public stocks as a machine-readable ItemList", () => {
    const page = read("src/app/aktier/page.tsx");
    expect(page).toContain('"@type": "ItemList"');
    expect(page).toContain("itemListElement");
    expect(page).toContain("SeoJsonLd");
  });

  it("documents the metric knowledge cluster for AI consumers", () => {
    const llms = read("src/app/llms.txt/route.ts");
    for (const path of ["/nyckeltal", "/nyckeltal/pe-tal", "/nyckeltal/ev-ebitda", "/nyckeltal/roic", "/nyckeltal/fritt-kassaflode"]) {
      expect(llms).toContain(path);
    }
  });
});
