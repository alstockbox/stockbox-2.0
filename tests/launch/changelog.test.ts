import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("public changelog", () => {
  it("publishes versioned release notes and links them from discovery surfaces", () => {
    const page = read("src/app/changelog/page.tsx");
    const footer = read("src/components/app-shell/footer.tsx");
    const sitemap = read("src/app/sitemap.ts");
    expect(page).toContain("MODEL_VERSION");
    expect(page).toContain("SCORE_POLICY_VERSION");
    expect(page).toContain("2026-08-31");
    expect(page).toContain("plan access");
    expect(page).not.toMatch(/entitlements/i);
    expect(footer).toContain('"/changelog"');
    expect(sitemap).toContain('"/changelog"');
  });

  it("keeps Swedish release notes readable without encoding replacement markers", () => {
    const page = read("src/app/changelog/page.tsx");
    expect(page).not.toMatch(/j\?mf\?relse|datak\?llor|H\?rdade|\?ngerblankett|of\?rdiga|fr\?n/);
    expect(page).toContain("j\\u00e4mf\\u00f6relse");
    expect(page).toContain("<li key={item}>{item}</li>");
  });
});
