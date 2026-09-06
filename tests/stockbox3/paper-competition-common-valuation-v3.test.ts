import { describe, expect, it } from "vitest";
import type { PaperFillV3, PaperMarketObservationV3 } from "../../src/lib/paper-trading/engine-v3";
import {
  orchestratePaperCompetitionCommonValuationV3,
  type PaperCompetitionCommonValuationDependenciesV3,
} from "../../src/lib/paper-trading/competition-valuation-v3";
import { derivePaperPerformanceV3 } from "../../src/lib/paper-trading/performance-v3";

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

function evidence(cutoff: string) {
  return {
    ok: true as const,
    evidence: {
      competition: {
        id: "competition-1",
        kind: "challenge" as const,
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
          userId: "user-1",
          accountId: "account-1",
          fills: [fill({ fillId: "f1", orderId: "o1", ticker: "AAPL", quantity: 10, price: 100, executedAt: "2026-09-06T12:30:00.000Z" })],
        },
        {
          userId: "user-2",
          accountId: "account-2",
          fills: [fill({ fillId: "f2", orderId: "o2", ticker: "AAPL", quantity: 5, price: 100, executedAt: "2026-09-06T12:35:00.000Z" })],
        },
      ],
    },
  };
}

function dependencies(input: {
  cutoff: string;
  quoteFor?: (ticker: string) => PaperMarketObservationV3;
  persistOk?: boolean;
  standingsUnavailableCount?: number;
  standingsRankedCount?: number;
}) {
  const calls = {
    evidenceCutoffs: [] as string[],
    quoteTickers: [] as string[],
    persistedAccounts: [] as string[],
    standingsCutoffs: [] as string[],
  };

  const deps: PaperCompetitionCommonValuationDependenciesV3 = {
    loadEvidence: async ({ evaluationCutoff }) => {
      calls.evidenceCutoffs.push(evaluationCutoff);
      return evidence(input.cutoff);
    },
    fetchQuote: async (ticker) => {
      calls.quoteTickers.push(ticker);
      return {
        observation: input.quoteFor?.(ticker) ?? quote(ticker, input.cutoff),
        reason: null,
      };
    },
    derivePerformance: derivePaperPerformanceV3,
    persistSnapshot: async ({ accountId, performance }) => {
      calls.persistedAccounts.push(accountId);
      return input.persistOk === false
        ? { ok: false as const, error: "WRITE_FAILED" }
        : {
            ok: true as const,
            snapshot: {
              id: `snapshot-${accountId}`,
              accountId,
              userId: accountId === "account-1" ? "user-1" : "user-2",
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
    loadStandings: async ({ evaluationCutoff }) => {
      calls.standingsCutoffs.push(evaluationCutoff);
      return {
        ok: true as const,
        competitionId: "competition-1",
        competitionKind: "challenge" as const,
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

describe("Paper Trading V3 common competition valuation", () => {
  it("owns one server-generated cutoff and passes that exact cutoff through evidence and standings", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({ cutoff });

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result.status).toBe("VERIFIED");
    expect(calls.evidenceCutoffs).toEqual([cutoff]);
    expect(calls.standingsCutoffs).toEqual([cutoff]);
    if (result.status === "VERIFIED") expect(result.evaluationCutoff).toBe(cutoff);
  });

  it("deduplicates quotes globally so the same ticker is fetched once for all participants", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({ cutoff });

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result.status).toBe("VERIFIED");
    expect(calls.quoteTickers).toEqual(["AAPL"]);
  });

  it("persists nothing when any required quote is unavailable or stale at the common cutoff", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({
      cutoff,
      quoteFor: (ticker) => ({
        ...quote(ticker, "2026-09-06T12:00:00.000Z"),
        verification: "UNAVAILABLE",
        price: null,
      }),
    });

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "PERFORMANCE_NOT_VERIFIED" });
    expect(calls.persistedAccounts).toEqual([]);
    expect(calls.standingsCutoffs).toEqual([]);
  });

  it("derives every participant before the first snapshot write", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    let quoteCalls = 0;
    const { deps, calls } = dependencies({
      cutoff,
      quoteFor: (ticker) => {
        quoteCalls += 1;
        return quoteCalls === 1
          ? quote(ticker, cutoff)
          : { ...quote(ticker, cutoff), verification: "UNAVAILABLE", price: null };
      },
    });

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result.status).toBe("VERIFIED");
    expect(calls.persistedAccounts).toEqual(["account-1", "account-2"]);
  });

  it("withholds the leaderboard when any snapshot persistence fails", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({ cutoff, persistOk: false });

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "SNAPSHOT_PERSIST_FAILED" });
    expect(calls.standingsCutoffs).toEqual([]);
  });

  it("requires exact-cutoff standings to have full participant coverage after all writes", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({
      cutoff,
      standingsRankedCount: 1,
      standingsUnavailableCount: 1,
    });

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date(cutoff),
    }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });
    expect(calls.persistedAccounts).toEqual(["account-1", "account-2"]);
    expect(calls.standingsCutoffs).toEqual([cutoff]);
  });

  it("fails before evidence loading when the server time is invalid", async () => {
    const cutoff = "2026-09-06T13:00:00.000Z";
    const { deps, calls } = dependencies({ cutoff });

    const result = await orchestratePaperCompetitionCommonValuationV3({
      competitionId: "competition-1",
      serverNow: new Date("invalid"),
    }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "INVALID_INPUT" });
    expect(calls.evidenceCutoffs).toEqual([]);
    expect(calls.quoteTickers).toEqual([]);
    expect(calls.persistedAccounts).toEqual([]);
  });
});
