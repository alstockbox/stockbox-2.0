import { describe, expect, it, vi } from "vitest";
import {
  loadPaperPrivateLeagueLeaderboardReadModelV3,
  type PaperPrivateLeagueLeaderboardReadModelDependenciesV3,
} from "../../src/lib/paper-trading/private-league-leaderboard-read-model-v3";

const competitionId = "11111111-1111-4111-8111-111111111111";
const viewerUserId = "viewer-user";
const otherUserId = "other-user";
const startsAt = "2026-09-06T12:00:00.000Z";
const cutoff = "2026-09-06T14:00:00.000Z";
const endsAt = "2026-09-06T16:00:00.000Z";

function setup(input?: {
  status?: "active" | "completed" | "open" | "cancelled";
  kind?: "challenge" | "private_league";
  pointerCutoff?: string | null;
  pointerVerifiedAt?: string | null;
  standingsUnavailable?: boolean;
  standingsError?: boolean;
  standingsCurrency?: string;
  standingsCutoff?: string;
  standingsKind?: "challenge" | "private_league";
}) {
  const loadCompetition = vi.fn(async () => ({
    ok: true as const,
    competition: {
      id: competitionId,
      kind: input?.kind ?? "private_league",
      status: input?.status ?? "active",
      baseCurrency: "USD",
      startsAt,
      endsAt,
    },
  }));
  const loadVerifiedCutoff = vi.fn(async () => ({
    ok: true as const,
    pointer: input?.pointerCutoff === null
      ? null
      : {
          lastVerifiedAt: input?.pointerVerifiedAt ?? "2026-09-06T14:00:05.000Z",
          lastVerifiedEvaluationCutoff: input?.pointerCutoff ?? cutoff,
        },
  }));
  const loadStandings = vi.fn(async () => {
    if (input?.standingsError) {
      return { ok: false as const, error: "PAPER_COMPETITION_STANDINGS_LOAD_FAILED" as const, standings: [] as const };
    }
    const standingsCutoff = input?.standingsCutoff ?? cutoff;
    const unavailable = input?.standingsUnavailable ?? false;
    return {
      ok: true as const,
      competitionId,
      competitionKind: input?.standingsKind ?? "private_league",
      baseCurrency: input?.standingsCurrency ?? "USD",
      evaluationCutoff: standingsCutoff,
      standings: unavailable
        ? [
            {
              status: "RANKED" as const,
              competitionId,
              userId: viewerUserId,
              accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              joinedAt: startsAt,
              rank: 1,
              returnPercent: 5,
              equity: 105000,
              evaluatedAt: standingsCutoff,
            },
            {
              status: "UNAVAILABLE" as const,
              competitionId,
              userId: otherUserId,
              accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              joinedAt: startsAt,
              rank: null,
              returnPercent: null,
              equity: null,
              evaluatedAt: standingsCutoff,
              reason: "SNAPSHOT_MISSING" as const,
            },
          ]
        : [
            {
              status: "RANKED" as const,
              competitionId,
              userId: otherUserId,
              accountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              joinedAt: startsAt,
              rank: 1,
              returnPercent: 6,
              equity: 106000,
              evaluatedAt: standingsCutoff,
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
              evaluatedAt: standingsCutoff,
            },
          ],
      rankedCount: unavailable ? 1 : 2,
      unavailableCount: unavailable ? 1 : 0,
    };
  });

  const deps: PaperPrivateLeagueLeaderboardReadModelDependenciesV3 = {
    loadCompetition: loadCompetition as never,
    loadVerifiedCutoff: loadVerifiedCutoff as never,
    loadStandings: loadStandings as never,
  };
  return { deps, loadCompetition, loadVerifiedCutoff, loadStandings };
}

describe("Paper Trading V3 private league leaderboard read model", () => {
  it("uses only persisted verified evidence and loads standings as the current member", async () => {
    const { deps, loadStandings } = setup();
    const result = await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(loadStandings).toHaveBeenCalledTimes(1);
    expect(loadStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: cutoff,
      viewer: { scope: "member", userId: viewerUserId },
    });
    expect(result).toEqual({
      status: "VERIFIED",
      competitionId,
      baseCurrency: "USD",
      evaluationCutoff: cutoff,
      final: false,
      participantCount: 2,
      standings: [
        { rank: 1, returnPercent: 6, equity: 106000, isViewer: false },
        { rank: 2, returnPercent: 5, equity: 105000, isViewer: true },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(JSON.stringify(result)).not.toContain("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(JSON.stringify(result)).not.toContain(otherUserId);
  });

  it("does not read standings when no persisted verified cutoff exists", async () => {
    const { deps, loadStandings } = setup({ pointerCutoff: null });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, deps))
      .toEqual({ status: "UNAVAILABLE", reason: "NO_VERIFIED_CUTOFF" });
    expect(loadStandings).not.toHaveBeenCalled();
  });

  it("requires a completed private league to use the exact endsAt cutoff", async () => {
    const { deps, loadStandings } = setup({ status: "completed" });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, deps))
      .toEqual({ status: "UNAVAILABLE", reason: "FINAL_CUTOFF_UNAVAILABLE" });
    expect(loadStandings).not.toHaveBeenCalled();
  });

  it("accepts final private league standings only at exact endsAt", async () => {
    const { deps, loadStandings } = setup({
      status: "completed",
      pointerCutoff: endsAt,
      pointerVerifiedAt: "2026-09-06T16:00:05.000Z",
      standingsCutoff: endsAt,
    });
    const result = await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);
    expect(loadStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: endsAt,
      viewer: { scope: "member", userId: viewerUserId },
    });
    expect(result.status).toBe("VERIFIED");
    if (result.status === "VERIFIED") expect(result.final).toBe(true);
  });

  it("fails closed for challenges and non-rankable states", async () => {
    const challenge = setup({ kind: "challenge" });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, challenge.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "COMPETITION_NOT_RANKABLE" });
    expect(challenge.loadStandings).not.toHaveBeenCalled();

    const open = setup({ status: "open" });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, open.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "COMPETITION_NOT_RANKABLE" });
    expect(open.loadStandings).not.toHaveBeenCalled();
  });

  it("rejects invalid verified cutoff chronology before member standings", async () => {
    const { deps, loadStandings } = setup({ pointerVerifiedAt: "2026-09-06T13:59:59.000Z" });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, deps))
      .toEqual({ status: "UNAVAILABLE", reason: "VERIFIED_CUTOFF_INVALID" });
    expect(loadStandings).not.toHaveBeenCalled();
  });

  it("requires 100 percent exact-cutoff standings coverage", async () => {
    const { deps } = setup({ standingsUnavailable: true });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });
  });

  it("fails closed on standings kind, currency or cutoff mismatch", async () => {
    const wrongCurrency = setup({ standingsCurrency: "SEK" });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, wrongCurrency.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });

    const wrongCutoff = setup({ standingsCutoff: "2026-09-06T14:01:00.000Z" });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, wrongCutoff.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });

    const wrongKind = setup({ standingsKind: "challenge" });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, wrongKind.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });
  });

  it("returns generic unavailable when member standings loading fails", async () => {
    const { deps } = setup({ standingsError: true });
    expect(await loadPaperPrivateLeagueLeaderboardReadModelV3({ competitionId, viewerUserId }, deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_UNAVAILABLE" });
  });
});
