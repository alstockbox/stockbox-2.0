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
