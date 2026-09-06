import {
  loadDuePaperCompetitionValuationCandidatesV3,
  type PaperCompetitionValuationCandidatesResultV3,
} from "./competition-valuation-candidate-repository-v3";
import { runPaperCompetitionValuationJobV3 } from "./competition-valuation-job-v3";

export type PaperCompetitionValuationSweepResultV3 =
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

type CompetitionRunnerV3 = (
  input: { competitionId: string },
) => ReturnType<typeof runPaperCompetitionValuationJobV3>;

export type PaperCompetitionValuationSweepDependenciesV3 = {
  loadCandidates: () => Promise<PaperCompetitionValuationCandidatesResultV3>;
  runCompetition: CompetitionRunnerV3;
};

/**
 * Executes one bounded internal sweep. Candidate selection is DB-owned and the
 * per-competition job re-loads trusted kind before the existing claim RPC
 * establishes the authoritative cutoff. Runs are deliberately sequential to
 * cap provider/database pressure and one failed competition cannot suppress
 * later candidates.
 */
export async function runPaperCompetitionValuationSweepV3(
  dependencies: PaperCompetitionValuationSweepDependenciesV3 = {
    loadCandidates: loadDuePaperCompetitionValuationCandidatesV3,
    runCompetition: runPaperCompetitionValuationJobV3,
  },
): Promise<PaperCompetitionValuationSweepResultV3> {
  let candidates: PaperCompetitionValuationCandidatesResultV3;
  try {
    candidates = await dependencies.loadCandidates();
  } catch {
    return { status: "ERROR" };
  }
  if (!candidates.ok) return { status: "ERROR" };

  const summary: Extract<PaperCompetitionValuationSweepResultV3, { status: "COMPLETED" }> = {
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
