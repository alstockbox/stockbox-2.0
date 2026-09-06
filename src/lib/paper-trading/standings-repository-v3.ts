import { createAdminClient } from "@/lib/supabase/admin";
import { PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION } from "./final-performance-v3";
import {
  derivePaperCompetitionLeaderboardV3,
  type PaperCompetitionLeaderboardEntryV3,
  type PaperCompetitionLeaderboardStandingV3,
} from "./leaderboard-v3";
import {
  mapPaperFinalPerformanceSnapshotV3,
  mapPaperPerformanceSnapshotV3,
  type PaperComparablePerformanceSnapshotRowV3,
} from "./performance-repository-v3";
import { PAPER_PERFORMANCE_V3_POLICY_VERSION } from "./performance-v3";

export const PAPER_STANDINGS_V3_ENTRY_PAGE_SIZE = 500;
export const PAPER_STANDINGS_V3_SNAPSHOT_CHUNK_SIZE = 100;

export type PaperCompetitionStandingsViewerV3 =
  | { scope: "public" }
  | { scope: "member"; userId: string };

export type PaperCompetitionStandingsLoadResultV3 =
  | {
      ok: true;
      competitionId: string;
      competitionKind: "challenge" | "private_league";
      baseCurrency: string;
      evaluationCutoff: string;
      standings: PaperCompetitionLeaderboardStandingV3[];
      rankedCount: number;
      unavailableCount: number;
    }
  | {
      ok: false;
      error:
        | "PAPER_COMPETITION_STANDINGS_INVALID_INPUT"
        | "PAPER_COMPETITION_STANDINGS_NOT_FOUND"
        | "PAPER_COMPETITION_STANDINGS_FORBIDDEN"
        | "PAPER_COMPETITION_STANDINGS_INVALID_DATA"
        | "PAPER_COMPETITION_STANDINGS_LOAD_FAILED"
        | "SUPABASE_ADMIN_NOT_CONFIGURED";
      standings: [];
    };

type JsonRow = Record<string, unknown>;
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type CompetitionTerms = {
  id: string;
  kind: "challenge" | "private_league";
  status: "active" | "completed";
  baseCurrency: string;
  startingCash: 100_000;
  startsAt: string;
  endsAt: string;
  maxParticipants: number;
};

type PaperCompetitionStandingsInputV3 = {
  competitionId: string;
  evaluationCutoff: string;
  viewer: PaperCompetitionStandingsViewerV3;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: unknown): string | null {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function identity(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function mapCompetitionTerms(row: JsonRow): CompetitionTerms | null {
  const id = text(row.id);
  const kind = text(row.kind);
  const status = text(row.status);
  const baseCurrency = text(row.base_currency)?.toUpperCase() ?? null;
  const startingCash = numeric(row.starting_cash);
  const startsAt = timestamp(row.starts_at);
  const endsAt = timestamp(row.ends_at);
  const maxParticipants = numeric(row.max_participants);

  if (
    !id
    || (kind !== "challenge" && kind !== "private_league")
    || (status !== "active" && status !== "completed")
    || !baseCurrency
    || !/^[A-Z]{3}$/.test(baseCurrency)
    || startingCash !== 100_000
    || !startsAt
    || !endsAt
    || Date.parse(endsAt) <= Date.parse(startsAt)
    || maxParticipants === null
    || !Number.isSafeInteger(maxParticipants)
    || maxParticipants < 2
    || maxParticipants > 10_000
  ) return null;

  return {
    id,
    kind,
    status,
    baseCurrency,
    startingCash: 100_000,
    startsAt,
    endsAt,
    maxParticipants,
  };
}

function mapLeaderboardEntry(row: JsonRow, competitionId: string): PaperCompetitionLeaderboardEntryV3 | null {
  const rowCompetitionId = text(row.competition_id);
  const userId = text(row.user_id);
  const accountId = text(row.account_id);
  const joinedAt = timestamp(row.joined_at);
  if (!rowCompetitionId || rowCompetitionId !== competitionId || !userId || !accountId || !joinedAt) return null;
  return {
    competitionId,
    userId,
    accountId,
    accountType: "competition",
    joinedAt,
  };
}

async function verifyPrivateLeagueMembership(
  supabase: AdminClient,
  competitionId: string,
  viewer: PaperCompetitionStandingsViewerV3,
): Promise<"ALLOWED" | "FORBIDDEN" | "FAILED"> {
  if (viewer.scope !== "member") return "FORBIDDEN";
  const viewerUserId = identity(viewer.userId);
  if (!viewerUserId) return "FORBIDDEN";

  try {
    const { data, error } = await supabase
      .from("paper_private_league_members_v3")
      .select("competition_id,user_id,role")
      .eq("competition_id", competitionId)
      .eq("user_id", viewerUserId)
      .maybeSingle();
    if (error) return "FAILED";
    if (!data || typeof data !== "object") return "FORBIDDEN";
    const row = data as JsonRow;
    const role = text(row.role);
    return text(row.user_id) === viewerUserId
      && text(row.competition_id) === competitionId
      && (role === "owner" || role === "admin" || role === "member")
      ? "ALLOWED"
      : "FORBIDDEN";
  } catch {
    return "FAILED";
  }
}

async function loadAllCompetitionEntries(
  supabase: AdminClient,
  competitionId: string,
  maxParticipants: number,
): Promise<PaperCompetitionLeaderboardEntryV3[] | null> {
  const entries: PaperCompetitionLeaderboardEntryV3[] = [];
  const seenEntryAccounts = new Set<string>();
  const seenEntryUsers = new Set<string>();

  for (let from = 0; from < maxParticipants; from += PAPER_STANDINGS_V3_ENTRY_PAGE_SIZE) {
    const to = Math.min(from + PAPER_STANDINGS_V3_ENTRY_PAGE_SIZE, maxParticipants) - 1;
    const expectedPageCapacity = to - from + 1;
    const { data, error } = await supabase
      .from("paper_competition_entries_v3")
      .select("competition_id,user_id,account_id,joined_at")
      .eq("competition_id", competitionId)
      .order("joined_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) return null;

    const rows = data ?? [];
    for (const rawRow of rows) {
      const entry = mapLeaderboardEntry(rawRow as JsonRow, competitionId);
      if (!entry || seenEntryAccounts.has(entry.accountId) || seenEntryUsers.has(entry.userId)) return null;
      seenEntryAccounts.add(entry.accountId);
      seenEntryUsers.add(entry.userId);
      entries.push(entry);
    }

    if (rows.length < expectedPageCapacity) break;
  }

  if (entries.length > maxParticipants) return null;

  if (entries.length === maxParticipants) {
    const { data, error } = await supabase
      .from("paper_competition_entries_v3")
      .select("account_id")
      .eq("competition_id", competitionId)
      .range(maxParticipants, maxParticipants);
    if (error || (data ?? []).length > 0) return null;
  }

  return entries;
}

async function loadExactCutoffSnapshots(
  supabase: AdminClient,
  competition: CompetitionTerms,
  evaluationCutoff: string,
  entries: readonly PaperCompetitionLeaderboardEntryV3[],
  expectedSnapshotPolicy: "active" | "final",
): Promise<PaperComparablePerformanceSnapshotRowV3[] | null> {
  const snapshots: PaperComparablePerformanceSnapshotRowV3[] = [];
  const seenSnapshotAccounts = new Set<string>();
  const cutoffMs = Date.parse(evaluationCutoff);
  const expectedPolicyVersion = expectedSnapshotPolicy === "final"
    ? PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION
    : PAPER_PERFORMANCE_V3_POLICY_VERSION;

  for (let offset = 0; offset < entries.length; offset += PAPER_STANDINGS_V3_SNAPSHOT_CHUNK_SIZE) {
    const accountIds = entries
      .slice(offset, offset + PAPER_STANDINGS_V3_SNAPSHOT_CHUNK_SIZE)
      .map((entry) => entry.accountId);
    if (accountIds.length === 0) continue;

    const { data, error } = await supabase
      .from("paper_performance_snapshots_v3")
      .select("id,account_id,user_id,base_currency,starting_cash,cash_value,positions_market_value,equity,profit_loss,return_percent,open_position_count,quote_count,evaluated_at,oldest_quote_observed_at,policy_version,pricing_basis,created_at")
      .eq("evaluated_at", evaluationCutoff)
      .eq("base_currency", competition.baseCurrency)
      .eq("policy_version", expectedPolicyVersion)
      .in("account_id", accountIds);
    if (error) return null;

    for (const rawRow of data ?? []) {
      const snapshot = expectedSnapshotPolicy === "final"
        ? mapPaperFinalPerformanceSnapshotV3(rawRow as JsonRow)
        : mapPaperPerformanceSnapshotV3(rawRow as JsonRow);
      if (
        !snapshot
        || Date.parse(snapshot.evaluatedAt) !== cutoffMs
        || snapshot.baseCurrency !== competition.baseCurrency
        || seenSnapshotAccounts.has(snapshot.accountId)
      ) return null;
      seenSnapshotAccounts.add(snapshot.accountId);
      snapshots.push(snapshot);
    }
  }

  return snapshots;
}

/**
 * Shared trusted standings loader. Snapshot policy is selected only by the
 * server-side wrapper exports below and is never accepted from browser input.
 */
async function loadPaperCompetitionStandingsForPolicyV3(
  input: PaperCompetitionStandingsInputV3,
  expectedSnapshotPolicy: "active" | "final",
): Promise<PaperCompetitionStandingsLoadResultV3> {
  const competitionId = identity(input.competitionId);
  const cutoffMs = Date.parse(input.evaluationCutoff);
  if (!competitionId || !Number.isFinite(cutoffMs)) {
    return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_INPUT", standings: [] };
  }
  const evaluationCutoff = new Date(cutoffMs).toISOString();

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", standings: [] };

  try {
    const { data, error } = await supabase
      .from("paper_competitions_v3")
      .select("id,kind,status,base_currency,starting_cash,starts_at,ends_at,max_participants")
      .eq("id", competitionId)
      .maybeSingle();
    if (error) return { ok: false, error: "PAPER_COMPETITION_STANDINGS_LOAD_FAILED", standings: [] };
    if (!data) return { ok: false, error: "PAPER_COMPETITION_STANDINGS_NOT_FOUND", standings: [] };

    const competition = mapCompetitionTerms(data as JsonRow);
    if (!competition || competition.id !== competitionId) {
      return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_DATA", standings: [] };
    }
    if (competition.status !== "active" && competition.status !== "completed") {
      return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_DATA", standings: [] };
    }
    if (competition.startingCash !== 100_000) {
      return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_DATA", standings: [] };
    }
    if (cutoffMs < Date.parse(competition.startsAt) || cutoffMs > Date.parse(competition.endsAt)) {
      return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_INPUT", standings: [] };
    }
    if (
      expectedSnapshotPolicy === "final"
      && (
        competition.status !== "completed"
        || Date.parse(competition.endsAt) !== cutoffMs
      )
    ) {
      return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_INPUT", standings: [] };
    }

    if (competition.kind === "private_league") {
      if (input.viewer.scope !== "member") {
        return { ok: false, error: "PAPER_COMPETITION_STANDINGS_FORBIDDEN", standings: [] };
      }
      const membership = await verifyPrivateLeagueMembership(supabase, competitionId, input.viewer);
      if (membership === "FORBIDDEN") {
        return { ok: false, error: "PAPER_COMPETITION_STANDINGS_FORBIDDEN", standings: [] };
      }
      if (membership === "FAILED") {
        return { ok: false, error: "PAPER_COMPETITION_STANDINGS_LOAD_FAILED", standings: [] };
      }
    }

    const entries = await loadAllCompetitionEntries(supabase, competitionId, competition.maxParticipants);
    if (!entries) return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_DATA", standings: [] };

    const snapshots = await loadExactCutoffSnapshots(
      supabase,
      competition,
      evaluationCutoff,
      entries,
      expectedSnapshotPolicy,
    );
    if (!snapshots) return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_DATA", standings: [] };

    const leaderboard = derivePaperCompetitionLeaderboardV3({
      competitionId,
      baseCurrency: competition.baseCurrency,
      evaluationCutoff,
      entries,
      snapshots,
    });
    if (!leaderboard.ok) {
      return { ok: false, error: "PAPER_COMPETITION_STANDINGS_INVALID_DATA", standings: [] };
    }

    return {
      ok: true,
      competitionId,
      competitionKind: competition.kind,
      baseCurrency: competition.baseCurrency,
      evaluationCutoff: leaderboard.evaluationCutoff,
      standings: leaderboard.standings,
      rankedCount: leaderboard.rankedCount,
      unavailableCount: leaderboard.unavailableCount,
    };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_STANDINGS_LOAD_FAILED", standings: [] };
  }
}

/**
 * Active/current standings use only the original 20-minute mark-to-market
 * snapshot policy. Existing callers keep the same API and semantics.
 */
export async function loadPaperCompetitionStandingsV3(
  input: PaperCompetitionStandingsInputV3,
): Promise<PaperCompetitionStandingsLoadResultV3> {
  return loadPaperCompetitionStandingsForPolicyV3(input, "active");
}

/**
 * Final standings use only the explicit final snapshot policy. A final result is
 * readable only for a completed competition at its exact authoritative endsAt.
 */
export async function loadPaperCompetitionFinalStandingsV3(
  input: PaperCompetitionStandingsInputV3,
): Promise<PaperCompetitionStandingsLoadResultV3> {
  return loadPaperCompetitionStandingsForPolicyV3(input, "final");
}
