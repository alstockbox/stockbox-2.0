import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

type JsonRow = Record<string, unknown>;

type WriteFailure = { ok: false; error: string };

export type CreatePrivatePaperLeagueInputV3 = {
  ownerUserId: string;
  name: string;
  baseCurrency: string;
  startsAt: string;
  joinDeadline: string;
  endsAt: string;
  maxParticipants: number;
  inviteTokenHash: string;
  inviteExpiresAt: string;
};

export type CreatePrivatePaperLeagueResultV3 =
  | { ok: true; competitionId: string }
  | WriteFailure;

export type JoinPrivatePaperLeagueResultV3 =
  | { ok: true }
  | WriteFailure;

export type CreatePrivatePaperLeagueInviteInputV3 = {
  actorUserId: string;
  competitionId: string;
  inviteTokenHash: string;
  expiresAt: string;
};

export type CreatePrivatePaperLeagueInviteResultV3 =
  | { ok: true; inviteId: string; competitionId: string; expiresAt: string }
  | WriteFailure;

export type RevokePrivatePaperLeagueInviteInputV3 = {
  actorUserId: string;
  inviteId: string;
};

export type PrivatePaperLeagueMemberRoleV3 = "admin" | "member";

export type SetPrivatePaperLeagueMemberRoleInputV3 = {
  actorUserId: string;
  competitionId: string;
  memberUserId: string;
  role: PrivatePaperLeagueMemberRoleV3;
};

export type SetPrivatePaperLeagueMemberRoleResultV3 =
  | { ok: true; role: PrivatePaperLeagueMemberRoleV3 }
  | WriteFailure;

function normalizeUuid(value: string): string | null {
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

function normalizeHash(value: string): string | null {
  return HASH_PATTERN.test(value) ? value : null;
}

function normalizeTimestamp(value: string): string | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizedRpcRow(data: unknown): JsonRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as JsonRow : null;
}

function rowUuid(row: JsonRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? normalizeUuid(value) : null;
}

function validateJoinedEntry(row: JsonRow, userId: string): boolean {
  return rowUuid(row, "id") !== null
    && rowUuid(row, "user_id") === userId
    && rowUuid(row, "competition_id") !== null
    && rowUuid(row, "account_id") !== null;
}

export async function createPrivatePaperLeagueV3(
  input: CreatePrivatePaperLeagueInputV3,
): Promise<CreatePrivatePaperLeagueResultV3> {
  const ownerUserId = normalizeUuid(input.ownerUserId);
  const name = input.name.trim();
  const baseCurrency = input.baseCurrency.trim().toUpperCase();
  const startsAt = normalizeTimestamp(input.startsAt);
  const joinDeadline = normalizeTimestamp(input.joinDeadline);
  const endsAt = normalizeTimestamp(input.endsAt);
  const inviteTokenHash = normalizeHash(input.inviteTokenHash);
  const inviteExpiresAt = normalizeTimestamp(input.inviteExpiresAt);
  if (
    !ownerUserId
    || name.length < 1
    || name.length > 120
    || !CURRENCY_PATTERN.test(baseCurrency)
    || !startsAt
    || !joinDeadline
    || !endsAt
    || Date.parse(joinDeadline) > Date.parse(startsAt)
    || Date.parse(endsAt) <= Date.parse(startsAt)
    || !Number.isInteger(input.maxParticipants)
    || input.maxParticipants < 2
    || input.maxParticipants > 10_000
    || !inviteTokenHash
    || !inviteExpiresAt
    || Date.parse(inviteExpiresAt) > Date.parse(joinDeadline)
  ) return { ok: false, error: "PRIVATE_LEAGUE_CREATE_INVALID" };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("create_private_paper_league_v3", {
      p_owner_user_id: ownerUserId,
      p_name: name,
      p_base_currency: baseCurrency,
      p_starts_at: startsAt,
      p_join_deadline: joinDeadline,
      p_ends_at: endsAt,
      p_max_participants: input.maxParticipants,
      p_invite_token_hash: inviteTokenHash,
      p_invite_expires_at: inviteExpiresAt,
    });
    if (error) return { ok: false, error: error.message };

    const row = normalizedRpcRow(data);
    const id = row ? rowUuid(row, "id") : null;
    const kind = row && typeof row.kind === "string" ? row.kind : null;
    const currency = row && typeof row.base_currency === "string" ? row.base_currency.toUpperCase() : null;
    const startingCash = row ? Number(row.starting_cash) : Number.NaN;
    if (!id || kind !== "private_league" || currency !== baseCurrency || startingCash !== 100_000) {
      return { ok: false, error: "PRIVATE_LEAGUE_CREATE_RESULT_INVALID" };
    }
    return { ok: true, competitionId: id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_CREATE_FAILED" };
  }
}

export async function joinPrivatePaperLeagueV3(
  userId: string,
  inviteTokenHash: string,
): Promise<JoinPrivatePaperLeagueResultV3> {
  const normalizedUserId = normalizeUuid(userId);
  const normalizedInviteTokenHash = normalizeHash(inviteTokenHash);
  if (!normalizedUserId || !normalizedInviteTokenHash) {
    return { ok: false, error: "PRIVATE_LEAGUE_JOIN_INVALID" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("join_private_paper_league_v3", {
      p_user_id: normalizedUserId,
      p_invite_token_hash: normalizedInviteTokenHash,
    });
    if (error) return { ok: false, error: error.message };
    const row = normalizedRpcRow(data);
    if (!row || !validateJoinedEntry(row, normalizedUserId)) {
      return { ok: false, error: "PRIVATE_LEAGUE_JOIN_RESULT_INVALID" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_JOIN_FAILED" };
  }
}

export async function createPrivatePaperLeagueInviteV3(
  input: CreatePrivatePaperLeagueInviteInputV3,
): Promise<CreatePrivatePaperLeagueInviteResultV3> {
  const actorUserId = normalizeUuid(input.actorUserId);
  const competitionId = normalizeUuid(input.competitionId);
  const inviteTokenHash = normalizeHash(input.inviteTokenHash);
  const expiresAt = normalizeTimestamp(input.expiresAt);
  if (!actorUserId || !competitionId || !inviteTokenHash || !expiresAt) {
    return { ok: false, error: "PRIVATE_LEAGUE_INVITE_CREATE_INVALID" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("create_private_paper_league_invite_v3", {
      p_actor_user_id: actorUserId,
      p_competition_id: competitionId,
      p_invite_token_hash: inviteTokenHash,
      p_expires_at: expiresAt,
    });
    if (error) return { ok: false, error: error.message };

    const row = normalizedRpcRow(data);
    const inviteId = row ? rowUuid(row, "id") : null;
    const returnedCompetitionId = row ? rowUuid(row, "competition_id") : null;
    const returnedHash = row && typeof row.invite_token_hash === "string" ? row.invite_token_hash : null;
    const returnedExpiry = row && typeof row.expires_at === "string" ? normalizeTimestamp(row.expires_at) : null;
    if (
      !inviteId
      || returnedCompetitionId !== competitionId
      || returnedHash !== inviteTokenHash
      || returnedExpiry !== expiresAt
    ) return { ok: false, error: "PRIVATE_LEAGUE_INVITE_CREATE_RESULT_INVALID" };

    return { ok: true, inviteId, competitionId, expiresAt };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_INVITE_CREATE_FAILED" };
  }
}

export async function revokePrivatePaperLeagueInviteV3(
  input: RevokePrivatePaperLeagueInviteInputV3,
): Promise<{ ok: true } | WriteFailure> {
  const actorUserId = normalizeUuid(input.actorUserId);
  const inviteId = normalizeUuid(input.inviteId);
  if (!actorUserId || !inviteId) return { ok: false, error: "PRIVATE_LEAGUE_INVITE_REVOKE_INVALID" };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("revoke_private_paper_league_invite_v3", {
      p_actor_user_id: actorUserId,
      p_invite_id: inviteId,
    });
    if (error) return { ok: false, error: error.message };
    return data === true ? { ok: true } : { ok: false, error: "PRIVATE_LEAGUE_INVITE_REVOKE_REJECTED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_INVITE_REVOKE_FAILED" };
  }
}

export async function setPrivatePaperLeagueMemberRoleV3(
  input: SetPrivatePaperLeagueMemberRoleInputV3,
): Promise<SetPrivatePaperLeagueMemberRoleResultV3> {
  const actorUserId = normalizeUuid(input.actorUserId);
  const competitionId = normalizeUuid(input.competitionId);
  const memberUserId = normalizeUuid(input.memberUserId);
  if (!actorUserId || !competitionId || !memberUserId || !["admin", "member"].includes(input.role)) {
    return { ok: false, error: "PRIVATE_LEAGUE_ROLE_INVALID" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("set_private_paper_league_member_role_v3", {
      p_actor_user_id: actorUserId,
      p_competition_id: competitionId,
      p_member_user_id: memberUserId,
      p_role: input.role,
    });
    if (error) return { ok: false, error: error.message };

    const row = normalizedRpcRow(data);
    const returnedCompetitionId = row ? rowUuid(row, "competition_id") : null;
    const returnedUserId = row ? rowUuid(row, "user_id") : null;
    const returnedRole = row && (row.role === "admin" || row.role === "member") ? row.role : null;
    if (returnedCompetitionId !== competitionId || returnedUserId !== memberUserId || returnedRole !== input.role) {
      return { ok: false, error: "PRIVATE_LEAGUE_ROLE_RESULT_INVALID" };
    }
    return { ok: true, role: returnedRole };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_ROLE_FAILED" };
  }
}
