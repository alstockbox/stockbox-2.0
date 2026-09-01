import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("SEO trust and authority contract", () => {
  it("makes the data-source registry machine readable", () => {
    const page = read("src/app/data-sources/page.tsx");
    expect(page).toContain("SeoJsonLd");
    expect(page).toContain('"@type": "ItemList"');
    expect(page).toContain("itemListElement");
  });

  it("publishes methodology as a versioned technical document", () => {
    const page = read("src/app/docs/methodology/page.tsx");
    expect(page).toContain("SeoJsonLd");
    expect(page).toContain('"@type": "TechArticle"');
    expect(page).toContain("MODEL_VERSION");
  });

  it("publishes the about page with organization relationship schema", () => {
    const page = read("src/app/about/page.tsx");
    expect(page).toContain("SeoJsonLd");
    expect(page).toContain('"@type": "AboutPage"');
    expect(page).toContain("#organization");
  });

  it("defines a stable SoftwareApplication entity before other pages reference it", () => {
    const layout = read("src/app/layout.tsx");
    const tools = read("src/app/aktieanalys-verktyg/page.tsx");
    expect(layout).toContain('"@id": `${baseUrl}/#software`');
    expect(tools).toContain('`${baseUrl.replace(/\\/$/, "")}/#software`');
  });

  it("links the key-metric hub from the global footer", () => {
    const footer = read("src/components/app-shell/footer.tsx");
    expect(footer).toContain('["/nyckeltal",');
  });

  it("uses the key-metric hub as the P/E breadcrumb parent", () => {
    const pe = read("src/app/nyckeltal/pe-tal/page.tsx");
    expect(pe).toContain('{ label: "Nyckeltal", href: "/nyckeltal" }');
  });
});
