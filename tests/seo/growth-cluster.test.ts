import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const guidePages = [
  ["src/app/nyckeltal/page.tsx", "/nyckeltal"],
  ["src/app/nyckeltal/ev-ebitda/page.tsx", "/nyckeltal/ev-ebitda"],
  ["src/app/nyckeltal/roic/page.tsx", "/nyckeltal/roic"],
  ["src/app/nyckeltal/fritt-kassaflode/page.tsx", "/nyckeltal/fritt-kassaflode"],
] as const;

describe("SEO growth cluster", () => {
  it.each(guidePages)("gives %s unique metadata and canonical", (path, canonical) => {
    const content = read(path);
    expect(content).toContain("description:");
    expect(content).toContain(`canonical: \"${canonical}\"`);
    expect(content).toContain("SeoJsonLd");
  });

  it("discovers the complete valuation and quality cluster in the sitemap", () => {
    const sitemap = read("src/app/sitemap.ts");
    for (const path of ["/nyckeltal", "/nyckeltal/pe-tal", "/nyckeltal/ev-ebitda", "/nyckeltal/roic", "/nyckeltal/fritt-kassaflode"]) {
      expect(sitemap).toContain(`\"${path}\"`);
    }
  });

  it("links the metric cluster from the public stock template", () => {
    const page = read("src/app/aktier/[slug]/page.tsx");
    expect(page).toContain('href="/nyckeltal/pe-tal"');
    expect(page).toContain('href="/nyckeltal/ev-ebitda"');
    expect(page).toContain('href="/nyckeltal/roic"');
    expect(page).toContain('href="/nyckeltal/fritt-kassaflode"');
  });
});
