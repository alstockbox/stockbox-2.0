import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const home = read("src/app/page.tsx");
const nav = read("src/components/app-shell/nav.tsx");
const footer = read("src/components/app-shell/footer.tsx");
const pricing = read("src/app/pricing/page.tsx");
const methodology = read("src/app/docs/methodology/page.tsx");
const layout = read("src/app/layout.tsx");
const robots = read("src/app/robots.ts");
const sitemap = read("src/app/sitemap.ts");

describe("public launch trust layer", () => {
  it("uses benefit-led research copy instead of internal provider or advice-adjacent language", () => {
    const marketing = read("src/lib/i18n/marketing-copy.ts");
    expect(marketing).toContain("Analyze stocks with data-driven fundamentals");
    expect(marketing).toContain("Sources stay visible");
    expect(marketing).toContain("Missing data stays missing");
    expect(home).not.toContain("Missing provider setup is shown honestly");
    expect(home).not.toContain("decision-ready");
  });
  it("separates signed-out marketing navigation from the authenticated workspace", () => {
    expect(nav).toContain("marketingNavItems");
    expect(nav).toContain('href: "/about"');
    expect(nav).toContain('href: "/sample-analysis"');
    expect(nav).toContain('href: "/docs/methodology"');
    expect(nav).toContain('href: "/pricing"');
    expect(nav).toContain('href: "/history"');
    expect(nav).toContain('href: "/compare"');
    expect(nav).toContain("md:hidden");
  });

  it("uses the official logo rather than the SB placeholder", () => {
    expect(nav).toContain("<StockBoxLogo");
    expect(nav).not.toContain(">SB</span>");
    expect(existsSync(join(root, "src/components/brand/stockbox-logo.tsx"))).toBe(true);
    expect(existsSync(join(root, "public/images/stockbox-logo.png"))).toBe(true);
  });

  it("ships the trust pages required by the public site", () => {
    for (const path of [
      "src/app/about/page.tsx",
      "src/app/data-sources/page.tsx",
      "src/app/faq/page.tsx",
      "src/app/sample-analysis/page.tsx",
    ]) expect(existsSync(join(root, path))).toBe(true);
    expect(footer).toContain("/about");
    expect(footer).toContain("/contact");
    expect(footer).toContain("/data-sources");
    expect(footer).toContain("/faq");
    expect(footer).toContain("/sample-analysis");
  });

  it("expands methodology around the actual score dimensions and avoids personalized advice wording", () => {
    for (const heading of ["Valuation", "Growth", "Profitability", "Financial health", "Quality", "Risk"])
      expect(methodology).toContain(heading);
    expect(methodology).not.toContain("Personalized, not altered");
    expect(methodology).toContain("Profile-weighted");
  });

  it("describes plan capabilities in customer language", () => {
    expect(pricing).toContain("formatDeepReports");
    expect(pricing).toContain("formatBatchCompanies");
    expect(pricing).not.toContain("{copy.batchRows}");
  });

  it("adds entity schema and crawl rules for public search while excluding private app surfaces", () => {
    expect(layout).toContain('application/ld+json');
    expect(layout).toContain("SoftwareApplication");
    expect(layout).toContain("Organization");
    expect(robots).toContain('userAgent: "OAI-SearchBot"');
    expect(robots).toContain('"/auth"');
    expect(sitemap).toContain("/about");
    expect(sitemap).toContain("/data-sources");
    expect(sitemap).toContain("/faq");
    expect(sitemap).toContain("/sample-analysis");
    expect(sitemap).not.toContain("/analyze");
  });
});
