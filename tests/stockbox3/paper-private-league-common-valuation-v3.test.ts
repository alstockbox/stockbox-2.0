import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PaperFillV3, PaperMarketObservationV3 } from "../../src/lib/paper-trading/engine-v3";
import {
  orchestratePrivatePaperLeagueCommonValuationV3,
  type PaperCompetitionCommonValuationDependenciesV3,
} from "../../src/lib/paper-trading/competition-valuation-v3";

const sourcePath = path.join(process.cwd(), "src/lib/paper-trading/competition-valuation-v3.ts");
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";

function fill(input: {
  fillId: string;
  orderId: string;
  ticker: string;
  quantity: number;
  price: number;
  executedAt: string;
}): PaperFillV3 {
  return {
    fillId: input.fillId,
    orderId: input.orderId,
    idempotencyKey: `key-${input.fillId}`,
    ticker: input.ticker,
    side: "buy",
    quantity: input.quantity,
    price: input.price,
    grossAmount: input.quantity * input.price,
    fee: 0,
    currency: "USD",
    executedAt: input.executedAt,
    marketObservedAt: input.executedAt,
    provider: "yahoo-chart-execution",
    pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    policyVersion: "stockbox-paper-trading-v3.0.0",
  };
}

function quote(ticker: string, observedAt: string, price = 120): PaperMarketObservationV3 {
  return {
    ticker,
    price,
    currency: "USD",
    observedAt,
    provider: "yahoo-chart-execution",
    verification: "VERIFIED",
  };
}

function privateEvidence(cutoff: string) {
  return {
    ok: true as const,
    evidence: {
      competition: {
        id: "private-league-1",
        kind: "private_league" as const,
        status: "active" as const,
        baseCurrency: "USD",
        startingCash: 100_000 as const,
        startsAt: "2026-09-06T12:00:00.000Z",
        endsAt: "2026-09-06T16:00:00.000Z",
        maxParticipants: 10,
      },
      evaluationCutoff: cutoff,
      participants: [
        {
          userId: "member-1",
          accountId: "private-account-1",
          fills: [fill({
            fillId: "pf1",
            orderId: "po1",
            ticker: "AAPL",
            quantity: 10,
            price: 100,
            executedAt: "2026-09-06T12:30:00.000Z",
          })],
        },
        {
          userId: "member-2",
          accountId: "private-account-2",
          fills: [fill({
            fillId: "pf2",
            orderId: "po2",
            ticker: "AAPL",
            quantity: 5,
            price: 100,
            executedAt: "2026-09-06T12:35:00.000Z",
          })],
        },
      ],
    },
  };
}

function dependencies(input: {
  cutoff: string;
  quoteFor?: (ticker: string) => PaperMarketObservationV3;
  standingsKind?: "challenge" | "private_league";
  standingsRankedCount?: number;
  standingsUnavailableCount?: number;
}) {
  const calls = {
    evidenceCutoffs: [] as string[],
    quoteTickers: [] as string[],
    persistedAccounts: [] as string[],
    standingsCutoffs: [] as string[],
    standingsViewers: [] as Array<{ scope: "public" } | { scope: "member"; userId: string }>,
  };

  const deps: PaperCompetitionCommonValuationDependenciesV3 = {
    loadEvidence: async ({ evaluationCutoff }) => {
      calls.evidenceCutoffs.push(evaluationCutoff);
      return privateEvidence(input.cutoff);
    },
    fetchQuote: async (ticker) => {
      calls.quoteTickers.push(ticker);
      return {
        observation: input.quoteFor?.(ticker) ?? quote(ticker, input.cutoff),
        reason: null,
      };
    },
    persistSnapshot: async ({ accountId, userId, performance }) => {
      calls.persistedAccounts.push(accountId);
      return {
        ok: true as const,
        snapshot: {
          id: `snapshot-${accountId}`,
          accountId,
          userId,
          baseCurrency: "USD",
          startingCash: 100_000,
          cashValue: performance.status === "VERIFIED" ? performance.cashValue : 0,
          positionsMarketValue: performance.status === "VERIFIED" ? performance.positionsMarketValue : 0,
          equity: performance.status === "VERIFIED" ? performance.equity : 0,
          profitLoss: performance.status === "VERIFIED" ? performance.profitLoss : 0,
          returnPercent: performance.status === "VERIFIED" ? performance.returnPercent : 0,
          openPositionCount: performance.status === "VERIFIED" ? performance.openPositionCount : 0,
          quoteCount: performance.status === "VERIFIED" ? performance.quoteCount : 0,
          evaluatedAt: input.cutoff,
          oldestQuoteObservedAt: input.cutoff,
          policyVersion: "stockbox-paper-performance-v3.0.0",
          pricingBasis: "VERIFIED_MARK_TO_MARKET",
          createdAt: input.cutoff,
        },
      };
    },
    loadStandings: async ({ evaluationCutoff, viewer }) => {
      calls.standingsCutoffs.push(evaluationCutoff);
      calls.standingsViewers.push(viewer);
      return {
        ok: true as const,
        competitionId: "private-league-1",
        competitionKind: input.standingsKind ?? "private_league",
        baseCurrency: "USD",
        evaluationCutoff,
        standings: [],
        rankedCount: input.standingsRankedCount ?? 2,
        unavailableCount: input.standingsUnavailableCount ?? 0,
      };
    },
  };

  return { deps, calls };
}

describe("Paper Trading V3 private league common valuation", () => {
  it("uses one server-owned cutoff and a verified participant as member-scoped standings authority", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({ cutoff });

    const result = await orchestratePrivatePaperLeagueCommonValuationV3({
      competitionId: "private-league-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result.status).toBe("VERIFIED");
    expect(calls.evidenceCutoffs).toEqual([cutoff]);
    expect(calls.standingsCutoffs).toEqual([cutoff]);
    expect(calls.standingsViewers).toEqual([{ scope: "member", userId: "member-1" }]);
    if (result.status === "VERIFIED") expect(result.evaluationCutoff).toBe(cutoff);
  });

  it("deduplicates quotes globally across private-league participants", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({ cutoff });

    const result = await orchestratePrivatePaperLeagueCommonValuationV3({
      competitionId: "private-league-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result.status).toBe("VERIFIED");
    expect(calls.quoteTickers).toEqual(["AAPL"]);
  });

  it("persists zero snapshots when any required private-league valuation cannot be verified", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({
      cutoff,
      quoteFor: (ticker) => ({
        ...quote(ticker, "2026-09-06T12:00:00.000Z"),
        verification: "UNAVAILABLE",
        price: null,
      }),
    });

    const result = await orchestratePrivatePaperLeagueCommonValuationV3({
      competitionId: "private-league-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "PERFORMANCE_NOT_VERIFIED" });
    expect(calls.persistedAccounts).toEqual([]);
    expect(calls.standingsCutoffs).toEqual([]);
  });

  it("rejects standings that resolve to challenge or lose full exact-cutoff coverage", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const wrongKind = dependencies({ cutoff, standingsKind: "challenge" });
    const incomplete = dependencies({
      cutoff,
      standingsRankedCount: 1,
      standingsUnavailableCount: 1,
    });

    const wrongKindResult = await orchestratePrivatePaperLeagueCommonValuationV3({
      competitionId: "private-league-1",
      serverNow: new Date(cutoff),
    }, wrongKind.deps);
    const incompleteResult = await orchestratePrivatePaperLeagueCommonValuationV3({
      competitionId: "private-league-1",
      serverNow: new Date(cutoff),
    }, incomplete.deps);

    expect(wrongKindResult).toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });
    expect(incompleteResult).toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });
  });

  it("keeps private live valuation on the private evidence loader and never accepts caller-controlled viewer identity", () => {
    expect(source).toContain("loadPrivatePaperLeagueValuationEvidenceV3");
    expect(source).toContain("export async function runPrivatePaperLeagueCommonValuationAtV3");
    expect(source).toContain("export async function runPrivatePaperLeagueCommonValuationV3");
    expect(source).not.toContain("viewerUserId");
  });
});
