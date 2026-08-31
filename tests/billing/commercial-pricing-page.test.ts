import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/pricing/page.tsx", "utf8");

describe("commercial pricing page", () => {
  it("routes each paid pricing card to its own checkout plan", () => {
    expect(page).toContain("<CheckoutButton plan={plan}");
    expect(page).not.toContain('CheckoutButton plan="basic"');
  });

  it("explains the Free introductory quota accurately", () => {
    expect(page).toContain("copy.freeIntroAnalyses");
  });

  it("visually marks the catalog-highlighted plan", () => {
    expect(page).toContain("plan.highlight");
    expect(page).toContain("copy.mostPopular");
  });
});
