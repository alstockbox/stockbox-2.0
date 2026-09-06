import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadPaperCompetitionFinalStandingsV3,
  loadPaperCompetitionStandingsV3,
  type PaperCompetitionStandingsLoadResultV3,
} from "./standings-repository-v3";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ChallengeCompetitionStatusV3 = "open" | "active" | "completed" | "cancelled";

type ChallengeCompetitionTermsV3 = {
  id: string;
  kind: "challenge" | "private_league";
  status: ChallengeCompetitionStatusV3;
  baseCurrency: string;
  startsAt: string;
  endsAt: string;
};

type ChallengeCompetitionLoadResultV3 =
  | { ok: true; competition: ChallengeCompetitionTermsV3 }
  | { ok: false; error: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_DATA" | "LOAD_FAILED" | "SUPABASE_ADMIN_NOT_CONFIGURED" };

type VerifiedCutoffPointerV3 = {
  lastVerifiedAt: string;
  lastVerifiedEvaluationCutoff: string;
};

type VerifiedCutoffLoadResultV3 =
  | { ok: true; pointer: VerifiedCutoffPointerV3 | null }
  | { ok: false; error: "INVALID_INPUT" | "INVALID_DATA" | "LOAD_FAILED" | "SUPABASE_ADMIN_NOT_CONFIGURED" };

export type PaperChallengeLeaderboardPresentationStandingV3 = {
  rank: number;
  returnPercent: number;
  equity: number;
  isViewer: boolean;
};

export type PaperChallengeLeaderboardReadModelResultV3 =
  | {
      status: "VERIFIED";
      competitionId: string;
      baseCurrency: string;
      evaluationCutoff: string;
      final: boolean;
      participantCount: number;
      standings: PaperChallengeLeaderboardPresentationStandingV3[];
    }
  | {
      status: "UNAVAILABLE";
      reason:
        | "INVALID_INPUT"
        | "COMPETITION_UNAVAILABLE"
        | "COMPETITION_NOT_RANKABLE"
        | "NO_VERIFIED_CUTOFF"
        | "VERIFIED_CUTOFF_INVALID"
        | "FINAL_CUTOFF_UNAVAILABLE"
        | "STANDINGS_UNAVAILABLE"
        | "STANDINGS_INCOMPLETE";
    };

export type PaperChallengeLeaderboardReadModelDependenciesV3 = {
  loadCompetition: (competitionId: string) => Promise<ChallengeCompetitionLoadResultV3>;
  loadVerifiedCutoff: (competitionId: string) => Promise<VerifiedCutoffLoadResultV3>;
  loadActiveStandings: typeof loadPaperCompetitionStandingsV3;
  loadFinalStandings: typeof loadPaperCompetitionFinalStandingsV3;
};

type JsonRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function normalizeCurrency(value: unknown): string | null {
  const normalized = text(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function mapCompetition(row: JsonRow): ChallengeCompetitionTermsV3 | null {
  const id = text(row.id);
  const kind = text(row.kind);
  const status = text(row.status);
  const baseCurrency = normalizeCurrency(row.base_currency);
  const startsAt = timestamp(row.starts_at);
  const endsAt = timestamp(row.ends_at);

  if (
    !id
    || (kind !== "challenge" && kind !== "private_league")
    || (status !== "open" && status !== "active" && status !== "completed" && status !== "cancelled")
    || !baseCurrency
    || !startsAt
    || !endsAt
    || Date.parse(endsAt) <= Date.parse(startsAt)
  ) return null;

  return { id, kind, status, baseCurrency, startsAt, endsAt };
}

async function loadChallengeCompetitionTermsV3(competitionId: string): Promise<ChallengeCompetitionLoadResultV3> {
  if (!UUID_PATTERN.test(competitionId)) return { ok: false, error: "INVALID_INPUT" };
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase
      .from("paper_competitions_v3")
      .select("id,kind,status,base_currency,starts_at,ends_at")
      .eq("id", competitionId)
      .maybeSingle();
    if (error) return { ok: false, error: "LOAD_FAILED" };
    if (!data) return { ok: false, error: "NOT_FOUND" };
    const competition = mapCompetition(data as JsonRow);
    if (!competition || competition.id !== competitionId) return { ok: false, error: "INVALID_DATA" };
    return { ok: true, competition };
  } catch {
    return { ok: false, error: "LOAD_FAILED" };
  }
}

async function loadLatestVerifiedCompetitionCutoffV3(competitionId: string): Promise<VerifiedCutoffLoadResultV3> {
  if (!UUID_PATTERN.test(competitionId)) return { ok: false, error: "INVALID_INPUT" };
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase
      .from("paper_competition_valuation_control_v3")
      .select("competition_id,last_verified_at,last_verified_evaluation_cutoff")
      .eq("competition_id", competitionId)
      .maybeSingle();
    if (error) return { ok: false, error: "LOAD_FAILED" };
    if (!data) return { ok: true, pointer: null };

    const row = data as JsonRow;
    if (text(row.competition_id) !== competitionId) return { ok: false, error: "INVALID_DATA" };
    if (row.last_verified_at === null && row.last_verified_evaluation_cutoff === null) {
      return { ok: true, pointer: null };
    }

    const lastVerifiedAt = timestamp(row.last_verified_at);
    const lastVerifiedEvaluationCutoff = timestamp(row.last_verified_evaluation_cutoff);
    if (!lastVerifiedAt || !lastVerifiedEvaluationCutoff) return { ok: false, error: "INVALID_DATA" };

    return {
      ok: true,
      pointer: { lastVerifiedAt, lastVerifiedEvaluationCutoff },
    };
  } catch {
    return { ok: false, error: "LOAD_FAILED" };
  }
}

const defaultDependencies: PaperChallengeLeaderboardReadModelDependenciesV3 = {
  loadCompetition: loadChallengeCompetitionTermsV3,
  loadVerifiedCutoff: loadLatestVerifiedCompetitionCutoffV3,
  loadActiveStandings: loadPaperCompetitionStandingsV3,
  loadFinalStandings: loadPaperCompetitionFinalStandingsV3,
};

function standingsAreComplete(input: {
  competition: ChallengeCompetitionTermsV3;
  evaluationCutoff: string;
  viewerUserId: string;
  result: Extract<PaperCompetitionStandingsLoadResultV3, { ok: true }>;
}): boolean {
  const cutoffMs = Date.parse(input.evaluationCutoff);
  if (
    input.result.competitionId !== input.competition.id
    || input.result.competitionKind !== "challenge"
    || input.result.baseCurrency !== input.competition.baseCurrency
    || Date.parse(input.result.evaluationCutoff) !== cutoffMs
    || input.result.unavailableCount !== 0
    || input.result.rankedCount !== input.result.standings.length
    || input.result.standings.length === 0
  ) return false;

  const seenUsers = new Set<string>();
  let viewerCount = 0;
  for (const standing of input.result.standings) {
    if (
      standing.status !== "RANKED"
      || standing.competitionId !== input.competition.id
      || Date.parse(standing.evaluatedAt) !== cutoffMs
      || !Number.isSafeInteger(standing.rank)
      || standing.rank < 1
      || !Number.isFinite(standing.returnPercent)
      || !Number.isFinite(standing.equity)
      || standing.equity < 0
      || !standing.userId.trim()
      || seenUsers.has(standing.userId)
    ) return false;
    seenUsers.add(standing.userId);
    if (standing.userId === input.viewerUserId) viewerCount += 1;
  }

  return viewerCount === 1;
}

/**
 * Builds a presentation-safe challenge leaderboard exclusively from the latest
 * persisted verified cutoff and exact-cutoff snapshot evidence. It never fetches
 * quotes, recomputes performance, falls back to a latest snapshot, or exposes
 * raw participant/account identifiers to the UI model.
 */
export async function loadPaperChallengeLeaderboardReadModelV3(
  input: { competitionId: string; viewerUserId: string },
  dependencies: PaperChallengeLeaderboardReadModelDependenciesV3 = defaultDependencies,
): Promise<PaperChallengeLeaderboardReadModelResultV3> {
  const competitionId = input.competitionId.trim();
  const viewerUserId = input.viewerUserId.trim();
  if (!UUID_PATTERN.test(competitionId) || !viewerUserId) {
    return { status: "UNAVAILABLE", reason: "INVALID_INPUT" };
  }

  let competitionResult: ChallengeCompetitionLoadResultV3;
  try {
    competitionResult = await dependencies.loadCompetition(competitionId);
  } catch {
    return { status: "UNAVAILABLE", reason: "COMPETITION_UNAVAILABLE" };
  }
  if (!competitionResult.ok || competitionResult.competition.id !== competitionId) {
    return { status: "UNAVAILABLE", reason: "COMPETITION_UNAVAILABLE" };
  }

  const competition = competitionResult.competition;
  if (
    competition.kind !== "challenge"
    || (competition.status !== "active" && competition.status !== "completed")
  ) {
    return { status: "UNAVAILABLE", reason: "COMPETITION_NOT_RANKABLE" };
  }

  let pointerResult: VerifiedCutoffLoadResultV3;
  try {
    pointerResult = await dependencies.loadVerifiedCutoff(competitionId);
  } catch {
    return { status: "UNAVAILABLE", reason: "NO_VERIFIED_CUTOFF" };
  }
  if (!pointerResult.ok) return { status: "UNAVAILABLE", reason: "NO_VERIFIED_CUTOFF" };
  if (!pointerResult.pointer) return { status: "UNAVAILABLE", reason: "NO_VERIFIED_CUTOFF" };

  const startsAtMs = Date.parse(competition.startsAt);
  const endsAtMs = Date.parse(competition.endsAt);
  const cutoffMs = Date.parse(pointerResult.pointer.lastVerifiedEvaluationCutoff);
  const verifiedAtMs = Date.parse(pointerResult.pointer.lastVerifiedAt);
  if (
    !Number.isFinite(startsAtMs)
    || !Number.isFinite(endsAtMs)
    || !Number.isFinite(cutoffMs)
    || !Number.isFinite(verifiedAtMs)
    || endsAtMs <= startsAtMs
    || cutoffMs < startsAtMs
    || cutoffMs > endsAtMs
    || verifiedAtMs < cutoffMs
  ) {
    return { status: "UNAVAILABLE", reason: "VERIFIED_CUTOFF_INVALID" };
  }
  const evaluationCutoff = new Date(cutoffMs).toISOString();

  if (competition.status === "completed" && cutoffMs !== endsAtMs) {
    return { status: "UNAVAILABLE", reason: "FINAL_CUTOFF_UNAVAILABLE" };
  }

  let standingsResult: PaperCompetitionStandingsLoadResultV3;
  try {
    const loadStandings = competition.status === "completed"
      ? dependencies.loadFinalStandings
      : dependencies.loadActiveStandings;
    standingsResult = await loadStandings({
      competitionId,
      evaluationCutoff,
      viewer: { scope: "public" },
    });
  } catch {
    return { status: "UNAVAILABLE", reason: "STANDINGS_UNAVAILABLE" };
  }
  if (!standingsResult.ok) return { status: "UNAVAILABLE", reason: "STANDINGS_UNAVAILABLE" };
  if (!standingsAreComplete({ competition, evaluationCutoff, viewerUserId, result: standingsResult })) {
    return { status: "UNAVAILABLE", reason: "STANDINGS_INCOMPLETE" };
  }

  return {
    status: "VERIFIED",
    competitionId,
    baseCurrency: competition.baseCurrency,
    evaluationCutoff,
    final: competition.status === "completed",
    participantCount: standingsResult.standings.length,
    standings: standingsResult.standings.map((standing) => {
      if (standing.status !== "RANKED") throw new Error("unreachable incomplete standings");
      return {
        rank: standing.rank,
        returnPercent: standing.returnPercent,
        equity: standing.equity,
        isViewer: standing.userId === viewerUserId,
      };
    }),
  };
}
