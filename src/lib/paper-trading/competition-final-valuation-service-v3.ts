import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { loadPaperCompetitionKindV3 } from "./competition-kind-repository-v3";
import {
  loadPaperCompetitionValuationEvidenceV3,
  loadPrivatePaperLeagueValuationEvidenceV3,
} from "./competition-valuation-repository-v3";
import {
  orchestratePaperCompetitionCommonValuationV3,
  orchestratePrivatePaperLeagueCommonValuationV3,
  type PaperCompetitionCommonValuationResultV3,
} from "./competition-valuation-v3";
import { fetchYahooFinalCutoffQuoteV3 } from "./final-cutoff-quote-v3";
import { derivePaperFinalPerformanceV3 } from "./final-performance-v3";
import { persistVerifiedPaperFinalPerformanceSnapshotV3 } from "./performance-repository-v3";
import { loadPaperCompetitionFinalStandingsV3 } from "./standings-repository-v3";
import {
  claimFinalPaperCompetitionValuationV3,
  completePaperCompetitionValuationV3,
  type PaperCompetitionValuationCompletionOutcomeV3,
} from "./valuation-lease-repository-v3";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FinalValuationAtV3 = (input: {
  competitionId: string;
  evaluationCutoff: string;
}) => Promise<PaperCompetitionCommonValuationResultV3>;

export type PaperCompetitionFinalValuationServiceDependenciesV3 = {
  loadCompetitionKind: typeof loadPaperCompetitionKindV3;
  claimFinalValuation: typeof claimFinalPaperCompetitionValuationV3;
  completeValuation: typeof completePaperCompetitionValuationV3;
  runChallengeFinalValuationAt: FinalValuationAtV3;
  runPrivateLeagueFinalValuationAt: FinalValuationAtV3;
};

export type PaperCompetitionFinalValuationServiceResultV3 =
  | PaperCompetitionCommonValuationResultV3
  | { status: "DISABLED" }
  | { status: "KILLED" }
  | { status: "INVALID_INPUT" }
  | { status: "THROTTLED" }
  | { status: "ERROR" };

async function runChallengeFinalValuationAtV3(trustedFinal: {
  competitionId: string;
  evaluationCutoff: string;
}): Promise<PaperCompetitionCommonValuationResultV3> {
  const cutoffMs = Date.parse(trustedFinal.evaluationCutoff);
  if (!Number.isFinite(cutoffMs)) return { status: "UNAVAILABLE", reason: "INVALID_INPUT" };
  const evaluationCutoff = new Date(cutoffMs).toISOString();

  return orchestratePaperCompetitionCommonValuationV3({
    competitionId: trustedFinal.competitionId,
    serverNow: new Date(cutoffMs),
  }, {
    loadEvidence: loadPaperCompetitionValuationEvidenceV3,
    fetchQuote: (ticker) => fetchYahooFinalCutoffQuoteV3(ticker, evaluationCutoff),
    derivePerformance: derivePaperFinalPerformanceV3,
    persistSnapshot: persistVerifiedPaperFinalPerformanceSnapshotV3,
    loadStandings: loadPaperCompetitionFinalStandingsV3,
  });
}

async function runPrivateLeagueFinalValuationAtV3(trustedFinal: {
  competitionId: string;
  evaluationCutoff: string;
}): Promise<PaperCompetitionCommonValuationResultV3> {
  const cutoffMs = Date.parse(trustedFinal.evaluationCutoff);
  if (!Number.isFinite(cutoffMs)) return { status: "UNAVAILABLE", reason: "INVALID_INPUT" };
  const evaluationCutoff = new Date(cutoffMs).toISOString();

  return orchestratePrivatePaperLeagueCommonValuationV3({
    competitionId: trustedFinal.competitionId,
    serverNow: new Date(cutoffMs),
  }, {
    loadEvidence: loadPrivatePaperLeagueValuationEvidenceV3,
    fetchQuote: (ticker) => fetchYahooFinalCutoffQuoteV3(ticker, evaluationCutoff),
    derivePerformance: derivePaperFinalPerformanceV3,
    persistSnapshot: persistVerifiedPaperFinalPerformanceSnapshotV3,
    loadStandings: loadPaperCompetitionFinalStandingsV3,
  });
}

async function completeGrantedFinalLease(
  dependencies: PaperCompetitionFinalValuationServiceDependenciesV3,
  input: {
    competitionId: string;
    leaseToken: string;
    evaluationCutoff: string;
    outcome: PaperCompetitionValuationCompletionOutcomeV3;
  },
): Promise<boolean> {
  try {
    const result = await dependencies.completeValuation(input);
    return result.ok && result.completed === true;
  } catch {
    return false;
  }
}

function globalFinalValuationEnabled(): boolean {
  return isFeatureEnabled("paperTrading")
    && isFeatureEnabled("leaderboards")
    && (isFeatureEnabled("challenges") || isFeatureEnabled("privateLeagues"));
}

function kindEnabled(kind: "challenge" | "private_league"): boolean {
  return kind === "challenge"
    ? isFeatureEnabled("challenges")
    : isFeatureEnabled("privateLeagues");
}

/**
 * Internal final-valuation boundary. The caller can supply only competitionId.
 * Competition kind and immutable final cutoff are both resolved by trusted
 * server/database authority before any historical provider work occurs.
 */
export async function runPaperCompetitionFinalValuationServiceV3(
  input: { competitionId: string },
  dependencies: PaperCompetitionFinalValuationServiceDependenciesV3 = {
    loadCompetitionKind: loadPaperCompetitionKindV3,
    claimFinalValuation: claimFinalPaperCompetitionValuationV3,
    completeValuation: completePaperCompetitionValuationV3,
    runChallengeFinalValuationAt: runChallengeFinalValuationAtV3,
    runPrivateLeagueFinalValuationAt: runPrivateLeagueFinalValuationAtV3,
  },
): Promise<PaperCompetitionFinalValuationServiceResultV3> {
  const competitionId = input.competitionId.trim();
  if (!UUID_PATTERN.test(competitionId)) return { status: "INVALID_INPUT" };
  if (!globalFinalValuationEnabled()) return { status: "DISABLED" };
  if (isKilled("paperTrading") || isKilled("backgroundJobs")) return { status: "KILLED" };

  let kindResult: Awaited<ReturnType<PaperCompetitionFinalValuationServiceDependenciesV3["loadCompetitionKind"]>>;
  try {
    kindResult = await dependencies.loadCompetitionKind(competitionId);
  } catch {
    return { status: "ERROR" };
  }
  if (!kindResult.ok) return { status: "ERROR" };
  if (!kindEnabled(kindResult.kind)) return { status: "DISABLED" };

  let claimResult: Awaited<ReturnType<PaperCompetitionFinalValuationServiceDependenciesV3["claimFinalValuation"]>>;
  try {
    claimResult = await dependencies.claimFinalValuation(competitionId);
  } catch {
    return { status: "ERROR" };
  }
  if (!claimResult.ok) return { status: "ERROR" };
  if (!claimResult.claim.claimed) return { status: "THROTTLED" };

  const cutoffMs = Date.parse(claimResult.claim.claimedAt);
  if (!Number.isFinite(cutoffMs)) return { status: "ERROR" };
  const evaluationCutoff = new Date(cutoffMs).toISOString();
  if (evaluationCutoff !== claimResult.claim.claimedAt) return { status: "ERROR" };

  const completionEvidence = {
    competitionId,
    leaseToken: claimResult.claim.leaseToken,
    evaluationCutoff,
  };

  let valuation: PaperCompetitionCommonValuationResultV3;
  try {
    valuation = kindResult.kind === "challenge"
      ? await dependencies.runChallengeFinalValuationAt({ competitionId, evaluationCutoff })
      : await dependencies.runPrivateLeagueFinalValuationAt({ competitionId, evaluationCutoff });
  } catch {
    await completeGrantedFinalLease(dependencies, { ...completionEvidence, outcome: "error" });
    return { status: "ERROR" };
  }

  if (valuation.status === "VERIFIED" && valuation.evaluationCutoff !== evaluationCutoff) {
    await completeGrantedFinalLease(dependencies, { ...completionEvidence, outcome: "error" });
    return { status: "ERROR" };
  }

  const outcome: PaperCompetitionValuationCompletionOutcomeV3 = valuation.status === "VERIFIED"
    ? "verified"
    : "unavailable";
  const completed = await completeGrantedFinalLease(dependencies, {
    ...completionEvidence,
    outcome,
  });
  if (!completed) return { status: "ERROR" };

  return valuation;
}
