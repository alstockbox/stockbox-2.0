import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  loadDuePaperCompetitionFinalValuationCandidatesV3,
  type PaperCompetitionFinalValuationCandidatesResultV3,
} from "./competition-final-valuation-candidate-repository-v3";
import {
  runPaperCompetitionFinalValuationServiceV3,
  type PaperCompetitionFinalValuationServiceResultV3,
} from "./competition-final-valuation-service-v3";

export type PaperCompetitionFinalValuationSweepResultV3 =
  | { status: "DISABLED" }
  | { status: "KILLED" }
  | { status: "ERROR" }
  | {
      status: "COMPLETED";
      attempted: number;
      verified: number;
      unavailable: number;
      throttled: number;
      disabled: number;
      killed: number;
      errors: number;
    };

type FinalCompetitionRunnerV3 = (
  input: { competitionId: string },
) => Promise<PaperCompetitionFinalValuationServiceResultV3>;

export type PaperCompetitionFinalValuationSweepDependenciesV3 = {
  loadCandidates: () => Promise<PaperCompetitionFinalValuationCandidatesResultV3>;
  runCompetition: FinalCompetitionRunnerV3;
};

function finalSweepEnabledV3(): boolean {
  return isFeatureEnabled("paperTrading")
    && isFeatureEnabled("leaderboards")
    && (isFeatureEnabled("challenges") || isFeatureEnabled("privateLeagues"));
}

/**
 * Executes one bounded final-valuation sweep. Feature and kill-switch checks
 * happen before candidate enumeration so a dark/killed subsystem performs no
 * candidate DB work and no historical provider work. Candidate selection is
 * DB-owned, processing is sequential, and the per-competition final service
 * re-checks trusted kind and obtains the exact endsAt final claim.
 */
export async function runPaperCompetitionFinalValuationSweepV3(
  dependencies: PaperCompetitionFinalValuationSweepDependenciesV3 = {
    loadCandidates: loadDuePaperCompetitionFinalValuationCandidatesV3,
    runCompetition: runPaperCompetitionFinalValuationServiceV3,
  },
): Promise<PaperCompetitionFinalValuationSweepResultV3> {
  if (!finalSweepEnabledV3()) return { status: "DISABLED" };
  if (isKilled("paperTrading") || isKilled("backgroundJobs")) return { status: "KILLED" };

  let candidates: PaperCompetitionFinalValuationCandidatesResultV3;
  try {
    candidates = await dependencies.loadCandidates();
  } catch {
    return { status: "ERROR" };
  }
  if (!candidates.ok) return { status: "ERROR" };

  const summary: Extract<PaperCompetitionFinalValuationSweepResultV3, { status: "COMPLETED" }> = {
    status: "COMPLETED",
    attempted: 0,
    verified: 0,
    unavailable: 0,
    throttled: 0,
    disabled: 0,
    killed: 0,
    errors: 0,
  };

  for (const competitionId of candidates.competitionIds) {
    summary.attempted += 1;
    try {
      const result = await dependencies.runCompetition({ competitionId });
      switch (result.status) {
        case "VERIFIED":
          summary.verified += 1;
          break;
        case "UNAVAILABLE":
          summary.unavailable += 1;
          break;
        case "THROTTLED":
          summary.throttled += 1;
          break;
        case "DISABLED":
          summary.disabled += 1;
          break;
        case "KILLED":
          summary.killed += 1;
          break;
        case "ERROR":
        case "INVALID_INPUT":
        default:
          summary.errors += 1;
          break;
      }
    } catch {
      summary.errors += 1;
    }
  }

  return summary;
}
