import {
  derivePaperTradingLedgerV3,
  type PaperMarketObservationV3,
  type PaperTradingAccountStateV3,
} from "./engine-v3";
import {
  loadPaperCompetitionValuationEvidenceV3,
  loadPrivatePaperLeagueValuationEvidenceV3,
  type PaperCompetitionValuationEvidenceV3,
  type PaperCompetitionValuationKindV3,
} from "./competition-valuation-repository-v3";
import { fetchYahooExecutionQuoteV3 } from "./execution-quote-v3";
import type { PaperFinalPerformanceResultV3 } from "./final-performance-v3";
import {
  derivePaperPerformanceV3,
  derivePaperStateAtCutoffV3,
  type PaperPerformanceResultV3,
} from "./performance-v3";
import { persistVerifiedPaperPerformanceSnapshotV3 } from "./performance-repository-v3";
import { loadPaperCompetitionStandingsV3 } from "./standings-repository-v3";

export const PAPER_COMPETITION_COMMON_VALUATION_MAX_UNIQUE_TICKERS_V3 = 500;

export type PaperCompetitionValuationPerformanceV3 =
  | PaperPerformanceResultV3
  | PaperFinalPerformanceResultV3;

export type PaperCompetitionPerformanceDerivationInputV3 = {
  baseCurrency: string;
  startingCash: number;
  state: PaperTradingAccountStateV3;
  quotes: readonly PaperMarketObservationV3[];
  evaluatedAt: string;
};

export type PaperCompetitionCommonValuationDependenciesV3<
  TPerformance extends PaperCompetitionValuationPerformanceV3 = PaperPerformanceResultV3,
> = {
  loadEvidence: typeof loadPaperCompetitionValuationEvidenceV3;
  fetchQuote: typeof fetchYahooExecutionQuoteV3;
  derivePerformance: (input: PaperCompetitionPerformanceDerivationInputV3) => TPerformance;
  persistSnapshot: (input: {
    userId: string;
    accountId: string;
    performance: TPerformance;
  }) => Promise<{ ok: boolean }>;
  loadStandings: typeof loadPaperCompetitionStandingsV3;
};

export type PaperCompetitionCommonValuationUnavailableReasonV3 =
  | "INVALID_INPUT"
  | "EVIDENCE_UNAVAILABLE"
  | "EVIDENCE_MISMATCH"
  | "VALUATION_TOO_LARGE"
  | "PERFORMANCE_NOT_VERIFIED"
  | "SNAPSHOT_PERSIST_FAILED"
  | "STANDINGS_UNAVAILABLE"
  | "STANDINGS_INCOMPLETE";

export type PaperCompetitionCommonValuationResultV3 =
  | {
      status: "VERIFIED";
      competitionId: string;
      evaluationCutoff: string;
      participantCount: number;
      rankedCount: number;
      baseCurrency: string;
    }
  | {
      status: "UNAVAILABLE";
      reason: PaperCompetitionCommonValuationUnavailableReasonV3;
    };

type PreparedParticipant = {
  userId: string;
  accountId: string;
  state: Extract<ReturnType<typeof derivePaperStateAtCutoffV3>, { ok: true }>;
};

function unavailable(reason: PaperCompetitionCommonValuationUnavailableReasonV3): PaperCompetitionCommonValuationResultV3 {
  return { status: "UNAVAILABLE", reason };
}

function normalizedIdentity(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizedTicker(value: string): string | null {
  const ticker = value.trim().toUpperCase();
  return ticker && ticker.length <= 32 ? ticker : null;
}

function evidenceMatchesRequest(
  evidence: PaperCompetitionValuationEvidenceV3,
  competitionId: string,
  evaluationCutoff: string,
  expectedKind: PaperCompetitionValuationKindV3,
): boolean {
  return evidence.competition.id === competitionId
    && evidence.competition.kind === expectedKind
    && /^[A-Z]{3}$/.test(evidence.competition.baseCurrency)
    && evidence.competition.startingCash === 100_000
    && evidence.evaluationCutoff === evaluationCutoff
    && evidence.participants.length > 0
    && evidence.participants.length <= evidence.competition.maxParticipants;
}

/**
 * Produces one competition valuation from one server-owned cutoff.
 *
 * The performance policy is an injected server dependency so active valuations
 * and immutable finals can share the exact same evidence/coverage algorithm
 * without sharing their pricing semantics. The browser never selects it.
 *
 * The function is deliberately fail-closed:
 * - the browser never supplies the cutoff;
 * - every participant is reconstructed and valued before the first snapshot write;
 * - one provider observation is fetched per unique open-position ticker;
 * - if any participant cannot be verified, no snapshot is written;
 * - standings are returned only after exact-cutoff persistence has full coverage.
 */
async function orchestratePaperCompetitionCommonValuationForKindV3<
  TPerformance extends PaperCompetitionValuationPerformanceV3,
>(
  input: {
    competitionId: string;
    serverNow: Date;
  },
  dependencies: PaperCompetitionCommonValuationDependenciesV3<TPerformance>,
  expectedKind: PaperCompetitionValuationKindV3,
): Promise<PaperCompetitionCommonValuationResultV3> {
  const competitionId = normalizedIdentity(input.competitionId);
  const serverNowMs = input.serverNow instanceof Date ? input.serverNow.getTime() : Number.NaN;
  if (!competitionId || !Number.isFinite(serverNowMs)) return unavailable("INVALID_INPUT");

  const evaluationCutoff = new Date(serverNowMs).toISOString();

  let evidenceResult: Awaited<ReturnType<PaperCompetitionCommonValuationDependenciesV3<TPerformance>["loadEvidence"]>>;
  try {
    evidenceResult = await dependencies.loadEvidence({ competitionId, evaluationCutoff });
  } catch {
    return unavailable("EVIDENCE_UNAVAILABLE");
  }
  if (!evidenceResult.ok) return unavailable("EVIDENCE_UNAVAILABLE");

  const evidence = evidenceResult.evidence;
  if (!evidenceMatchesRequest(evidence, competitionId, evaluationCutoff, expectedKind)) {
    return unavailable("EVIDENCE_MISMATCH");
  }

  const prepared: PreparedParticipant[] = [];
  const uniqueTickers = new Set<string>();

  for (const participant of evidence.participants) {
    const userId = normalizedIdentity(participant.userId);
    const accountId = normalizedIdentity(participant.accountId);
    if (!userId || !accountId) return unavailable("EVIDENCE_MISMATCH");

    const cutoffState = derivePaperStateAtCutoffV3({
      baseCurrency: evidence.competition.baseCurrency,
      startingCash: evidence.competition.startingCash,
      fills: participant.fills,
      evaluationCutoff,
    });
    if (!cutoffState.ok || cutoffState.evaluationCutoff !== evaluationCutoff) {
      return unavailable("PERFORMANCE_NOT_VERIFIED");
    }

    const ledger = derivePaperTradingLedgerV3(cutoffState.state.fills);
    if (!ledger.ok) return unavailable("PERFORMANCE_NOT_VERIFIED");
    for (const position of ledger.positions) {
      if (position.quantity <= 1e-9) continue;
      const ticker = normalizedTicker(position.ticker);
      if (!ticker) return unavailable("PERFORMANCE_NOT_VERIFIED");
      uniqueTickers.add(ticker);
    }

    prepared.push({ userId, accountId, state: cutoffState });
  }

  if (prepared.length !== evidence.participants.length) return unavailable("EVIDENCE_MISMATCH");
  if (uniqueTickers.size > PAPER_COMPETITION_COMMON_VALUATION_MAX_UNIQUE_TICKERS_V3) {
    return unavailable("VALUATION_TOO_LARGE");
  }

  const quotes: PaperMarketObservationV3[] = [];
  for (const ticker of [...uniqueTickers].sort((left, right) => left.localeCompare(right))) {
    try {
      const quoteResult = await dependencies.fetchQuote(ticker);
      quotes.push(quoteResult.observation);
    } catch {
      return unavailable("PERFORMANCE_NOT_VERIFIED");
    }
  }

  const verifiedPerformances: Array<{
    userId: string;
    accountId: string;
    performance: TPerformance;
  }> = [];

  for (const participant of prepared) {
    const performance = dependencies.derivePerformance({
      baseCurrency: evidence.competition.baseCurrency,
      startingCash: evidence.competition.startingCash,
      state: participant.state.state,
      quotes,
      evaluatedAt: evaluationCutoff,
    });
    if (performance.status !== "VERIFIED" || !performance.rankEligible) {
      return unavailable("PERFORMANCE_NOT_VERIFIED");
    }
    verifiedPerformances.push({
      userId: participant.userId,
      accountId: participant.accountId,
      performance,
    });
  }

  if (verifiedPerformances.length !== evidence.participants.length) {
    return unavailable("PERFORMANCE_NOT_VERIFIED");
  }

  for (const participant of verifiedPerformances) {
    try {
      const persisted = await dependencies.persistSnapshot({
        userId: participant.userId,
        accountId: participant.accountId,
        performance: participant.performance,
      });
      if (!persisted.ok) return unavailable("SNAPSHOT_PERSIST_FAILED");
    } catch {
      return unavailable("SNAPSHOT_PERSIST_FAILED");
    }
  }

  const standingsViewer = expectedKind === "challenge"
    ? { scope: "public" as const }
    : { scope: "member" as const, userId: prepared[0].userId };

  let standings: Awaited<ReturnType<PaperCompetitionCommonValuationDependenciesV3<TPerformance>["loadStandings"]>>;
  try {
    standings = await dependencies.loadStandings({
      competitionId,
      evaluationCutoff,
      viewer: standingsViewer,
    });
  } catch {
    return unavailable("STANDINGS_UNAVAILABLE");
  }
  if (!standings.ok) return unavailable("STANDINGS_UNAVAILABLE");

  const participantCount = evidence.participants.length;
  if (
    standings.competitionId !== competitionId
    || standings.competitionKind !== expectedKind
    || standings.baseCurrency !== evidence.competition.baseCurrency
    || standings.evaluationCutoff !== evaluationCutoff
    || standings.unavailableCount !== 0
    || standings.rankedCount !== participantCount
    || standings.rankedCount + standings.unavailableCount !== participantCount
  ) {
    return unavailable("STANDINGS_INCOMPLETE");
  }

  return {
    status: "VERIFIED",
    competitionId,
    evaluationCutoff,
    participantCount,
    rankedCount: standings.rankedCount,
    baseCurrency: standings.baseCurrency,
  };
}

export async function orchestratePaperCompetitionCommonValuationV3<
  TPerformance extends PaperCompetitionValuationPerformanceV3,
>(
  input: {
    competitionId: string;
    serverNow: Date;
  },
  dependencies: PaperCompetitionCommonValuationDependenciesV3<TPerformance>,
): Promise<PaperCompetitionCommonValuationResultV3> {
  return orchestratePaperCompetitionCommonValuationForKindV3(input, dependencies, "challenge");
}

export async function orchestratePrivatePaperLeagueCommonValuationV3<
  TPerformance extends PaperCompetitionValuationPerformanceV3,
>(
  input: {
    competitionId: string;
    serverNow: Date;
  },
  dependencies: PaperCompetitionCommonValuationDependenciesV3<TPerformance>,
): Promise<PaperCompetitionCommonValuationResultV3> {
  return orchestratePaperCompetitionCommonValuationForKindV3(input, dependencies, "private_league");
}

const liveDependencies: PaperCompetitionCommonValuationDependenciesV3<PaperPerformanceResultV3> = {
  loadEvidence: loadPaperCompetitionValuationEvidenceV3,
  fetchQuote: fetchYahooExecutionQuoteV3,
  derivePerformance: derivePaperPerformanceV3,
  persistSnapshot: persistVerifiedPaperPerformanceSnapshotV3,
  loadStandings: loadPaperCompetitionStandingsV3,
};

const privateLeagueLiveDependencies: PaperCompetitionCommonValuationDependenciesV3<PaperPerformanceResultV3> = {
  loadEvidence: loadPrivatePaperLeagueValuationEvidenceV3,
  fetchQuote: fetchYahooExecutionQuoteV3,
  derivePerformance: derivePaperPerformanceV3,
  persistSnapshot: persistVerifiedPaperPerformanceSnapshotV3,
  loadStandings: loadPaperCompetitionStandingsV3,
};

/**
 * Trusted internal entry point for a cutoff already established by StockBox
 * server infrastructure, such as the database valuation-lease claim.
 */
export async function runPaperCompetitionCommonValuationAtV3(input: {
  competitionId: string;
  serverNow: Date;
}): Promise<PaperCompetitionCommonValuationResultV3> {
  return orchestratePaperCompetitionCommonValuationV3({
    competitionId: input.competitionId,
    serverNow: input.serverNow,
  }, liveDependencies);
}

/** Server-only live entry point for callers that do not already own a trusted cutoff. */
export async function runPaperCompetitionCommonValuationV3(input: {
  competitionId: string;
}): Promise<PaperCompetitionCommonValuationResultV3> {
  return runPaperCompetitionCommonValuationAtV3({
    competitionId: input.competitionId,
    serverNow: new Date(),
  });
}

/**
 * Trusted private-league entry point for a cutoff already established by the
 * private-league database valuation lease.
 */
export async function runPrivatePaperLeagueCommonValuationAtV3(input: {
  competitionId: string;
  serverNow: Date;
}): Promise<PaperCompetitionCommonValuationResultV3> {
  return orchestratePrivatePaperLeagueCommonValuationV3({
    competitionId: input.competitionId,
    serverNow: input.serverNow,
  }, privateLeagueLiveDependencies);
}

/** Server-only private-league live entry point without a caller-controlled cutoff. */
export async function runPrivatePaperLeagueCommonValuationV3(input: {
  competitionId: string;
}): Promise<PaperCompetitionCommonValuationResultV3> {
  return runPrivatePaperLeagueCommonValuationAtV3({
    competitionId: input.competitionId,
    serverNow: new Date(),
  });
}
