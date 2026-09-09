import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { UniversalSecurityReport } from "@/lib/data/universal-security-provider";
import { persistSpecialistRecommendationLiveAuditV3 } from "@/lib/data/recommendation-specialist-live-audit-v3";

function etfReport(): UniversalSecurityReport {
  return {
    ticker: "SPY",
    recommendation: "Buy",
    dataStatus: "current",
    dataAsOf: "2026-09-09",
    redFlags: [],
    providerDiagnostics: [],
    securityClassification: {
      kind: "index_etf",
      confidence: 0.95,
      reason: "Index ETF",
    },
    securityAnalysis: {
      etf: {
        kind: "etf",
        subtype: "index_etf",
        score: {
          score: 75,
          coverage: 0.9,
          availableWeight: 90,
          applicableWeight: 100,
          factors: [],
          missing: [],
        },
        lookThrough: {
          coveredWeight: 0,
          qualityCoveredWeight: 0,
          stockBoxQuality: null,
          revenueGrowth: null,
          epsGrowth: null,
          roic: null,
          operatingMargin: null,
          netDebtToEbitda: null,
          forwardPe: null,
          priceBook: null,
          freeCashFlowYield: null,
          dividendYield: null,
          top10Weight: null,
          largestHoldingWeight: null,
          holdingsHhi: null,
          sectorHhi: null,
          countryHhi: null,
        },
        warnings: [],
      },
    },
  } as unknown as UniversalSecurityReport;
}

describe("Recommendation specialist live audit V3", () => {
  it("does no audit work while Recommendation V3 is disabled or killed", async () => {
    const persistAudit = vi.fn();
    expect(await persistSpecialistRecommendationLiveAuditV3(etfReport(), {
      recommendationEnabled: false,
      dependencies: { persistAudit },
    })).toEqual({ status: "disabled" });
    expect(await persistSpecialistRecommendationLiveAuditV3(etfReport(), {
      recommendationEnabled: true,
      recommendationKilled: true,
      dependencies: { persistAudit },
    })).toEqual({ status: "killed" });
    expect(persistAudit).not.toHaveBeenCalled();
  });

  it("persists the same objective specialist event used by review learning", async () => {
    const persistAudit = vi.fn().mockResolvedValue({ ok: true, configured: true });
    const result = await persistSpecialistRecommendationLiveAuditV3(etfReport(), {
      recommendationEnabled: true,
      recommendationKilled: false,
      observedAt: "2026-09-09T12:00:00.000Z",
      dependencies: { persistAudit },
    });

    expect(result.status).toBe("evaluated");
    if (result.status !== "evaluated") throw new Error("expected evaluated specialist audit");
    expect(result.persisted).toBe(true);
    expect(result.event.analysisArchetype).toBe("etf:index_etf");
    expect(result.event.hadPersonalizedScore).toBe(false);
    expect(persistAudit).toHaveBeenCalledWith(result.event);
  });

  it("fails open when audit storage fails or throws", async () => {
    const unavailable = await persistSpecialistRecommendationLiveAuditV3(etfReport(), {
      recommendationEnabled: true,
      recommendationKilled: false,
      dependencies: {
        persistAudit: vi.fn().mockResolvedValue({
          ok: false,
          configured: false,
          error: "SUPABASE_ADMIN_NOT_CONFIGURED",
        }),
      },
    });
    expect(unavailable).toEqual(expect.objectContaining({ status: "evaluated", persisted: false }));

    const thrown = await persistSpecialistRecommendationLiveAuditV3(etfReport(), {
      recommendationEnabled: true,
      recommendationKilled: false,
      dependencies: { persistAudit: vi.fn().mockRejectedValue(new Error("audit down")) },
    });
    expect(thrown).toEqual(expect.objectContaining({ status: "evaluated", persisted: false, error: "audit down" }));
  });

  it("keeps the universal live provider wired after final specialist enrichment", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/data/universal-security-live-provider.ts"),
      "utf8",
    );
    expect(source).toContain("report = await enrichWithOfficialInvestmentCompanyNav(report, args)");
    expect(source).toContain("await persistSpecialistRecommendationLiveAuditV3(report)");
    expect(source.indexOf("await persistSpecialistRecommendationLiveAuditV3(report)"))
      .toBeGreaterThan(source.indexOf("report = await enrichWithOfficialInvestmentCompanyNav(report, args)"));
  });
});
