import { createAdminClient } from "@/lib/supabase/admin";
import { loadPaperAccountBoundaryV3 } from "./repository-v3";

export type PaperCompetitionV3 = {
  id: string;
  name: string;
  kind: "challenge" | "private_league";
  status: "open" | "active" | "completed" | "cancelled";
  baseCurrency: string;
  startingCash: 100_000;
  startsAt: string;
  joinDeadline: string;
  endsAt: string;
  maxParticipants: number;
  createdAt: string;
  updatedAt: string;
};

export type PaperCompetitionEntryV3 = {
  id: string;
  competitionId: string;
  userId: string;
  accountId: string;
  joinedAt: string;
};

export type PaperCompetitionListResultV3 =
  | { ok: true; competitions: PaperCompetitionV3[] }
  | { ok: false; error: string; competitions: [] };

export type PaperCompetitionEntryListResultV3 =
  | { ok: true; entries: PaperCompetitionEntryV3[] }
  | { ok: false; error: string; entries: [] };

export type PaperCompetitionJoinResultV3 =
  | { ok: true; entry: PaperCompetitionEntryV3 }
  | { ok: false; error: string };

export type PaperChallengeTradingContextV3 = {
  competitionId: string;
  accountId: string;
  startsAt: string;
  endsAt: string;
};

export type PaperChallengeTradingContextResultV3 =
  | { ok: true; context: PaperChallengeTradingContextV3 }
  | { ok: false; error: string };

type JsonRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function validTimestamp(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? candidate : null;
}

function mapCompetition(row: JsonRow): PaperCompetitionV3 | null {
  const id = text(row.id);
  const name = text(row.name);
  const kind = text(row.kind);
  const status = text(row.status);
  const baseCurrency = text(row.base_currency)?.toUpperCase() ?? null;
  const startingCash = numeric(row.starting_cash);
  const startsAt = validTimestamp(row.starts_at);
  const joinDeadline = validTimestamp(row.join_deadline);
  const endsAt = validTimestamp(row.ends_at);
  const maxParticipants = numeric(row.max_participants);
  const createdAt = validTimestamp(row.created_at);
  const updatedAt = validTimestamp(row.updated_at);

  const validKind = kind === "challenge" || kind === "private_league";
  const validStatus = status === "open" || status === "active" || status === "completed" || status === "cancelled";
  if (
    !id
    || !name
    || !validKind
    || !validStatus
    || !baseCurrency
    || !/^[A-Z]{3}$/.test(baseCurrency)
    || startingCash !== 100_000
    || !startsAt
    || !joinDeadline
    || !endsAt
    || Date.parse(joinDeadline) > Date.parse(startsAt)
    || Date.parse(endsAt) <= Date.parse(startsAt)
    || maxParticipants === null
    || !Number.isInteger(maxParticipants)
    || maxParticipants < 2
    || maxParticipants > 10_000
    || !createdAt
    || !updatedAt
  ) return null;

  return {
    id,
    name,
    kind,
    status,
    baseCurrency,
    startingCash: 100_000,
    startsAt,
    joinDeadline,
    endsAt,
    maxParticipants,
    createdAt,
    updatedAt,
  };
}

function mapEntry(row: JsonRow): PaperCompetitionEntryV3 | null {
  const id = text(row.id);
  const competitionId = text(row.competition_id);
  const userId = text(row.user_id);
  const accountId = text(row.account_id);
  const joinedAt = validTimestamp(row.joined_at);
  if (!id || !competitionId || !userId || !accountId || !joinedAt) return null;
  return { id, competitionId, userId, accountId, joinedAt };
}

function normalizeIdentity(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function listOpenPaperChallengesV3(now = new Date()): Promise<PaperCompetitionListResultV3> {
  if (!Number.isFinite(now.getTime())) return { ok: false, error: "PAPER_COMPETITION_TIME_INVALID", competitions: [] };
  const nowIso = now.toISOString();
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", competitions: [] };

  try {
    const { data, error } = await supabase
      .from("paper_competitions_v3")
      .select("id,name,kind,status,base_currency,starting_cash,starts_at,join_deadline,ends_at,max_participants,created_at,updated_at")
      .eq("kind", "challenge")
      .eq("status", "open")
      .gt("join_deadline", nowIso)
      .gt("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(100);
    if (error) return { ok: false, error: error.message, competitions: [] };

    const mapped = (data ?? []).map((row) => mapCompetition(row as JsonRow));
    if (mapped.some((row) => row === null)) {
      return { ok: false, error: "PAPER_COMPETITION_LIST_INVALID", competitions: [] };
    }
    return { ok: true, competitions: mapped.filter((row): row is PaperCompetitionV3 => row !== null) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "PAPER_COMPETITION_LIST_FAILED",
      competitions: [],
    };
  }
}

export async function listPaperCompetitionEntriesV3(userId: string): Promise<PaperCompetitionEntryListResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  if (!normalizedUserId) return { ok: false, error: "PAPER_USER_ID_REQUIRED", entries: [] };
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", entries: [] };

  try {
    const { data, error } = await supabase
      .from("paper_competition_entries_v3")
      .select("id,competition_id,user_id,account_id,joined_at")
      .eq("user_id", normalizedUserId)
      .order("joined_at", { ascending: false })
      .limit(200);
    if (error) return { ok: false, error: error.message, entries: [] };

    const mapped = (data ?? []).map((row) => mapEntry(row as JsonRow));
    if (mapped.some((row) => row === null)) {
      return { ok: false, error: "PAPER_COMPETITION_ENTRY_LIST_INVALID", entries: [] };
    }
    return { ok: true, entries: mapped.filter((row): row is PaperCompetitionEntryV3 => row !== null) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "PAPER_COMPETITION_ENTRY_LIST_FAILED",
      entries: [],
    };
  }
}

export async function loadPaperChallengeTradingContextV3(
  userId: string,
  competitionId: string,
  now = new Date(),
): Promise<PaperChallengeTradingContextResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  const normalizedCompetitionId = normalizeIdentity(competitionId);
  const nowMs = now.getTime();
  if (!normalizedUserId || !normalizedCompetitionId) {
    return { ok: false, error: "PAPER_COMPETITION_IDENTITY_REQUIRED" };
  }
  if (!Number.isFinite(nowMs)) return { ok: false, error: "PAPER_COMPETITION_TIME_INVALID" };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const competitionResult = await supabase
      .from("paper_competitions_v3")
      .select("id,kind,status,starts_at,ends_at")
      .eq("id", normalizedCompetitionId)
      .maybeSingle();
    if (competitionResult.error) return { ok: false, error: competitionResult.error.message };
    if (!competitionResult.data) return { ok: false, error: "PAPER_CHALLENGE_NOT_FOUND" };

    const competitionRow = competitionResult.data as JsonRow;
    const competition = {
      id: text(competitionRow.id),
      kind: text(competitionRow.kind),
      status: text(competitionRow.status),
      startsAt: validTimestamp(competitionRow.starts_at),
      endsAt: validTimestamp(competitionRow.ends_at),
    };
    if (
      competition.id !== normalizedCompetitionId
      || !competition.kind
      || !competition.status
      || !competition.startsAt
      || !competition.endsAt
    ) return { ok: false, error: "PAPER_CHALLENGE_INVALID" };
    if (competition.kind !== "challenge" || competition.status === "cancelled" || competition.status === "completed") {
      return { ok: false, error: "PAPER_CHALLENGE_NOT_TRADING" };
    }

    const startsAtMs = Date.parse(competition.startsAt);
    const endsAtMs = Date.parse(competition.endsAt);
    if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) {
      return { ok: false, error: "PAPER_CHALLENGE_INVALID" };
    }
    if (nowMs < startsAtMs || nowMs > endsAtMs) {
      return { ok: false, error: "PAPER_CHALLENGE_NOT_TRADING" };
    }

    const entryResult = await supabase
      .from("paper_competition_entries_v3")
      .select("id,competition_id,user_id,account_id,joined_at")
      .eq("user_id", normalizedUserId)
      .eq("competition_id", normalizedCompetitionId)
      .maybeSingle();
    if (entryResult.error) return { ok: false, error: entryResult.error.message };
    if (!entryResult.data) return { ok: false, error: "PAPER_CHALLENGE_ENTRY_NOT_FOUND" };

    const entry = mapEntry(entryResult.data as JsonRow);
    if (!entry || entry.userId !== normalizedUserId || entry.competitionId !== normalizedCompetitionId) {
      return { ok: false, error: "PAPER_CHALLENGE_ENTRY_INVALID" };
    }

    const boundary = await loadPaperAccountBoundaryV3(normalizedUserId, entry.accountId);
    if (
      !boundary.ok
      || boundary.account.accountType !== "competition"
      || boundary.account.competitionId !== normalizedCompetitionId
      || boundary.account.status !== "active"
    ) return { ok: false, error: "PAPER_CHALLENGE_ACCOUNT_INVALID" };

    return {
      ok: true,
      context: {
        competitionId: normalizedCompetitionId,
        accountId: entry.accountId,
        startsAt: competition.startsAt,
        endsAt: competition.endsAt,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_CHALLENGE_CONTEXT_FAILED" };
  }
}

export async function joinPaperCompetitionV3(
  userId: string,
  competitionId: string,
): Promise<PaperCompetitionJoinResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  const normalizedCompetitionId = normalizeIdentity(competitionId);
  if (!normalizedUserId || !normalizedCompetitionId) {
    return { ok: false, error: "PAPER_COMPETITION_IDENTITY_REQUIRED" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase
      .rpc("join_paper_competition_v3", {
        p_user_id: normalizedUserId,
        p_competition_id: normalizedCompetitionId,
      });
    if (error) return { ok: false, error: error.message };

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return { ok: false, error: "PAPER_COMPETITION_JOIN_INVALID" };
    const entry = mapEntry(row as JsonRow);
    if (!entry || entry.userId !== normalizedUserId || entry.competitionId !== normalizedCompetitionId) {
      return { ok: false, error: "PAPER_COMPETITION_JOIN_INVALID" };
    }
    return { ok: true, entry };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_COMPETITION_JOIN_FAILED" };
  }
}
