import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  runPrivatePaperLeagueValuationServiceV3,
  type PaperCompetitionValuationServiceDependenciesV3,
} from "../../src/lib/paper-trading/competition-valuation-service-v3";

const servicePath = path.join(process.cwd(), "src/lib/paper-trading/competition-valuation-service-v3.ts");
const source = fs.existsSync(servicePath) ? fs.readFileSync(servicePath, "utf8") : "";

const ENV_KEYS = [
  "FEATURE_PAPERTRADING",
  "FEATURE_CHALLENGES",
  "FEATURE_PRIVATELEAGUES",
  "FEATURE_LEADERBOARDS",
  "KILL_SWITCH_PAPERTRADING",
  "KILL_SWITCH_BACKGROUNDJOBS",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const competitionId = "11111111-1111-4111-8111-111111111111";
const leaseToken = "22222222-2222-4222-8222-222222222222";
const claimedAt = "2026-09-06T14:00:00.000Z";

function enablePrivateLeagueValuation() {
  process.env.FEATURE_PAPERTRADING = "true";
  process.env.FEATURE_PRIVATELEAGUES = "true";
  process.env.FEATURE_LEADERBOARDS = "true";
  process.env.FEATURE_CHALLENGES = "false";
  delete process.env.KILL_SWITCH_PAPERTRADING;
  delete process.env.KILL_SWITCH_BACKGROUNDJOBS;
}

function setup(input?: {
  claimed?: boolean;
  valuation?: "verified" | "unavailable" | "throw" | "wrong-cutoff";
  completionOk?: boolean;
}) {
  const claimValuation = vi.fn(async () => input?.claimed === false
    ? {
        ok: true as const,
        claim: {
          claimed: false as const,
          leaseToken: null,
          claimedAt,
          leaseExpiresAt: null,
        },
      }
    : {
        ok: true as const,
        claim: {
          claimed: true as const,
          leaseToken,
          claimedAt,
          leaseExpiresAt: "2026-09-06T14:10:00.000Z",
        },
      });

  const runValuationAt = vi.fn(async ({ competitionId: id, serverNow }: { competitionId: string; serverNow: Date }) => {
    if (input?.valuation === "throw") throw new Error("valuation failed");
    if (input?.valuation === "unavailable") {
      return {
        status: "UNAVAILABLE" as const,
        reason: "PERFORMANCE_NOT_VERIFIED" as const,
      };
    }
    return {
      status: "VERIFIED" as const,
      competitionId: id,
      evaluationCutoff: input?.valuation === "wrong-cutoff"
        ? "2026-09-06T14:00:01.000Z"
        : serverNow.toISOString(),
      participantCount: 2,
      rankedCount: 2,
      baseCurrency: "USD",
    };
  });

  const completeValuation = vi.fn(async () => input?.completionOk === false
    ? { ok: false as const, error: "PAPER_COMPETITION_VALUATION_COMPLETE_FAILED" as const }
    : { ok: true as const, completed: true as const });

  const deps: PaperCompetitionValuationServiceDependenciesV3 = {
    claimValuation,
    completeValuation,
    runValuationAt,
  };

  return { deps, claimValuation, runValuationAt, completeValuation };
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe("Paper Trading V3 private league valuation service", () => {
  it("is dark by default and does zero lease/provider/completion work", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const { deps, claimValuation, runValuationAt, completeValuation } = setup();

    const result = await runPrivatePaperLeagueValuationServiceV3({ competitionId }, deps);

    expect(result).toEqual({ status: "DISABLED" });
    expect(claimValuation).not.toHaveBeenCalled();
    expect(runValuationAt).not.toHaveBeenCalled();
    expect(completeValuation).not.toHaveBeenCalled();
  });

  it("requires paperTrading, privateLeagues and leaderboards but not the challenges flag", async () => {
    enablePrivateLeagueValuation();
    const allowed = setup();

    const result = await runPrivatePaperLeagueValuationServiceV3({ competitionId }, allowed.deps);
    expect(result.status).toBe("VERIFIED");
    expect(allowed.claimValuation).toHaveBeenCalledTimes(1);

    process.env.FEATURE_PRIVATELEAGUES = "false";
    const blocked = setup();
    expect(await runPrivatePaperLeagueValuationServiceV3({ competitionId }, blocked.deps)).toEqual({ status: "DISABLED" });
    expect(blocked.claimValuation).not.toHaveBeenCalled();
  });

  it("fails closed under paper-trading or background-job kill switches before claiming", async () => {
    enablePrivateLeagueValuation();
    process.env.KILL_SWITCH_PAPERTRADING = "true";
    const paperKilled = setup();
    expect(await runPrivatePaperLeagueValuationServiceV3({ competitionId }, paperKilled.deps)).toEqual({ status: "KILLED" });
    expect(paperKilled.claimValuation).not.toHaveBeenCalled();

    enablePrivateLeagueValuation();
    process.env.KILL_SWITCH_BACKGROUNDJOBS = "true";
    const jobsKilled = setup();
    expect(await runPrivatePaperLeagueValuationServiceV3({ competitionId }, jobsKilled.deps)).toEqual({ status: "KILLED" });
    expect(jobsKilled.claimValuation).not.toHaveBeenCalled();
  });

  it("returns THROTTLED with zero valuation/completion work when the private lease is not granted", async () => {
    enablePrivateLeagueValuation();
    const { deps, claimValuation, runValuationAt, completeValuation } = setup({ claimed: false });

    const result = await runPrivatePaperLeagueValuationServiceV3({ competitionId }, deps);

    expect(result).toEqual({ status: "THROTTLED" });
    expect(claimValuation).toHaveBeenCalledWith(competitionId);
    expect(runValuationAt).not.toHaveBeenCalled();
    expect(completeValuation).not.toHaveBeenCalled();
  });

  it("uses DB claimedAt as the sole cutoff and completes VERIFIED with exact lease evidence", async () => {
    enablePrivateLeagueValuation();
    const { deps, runValuationAt, completeValuation } = setup();

    const result = await runPrivatePaperLeagueValuationServiceV3({
      competitionId,
      serverNow: new Date("1999-01-01T00:00:00.000Z"),
      evaluationCutoff: "1999-01-01T00:00:00.000Z",
    } as never, deps);

    expect(result.status).toBe("VERIFIED");
    expect(runValuationAt).toHaveBeenCalledWith({ competitionId, serverNow: new Date(claimedAt) });
    expect(completeValuation).toHaveBeenCalledWith({
      competitionId,
      leaseToken,
      evaluationCutoff: claimedAt,
      outcome: "verified",
    });
  });

  it("completes UNAVAILABLE terminally before returning the fail-closed valuation", async () => {
    enablePrivateLeagueValuation();
    const { deps, completeValuation } = setup({ valuation: "unavailable" });

    const result = await runPrivatePaperLeagueValuationServiceV3({ competitionId }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "PERFORMANCE_NOT_VERIFIED" });
    expect(completeValuation).toHaveBeenCalledWith({
      competitionId,
      leaseToken,
      evaluationCutoff: claimedAt,
      outcome: "unavailable",
    });
  });

  it("records ERROR completion on throw or cutoff mismatch, and never publishes mismatched VERIFIED", async () => {
    enablePrivateLeagueValuation();
    const thrown = setup({ valuation: "throw" });
    expect(await runPrivatePaperLeagueValuationServiceV3({ competitionId }, thrown.deps)).toEqual({ status: "ERROR" });
    expect(thrown.completeValuation).toHaveBeenCalledWith({
      competitionId,
      leaseToken,
      evaluationCutoff: claimedAt,
      outcome: "error",
    });

    const mismatched = setup({ valuation: "wrong-cutoff" });
    expect(await runPrivatePaperLeagueValuationServiceV3({ competitionId }, mismatched.deps)).toEqual({ status: "ERROR" });
    expect(mismatched.completeValuation).toHaveBeenCalledWith({
      competitionId,
      leaseToken,
      evaluationCutoff: claimedAt,
      outcome: "error",
    });
  });

  it("fails closed when terminal completion cannot be authenticated and binds live defaults to private authority", async () => {
    enablePrivateLeagueValuation();
    const { deps, completeValuation } = setup({ completionOk: false });

    expect(await runPrivatePaperLeagueValuationServiceV3({ competitionId }, deps)).toEqual({ status: "ERROR" });
    expect(completeValuation).toHaveBeenCalledTimes(1);

    expect(source).toContain("claimPrivatePaperLeagueValuationV3");
    expect(source).toContain("runPrivatePaperLeagueCommonValuationAtV3");
    expect(source).toContain("export async function runPrivatePaperLeagueValuationServiceV3");
    expect(source).toContain("claimValuation: claimPrivatePaperLeagueValuationV3");
    expect(source).toContain("runValuationAt: runPrivatePaperLeagueCommonValuationAtV3");
  });
});
