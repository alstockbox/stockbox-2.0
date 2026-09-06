import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  runPaperCompetitionCommonValuationAtV3,
  type PaperCompetitionCommonValuationResultV3,
} from "./competition-valuation-v3";
import { claimPaperCompetitionValuationV3 } from "./valuation-lease-repository-v3";

export type PaperCompetitionValuationServiceDependenciesV3 = {
  claimValuation: typeof claimPaperCompetitionValuationV3;
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

/**
 * Internal-only boundary around competition valuation.
 *
 * This service intentionally accepts only a competition id. Before any quote
 * provider or valuation work it must obtain the service-role database lease.
 * The DB-owned claimedAt timestamp is then the sole common valuation cutoff;
 * browser/app wall-clock fields are never accepted as authority.
 */
export async function runPaperCompetitionValuationServiceV3(
  input: { competitionId: string },
  dependencies: PaperCompetitionValuationServiceDependenciesV3 = {
    claimValuation: claimPaperCompetitionValuationV3,
    runValuationAt: runPaperCompetitionCommonValuationAtV3,
  },
): Promise<PaperCompetitionValuationServiceResultV3> {
  const competitionId = input.competitionId.trim();
  if (!UUID_PATTERN.test(competitionId)) return { status: "INVALID_INPUT" };
  if (!valuationEnabled()) return { status: "DISABLED" };
  if (isKilled("paperTrading") || isKilled("backgroundJobs")) return { status: "KILLED" };

  try {
    const claimResult = await dependencies.claimValuation(competitionId);
    if (!claimResult.ok) return { status: "ERROR" };
    if (!claimResult.claim.claimed) return { status: "THROTTLED" };

    const claimedAtMs = Date.parse(claimResult.claim.claimedAt);
    if (!Number.isFinite(claimedAtMs)) return { status: "ERROR" };

    return await dependencies.runValuationAt({
      competitionId,
      serverNow: new Date(claimedAtMs),
    });
  } catch {
    return { status: "ERROR" };
  }
}
