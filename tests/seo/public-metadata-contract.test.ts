import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const publicPages = [
  ["/", "src/app/page.tsx"],
  ["/pricing", "src/app/pricing/page.tsx"],
  ["/about", "src/app/about/page.tsx"],
  ["/contact", "src/app/contact/page.tsx"],
  ["/data-sources", "src/app/data-sources/page.tsx"],
  ["/faq", "src/app/faq/page.tsx"],
  ["/sample-analysis", "src/app/sample-analysis/page.tsx"],
  ["/docs/methodology", "src/app/docs/methodology/page.tsx"],
  ["/changelog", "src/app/changelog/page.tsx"],
  ["/legal/privacy", "src/app/legal/privacy/page.tsx"],
  ["/legal/terms", "src/app/legal/terms/page.tsx"],
  ["/withdraw", "src/app/withdraw/page.tsx"],
  ["/legal/withdrawal-form", "src/app/legal/withdrawal-form/page.tsx"],
] as const;

describe("public SEO metadata contract", () => {
  it.each(publicPages)("gives %s a description and explicit canonical", (route, file) => {
    const source = read(file);
    expect(source).toContain("description:");
    expect(source).toContain(`canonical: "${route}"`);
  });

  it("includes all public legal discovery routes in the sitemap", () => {
    const sitemap = read("src/app/sitemap.ts");
    expect(sitemap).toContain('"/legal/withdrawal-form"');
  });
});
