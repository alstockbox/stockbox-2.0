import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "src/app/compare/page.tsx"), "utf8");

describe("comparison profile page P0", () => {
  it("wires profile-aware comparison semantics into the product page", () => {
    expect(page).toContain("resolveComparisonProfile");
    expect(page).toContain("comparisonLensForProfile");
    expect(page).toContain("comparisonWarnings");
    expect(page).toContain("orderedComparisonGroups");
    expect(page).toContain("Comparison lens");
    expect(page).toContain("Mixed profile snapshots");
    expect(page).toContain("Contextual — no automatic winner");
  });
});
