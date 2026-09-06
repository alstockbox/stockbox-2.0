import { describe, expect, it, vi } from "vitest";
import {
  loadPaperChallengeLeaderboardReadModelV3,
  type PaperChallengeLeaderboardReadModelDependenciesV3,
} from "../../src/lib/paper-trading/challenge-leaderboard-read-model-v3";

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
      kind: input?.kind ?? "challenge",
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
      competitionKind: input?.standingsKind ?? "challenge",
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

  const deps: PaperChallengeLeaderboardReadModelDependenciesV3 = {
    loadCompetition: loadCompetition as never,
    loadVerifiedCutoff: loadVerifiedCutoff as never,
    loadStandings: loadStandings as never,
  };
  return { deps, loadCompetition, loadVerifiedCutoff, loadStandings };
}

describe("Paper Trading V3 challenge leaderboard read model", () => {
  it("uses only the persisted latest verified cutoff and exact persisted standings", async () => {
    const { deps, loadStandings } = setup();

    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(loadStandings).toHaveBeenCalledTimes(1);
    expect(loadStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: cutoff,
      viewer: { scope: "public" },
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

  it("returns unavailable and performs no standings load when no verified cutoff exists", async () => {
    const { deps, loadStandings } = setup({ pointerCutoff: null });

    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "NO_VERIFIED_CUTOFF" });
    expect(loadStandings).not.toHaveBeenCalled();
  });

  it("requires a completed challenge to have an exact verified snapshot at endsAt", async () => {
    const { deps, loadStandings } = setup({ status: "completed" });

    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "FINAL_CUTOFF_UNAVAILABLE" });
    expect(loadStandings).not.toHaveBeenCalled();
  });

  it("accepts completed final standings only when the verified cutoff is exactly endsAt", async () => {
    const { deps, loadStandings } = setup({
      status: "completed",
      pointerCutoff: endsAt,
      pointerVerifiedAt: "2026-09-06T16:00:05.000Z",
      standingsCutoff: endsAt,
    });

    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(loadStandings).toHaveBeenCalledWith({
      competitionId,
      evaluationCutoff: endsAt,
      viewer: { scope: "public" },
    });
    expect(result.status).toBe("VERIFIED");
    if (result.status === "VERIFIED") expect(result.final).toBe(true);
  });

  it("fails closed for private leagues and non-rankable competition states", async () => {
    const privateSetup = setup({ kind: "private_league" });
    expect(await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, privateSetup.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "COMPETITION_NOT_RANKABLE" });
    expect(privateSetup.loadStandings).not.toHaveBeenCalled();

    const openSetup = setup({ status: "open" });
    expect(await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, openSetup.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "COMPETITION_NOT_RANKABLE" });
    expect(openSetup.loadStandings).not.toHaveBeenCalled();
  });

  it("rejects invalid verified pointer chronology before reading standings", async () => {
    const { deps, loadStandings } = setup({ pointerVerifiedAt: "2026-09-06T13:59:59.000Z" });

    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "VERIFIED_CUTOFF_INVALID" });
    expect(loadStandings).not.toHaveBeenCalled();
  });

  it("requires 100 percent exact-cutoff standings coverage", async () => {
    const { deps } = setup({ standingsUnavailable: true });

    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });
  });

  it("fails closed on standings competition, currency or cutoff mismatch", async () => {
    const wrongCurrency = setup({ standingsCurrency: "SEK" });
    expect(await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, wrongCurrency.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });

    const wrongCutoff = setup({ standingsCutoff: "2026-09-06T14:01:00.000Z" });
    expect(await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, wrongCutoff.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });

    const wrongKind = setup({ standingsKind: "private_league" });
    expect(await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, wrongKind.deps))
      .toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" });
  });

  it("returns a generic unavailable result when repository loading fails", async () => {
    const { deps } = setup({ standingsError: true });

    const result = await loadPaperChallengeLeaderboardReadModelV3({ competitionId, viewerUserId }, deps);

    expect(result).toEqual({ status: "UNAVAILABLE", reason: "STANDINGS_UNAVAILABLE" });
  });
});
