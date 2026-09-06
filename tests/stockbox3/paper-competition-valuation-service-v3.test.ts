import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runPaperCompetitionValuationServiceV3,
  type PaperCompetitionValuationServiceDependenciesV3,
} from "../../src/lib/paper-trading/competition-valuation-service-v3";

const ENV_KEYS = [
  "FEATURE_PAPERTRADING",
  "FEATURE_CHALLENGES",
  "FEATURE_LEADERBOARDS",
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

function enableAll() {
  process.env.FEATURE_PAPERTRADING = "true";
  process.env.FEATURE_CHALLENGES = "true";
  process.env.FEATURE_LEADERBOARDS = "true";
  delete process.env.KILL_SWITCH_PAPERTRADING;
  delete process.env.KILL_SWITCH_BACKGROUNDJOBS;
}

function dependencies() {
  const runValuation = vi.fn(async ({ competitionId }: { competitionId: string }) => ({
    status: "VERIFIED" as const,
    competitionId,
    evaluationCutoff: "2026-09-06T14:00:00.000Z",
    participantCount: 2,
    rankedCount: 2,
    baseCurrency: "USD",
  }));
  const deps: PaperCompetitionValuationServiceDependenciesV3 = { runValuation };
  return { deps, runValuation };
}

describe("Paper Trading V3 competition valuation service boundary", () => {
  it("is dark by default and never calls the live valuation runner", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const { deps, runValuation } = dependencies();

    const result = await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, deps);

    expect(result).toEqual({ status: "DISABLED" });
    expect(runValuation).not.toHaveBeenCalled();
  });

  it("requires paperTrading, challenges and leaderboards together", async () => {
    enableAll();
    process.env.FEATURE_LEADERBOARDS = "false";
    const { deps, runValuation } = dependencies();

    const result = await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, deps);

    expect(result).toEqual({ status: "DISABLED" });
    expect(runValuation).not.toHaveBeenCalled();
  });

  it("fails closed under either paper-trading or background-job kill switch", async () => {
    enableAll();
    const first = dependencies();
    process.env.KILL_SWITCH_PAPERTRADING = "true";
    expect(await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, first.deps)).toEqual({ status: "KILLED" });
    expect(first.runValuation).not.toHaveBeenCalled();

    enableAll();
    const second = dependencies();
    process.env.KILL_SWITCH_BACKGROUNDJOBS = "true";
    expect(await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, second.deps)).toEqual({ status: "KILLED" });
    expect(second.runValuation).not.toHaveBeenCalled();
  });

  it("rejects malformed competition identity before any provider or database work", async () => {
    enableAll();
    const { deps, runValuation } = dependencies();

    const result = await runPaperCompetitionValuationServiceV3({ competitionId: "not-a-uuid" }, deps);

    expect(result).toEqual({ status: "INVALID_INPUT" });
    expect(runValuation).not.toHaveBeenCalled();
  });

  it("passes only the validated competition id into the live runner when all gates are open", async () => {
    enableAll();
    const { deps, runValuation } = dependencies();
    const competitionId = "11111111-1111-4111-8111-111111111111";

    const result = await runPaperCompetitionValuationServiceV3({ competitionId }, deps);

    expect(result.status).toBe("VERIFIED");
    expect(runValuation).toHaveBeenCalledTimes(1);
    expect(runValuation).toHaveBeenCalledWith({ competitionId });
  });
});
