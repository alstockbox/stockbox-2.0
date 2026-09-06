import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  runPaperCompetitionCommonValuationAtV3,
  type PaperCompetitionCommonValuationResultV3,
} from "./competition-valuation-v3";
import {
  claimPaperCompetitionValuationV3,
  completePaperCompetitionValuationV3,
  type PaperCompetitionValuationCompletionOutcomeV3,
} from "./valuation-lease-repository-v3";

export type PaperCompetitionValuationServiceDependenciesV3 = {
  claimValuation: typeof claimPaperCompetitionValuationV3;
  completeValuation: typeof completePaperCompetitionValuationV3;
  runValuationAt: typeof runPaperCompetitionCommonValuationAtV3;
};

export type PaperCompetitionValuationServiceResultV3 =
  | PaperCompetitionCommonValuationResultV3
  | { status: "DISABLED" }
  | { status: "KILLED" }
  | { status: "INVALID_INPUT" }
  | { status: "THROTTLED" }
  | { status: "ERROR" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valuationEnabled(): boolean {
  return isFeatureEnabled("paperTrading")
    && isFeatureEnabled("challenges")
    && isFeatureEnabled("leaderboards");
}

async function completeGrantedLease(
  dependencies: PaperCompetitionValuationServiceDependenciesV3,
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

/**
 * Internal-only boundary around competition valuation.
 *
 * This service intentionally accepts only a competition id. Before any quote
 * provider or valuation work it must obtain the service-role database lease.
 * The DB-owned claimedAt timestamp is then the sole common valuation cutoff;
 * browser/app wall-clock fields are never accepted as authority. A granted
 * lease must also be terminally completed before any valuation result can be
 * returned as trusted output.
 */
export async function runPaperCompetitionValuationServiceV3(
  input: { competitionId: string },
  dependencies: PaperCompetitionValuationServiceDependenciesV3 = {
    claimValuation: claimPaperCompetitionValuationV3,
    completeValuation: completePaperCompetitionValuationV3,
    runValuationAt: runPaperCompetitionCommonValuationAtV3,
  },
): Promise<PaperCompetitionValuationServiceResultV3> {
  const competitionId = input.competitionId.trim();
  if (!UUID_PATTERN.test(competitionId)) return { status: "INVALID_INPUT" };
  if (!valuationEnabled()) return { status: "DISABLED" };
  if (isKilled("paperTrading") || isKilled("backgroundJobs")) return { status: "KILLED" };

  let claimResult: Awaited<ReturnType<PaperCompetitionValuationServiceDependenciesV3["claimValuation"]>>;
  try {
    claimResult = await dependencies.claimValuation(competitionId);
  } catch {
    return { status: "ERROR" };
  }
  if (!claimResult.ok) return { status: "ERROR" };
  if (!claimResult.claim.claimed) return { status: "THROTTLED" };

  const claimedAtMs = Date.parse(claimResult.claim.claimedAt);
  if (!Number.isFinite(claimedAtMs)) return { status: "ERROR" };

  const completionEvidence = {
    competitionId,
    leaseToken: claimResult.claim.leaseToken,
    evaluationCutoff: claimResult.claim.claimedAt,
  };

  let valuation: PaperCompetitionCommonValuationResultV3;
  try {
    valuation = await dependencies.runValuationAt({
      competitionId,
      serverNow: new Date(claimedAtMs),
    });
  } catch {
    await completeGrantedLease(dependencies, {
      ...completionEvidence,
      outcome: "error",
    });
    return { status: "ERROR" };
  }

  if (valuation.status === "VERIFIED" && valuation.evaluationCutoff !== claimResult.claim.claimedAt) {
    await completeGrantedLease(dependencies, {
      ...completionEvidence,
      outcome: "error",
    });
    return { status: "ERROR" };
  }

  const outcome: PaperCompetitionValuationCompletionOutcomeV3 = valuation.status === "VERIFIED"
    ? "verified"
    : "unavailable";
  const completed = await completeGrantedLease(dependencies, {
    ...completionEvidence,
    outcome,
  });
  if (!completed) return { status: "ERROR" };

  return valuation;
}
