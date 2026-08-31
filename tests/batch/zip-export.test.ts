import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "../../src/lib/analysis/types";
import { buildBatchZip, renderAnalysisPdf, safeAnalysisFilename } from "../../src/lib/batch/export";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const report = {
  id: "11111111-1111-4111-8111-111111111111", ticker: "META", companyName: "Meta Platforms, Inc.",
  analysisType: "deep", investmentProfile: "balanced", generatedAt: "2026-08-31T07:49:42.282Z",
  oneSentence: "Canonical report snapshot.", summary: "A stored StockBox analysis.", recommendation: "Hold",
  shortTermAssessment: "Neutral.", longTermAssessment: "Monitor fundamentals.",
  metrics: { revenueGrowth1y: .1, revenueCagr3y: .08, epsGrowth1y: .12, grossMargin: .8, operatingMargin: .4, netMargin: .3, fcf: 100, fcfMargin: .25, cashConversion: 1.1, debtToEquity: .2, debtToAssets: .1, netDebt: -20, interestCoverage: 10, earningsYield: .03, fcfYield: .025, priceMomentum1y: .2, priceMomentum3m: .05 },
  score: { score: 70, personalizedScore: 70, confidence: 85, dimensions: [{ key: "valuation", label: "Valuation", score: 60, coverage: 1, rationale: "Available." }], missingData: [] },
  dcf: { suitable: false, reason: "Not used.", bear: null, base: null, bull: null }, redFlags: [], greenFlags: [], scenarios: [],
  sources: [{ name: "SEC Companyfacts", url: "https://www.sec.gov/", freshness: "2026-06-30" }],
  disclaimer: "For research only.", modelVersion: "stockbox-analysis-engine-v2.7.0", dataCoverage: .9,
} as unknown as AnalysisReport;

describe("batch ZIP export", () => {
  it("creates a real PDF from an immutable report snapshot", async () => {
    const pdf = await renderAnalysisPdf(report);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });

  it("creates a PDF when report text contains arrows and typographic dashes", async () => {
    const pdf = await renderAnalysisPdf({
      ...report,
      summary: "TTM \u2192 FY comparison \u2013 valuation bridge \u2014 still exportable.",
      score: {
        ...report.score,
        dimensions: [
          {
            key: "valuation",
            label: "Valuation",
            score: 60,
            coverage: 1,
            rationale: "TTM \u2192 FY input changed \u2013 exports should not fail.",
          },
        ],
      },
    } as AnalysisReport);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });

  it("creates a ZIP containing one PDF per completed accessible report plus metadata", async () => {
    const bytes = await buildBatchZip([report]);
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    expect(names.some((name) => name.startsWith("Analyses/META_Meta_Platforms_Inc_2026-08-31") && name.endsWith(".pdf"))).toBe(true);
    expect(names).toContain("metadata.json");
    expect(names).toContain("Batch_Data.csv");
  });

  it("sanitizes path separators and unsafe filename characters", () => {
    expect(safeAnalysisFilename({ ...report, companyName: "A/B:C*D?" } as AnalysisReport)).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("keeps the API ownership-scoped and never re-runs analysis for export", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/batch/export/route.ts"), "utf8");
    expect(route).toContain("requireUser");
    expect(route).toContain("getAnalysis(id, user.id)");
    expect(route).not.toContain("runFinancialAnalysis");
  });
});
