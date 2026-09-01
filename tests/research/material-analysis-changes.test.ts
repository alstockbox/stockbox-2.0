import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "@/lib/analysis/types";
import { deriveMaterialAnalysisChanges } from "@/lib/research/analysis-changes";

function report(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    id: "analysis",
    ticker: "BOX",
    companyName: "Box Co",
    analysisType: "deep",
    investmentProfile: "balanced",
    generatedAt: "2026-09-01T10:00:00.000Z",
    oneSentence: "Test",
    summary: "Test",
    recommendation: "Buy",
    shortTermAssessment: "Test",
    longTermAssessment: "Test",
    metrics: {
      revenueGrowth1y: 0.10,
      revenueCagr3y: 0.08,
      epsGrowth1y: 0.10,
      grossMargin: 0.50,
      operatingMargin: 0.20,
      netMargin: 0.15,
      fcf: 100,
      fcfMargin: 0.18,
      cashConversion: 1,
      debtToEquity: 0.5,
      debtToAssets: 0.2,
      netDebt: 20,
      interestCoverage: 10,
      earningsYield: 0.05,
      fcfYield: 0.04,
      priceMomentum1y: 0.1,
      priceMomentum3m: 0.02,
    },
    score: { score: 75, personalizedScore: 75, confidence: 80, dimensions: [], missingData: [] },
    dcf: { suitable: false, bear: null, base: null, bull: null },
    redFlags: [], greenFlags: [], scenarios: [], sources: [], disclaimer: "Research only",
    dataCoverage: 0.9,
    ...overrides,
  };
}

describe("material analysis changes", () => {
  it("persists a rating downgrade and new high-severity red flag as weakening evidence", () => {
    const previous = report();
    const current = report({
      recommendation: "Hold",
      score: { ...previous.score, score: 64 },
      redFlags: [{ severity: "high", title: "Leverage jumped", detail: "Debt increased materially." }],
    });
    const changes = deriveMaterialAnalysisChanges(previous, current);
    expect(changes.some((change) => change.kind === "rating_changed" && change.direction === "weakens")).toBe(true);
    expect(changes.some((change) => change.kind === "red_flag_added" && change.severity === "important")).toBe(true);
  });

  it("has a private persisted change-event schema", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901154107_analysis_change_events_store.sql"), "utf8");
    expect(migration).toContain("create table if not exists public.analysis_change_events");
    expect(migration).toContain("analysis_change_events_select_own");
    expect(migration).toContain("analysis_change_events_dedupe_idx");
    expect(migration).not.toContain("analyses_capture_stockbox_changes");
    expect(migration).not.toContain("capture_stockbox_analysis_changes");
  });
});
