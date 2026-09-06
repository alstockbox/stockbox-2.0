import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  runPaperCompetitionCommonValuationV3,
  type PaperCompetitionCommonValuationResultV3,
} from "./competition-valuation-v3";

export type PaperCompetitionValuationServiceDependenciesV3 = {
  runValuation: typeof runPaperCompetitionCommonValuationV3;
};

export type PaperCompetitionValuationServiceResultV3 =
  | PaperCompetitionCommonValuationResultV3
  | { status: "DISABLED" }
  | { status: "KILLED" }
  | { status: "INVALID_INPUT" }
  | { status: "ERROR" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valuationEnabled(): boolean {
  return isFeatureEnabled("paperTrading")
    && isFeatureEnabled("challenges")
    && isFeatureEnabled("leaderboards");
}

/**
 * Internal-only boundary around the live competition valuation runner.
 *
 * This service intentionally accepts only a competition id. It owns no browser
 * route or server action, and the downstream orchestrator owns the evaluation
 * cutoff. Both the paper-trading and general background-job emergency switches
 * can stop provider/database work immediately.
 */
export async function runPaperCompetitionValuationServiceV3(
  input: { competitionId: string },
  dependencies: PaperCompetitionValuationServiceDependenciesV3 = {
    runValuation: runPaperCompetitionCommonValuationV3,
  },
): Promise<PaperCompetitionValuationServiceResultV3> {
  const competitionId = input.competitionId.trim();
  if (!UUID_PATTERN.test(competitionId)) return { status: "INVALID_INPUT" };
  if (!valuationEnabled()) return { status: "DISABLED" };
  if (isKilled("paperTrading") || isKilled("backgroundJobs")) return { status: "KILLED" };

  try {
    return await dependencies.runValuation({ competitionId });
  } catch {
    return { status: "ERROR" };
  }
}
