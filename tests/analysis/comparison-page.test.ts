import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("comparison product page", () => {
  it("uses canonical saved reports with company/report discovery", () => {
    const page = read("src/app/compare/page.tsx");
    const picker = read("src/components/analysis/comparison-picker.tsx");
    expect(page).toContain("ComparisonPicker");
    expect(page).toContain("comparisonGroups");
    expect(page).toContain("objectiveDifferences");
    expect(page).toContain("formatAnalysisTimestamp(report.generatedAt");
    expect(picker).toContain("/api/companies/search?q=");
    expect(picker).toContain("reportSearchMatch");
  });

  it("supports up to five saved snapshots without a new comparison backend", () => {
    const page = read("src/app/compare/page.tsx");
    const picker = read("src/components/analysis/comparison-picker.tsx");

    expect(page).toContain("allIds.slice(0, 5)");
    expect(page).toContain("allIds.length > 5");
    expect(page).toContain("A maximum of five reports is supported");
    expect(picker).toContain("current.length >= 5");
    expect(picker).toContain("Select up to five snapshots");
    expect(picker).toContain("{selectedIds.length}/5");
    expect(picker).toContain("selectedIds.length >= 5");
  });

  it("exposes finished comparison actions and mobile-safe card layouts", () => {
    const page = read("src/app/compare/page.tsx");
    expect(page).toContain("Open full analysis");
    expect(page).toContain("Swap companies");
    expect(page).toContain("Strengths and risks");
    expect(page).toContain("What stands out");
    expect(page).toContain("min-[390px]:grid-cols-3");
    expect(page).not.toContain("min-w-[760px]");
  });
});
