import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  completeDuePaperCompetitionsV3,
  type PaperCompetitionCompletionResultV3,
} from "./competition-completion-repository-v3";
import {
  runPaperCompetitionFinalValuationSweepV3,
  type PaperCompetitionFinalValuationSweepResultV3,
} from "./competition-final-valuation-sweep-v3";
import {
  runPaperCompetitionValuationSweepV3,
  type PaperCompetitionValuationSweepResultV3,
} from "./competition-valuation-sweep-v3";

export type PaperCompetitionValuationRuntimeDependenciesV3 = {
  completeDue: () => Promise<PaperCompetitionCompletionResultV3>;
  runActive: () => Promise<PaperCompetitionValuationSweepResultV3>;
  runFinal: () => Promise<PaperCompetitionFinalValuationSweepResultV3>;
};

export type PaperCompetitionValuationRuntimeResultV3 =
  | { status: "DISABLED" }
  | { status: "KILLED" }
  | { status: "ERROR" }
  | {
      status: "COMPLETED";
      completedCompetitions: number;
      active: PaperCompetitionValuationSweepResultV3;
      final: PaperCompetitionFinalValuationSweepResultV3;
      errors: number;
    };

function runtimeEnabledV3(): boolean {
  return isFeatureEnabled("paperTrading")
    && isFeatureEnabled("leaderboards")
    && (isFeatureEnabled("challenges") || isFeatureEnabled("privateLeagues"));
}

function nestedErrors(
  result: PaperCompetitionValuationSweepResultV3 | PaperCompetitionFinalValuationSweepResultV3,
): number {
  if (result.status === "COMPLETED") return result.errors;
  return result.status === "ERROR" ? 1 : 0;
}

/**
 * One internal runtime pass for Paper Trading competition valuation.
 *
 * Expired active competitions are completed first so later valuation work
 * cannot treat an already-ended competition as live. Active and final sweeps
 * then run sequentially and independently: a runtime failure in one sweep is
 * represented generically and does not suppress the other. No identities or
 * provider-specific failure details are exposed by this aggregate boundary.
 */
export async function runPaperCompetitionValuationRuntimeV3(
  dependencies: PaperCompetitionValuationRuntimeDependenciesV3 = {
    completeDue: completeDuePaperCompetitionsV3,
    runActive: runPaperCompetitionValuationSweepV3,
    runFinal: runPaperCompetitionFinalValuationSweepV3,
  },
): Promise<PaperCompetitionValuationRuntimeResultV3> {
  if (!runtimeEnabledV3()) return { status: "DISABLED" };
  if (isKilled("paperTrading") || isKilled("backgroundJobs")) return { status: "KILLED" };

  let completion: PaperCompetitionCompletionResultV3;
  try {
    completion = await dependencies.completeDue();
  } catch {
    return { status: "ERROR" };
  }
  if (!completion.ok) return { status: "ERROR" };

  let active: PaperCompetitionValuationSweepResultV3;
  try {
    active = await dependencies.runActive();
  } catch {
    active = { status: "ERROR" };
  }

  let final: PaperCompetitionFinalValuationSweepResultV3;
  try {
    final = await dependencies.runFinal();
  } catch {
    final = { status: "ERROR" };
  }

  return {
    status: "COMPLETED",
    completedCompetitions: completion.completed,
    active,
    final,
    errors: nestedErrors(active) + nestedErrors(final),
  };
}
