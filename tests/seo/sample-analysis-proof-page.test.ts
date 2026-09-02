import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("sample analysis proof pages", () => {
  it("keeps the English sample URL and exposes a dedicated Swedish equivalent", () => {
    const english = read("src/app/sample-analysis/page.tsx");
    const swedish = read("src/app/exempel-aktieanalys/page.tsx");

    expect(english).toContain('canonical: "/sample-analysis"');
    expect(english).toContain('"sv-SE": "/exempel-aktieanalys"');
    expect(swedish).toContain('canonical: "/exempel-aktieanalys"');
    expect(swedish).toContain('"en": "/sample-analysis"');
  });

  it("makes the Swedish page a real, indexable proof-of-product asset", () => {
    const page = read("src/app/exempel-aktieanalys/page.tsx");
    expect(page).toContain("Exempel på aktieanalys");
    expect(page).toContain("SeoJsonLd");
    expect(page).toContain('"@type": ["Article", "WebPage"]');
    expect(page).toContain("datePublished: report.generatedAt");
    expect(page).toContain("softwareVersion: report.modelVersion");
    expect(page).toContain("citation: report.sources.map");
    expect(page).toContain('href="/docs/methodology"');
    expect(page).toContain('href="/data-sources"');
    expect(page).toContain('href="/research-standard"');
    expect(page).toContain('href="/aktier"');
  });

  it("does not trigger company-catalog or provider discovery from crawler-facing proof pages", () => {
    const english = read("src/app/sample-analysis/page.tsx");
    const swedish = read("src/app/exempel-aktieanalys/page.tsx");
    for (const page of [english, swedish]) {
      expect(page).not.toContain("searchCompanyCatalog");
      expect(page).not.toContain("resolveCanonicalCompanySelection");
    }
  });

  it("makes the proof page discoverable from sitemap, guides and AI discovery", () => {
    const sitemap = read("src/app/sitemap.ts");
    const guides = read("src/app/guider/page.tsx");
    const llms = read("src/app/llms.txt/route.ts");
    const config = read("next.config.ts");

    expect(sitemap).toContain('path: "/exempel-aktieanalys"');
    expect(guides).toContain('"/exempel-aktieanalys"');
    expect(llms).toContain("/exempel-aktieanalys");
    expect(config).toContain('"/exempel-aktieanalys"');
  });
});
