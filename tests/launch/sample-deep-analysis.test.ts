import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("public Deep sample", () => {
  it("renders a current approved Deep snapshot with historical research through ReportView", () => {
    const loader = read("src/lib/analysis/public-sample.ts");
    const page = read("src/app/sample-analysis/page.tsx");
    expect(loader).toContain('PUBLIC_SAMPLE_ANALYSIS_ID = "913227da-7eca-4b05-981a-53f785356190"');
    expect(loader).toContain('report.analysisType !== "deep"');
    expect(loader).toContain("report.historical");
    expect(loader).toContain("delete publicReport.adminQa");
    expect(loader).toContain("delete publicReport.providerDiagnostics");
    expect(page).toContain("getPublicSampleAnalysis");
    expect(page).toContain("<ReportView");
    expect(page).toContain("formatAnalysisTimestamp");
    expect(page).toContain("report.companyName");
    expect(page).toContain("report.ticker");
  });
});
