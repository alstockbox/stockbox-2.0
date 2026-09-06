import { createAdminClient } from "@/lib/supabase/admin";
import type { PaperCompetitionV3, PaperCompetitionEntryV3 } from "./competition-repository-v3";
import { loadPaperAccountBoundaryV3 } from "./repository-v3";

export const PRIVATE_LEAGUE_ID_CHUNK_SIZE = 100;
const PRIVATE_LEAGUE_MEMBER_PAGE_SIZE = 500;
const PRIVATE_LEAGUE_SELECT = "id,name,kind,status,base_currency,starting_cash,starts_at,join_deadline,ends_at,max_participants,created_at,updated_at";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRow = Record<string, unknown>;
export type PrivatePaperLeagueRoleV3 = "owner" | "admin" | "member";

export type JoinedPrivatePaperLeagueV3 = {
  competition: PaperCompetitionV3;
  role: PrivatePaperLeagueRoleV3;
};

export type JoinedPrivatePaperLeagueListResultV3 =
  | { ok: true; leagues: JoinedPrivatePaperLeagueV3[] }
  | { ok: false; error: string; leagues: [] };

export type PrivatePaperLeagueWorkspaceV3 = {
  competition: PaperCompetitionV3;
  role: PrivatePaperLeagueRoleV3;
  accountId: string;
  accountStatus: "active" | "archived";
};

export type PrivatePaperLeagueWorkspaceResultV3 =
  | { ok: true; workspace: PrivatePaperLeagueWorkspaceV3 }
  | { ok: false; error: string };

export type PrivatePaperLeagueTradingContextV3 = {
  competitionId: string;
  accountId: string;
  startsAt: string;
  endsAt: string;
};

export type PrivatePaperLeagueTradingContextResultV3 =
  | { ok: true; context: PrivatePaperLeagueTradingContextV3 }
  | { ok: false; error: string };

export type PrivatePaperLeagueInviteMetadataV3 = {
  id: string;
  competitionId: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type PrivatePaperLeagueInviteListResultV3 =
  | { ok: true; invites: PrivatePaperLeagueInviteMetadataV3[] }
  | { ok: false; error: string; invites: [] };

export type PrivatePaperLeagueMemberV3 = {
  userId: string;
  role: PrivatePaperLeagueRoleV3;
};

export type PrivatePaperLeagueMemberListResultV3 =
  | { ok: true; members: PrivatePaperLeagueMemberV3[] }
  | { ok: false; error: string; members: [] };

function normalizeIdentity(value: string): string | null {
  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : null;
}

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

function mapRole(value: unknown): PrivatePaperLeagueRoleV3 | null {
  const role = text(value);
  return role === "owner" || role === "admin" || role === "member" ? role : null;
}

function mapCompetition(row: JsonRow): PaperCompetitionV3 | null {
  const id = normalizeIdentity(String(row.id ?? ""));
  const name = text(row.name);
  const kind = text(row.kind);
  const status = text(row.status);
  const baseCurrency = text(row.base_currency)?.toUpperCase() ?? null;
  const startingCash = numeric(row.starting_cash);
  const startsAt = timestamp(row.starts_at);
  const joinDeadline = timestamp(row.join_deadline);
  const endsAt = timestamp(row.ends_at);
  const maxParticipants = numeric(row.max_participants);
  const createdAt = timestamp(row.created_at);
  const updatedAt = timestamp(row.updated_at);
  if (
    !id || !name || kind !== "private_league"
    || !status || !["open", "active", "completed", "cancelled"].includes(status)
    || !baseCurrency || !/^[A-Z]{3}$/.test(baseCurrency)
    || startingCash !== 100_000 || !startsAt || !joinDeadline || !endsAt
    || Date.parse(joinDeadline) > Date.parse(startsAt) || Date.parse(endsAt) <= Date.parse(startsAt)
    || maxParticipants === null || !Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 10_000
    || !createdAt || !updatedAt
  ) return null;
  return {
    id,
    name,
    kind: "private_league",
    status: status as PaperCompetitionV3["status"],
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
  const id = normalizeIdentity(String(row.id ?? ""));
  const competitionId = normalizeIdentity(String(row.competition_id ?? ""));
  const userId = normalizeIdentity(String(row.user_id ?? ""));
  const accountId = normalizeIdentity(String(row.account_id ?? ""));
  const joinedAt = timestamp(row.joined_at);
  return id && competitionId && userId && accountId && joinedAt
    ? { id, competitionId, userId, accountId, joinedAt }
    : null;
}

export async function listJoinedPrivatePaperLeaguesV3(userId: string): Promise<JoinedPrivatePaperLeagueListResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  if (!normalizedUserId) return { ok: false, error: "PRIVATE_LEAGUE_USER_INVALID", leagues: [] };
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", leagues: [] };

  try {
    const membershipByCompetition = new Map<string, PrivatePaperLeagueRoleV3>();
    const seenMembershipCompetitionIds = new Set<string>();
    for (let from = 0; ; from += PRIVATE_LEAGUE_MEMBER_PAGE_SIZE) {
      const to = from + PRIVATE_LEAGUE_MEMBER_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("paper_private_league_members_v3")
        .select("competition_id,user_id,role")
        .eq("user_id", normalizedUserId)
        .order("competition_id", { ascending: true })
        .range(from, to);
      if (error) return { ok: false, error: error.message, leagues: [] };
      const rows = data ?? [];
      for (const rawRow of rows) {
        const row = rawRow as JsonRow;
        const competitionId = normalizeIdentity(String(row.competition_id ?? ""));
        const rowUserId = normalizeIdentity(String(row.user_id ?? ""));
        const role = mapRole(row.role);
        if (!competitionId || rowUserId !== normalizedUserId || !role || seenMembershipCompetitionIds.has(competitionId)) {
          return { ok: false, error: "PRIVATE_LEAGUE_LIST_INVALID", leagues: [] };
        }
        seenMembershipCompetitionIds.add(competitionId);
        membershipByCompetition.set(competitionId, role);
      }
      if (rows.length < PRIVATE_LEAGUE_MEMBER_PAGE_SIZE) break;
    }

    const competitionIds = [...membershipByCompetition.keys()];
    if (competitionIds.length === 0) return { ok: true, leagues: [] };

    const requestedCompetitionIds = new Set(competitionIds);
    const seenCompetitionIds = new Set<string>();
    const leagues: JoinedPrivatePaperLeagueV3[] = [];
    for (let index = 0; index < competitionIds.length; index += PRIVATE_LEAGUE_ID_CHUNK_SIZE) {
      const chunk = competitionIds.slice(index, index + PRIVATE_LEAGUE_ID_CHUNK_SIZE);
      const { data, error } = await supabase
        .from("paper_competitions_v3")
        .select(PRIVATE_LEAGUE_SELECT)
        .in("id", chunk)
        .eq("kind", "private_league");
      if (error) return { ok: false, error: error.message, leagues: [] };
      for (const rawRow of data ?? []) {
        const competition = mapCompetition(rawRow as JsonRow);
        if (!competition || seenCompetitionIds.has(competition.id) || !requestedCompetitionIds.has(competition.id)) {
          return { ok: false, error: "PRIVATE_LEAGUE_LIST_INVALID", leagues: [] };
        }
        const role = membershipByCompetition.get(competition.id);
        if (!role) return { ok: false, error: "PRIVATE_LEAGUE_LIST_INVALID", leagues: [] };
        seenCompetitionIds.add(competition.id);
        leagues.push({ competition, role });
      }
    }
    if (seenCompetitionIds.size !== requestedCompetitionIds.size) {
      return { ok: false, error: "PRIVATE_LEAGUE_LIST_INVALID", leagues: [] };
    }
    leagues.sort((a, b) => Date.parse(b.competition.startsAt) - Date.parse(a.competition.startsAt) || a.competition.id.localeCompare(b.competition.id));
    return { ok: true, leagues };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_LIST_FAILED", leagues: [] };
  }
}

export async function loadPrivatePaperLeagueWorkspaceV3(
  userId: string,
  competitionId: string,
): Promise<PrivatePaperLeagueWorkspaceResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  const normalizedCompetitionId = normalizeIdentity(competitionId);
  if (!normalizedUserId || !normalizedCompetitionId) return { ok: false, error: "PRIVATE_LEAGUE_IDENTITY_INVALID" };
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const membershipResult = await supabase
      .from("paper_private_league_members_v3")
      .select("competition_id,user_id,role")
      .eq("competition_id", normalizedCompetitionId)
      .eq("user_id", normalizedUserId)
      .maybeSingle();
    if (membershipResult.error) return { ok: false, error: membershipResult.error.message };
    if (!membershipResult.data) return { ok: false, error: "PRIVATE_LEAGUE_FORBIDDEN" };
    const membership = membershipResult.data as JsonRow;
    const role = mapRole(membership.role);
    if (
      normalizeIdentity(String(membership.competition_id ?? "")) !== normalizedCompetitionId
      || normalizeIdentity(String(membership.user_id ?? "")) !== normalizedUserId
      || !(role === "owner" || role === "admin" || role === "member")
    ) return { ok: false, error: "PRIVATE_LEAGUE_MEMBERSHIP_INVALID" };

    const competitionResult = await supabase
      .from("paper_competitions_v3")
      .select(PRIVATE_LEAGUE_SELECT)
      .eq("id", normalizedCompetitionId)
      .maybeSingle();
    if (competitionResult.error) return { ok: false, error: competitionResult.error.message };
    const competition = competitionResult.data ? mapCompetition(competitionResult.data as JsonRow) : null;
    if (!competition || competition.id !== normalizedCompetitionId || competition.kind !== "private_league") {
      return { ok: false, error: "PRIVATE_LEAGUE_INVALID" };
    }

    const entryResult = await supabase
      .from("paper_competition_entries_v3")
      .select("id,competition_id,user_id,account_id,joined_at")
      .eq("competition_id", normalizedCompetitionId)
      .eq("user_id", normalizedUserId)
      .maybeSingle();
    if (entryResult.error) return { ok: false, error: entryResult.error.message };
    const entry = entryResult.data ? mapEntry(entryResult.data as JsonRow) : null;
    if (!entry || entry.competitionId !== normalizedCompetitionId || entry.userId !== normalizedUserId) {
      return { ok: false, error: "PRIVATE_LEAGUE_ENTRY_INVALID" };
    }

    const boundary = await loadPaperAccountBoundaryV3(normalizedUserId, entry.accountId);
    if (
      !boundary.ok
      || boundary.account.accountType !== "competition"
      || boundary.account.competitionId !== normalizedCompetitionId
    ) return { ok: false, error: "PRIVATE_LEAGUE_ACCOUNT_INVALID" };

    return {
      ok: true,
      workspace: {
        competition,
        role,
        accountId: entry.accountId,
        accountStatus: boundary.account.status,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_WORKSPACE_FAILED" };
  }
}

export async function loadPrivatePaperLeagueTradingContextV3(
  userId: string,
  competitionId: string,
  now: Date = new Date(),
): Promise<PrivatePaperLeagueTradingContextResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  const normalizedCompetitionId = normalizeIdentity(competitionId);
  const nowMs = now.getTime();
  if (!normalizedUserId || !normalizedCompetitionId || !Number.isFinite(nowMs)) {
    return { ok: false, error: "PRIVATE_LEAGUE_TRADING_INVALID" };
  }

  const workspaceResult = await loadPrivatePaperLeagueWorkspaceV3(normalizedUserId, normalizedCompetitionId);
  if (!workspaceResult.ok) return { ok: false, error: "PRIVATE_LEAGUE_TRADING_UNAVAILABLE" };
  const workspace = workspaceResult.workspace;
  const startsAtMs = Date.parse(workspace.competition.startsAt);
  const endsAtMs = Date.parse(workspace.competition.endsAt);

  if (
    workspace.competition.kind !== "private_league"
    || workspace.competition.status === "cancelled"
    || workspace.competition.status === "completed"
    || workspace.accountStatus !== "active"
    || !Number.isFinite(startsAtMs)
    || !Number.isFinite(endsAtMs)
    || nowMs < startsAtMs || nowMs > endsAtMs
  ) {
    return { ok: false, error: "PRIVATE_LEAGUE_TRADING_UNAVAILABLE" };
  }

  return {
    ok: true,
    context: {
      competitionId: normalizedCompetitionId,
      accountId: workspace.accountId,
      startsAt: workspace.competition.startsAt,
      endsAt: workspace.competition.endsAt,
    },
  };
}

export async function listPrivatePaperLeagueInvitesV3(
  userId: string,
  competitionId: string,
): Promise<PrivatePaperLeagueInviteListResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  const normalizedCompetitionId = normalizeIdentity(competitionId);
  if (!normalizedUserId || !normalizedCompetitionId) return { ok: false, error: "PRIVATE_LEAGUE_IDENTITY_INVALID", invites: [] };
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", invites: [] };

  try {
    const membershipResult = await supabase
      .from("paper_private_league_members_v3")
      .select("competition_id,user_id,role")
      .eq("competition_id", normalizedCompetitionId)
      .eq("user_id", normalizedUserId)
      .maybeSingle();
    if (membershipResult.error) return { ok: false, error: membershipResult.error.message, invites: [] };
    if (!membershipResult.data) return { ok: false, error: "PRIVATE_LEAGUE_FORBIDDEN", invites: [] };
    const role = mapRole((membershipResult.data as JsonRow).role);
    if (role !== "owner" && role !== "admin") return { ok: false, error: "PRIVATE_LEAGUE_FORBIDDEN", invites: [] };

    const { data, error } = await supabase
      .from("paper_private_league_invites_v3")
      .select("id,competition_id,expires_at,revoked_at,created_at")
      .eq("competition_id", normalizedCompetitionId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return { ok: false, error: error.message, invites: [] };

    const seenIds = new Set<string>();
    const invites: PrivatePaperLeagueInviteMetadataV3[] = [];
    for (const rawRow of data ?? []) {
      const row = rawRow as JsonRow;
      const id = normalizeIdentity(String(row.id ?? ""));
      const rowCompetitionId = normalizeIdentity(String(row.competition_id ?? ""));
      const expiresAt = timestamp(row.expires_at);
      const revokedAt = row.revoked_at === null ? null : timestamp(row.revoked_at);
      const createdAt = timestamp(row.created_at);
      if (!id || seenIds.has(id) || rowCompetitionId !== normalizedCompetitionId || !expiresAt || row.revoked_at !== null && !revokedAt || !createdAt) {
        return { ok: false, error: "PRIVATE_LEAGUE_INVITES_INVALID", invites: [] };
      }
      seenIds.add(id);
      invites.push({ id, competitionId: normalizedCompetitionId, expiresAt, revokedAt, createdAt });
    }
    return { ok: true, invites };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_INVITES_FAILED", invites: [] };
  }
}

export async function listPrivatePaperLeagueMembersV3(
  userId: string,
  competitionId: string,
): Promise<PrivatePaperLeagueMemberListResultV3> {
  const normalizedUserId = normalizeIdentity(userId);
  const normalizedCompetitionId = normalizeIdentity(competitionId);
  if (!normalizedUserId || !normalizedCompetitionId) {
    return { ok: false, error: "PRIVATE_LEAGUE_IDENTITY_INVALID", members: [] };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", members: [] };

  try {
    const membershipResult = await supabase
      .from("paper_private_league_members_v3")
      .select("competition_id,user_id,role")
      .eq("competition_id", normalizedCompetitionId)
      .eq("user_id", normalizedUserId)
      .maybeSingle();
    if (membershipResult.error) return { ok: false, error: membershipResult.error.message, members: [] };
    if (!membershipResult.data) return { ok: false, error: "PRIVATE_LEAGUE_FORBIDDEN", members: [] };
    const role = mapRole((membershipResult.data as JsonRow).role);
    if (role !== "owner" && role !== "admin") {
      return { ok: false, error: "PRIVATE_LEAGUE_FORBIDDEN", members: [] };
    }

    const seenUserIds = new Set<string>();
    const members: PrivatePaperLeagueMemberV3[] = [];
    let ownerCount = 0;
    for (let from = 0; ; from += PRIVATE_LEAGUE_MEMBER_PAGE_SIZE) {
      const to = from + PRIVATE_LEAGUE_MEMBER_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("paper_private_league_members_v3")
        .select("competition_id,user_id,role")
        .eq("competition_id", normalizedCompetitionId)
        .order("user_id", { ascending: true })
        .range(from, to);
      if (error) return { ok: false, error: error.message, members: [] };

      const rows = data ?? [];
      for (const rawRow of rows) {
        const row = rawRow as JsonRow;
        const rowCompetitionId = normalizeIdentity(String(row.competition_id ?? ""));
        const memberUserId = normalizeIdentity(String(row.user_id ?? ""));
        const memberRole = mapRole(row.role);
        if (
          rowCompetitionId !== normalizedCompetitionId
          || !memberUserId
          || !memberRole
          || seenUserIds.has(memberUserId)
        ) {
          return { ok: false, error: "PRIVATE_LEAGUE_MEMBERS_INVALID", members: [] };
        }
        seenUserIds.add(memberUserId);
        if (memberRole === "owner") ownerCount += 1;
        members.push({ userId: memberUserId, role: memberRole });
      }
      if (rows.length < PRIVATE_LEAGUE_MEMBER_PAGE_SIZE) break;
    }

    if (members.length === 0 || ownerCount !== 1) {
      return { ok: false, error: "PRIVATE_LEAGUE_MEMBERS_INVALID", members: [] };
    }

    const roleOrder: Record<PrivatePaperLeagueRoleV3, number> = { owner: 0, admin: 1, member: 2 };
    members.sort((left, right) => roleOrder[left.role] - roleOrder[right.role] || left.userId.localeCompare(right.userId));
    return { ok: true, members };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PRIVATE_LEAGUE_MEMBERS_FAILED", members: [] };
  }
}
