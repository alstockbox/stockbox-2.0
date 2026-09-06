import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runPaperCompetitionValuationServiceV3 } from "../../src/lib/paper-trading/competition-valuation-service-v3";

const repositoryPath = path.join(
  process.cwd(),
  "src/lib/paper-trading/valuation-lease-repository-v3.ts",
);
const repositorySource = fs.existsSync(repositoryPath) ? fs.readFileSync(repositoryPath, "utf8") : "";

const ENV_KEYS = [
  "FEATURE_PAPERTRADING",
  "FEATURE_CHALLENGES",
  "FEATURE_LEADERBOARDS",
  "KILL_SWITCH_PAPERTRADING",
  "KILL_SWITCH_BACKGROUNDJOBS",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

const competitionId = "11111111-1111-4111-8111-111111111111";
const leaseToken = "22222222-2222-4222-8222-222222222222";
const claimedAt = "2026-09-06T14:00:00.000Z";

function enableAll() {
  process.env.FEATURE_PAPERTRADING = "true";
  process.env.FEATURE_CHALLENGES = "true";
  process.env.FEATURE_LEADERBOARDS = "true";
  delete process.env.KILL_SWITCH_PAPERTRADING;
  delete process.env.KILL_SWITCH_BACKGROUNDJOBS;
}

function setup(input?: {
  valuation?: "verified" | "unavailable" | "throw";
  completionOk?: boolean;
  claimed?: boolean;
}) {
  const claimed = input?.claimed ?? true;
  const claimValuation = vi.fn(async () => claimed
    ? {
        ok: true as const,
        claim: {
          claimed: true as const,
          leaseToken,
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

  const runValuationAt = vi.fn(async () => {
    if (input?.valuation === "throw") throw new Error("valuation failed");
    if (input?.valuation === "unavailable") {
      return {
        status: "UNAVAILABLE" as const,
        reason: "PERFORMANCE_NOT_VERIFIED" as const,
      };
    }
    return {
      status: "VERIFIED" as const,
      competitionId,
      evaluationCutoff: claimedAt,
      participantCount: 2,
      rankedCount: 2,
      baseCurrency: "USD",
    };
  });

  const completeValuation = vi.fn(async () => input?.completionOk === false
    ? { ok: false as const, error: "PAPER_COMPETITION_VALUATION_COMPLETE_FAILED" as const }
    : { ok: true as const, completed: true as const });

  return {
    deps: { claimValuation, runValuationAt, completeValuation } as never,
    claimValuation,
    runValuationAt,
    completeValuation,
  };
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe("Paper Trading V3 valuation completion repository", () => {
  it("exports a strict service-role completion adapter bound to the exact lease evidence", () => {
    expect(repositorySource).toContain("export async function completePaperCompetitionValuationV3");
    expect(repositorySource).toContain('.rpc("complete_paper_competition_valuation_v3"');
    expect(repositorySource).toContain("p_competition_id: competitionId");
    expect(repositorySource).toContain("p_lease_token: leaseToken");
    expect(repositorySource).toContain("p_evaluation_cutoff: evaluationCutoff");
    expect(repositorySource).toContain("p_outcome: outcome");
    expect(repositorySource).toContain("UUID_PATTERN.test(competitionId)");
    expect(repositorySource).toContain("UUID_PATTERN.test(leaseToken)");
    expect(repositorySource).toContain("PAPER_COMPETITION_VALUATION_COMPLETE_INVALID_INPUT");
    expect(repositorySource).toContain("PAPER_COMPETITION_VALUATION_COMPLETE_INVALID_RESULT");
  });
});

describe("Paper Trading V3 valuation service lease completion", () => {
  it("records verified completion with the exact DB-owned cutoff and lease token before returning VERIFIED", async () => {
    enableAll();
    const { deps, completeValuation } = setup();

    const result = await runPaperCompetitionValuationServiceV3({ competitionId }, deps);

    expect(completeValuation).toHaveBeenCalledTimes(1);
    expect(completeValuation).toHaveBeenCalledWith({
      competitionId,
      leaseToken,
      evaluationCutoff: claimedAt,
      outcome: "verified",
    });
    expect(result.status).toBe("VERIFIED");
  });

  it("records unavailable completion and preserves the fail-closed valuation result", async () => {
    enableAll();
    const { deps, completeValuation } = setup({ valuation: "unavailable" });

    const result = await runPaperCompetitionValuationServiceV3({ competitionId }, deps);

    expect(completeValuation).toHaveBeenCalledWith({
      competitionId,
      leaseToken,
      evaluationCutoff: claimedAt,
      outcome: "unavailable",
    });
    expect(result).toEqual({ status: "UNAVAILABLE", reason: "PERFORMANCE_NOT_VERIFIED" });
  });

  it("records error completion when valuation throws", async () => {
    enableAll();
    const { deps, completeValuation } = setup({ valuation: "throw" });

    const result = await runPaperCompetitionValuationServiceV3({ competitionId }, deps);

    expect(completeValuation).toHaveBeenCalledWith({
      competitionId,
      leaseToken,
      evaluationCutoff: claimedAt,
      outcome: "error",
    });
    expect(result).toEqual({ status: "ERROR" });
  });

  it("fails closed instead of publishing VERIFIED when lease completion cannot be authenticated", async () => {
    enableAll();
    const { deps, completeValuation } = setup({ completionOk: false });

    const result = await runPaperCompetitionValuationServiceV3({ competitionId }, deps);

    expect(completeValuation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "ERROR" });
  });

  it("does not complete a lease that was never granted", async () => {
    enableAll();
    const { deps, completeValuation } = setup({ claimed: false });

    const result = await runPaperCompetitionValuationServiceV3({ competitionId }, deps);

    expect(result).toEqual({ status: "THROTTLED" });
    expect(completeValuation).not.toHaveBeenCalled();
  });
});
