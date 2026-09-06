import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  orchestratePaperCompetitionCommonValuationV3,
} from "@/lib/paper-trading/competition-valuation-v3";
import {
  PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION,
  PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS,
} from "@/lib/paper-trading/final-performance-v3";

const commonSource = readFileSync("src/lib/paper-trading/competition-valuation-v3.ts", "utf8");
const finalServiceSource = readFileSync("src/lib/paper-trading/competition-final-valuation-service-v3.ts", "utf8");
const CUTOFF = "2026-09-06T20:00:00.000Z";

function finalPerformance() {
  return {
    status: "VERIFIED" as const,
    rankEligible: true as const,
    policyVersion: PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION,
    pricingBasis: PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS,
    baseCurrency: "USD",
    startingCash: 100_000,
    cashValue: 100_000,
    positionsMarketValue: 0,
    equity: 100_000,
    profitLoss: 0,
    returnPercent: 0,
    openPositionCount: 0,
    quoteCount: 0,
    evaluatedAt: CUTOFF,
    oldestQuoteObservedAt: null,
  };
}

describe("Paper Trading V3 final valuation orchestration", () => {
  it("delegates performance derivation through trusted dependencies before persistence", async () => {
    const derivePerformance = vi.fn(() => finalPerformance());
    const persistSnapshot = vi.fn(async ({ performance }: { performance: ReturnType<typeof finalPerformance> }) => ({
      ok: true as const,
      snapshot: {
        id: "snapshot-1",
        accountId: "account-1",
        userId: "user-1",
        baseCurrency: "USD",
        startingCash: 100_000,
        cashValue: performance.cashValue,
        positionsMarketValue: performance.positionsMarketValue,
        equity: performance.equity,
        profitLoss: performance.profitLoss,
        returnPercent: performance.returnPercent,
        openPositionCount: performance.openPositionCount,
        quoteCount: performance.quoteCount,
        evaluatedAt: performance.evaluatedAt,
        oldestQuoteObservedAt: performance.oldestQuoteObservedAt,
        policyVersion: performance.policyVersion,
        pricingBasis: performance.pricingBasis,
        createdAt: CUTOFF,
      },
    }));

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date(CUTOFF),
    }, {
      loadEvidence: async () => ({
        ok: true as const,
        evidence: {
          competition: {
            id: "competition-1",
            kind: "challenge" as const,
            status: "completed" as const,
            baseCurrency: "USD",
            startingCash: 100_000 as const,
            startsAt: "2026-09-01T12:00:00.000Z",
            endsAt: CUTOFF,
            maxParticipants: 10,
          },
          evaluationCutoff: CUTOFF,
          participants: [{ userId: "user-1", accountId: "account-1", fills: [] }],
        },
      }),
      fetchQuote: vi.fn(async () => ({ observation: null, reason: "unexpected" })) as never,
      derivePerformance,
      persistSnapshot,
      loadStandings: async ({ evaluationCutoff }: { evaluationCutoff: string }) => ({
        ok: true as const,
        competitionId: "competition-1",
        competitionKind: "challenge" as const,
        baseCurrency: "USD",
        evaluationCutoff,
        standings: [],
        rankedCount: 1,
        unavailableCount: 0,
      }),
    } as never);

    expect(result).toMatchObject({ status: "VERIFIED", evaluationCutoff: CUTOFF });
    expect(derivePerformance).toHaveBeenCalledTimes(1);
    expect(derivePerformance).toHaveBeenCalledWith(expect.objectContaining({
      baseCurrency: "USD",
      startingCash: 100_000,
      evaluatedAt: CUTOFF,
      quotes: [],
    }));
    expect(persistSnapshot).toHaveBeenCalledTimes(1);
    expect(persistSnapshot.mock.calls[0]?.[0].performance).toMatchObject({
      policyVersion: PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION,
      pricingBasis: PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS,
    });
  });

  it("keeps active live valuation explicitly wired to the active performance policy", () => {
    expect(commonSource).toContain("derivePerformance:");
    expect(commonSource).toContain("dependencies.derivePerformance");
    expect(commonSource).toContain("derivePerformance: derivePaperPerformanceV3");
    expect(commonSource).toContain("persistSnapshot: persistVerifiedPaperPerformanceSnapshotV3");
    expect(commonSource).toContain("loadStandings: loadPaperCompetitionStandingsV3");
  });

  it("wires final challenge and private-league valuation only to final derivation, persistence and standings", () => {
    expect(finalServiceSource).toContain("derivePaperFinalPerformanceV3");
    expect(finalServiceSource).toContain("persistVerifiedPaperFinalPerformanceSnapshotV3");
    expect(finalServiceSource).toContain("loadPaperCompetitionFinalStandingsV3");
    expect(finalServiceSource).toContain("derivePerformance: derivePaperFinalPerformanceV3");
    expect(finalServiceSource).toContain("persistSnapshot: persistVerifiedPaperFinalPerformanceSnapshotV3");
    expect(finalServiceSource).toContain("loadStandings: loadPaperCompetitionFinalStandingsV3");
    expect(finalServiceSource).not.toContain("persistVerifiedPaperPerformanceSnapshotV3");
    expect(finalServiceSource).not.toContain("derivePaperPerformanceV3");
  });

  it("preserves DB-owned cutoff and historical final quote authority", () => {
    expect(finalServiceSource).toContain("claimFinalPaperCompetitionValuationV3");
    expect(finalServiceSource).toContain("fetchYahooFinalCutoffQuoteV3");
    expect(finalServiceSource).not.toContain("fetchYahooExecutionQuoteV3");
    expect(finalServiceSource).not.toContain("input.evaluationCutoff");
    expect(finalServiceSource).not.toContain("input.serverNow");
    expect(finalServiceSource).not.toContain("input.accountId");
    expect(finalServiceSource).not.toContain("input.userId");
  });
});
