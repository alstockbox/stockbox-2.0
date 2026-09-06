import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  runPaperCompetitionFinalValuationServiceV3,
  type PaperCompetitionFinalValuationServiceDependenciesV3,
} from "../../src/lib/paper-trading/competition-final-valuation-service-v3";

const source = readFileSync("src/lib/paper-trading/competition-final-valuation-service-v3.ts", "utf8");
const COMPETITION_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_TOKEN = "22222222-2222-4222-8222-222222222222";
const FINAL_CUTOFF = "2026-09-06T20:00:00.000Z";

const ENV_KEYS = [
  "FEATURE_PAPERTRADING",
  "FEATURE_CHALLENGES",
  "FEATURE_PRIVATELEAGUES",
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
  process.env.FEATURE_PRIVATELEAGUES = "true";
  process.env.FEATURE_LEADERBOARDS = "true";
  delete process.env.KILL_SWITCH_PAPERTRADING;
  delete process.env.KILL_SWITCH_BACKGROUNDJOBS;
}

function setup(kind: "challenge" | "private_league" = "challenge", claimed = true) {
  const loadCompetitionKind = vi.fn(async () => ({ ok: true as const, kind }));
  const claimFinalValuation = vi.fn(async () => claimed
    ? {
        ok: true as const,
        claim: {
          claimed: true as const,
          leaseToken: LEASE_TOKEN,
          claimedAt: FINAL_CUTOFF,
          leaseExpiresAt: "2026-09-06T20:30:00.000Z",
        },
      }
    : {
        ok: true as const,
        claim: {
          claimed: false as const,
          leaseToken: null,
          claimedAt: FINAL_CUTOFF,
          leaseExpiresAt: null,
        },
      });
  const completeValuation = vi.fn(async () => ({ ok: true as const, completed: true as const }));
  const runChallengeFinalValuationAt = vi.fn(async ({ competitionId, evaluationCutoff }: { competitionId: string; evaluationCutoff: string }) => ({
    status: "VERIFIED" as const,
    competitionId,
    evaluationCutoff,
    participantCount: 2,
    rankedCount: 2,
    baseCurrency: "USD",
  }));
  const runPrivateLeagueFinalValuationAt = vi.fn(async ({ competitionId, evaluationCutoff }: { competitionId: string; evaluationCutoff: string }) => ({
    status: "VERIFIED" as const,
    competitionId,
    evaluationCutoff,
    participantCount: 2,
    rankedCount: 2,
    baseCurrency: "SEK",
  }));

  const deps: PaperCompetitionFinalValuationServiceDependenciesV3 = {
    loadCompetitionKind,
    claimFinalValuation,
    completeValuation,
    runChallengeFinalValuationAt,
    runPrivateLeagueFinalValuationAt,
  };
  return {
    deps,
    loadCompetitionKind,
    claimFinalValuation,
    completeValuation,
    runChallengeFinalValuationAt,
    runPrivateLeagueFinalValuationAt,
  };
}

describe("Paper Trading V3 final competition valuation service", () => {
  it("accepts only competitionId authority and production wiring uses historical cutoff quotes", () => {
    expect(source).toContain("fetchYahooFinalCutoffQuoteV3");
    expect(source).not.toContain("fetchYahooExecutionQuoteV3");
    expect(source).not.toContain("input.kind");
    expect(source).not.toContain("input.evaluationCutoff");
    expect(source).not.toContain("input.serverNow");
    expect(source).not.toContain("input.accountId");
    expect(source).not.toContain("input.userId");
  });

  it("rejects malformed identity before database, lease or provider work", async () => {
    enableAll();
    const s = setup();

    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: "bad" }, s.deps)).toEqual({ status: "INVALID_INPUT" });
    expect(s.loadCompetitionKind).not.toHaveBeenCalled();
    expect(s.claimFinalValuation).not.toHaveBeenCalled();
    expect(s.runChallengeFinalValuationAt).not.toHaveBeenCalled();
    expect(s.runPrivateLeagueFinalValuationAt).not.toHaveBeenCalled();
  });

  it("resolves trusted server kind before lease mutation and dispatches only that kind", async () => {
    enableAll();
    const challenge = setup("challenge");
    expect((await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, challenge.deps)).status).toBe("VERIFIED");
    expect(challenge.loadCompetitionKind).toHaveBeenCalledWith(COMPETITION_ID);
    expect(challenge.claimFinalValuation).toHaveBeenCalledWith(COMPETITION_ID);
    expect(challenge.loadCompetitionKind.mock.invocationCallOrder[0]).toBeLessThan(challenge.claimFinalValuation.mock.invocationCallOrder[0]);
    expect(challenge.runChallengeFinalValuationAt).toHaveBeenCalledWith({ competitionId: COMPETITION_ID, evaluationCutoff: FINAL_CUTOFF });
    expect(challenge.runPrivateLeagueFinalValuationAt).not.toHaveBeenCalled();

    const privateLeague = setup("private_league");
    expect((await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, privateLeague.deps)).status).toBe("VERIFIED");
    expect(privateLeague.runPrivateLeagueFinalValuationAt).toHaveBeenCalledWith({ competitionId: COMPETITION_ID, evaluationCutoff: FINAL_CUTOFF });
    expect(privateLeague.runChallengeFinalValuationAt).not.toHaveBeenCalled();
  });

  it("requires the correct feature surface before claiming", async () => {
    enableAll();
    process.env.FEATURE_CHALLENGES = "false";
    const challenge = setup("challenge");
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, challenge.deps)).toEqual({ status: "DISABLED" });
    expect(challenge.claimFinalValuation).not.toHaveBeenCalled();

    enableAll();
    process.env.FEATURE_PRIVATELEAGUES = "false";
    const privateLeague = setup("private_league");
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, privateLeague.deps)).toEqual({ status: "DISABLED" });
    expect(privateLeague.claimFinalValuation).not.toHaveBeenCalled();
  });

  it("fails closed under either kill switch before claim/provider work", async () => {
    enableAll();
    process.env.KILL_SWITCH_PAPERTRADING = "true";
    const first = setup();
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, first.deps)).toEqual({ status: "KILLED" });
    expect(first.claimFinalValuation).not.toHaveBeenCalled();
    expect(first.runChallengeFinalValuationAt).not.toHaveBeenCalled();

    enableAll();
    process.env.KILL_SWITCH_BACKGROUNDJOBS = "true";
    const second = setup();
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, second.deps)).toEqual({ status: "KILLED" });
    expect(second.claimFinalValuation).not.toHaveBeenCalled();
    expect(second.runChallengeFinalValuationAt).not.toHaveBeenCalled();
  });

  it("returns THROTTLED and performs zero valuation work when final claim is not granted", async () => {
    enableAll();
    const s = setup("challenge", false);
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, s.deps)).toEqual({ status: "THROTTLED" });
    expect(s.runChallengeFinalValuationAt).not.toHaveBeenCalled();
    expect(s.runPrivateLeagueFinalValuationAt).not.toHaveBeenCalled();
    expect(s.completeValuation).not.toHaveBeenCalled();
  });

  it("uses only the DB final claim cutoff and completes VERIFIED leases as verified", async () => {
    enableAll();
    const s = setup("challenge", true);
    const result = await runPaperCompetitionFinalValuationServiceV3({
      competitionId: COMPETITION_ID,
      kind: "private_league",
      evaluationCutoff: "1999-01-01T00:00:00.000Z",
      serverNow: new Date("1999-01-01T00:00:00.000Z"),
    } as never, s.deps);

    expect(result.status).toBe("VERIFIED");
    expect(s.runChallengeFinalValuationAt).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      evaluationCutoff: FINAL_CUTOFF,
    });
    expect(s.completeValuation).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      leaseToken: LEASE_TOKEN,
      evaluationCutoff: FINAL_CUTOFF,
      outcome: "verified",
    });
  });

  it("terminally completes UNAVAILABLE as unavailable and thrown/mismatched results as error", async () => {
    enableAll();
    const unavailable = setup();
    unavailable.runChallengeFinalValuationAt.mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "PERFORMANCE_NOT_VERIFIED" } as never);
    expect((await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, unavailable.deps)).status).toBe("UNAVAILABLE");
    expect(unavailable.completeValuation).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unavailable" }));

    const thrown = setup();
    thrown.runChallengeFinalValuationAt.mockRejectedValueOnce(new Error("provider detail must not leak"));
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, thrown.deps)).toEqual({ status: "ERROR" });
    expect(thrown.completeValuation).toHaveBeenCalledWith(expect.objectContaining({ outcome: "error" }));

    const mismatch = setup();
    mismatch.runChallengeFinalValuationAt.mockResolvedValueOnce({
      status: "VERIFIED",
      competitionId: COMPETITION_ID,
      evaluationCutoff: "2026-09-06T19:59:00.000Z",
      participantCount: 2,
      rankedCount: 2,
      baseCurrency: "USD",
    } as never);
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, mismatch.deps)).toEqual({ status: "ERROR" });
    expect(mismatch.completeValuation).toHaveBeenCalledWith(expect.objectContaining({ outcome: "error" }));
  });

  it("fails closed when trusted kind/claim/completion authority fails and never leaks raw errors", async () => {
    enableAll();
    const kindFailure = setup();
    kindFailure.loadCompetitionKind.mockResolvedValueOnce({ ok: false, error: "secret-db-detail" } as never);
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, kindFailure.deps)).toEqual({ status: "ERROR" });
    expect(kindFailure.claimFinalValuation).not.toHaveBeenCalled();

    const claimFailure = setup();
    claimFailure.claimFinalValuation.mockResolvedValueOnce({ ok: false, error: "secret-claim-detail" } as never);
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, claimFailure.deps)).toEqual({ status: "ERROR" });
    expect(claimFailure.runChallengeFinalValuationAt).not.toHaveBeenCalled();

    const completionFailure = setup();
    completionFailure.completeValuation.mockResolvedValueOnce({ ok: false, error: "secret-completion-detail" } as never);
    expect(await runPaperCompetitionFinalValuationServiceV3({ competitionId: COMPETITION_ID }, completionFailure.deps)).toEqual({ status: "ERROR" });
  });
});
