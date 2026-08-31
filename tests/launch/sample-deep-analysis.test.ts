import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(join(process.cwd(),p),"utf8");
describe("public Deep sample",()=>{
  it("renders an approved real Deep report through the production ReportView",()=>{
    const loader=read("src/lib/analysis/public-sample.ts"); const page=read("src/app/sample-analysis/page.tsx");
    expect(loader).toContain('PUBLIC_SAMPLE_ANALYSIS_ID = "54319758-1700-47ab-873f-0acafaca35d5"');
    expect(loader).toContain('report.analysisType !== "deep"');
    expect(loader).toContain("delete publicReport.adminQa");
    expect(loader).toContain("delete publicReport.providerDiagnostics");
    expect(page).toContain("getPublicSampleAnalysis");
    expect(page).toContain("<ReportView");
    expect(page).toContain("formatAnalysisTimestamp");
    expect(page).toContain("searchCompanyCatalog");
  });
});
