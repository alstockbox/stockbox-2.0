import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadPaperChallengeLeaderboardReadModelV3 } from "../../src/lib/paper-trading/challenge-leaderboard-read-model-v3";
import { loadPaperPrivateLeagueLeaderboardReadModelV3 } from "../../src/lib/paper-trading/private-league-leaderboard-read-model-v3";

const competitionId = "11111111-1111-4111-8111-111111111111";
const viewerUserId = "viewer-user";
const otherUserId = "other-user";
const startsAt = "2026-09-06T12:00:00.000Z";
const activeCutoff = "2026-09-06T14:00:00.000Z";
const endsAt = "2026-09-06T16:00:00.000Z";

const challengeSource = readFileSync("src/lib/paper-trading/challenge-leaderboard-read-model-v3.ts", "utf8");
const privateSource = readFileSync("src/lib/paper-trading/private-league-leaderboard-read-model-v3.ts", "utf8");

function standings(kind: "challenge" | "private_league", evaluationCutoff: string) {
  return {
    ok: true as const,
    competitionId,
    competitionKind: kind,
    baseCurrency: "USD",
    evaluationCutoff,
    standings: [
      {
        status: "RANKED" as const,
        competitionId,
        userId: otherUserId,
        accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        joinedAt: startsAt,
        rank: 1,
        returnPercent: 6,
        equity: 106000,
        evaluatedAt: evaluationCutoff,
      },
      {
        status: "RANKED" as const,
        competitionId,
        userId: viewerUserId,
        accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        joinedAt: startsAt,
        rank: 2,
        returnPercent: 5,
        equity: 105000,
        evaluatedAt: evaluationCutoff,
      },
    ],
    rankedCount: 2,
    unavailableCount: 0,
  };
}

function challengeDependencies(status: "active" | "completed") {
  const cutoff = status === "completed" ? endsAt : activeCutoff;
  const loadLegacyStandings = vi.fn(async () => standings("challenge", cutoff));
  const loadActiveStandings = vi.fn(async () => standings("challenge", cutoff));
  const loadFinalStandings = vi.fn(async () => standings("challenge", cutoff));
  const deps = {
    loadCompetition: vi.fn(async () => ({
      ok: true as const,
      competition: { id: competitionId, kind: "challenge" as const, status, baseCurrency: "USD", startsAt, endsAt },
    })),
    loadVerifiedCutoff: vi.fn(async () => ({
      ok: true as const,
      pointer: { lastVerifiedAt: "2026-09-06T16:00:05.000Z", lastVerifiedEvaluationCutoff: cutoff },
    })),
    loadStandings: loadLegacyStandings,
    loadActiveStandings,
    loadFinalStandings,
  } as never;
  return { deps, loadLegacyStandings, loadActiveStandings, loadFinalStandings, cutoff };
}

function privateDependencies(status: "active" | "completed") {
  const cutoff = status === "completed" ? endsAt : activeCutoff;
  const loadLegacyStandings = vi.fn(async () => standings("private_league", cutoff));
  const loadActiveStandings = vi.fn(async () => standings("private_league", cutoff));
  const loadFinalStandings = vi.fn(async () => standings("private_league", cutoff));
  const deps = {
    loadCompetition: vi.fn(async () => ({
      ok: true as const,
      competition: { id: competitionId, kind: "private_league" as const, status, baseCurrency: "USD", startsAt, endsAt },
    })),
    loadVerifiedCutoff: vi.fn(async () => ({
      ok: true as const,
      pointer: { lastVerifiedAt: "2026-09-06T16:00:05.000Z", lastVerifiedEvaluationCutoff: cutoff },
    })),
    loadStandings: loadLegacyStandings,
    loadActiveStandings,
    loadFinalStandings,
  } as never;
  return { deps, loadLegacyStandings, loadActiveStandings, loadFinalStandings, cutoff };
}

describe("Paper Trading V3 leaderboard snapshot-policy dispatch", () => {
  it("uses active standings only for an active challenge", async () => {
    const setup = challengeDependencies("active");
    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, setup.deps);

    expect(result.status).toBe("VERIFIED");
    expect(setup.loadActiveStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: setup.cutoff,
      viewer: { scope: "public" },
    });
    expect(setup.loadFinalStandings).not.toHaveBeenCalled();
    expect(setup.loadLegacyStandings).not.toHaveBeenCalled();
  });

  it("uses final standings only for a completed challenge at exact endsAt", async () => {
    const setup = challengeDependencies("completed");
    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, setup.deps);

    expect(result.status).toBe("VERIFIED");
    expect(setup.loadFinalStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: endsAt,
      viewer: { scope: "public" },
    });
    expect(setup.loadActiveStandings).not.toHaveBeenCalled();
    expect(setup.loadLegacyStandings).not.toHaveBeenCalled();
  });

  it("uses active standings only for an active private league and preserves member viewer authority", async () => {
    const setup = privateDependencies("active");
    const result = await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, setup.deps);

    expect(result.status).toBe("VERIFIED");
    expect(setup.loadActiveStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: setup.cutoff,
      viewer: { scope: "member", userId: viewerUserId },
    });
    expect(setup.loadFinalStandings).not.toHaveBeenCalled();
    expect(setup.loadLegacyStandings).not.toHaveBeenCalled();
  });

  it("uses final standings only for a completed private league and preserves member viewer authority", async () => {
    const setup = privateDependencies("completed");
    const result = await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, setup.deps);

    expect(result.status).toBe("VERIFIED");
    expect(setup.loadFinalStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: endsAt,
      viewer: { scope: "member", userId: viewerUserId },
    });
    expect(setup.loadActiveStandings).not.toHaveBeenCalled();
    expect(setup.loadLegacyStandings).not.toHaveBeenCalled();
  });

  it("keeps snapshot-policy selection server-owned in both read models", () => {
    for (const source of [challengeSource, privateSource]) {
      expect(source).toContain("loadPaperCompetitionFinalStandingsV3");
      expect(source).not.toContain("input.snapshotPolicy");
      expect(source).not.toContain("input.policyVersion");
    }
  });
});
