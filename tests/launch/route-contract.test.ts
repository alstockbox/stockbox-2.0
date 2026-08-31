import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("release route contract", () => {
  it("keeps canonical public aliases away from 404s", () => {
    const config = read("next.config.ts");
    for (const [source, destination] of [
      ["/methodology", "/docs/methodology"], ["/terms", "/legal/terms"],
      ["/privacy", "/legal/privacy"], ["/billing", "/settings/billing"],
      ["/comparison", "/compare"], ["/login", "/auth/login"], ["/signup", "/auth/signup"],
    ]) {
      expect(config).toContain(`source: "${source}"`);
      expect(config).toContain(`destination: "${destination}"`);
    }
  });

  it("ships a real product page and links it from public navigation", () => {
    const product = read("src/app/product/page.tsx");
    expect(product).toContain('alternates: { canonical: "/product" }');
    expect(product).toContain("Confidence & coverage");
    expect(product).toContain("Investor profiles");
    expect(read("src/components/app-shell/nav.tsx")).toContain('{ href: "/product"');
    expect(read("src/components/app-shell/footer.tsx")).toContain('["/product"');
    expect(read("src/app/sitemap.ts")).toContain('"/product"');
  });
});
