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

function dependencies(claimed = true) {
  const claimedAt = "2026-09-06T14:00:00.000Z";
  const claimValuation = vi.fn(async () => claimed
    ? {
        ok: true as const,
        claim: {
          claimed: true as const,
          leaseToken: "22222222-2222-4222-8222-222222222222",
          claimedAt,
          leaseExpiresAt: "2026-09-06T14:10:00.000Z",
        },
      }
    : {
        ok: true as const,
        claim: {
          claimed: false as const,
          leaseToken: null,
          claimedAt,
          leaseExpiresAt: null,
        },
      });
  const runValuationAt = vi.fn(async ({ competitionId, serverNow }: { competitionId: string; serverNow: Date }) => ({
    status: "VERIFIED" as const,
    competitionId,
    evaluationCutoff: serverNow.toISOString(),
    participantCount: 2,
    rankedCount: 2,
    baseCurrency: "USD",
  }));
  const deps: PaperCompetitionValuationServiceDependenciesV3 = { claimValuation, runValuationAt };
  return { deps, claimValuation, runValuationAt, claimedAt };
}

describe("Paper Trading V3 competition valuation service boundary", () => {
  it("is dark by default and never claims or calls the live valuation runner", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const { deps, claimValuation, runValuationAt } = dependencies();

    const result = await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, deps);

    expect(result).toEqual({ status: "DISABLED" });
    expect(claimValuation).not.toHaveBeenCalled();
    expect(runValuationAt).not.toHaveBeenCalled();
  });

  it("requires paperTrading, challenges and leaderboards together", async () => {
    enableAll();
    process.env.FEATURE_LEADERBOARDS = "false";
    const { deps, claimValuation, runValuationAt } = dependencies();

    const result = await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, deps);

    expect(result).toEqual({ status: "DISABLED" });
    expect(claimValuation).not.toHaveBeenCalled();
    expect(runValuationAt).not.toHaveBeenCalled();
  });

  it("fails closed under either paper-trading or background-job kill switch before claiming", async () => {
    enableAll();
    const first = dependencies();
    process.env.KILL_SWITCH_PAPERTRADING = "true";
    expect(await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, first.deps)).toEqual({ status: "KILLED" });
    expect(first.claimValuation).not.toHaveBeenCalled();
    expect(first.runValuationAt).not.toHaveBeenCalled();

    enableAll();
    const second = dependencies();
    process.env.KILL_SWITCH_BACKGROUNDJOBS = "true";
    expect(await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, second.deps)).toEqual({ status: "KILLED" });
    expect(second.claimValuation).not.toHaveBeenCalled();
    expect(second.runValuationAt).not.toHaveBeenCalled();
  });

  it("rejects malformed competition identity before any database or provider work", async () => {
    enableAll();
    const { deps, claimValuation, runValuationAt } = dependencies();

    const result = await runPaperCompetitionValuationServiceV3({ competitionId: "not-a-uuid" }, deps);

    expect(result).toEqual({ status: "INVALID_INPUT" });
    expect(claimValuation).not.toHaveBeenCalled();
    expect(runValuationAt).not.toHaveBeenCalled();
  });

  it("returns THROTTLED and performs zero provider valuation work when the database does not grant a claim", async () => {
    enableAll();
    const { deps, claimValuation, runValuationAt } = dependencies(false);
    const competitionId = "11111111-1111-4111-8111-111111111111";

    const result = await runPaperCompetitionValuationServiceV3({ competitionId }, deps);

    expect(result).toEqual({ status: "THROTTLED" });
    expect(claimValuation).toHaveBeenCalledWith(competitionId);
    expect(runValuationAt).not.toHaveBeenCalled();
  });

  it("fails closed if the lease repository cannot produce a validated claim", async () => {
    enableAll();
    const setup = dependencies();
    setup.claimValuation.mockResolvedValueOnce({
      ok: false,
      error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT",
    } as never);

    const result = await runPaperCompetitionValuationServiceV3({
      competitionId: "11111111-1111-4111-8111-111111111111",
    }, setup.deps);

    expect(result).toEqual({ status: "ERROR" });
    expect(setup.runValuationAt).not.toHaveBeenCalled();
  });

  it("uses the database claimedAt as the only common valuation cutoff and ignores caller-supplied time fields", async () => {
    enableAll();
    const { deps, claimValuation, runValuationAt, claimedAt } = dependencies(true);
    const competitionId = "11111111-1111-4111-8111-111111111111";

    const result = await runPaperCompetitionValuationServiceV3({
      competitionId,
      evaluationCutoff: "1999-01-01T00:00:00.000Z",
      serverNow: new Date("1999-01-01T00:00:00.000Z"),
    } as never, deps);

    expect(result.status).toBe("VERIFIED");
    expect(claimValuation).toHaveBeenCalledTimes(1);
    expect(claimValuation).toHaveBeenCalledWith(competitionId);
    expect(runValuationAt).toHaveBeenCalledTimes(1);
    expect(runValuationAt).toHaveBeenCalledWith({
      competitionId,
      serverNow: new Date(claimedAt),
    });
  });
});
