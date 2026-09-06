import { afterEach, describe, expect, it, vi } from "vitest";
import { runPaperCompetitionFinalValuationSweepV3 } from "../../src/lib/paper-trading/competition-final-valuation-sweep-v3";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ENV_KEYS = [
  "FEATURE_PAPERTRADING",
  "FEATURE_LEADERBOARDS",
  "FEATURE_CHALLENGES",
  "FEATURE_PRIVATELEAGUES",
  "KILL_SWITCH_PAPERTRADING",
  "KILL_SWITCH_BACKGROUNDJOBS",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function enableFinalSweep() {
  process.env.FEATURE_PAPERTRADING = "true";
  process.env.FEATURE_LEADERBOARDS = "true";
  process.env.FEATURE_CHALLENGES = "true";
  process.env.FEATURE_PRIVATELEAGUES = "true";
  delete process.env.KILL_SWITCH_PAPERTRADING;
  delete process.env.KILL_SWITCH_BACKGROUNDJOBS;
}

describe("Paper Trading V3 bounded final valuation sweep", () => {
  it("is dark by default and never enumerates candidates or runs provider work", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const loadCandidates = vi.fn();
    const runCompetition = vi.fn();

    expect(await runPaperCompetitionFinalValuationSweepV3({ loadCandidates, runCompetition })).toEqual({
      status: "DISABLED",
    });
    expect(loadCandidates).not.toHaveBeenCalled();
    expect(runCompetition).not.toHaveBeenCalled();
  });

  it("fails closed under either paper-trading or background-job kill switch before candidate enumeration", async () => {
    enableFinalSweep();
    process.env.KILL_SWITCH_PAPERTRADING = "true";
    const firstLoad = vi.fn();
    const firstRun = vi.fn();
    expect(await runPaperCompetitionFinalValuationSweepV3({
      loadCandidates: firstLoad,
      runCompetition: firstRun,
    })).toEqual({ status: "KILLED" });
    expect(firstLoad).not.toHaveBeenCalled();
    expect(firstRun).not.toHaveBeenCalled();

    enableFinalSweep();
    process.env.KILL_SWITCH_BACKGROUNDJOBS = "true";
    const secondLoad = vi.fn();
    const secondRun = vi.fn();
    expect(await runPaperCompetitionFinalValuationSweepV3({
      loadCandidates: secondLoad,
      runCompetition: secondRun,
    })).toEqual({ status: "KILLED" });
    expect(secondLoad).not.toHaveBeenCalled();
    expect(secondRun).not.toHaveBeenCalled();
  });

  it("runs only trusted bounded candidates sequentially and returns aggregate status without competition ids", async () => {
    enableFinalSweep();
    const loadCandidates = vi.fn(async () => ({ ok: true as const, competitionIds: [A, B] }));
    const callOrder: string[] = [];
    const runCompetition = vi.fn(async ({ competitionId }: { competitionId: string }) => {
      callOrder.push(competitionId);
      return competitionId === A
        ? { status: "VERIFIED" as const, competitionId, evaluationCutoff: "2026-09-06T18:00:00.000Z", participantCount: 2, rankedCount: 2, baseCurrency: "USD" }
        : { status: "UNAVAILABLE" as const, reason: "PERFORMANCE_NOT_VERIFIED" as const };
    });

    const result = await runPaperCompetitionFinalValuationSweepV3({ loadCandidates, runCompetition });

    expect(loadCandidates).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual([A, B]);
    expect(result).toEqual({
      status: "COMPLETED",
      attempted: 2,
      verified: 1,
      unavailable: 1,
      throttled: 0,
      disabled: 0,
      killed: 0,
      errors: 0,
    });
    expect(JSON.stringify(result)).not.toContain(A);
    expect(JSON.stringify(result)).not.toContain(B);
  });

  it("continues after one competition error and counts thrown runners as errors", async () => {
    enableFinalSweep();
    const loadCandidates = vi.fn(async () => ({ ok: true as const, competitionIds: [A, B] }));
    const runCompetition = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "THROTTLED" as const });

    expect(await runPaperCompetitionFinalValuationSweepV3({ loadCandidates, runCompetition })).toEqual({
      status: "COMPLETED",
      attempted: 2,
      verified: 0,
      unavailable: 0,
      throttled: 1,
      disabled: 0,
      killed: 0,
      errors: 1,
    });
    expect(runCompetition).toHaveBeenCalledTimes(2);
  });

  it("fails closed before provider work when trusted final candidate enumeration is unavailable", async () => {
    enableFinalSweep();
    const runCompetition = vi.fn();
    expect(await runPaperCompetitionFinalValuationSweepV3({
      loadCandidates: async () => ({ ok: false as const, error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_LOOKUP_FAILED" as const }),
      runCompetition,
    })).toEqual({ status: "ERROR" });
    expect(runCompetition).not.toHaveBeenCalled();
  });
});
