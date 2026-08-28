import type { AnalysisReport } from "../../src/lib/analysis/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { persistAnalysis } from "../../src/lib/db/repositories";

function report(score: number | null, recommendation: "Hold" | "No Rating", archetype: "standard" | "bank"): AnalysisReport {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ticker: archetype === "bank" ? "C" : "BOX",
    companyName: archetype === "bank" ? "Citigroup Inc." : "Box Systems",
    analysisType: "deep",
    investmentProfile: "balanced",
    score: {
      score,
      personalizedScore: score,
      confidence: archetype === "bank" ? 58 : 90,
      dimensions: [],
      missingData: [],
    },
    recommendation,
    modelVersion: "stockbox-analysis-engine-v2.6.0",
    reportSchemaVersion: "stockbox-analysis-report-v5",
    analysisArchetype: archetype,
    dataCoverage: archetype === "bank" ? 0.6 : 0.9,
    providerDiagnostics: [],
  } as unknown as AnalysisReport;
}

describe("analysis persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null });
  });

  it("persists a specialist No Rating report with null score instead of coercing missing data", async () => {
    const result = await persistAnalysis({ userId: "user-1", report: report(null, "No Rating", "bank"), rawProviderWarnings: [] });

    expect(result).toEqual({ ok: true, id: "22222222-2222-4222-8222-222222222222" });
    expect(mocks.from).toHaveBeenCalledWith("analyses");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      score: null,
      personalized_score: null,
      recommendation: "No Rating",
      analysis_archetype: "bank",
      report_schema_version: "stockbox-analysis-report-v5",
    }));
  });

  it("continues to persist a standard numeric-score report", async () => {
    const result = await persistAnalysis({ userId: "user-1", report: report(62, "Hold", "standard"), rawProviderWarnings: [] });

    expect(result.ok).toBe(true);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      score: 62,
      personalized_score: 62,
      recommendation: "Hold",
      analysis_archetype: "standard",
    }));
  });
});
