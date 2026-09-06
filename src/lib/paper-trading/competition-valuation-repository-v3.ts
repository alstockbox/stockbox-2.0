import { createAdminClient } from "@/lib/supabase/admin";
import {
  PAPER_TRADING_V3_POLICY_VERSION,
  type PaperFillV3,
  type PaperTradingSideV3,
} from "./engine-v3";
import { PAPER_TRADING_V3_FIXED_STARTING_CASH } from "./performance-v3";

export const PAPER_COMPETITION_VALUATION_ENTRY_PAGE_SIZE = 500;
export const PAPER_PRIVATE_LEAGUE_VALUATION_MEMBER_PAGE_SIZE = 500;
export const PAPER_COMPETITION_VALUATION_ACCOUNT_CHUNK_SIZE = 100;
export const PAPER_COMPETITION_VALUATION_LEDGER_CHUNK_SIZE = 100;
const PAPER_COMPETITION_VALUATION_LEDGER_PAGE_SIZE = 1000;

type JsonRow = Record<string, unknown>;
type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export type PaperCompetitionValuationKindV3 = "challenge" | "private_league";

type PaperCompetitionValuationTermsV3 = {
  id: string;
  kind: "challenge" | "private_league";
  status: "active" | "completed";
  baseCurrency: string;
  startingCash: 100_000;
  startsAt: string;
  endsAt: string;
  maxParticipants: number;
};

type PaperCompetitionValuationEntryV3 = {
  id: string;
  competitionId: string;
  userId: string;
  accountId: string;
  joinedAt: string;
};

type PaperPrivateLeagueValuationMembershipV3 = {
  competitionId: string;
  userId: string;
  role: "owner" | "admin" | "member";
};

type PaperCompetitionValuationAccountV3 = {
  id: string;
  userId: string;
  baseCurrency: string;
  status: "active" | "archived";
  accountType: "personal" | "competition";
  competitionId: string | null;
};

type PaperCompetitionValuationOrderV3 = {
  id: string;
  accountId: string;
  userId: string;
  idempotencyKey: string;
  ticker: string;
  side: PaperTradingSideV3;
  quantity: number;
  status: "filled";
  policyVersion: string;
};

export type PaperCompetitionValuationParticipantEvidenceV3 = {
  userId: string;
  accountId: string;
  fills: PaperFillV3[];
};

export type PaperCompetitionValuationEvidenceV3 = {
  competition: PaperCompetitionValuationTermsV3;
  evaluationCutoff: string;
  participants: PaperCompetitionValuationParticipantEvidenceV3[];
};

export type PaperCompetitionValuationEvidenceResultV3 =
  | { ok: true; evidence: PaperCompetitionValuationEvidenceV3 }
  | {
      ok: false;
      error:
        | "PAPER_COMPETITION_VALUATION_INVALID_INPUT"
        | "PAPER_COMPETITION_VALUATION_NOT_FOUND"
        | "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID"
        | "PAPER_COMPETITION_VALUATION_LOAD_FAILED"
        | "SUPABASE_ADMIN_NOT_CONFIGURED";
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

function close(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Math.max(1e-8, Number.EPSILON * scale * 8);
}

function mapCompetition(row: JsonRow): PaperCompetitionValuationTermsV3 | null {
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
    || startingCash !== PAPER_TRADING_V3_FIXED_STARTING_CASH
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
    startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
    startsAt,
    endsAt,
    maxParticipants,
  };
}

function mapEntry(row: JsonRow, competitionId: string): PaperCompetitionValuationEntryV3 | null {
  const id = text(row.id);
  const rowCompetitionId = text(row.competition_id);
  const userId = text(row.user_id);
  const accountId = text(row.account_id);
  const joinedAt = timestamp(row.joined_at);
  if (!id || rowCompetitionId !== competitionId || !userId || !accountId || !joinedAt) return null;
  return { id, competitionId, userId, accountId, joinedAt };
}

function mapAccount(row: JsonRow): PaperCompetitionValuationAccountV3 | null {
  const id = text(row.id);
  const userId = text(row.user_id);
  const baseCurrency = text(row.base_currency)?.toUpperCase() ?? null;
  const status = row.status === "active" || row.status === "archived" ? row.status : null;
  const accountType = row.account_type === "personal" || row.account_type === "competition" ? row.account_type : null;
  const competitionId = row.competition_id === null ? null : text(row.competition_id);
  if (
    !id
    || !userId
    || !baseCurrency
    || !/^[A-Z]{3}$/.test(baseCurrency)
    || !status
    || !accountType
    || (accountType === "personal" && competitionId !== null)
    || (accountType === "competition" && !competitionId)
  ) return null;
  return { id, userId, baseCurrency, status, accountType, competitionId };
}

function mapOrder(row: JsonRow): PaperCompetitionValuationOrderV3 | null {
  const id = text(row.id);
  const accountId = text(row.account_id);
  const userId = text(row.user_id);
  const idempotencyKey = text(row.idempotency_key);
  const ticker = text(row.ticker)?.toUpperCase() ?? null;
  const side = row.side === "buy" || row.side === "sell" ? row.side : null;
  const quantity = numeric(row.quantity);
  const status = row.status;
  const policyVersion = text(row.policy_version);
  if (
    !id
    || !accountId
    || !userId
    || !idempotencyKey
    || !ticker
    || ticker.length > 32
    || !side
    || quantity === null
    || quantity <= 0
    || status !== "filled"
    || policyVersion !== PAPER_TRADING_V3_POLICY_VERSION
  ) return null;
  return { id, accountId, userId, idempotencyKey, ticker, side, quantity, status: "filled", policyVersion };
}

function mapFill(
  row: JsonRow,
  orderById: ReadonlyMap<string, PaperCompetitionValuationOrderV3>,
  competitionBaseCurrency: string,
): PaperFillV3 | null {
  const fillId = text(row.id);
  const orderId = text(row.order_id);
  const accountId = text(row.account_id);
  const userId = text(row.user_id);
  const ticker = text(row.ticker)?.toUpperCase() ?? null;
  const side = row.side === "buy" || row.side === "sell" ? row.side : null;
  const quantity = numeric(row.quantity);
  const price = numeric(row.price);
  const grossAmount = numeric(row.gross_amount);
  const fee = numeric(row.fee);
  const currency = text(row.currency)?.toUpperCase() ?? null;
  const executedAt = timestamp(row.executed_at);
  const marketObservedAt = timestamp(row.market_observed_at);
  const provider = text(row.provider);
  const marketVerification = text(row.market_verification);
  const pricingBasis = text(row.pricing_basis);
  const policyVersion = text(row.policy_version);

  if (
    !fillId
    || !orderId
    || !accountId
    || !userId
    || !ticker
    || ticker.length > 32
    || !side
    || quantity === null
    || quantity <= 0
    || price === null
    || price <= 0
    || grossAmount === null
    || grossAmount <= 0
    || fee !== 0
    || !currency
    || currency !== competitionBaseCurrency
    || !executedAt
    || !marketObservedAt
    || !provider
    || marketVerification !== "VERIFIED"
    || pricingBasis !== "VERIFIED_OBSERVATION_EXACT"
    || policyVersion !== PAPER_TRADING_V3_POLICY_VERSION
    || !close(grossAmount, quantity * price)
  ) return null;

  const executedAtMs = Date.parse(executedAt);
  const observedAtMs = Date.parse(marketObservedAt);
  if (observedAtMs > executedAtMs + 30_000 || executedAtMs - observedAtMs > 20 * 60_000) return null;

  const order = orderById.get(orderId);
  if (
    !order
    || order.accountId !== accountId
    || order.userId !== userId
    || order.ticker !== ticker
    || order.side !== side
    || Math.abs(order.quantity - quantity) > 1e-9
  ) return null;

  return {
    fillId,
    orderId,
    idempotencyKey: order.idempotencyKey,
    ticker,
    side,
    quantity,
    price,
    grossAmount,
    fee,
    currency,
    executedAt,
    marketObservedAt,
    provider,
    pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    policyVersion: PAPER_TRADING_V3_POLICY_VERSION,
  };
}

async function loadEntries(
  supabase: AdminClient,
  competitionId: string,
  competition: PaperCompetitionValuationTermsV3,
): Promise<PaperCompetitionValuationEntryV3[] | null> {
  const entries: PaperCompetitionValuationEntryV3[] = [];
  const seenUsers = new Set<string>();
  const seenAccounts = new Set<string>();

  for (let from = 0; from < competition.maxParticipants; from += PAPER_COMPETITION_VALUATION_ENTRY_PAGE_SIZE) {
    const to = Math.min(from + PAPER_COMPETITION_VALUATION_ENTRY_PAGE_SIZE, competition.maxParticipants) - 1;
    const expectedCapacity = to - from + 1;
    const { data, error } = await supabase
      .from("paper_competition_entries_v3")
      .select("id,competition_id,user_id,account_id,joined_at")
      .eq("competition_id", competitionId)
      .order("joined_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) return null;

    const rows = data ?? [];
    for (const rawRow of rows) {
      const entry = mapEntry(rawRow as JsonRow, competitionId);
      if (
        !entry
        || seenUsers.has(entry.userId)
        || seenAccounts.has(entry.accountId)
        || Date.parse(entry.joinedAt) > Date.parse(competition.startsAt)
      ) return null;
      seenUsers.add(entry.userId);
      seenAccounts.add(entry.accountId);
      entries.push(entry);
    }
    if (rows.length < expectedCapacity) break;
  }

  if (entries.length === 0 || entries.length > competition.maxParticipants) return null;
  if (entries.length === competition.maxParticipants) {
    const { data, error } = await supabase
      .from("paper_competition_entries_v3")
      .select("id")
      .eq("competition_id", competitionId)
      .range(competition.maxParticipants, competition.maxParticipants);
    if (error || (data ?? []).length > 0) return null;
  }
  return entries;
}

async function loadPrivateLeagueMemberships(
  supabase: AdminClient,
  competitionId: string,
  entries: readonly PaperCompetitionValuationEntryV3[],
): Promise<Map<string, PaperPrivateLeagueValuationMembershipV3> | null> {
  const memberships = new Map<string, PaperPrivateLeagueValuationMembershipV3>();
  const seenUsers = new Set<string>();
  const entryUsers = new Set(entries.map((entry) => entry.userId));
  let ownerCount = 0;

  for (let from = 0; from <= entries.length; from += PAPER_PRIVATE_LEAGUE_VALUATION_MEMBER_PAGE_SIZE) {
    const to = Math.min(from + PAPER_PRIVATE_LEAGUE_VALUATION_MEMBER_PAGE_SIZE - 1, entries.length);
    const expectedCapacity = to - from + 1;
    const { data, error } = await supabase
      .from("paper_private_league_members_v3")
      .select("competition_id,user_id,role")
      .eq("competition_id", competitionId)
      .order("user_id", { ascending: true })
      .range(from, to);
    if (error) return null;

    const rows = data ?? [];
    for (const rawRow of rows) {
      const row = rawRow as JsonRow;
      const rowCompetitionId = text(row.competition_id);
      const userId = text(row.user_id);
      const role = text(row.role);
      if (
        rowCompetitionId !== competitionId
        || !userId
        || (role !== "owner" && role !== "admin" && role !== "member")
        || seenUsers.has(userId)
        || !entryUsers.has(userId)
      ) return null;

      seenUsers.add(userId);
      if (role === "owner") ownerCount += 1;
      memberships.set(userId, { competitionId, userId, role });
      if (seenUsers.size > entries.length) return null;
    }

    if (rows.length < expectedCapacity) break;
  }

  if (
    seenUsers.size !== entries.length
    || entries.some((entry) => !seenUsers.has(entry.userId))
    || ownerCount !== 1
  ) return null;

  return memberships;
}

async function loadAccounts(
  supabase: AdminClient,
  competitionId: string,
  competition: PaperCompetitionValuationTermsV3,
  entries: readonly PaperCompetitionValuationEntryV3[],
): Promise<Map<string, PaperCompetitionValuationAccountV3> | null> {
  const accounts = new Map<string, PaperCompetitionValuationAccountV3>();

  for (let offset = 0; offset < entries.length; offset += PAPER_COMPETITION_VALUATION_ACCOUNT_CHUNK_SIZE) {
    const accountIds = entries
      .slice(offset, offset + PAPER_COMPETITION_VALUATION_ACCOUNT_CHUNK_SIZE)
      .map((entry) => entry.accountId);
    const { data, error } = await supabase
      .from("paper_accounts_v3")
      .select("id,user_id,base_currency,status,account_type,competition_id")
      .in("id", accountIds);
    if (error) return null;

    for (const rawRow of data ?? []) {
      const account = mapAccount(rawRow as JsonRow);
      if (!account || accounts.has(account.id)) return null;
      accounts.set(account.id, account);
    }
  }

  if (accounts.size !== entries.length) return null;
  for (const entry of entries) {
    const account = accounts.get(entry.accountId);
    if (
      !account
      || account.accountType !== "competition"
      || account.competitionId !== competitionId
      || account.baseCurrency !== competition.baseCurrency
      || account.userId !== entry.userId
      || (competition.status === "active" && account.status !== "active")
    ) return null;
  }
  return accounts;
}

async function loadFilledOrdersForChunk(
  supabase: AdminClient,
  accountIds: readonly string[],
  evaluationCutoff: string,
): Promise<Map<string, PaperCompetitionValuationOrderV3> | null> {
  const orderById = new Map<string, PaperCompetitionValuationOrderV3>();

  for (let from = 0; ; from += PAPER_COMPETITION_VALUATION_LEDGER_PAGE_SIZE) {
    const to = from + PAPER_COMPETITION_VALUATION_LEDGER_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("paper_orders_v3")
      .select("id,account_id,user_id,idempotency_key,ticker,side,quantity,status,submitted_at,policy_version")
      .in("account_id", accountIds)
      .eq("status", "filled")
      .lte("submitted_at", evaluationCutoff)
      .order("submitted_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) return null;

    const rows = data ?? [];
    for (const rawRow of rows) {
      const order = mapOrder(rawRow as JsonRow);
      if (!order || orderById.has(order.id) || !accountIds.includes(order.accountId)) return null;
      orderById.set(order.id, order);
    }
    if (rows.length < PAPER_COMPETITION_VALUATION_LEDGER_PAGE_SIZE) break;
  }

  return orderById;
}

async function loadFillsForChunk(
  supabase: AdminClient,
  accountIds: readonly string[],
  evaluationCutoff: string,
  competitionBaseCurrency: string,
  orderById: ReadonlyMap<string, PaperCompetitionValuationOrderV3>,
): Promise<Map<string, PaperFillV3[]> | null> {
  const fillsByAccount = new Map<string, PaperFillV3[]>();
  const seenFillIds = new Set<string>();
  const seenOrderIds = new Set<string>();

  for (let from = 0; ; from += PAPER_COMPETITION_VALUATION_LEDGER_PAGE_SIZE) {
    const to = from + PAPER_COMPETITION_VALUATION_LEDGER_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("paper_fills_v3")
      .select("id,account_id,order_id,user_id,ticker,side,quantity,price,gross_amount,fee,currency,executed_at,market_observed_at,provider,market_verification,pricing_basis,policy_version")
      .in("account_id", accountIds)
      .lte("executed_at", evaluationCutoff)
      .order("executed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) return null;

    const rows = data ?? [];
    for (const rawRow of rows) {
      const fill = mapFill(rawRow as JsonRow, orderById, competitionBaseCurrency);
      if (
        !fill
        || seenFillIds.has(fill.fillId)
        || seenOrderIds.has(fill.orderId)
        || !accountIds.includes(text((rawRow as JsonRow).account_id) ?? "")
      ) return null;
      seenFillIds.add(fill.fillId);
      seenOrderIds.add(fill.orderId);
      const accountId = text((rawRow as JsonRow).account_id);
      if (!accountId) return null;
      const current = fillsByAccount.get(accountId) ?? [];
      current.push(fill);
      fillsByAccount.set(accountId, current);
    }
    if (rows.length < PAPER_COMPETITION_VALUATION_LEDGER_PAGE_SIZE) break;
  }

  return fillsByAccount;
}

async function loadLedgerEvidence(
  supabase: AdminClient,
  competition: PaperCompetitionValuationTermsV3,
  entries: readonly PaperCompetitionValuationEntryV3[],
  evaluationCutoff: string,
): Promise<Map<string, PaperFillV3[]> | null> {
  const fillsByAccount = new Map<string, PaperFillV3[]>();

  for (let offset = 0; offset < entries.length; offset += PAPER_COMPETITION_VALUATION_LEDGER_CHUNK_SIZE) {
    const accountIds = entries
      .slice(offset, offset + PAPER_COMPETITION_VALUATION_LEDGER_CHUNK_SIZE)
      .map((entry) => entry.accountId);
    const orderById = await loadFilledOrdersForChunk(supabase, accountIds, evaluationCutoff);
    if (!orderById) return null;
    const chunkFills = await loadFillsForChunk(
      supabase,
      accountIds,
      evaluationCutoff,
      competition.baseCurrency,
      orderById,
    );
    if (!chunkFills) return null;
    for (const accountId of accountIds) {
      fillsByAccount.set(accountId, chunkFills.get(accountId) ?? []);
    }
  }

  return fillsByAccount;
}

async function loadPaperCompetitionValuationEvidenceForKindV3(
  input: {
    competitionId: string;
    evaluationCutoff: string;
  },
  expectedKind: PaperCompetitionValuationKindV3,
): Promise<PaperCompetitionValuationEvidenceResultV3> {
  const competitionId = identity(input.competitionId);
  const cutoffMs = Date.parse(input.evaluationCutoff);
  if (!competitionId || !Number.isFinite(cutoffMs)) {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_INVALID_INPUT" };
  }
  const evaluationCutoff = new Date(cutoffMs).toISOString();
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase
      .from("paper_competitions_v3")
      .select("id,kind,status,base_currency,starting_cash,starts_at,ends_at,max_participants")
      .eq("id", competitionId)
      .maybeSingle();
    if (error) return { ok: false, error: "PAPER_COMPETITION_VALUATION_LOAD_FAILED" };
    if (!data) return { ok: false, error: "PAPER_COMPETITION_VALUATION_NOT_FOUND" };

    const competition = mapCompetition(data as JsonRow);
    if (expectedKind === "challenge" && competition && competition.kind !== "challenge") {
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID" };
    }
    if (
      !competition
      || competition.id !== competitionId
      || competition.kind !== expectedKind
      || (competition.status !== "active" && competition.status !== "completed")
      || competition.startingCash !== PAPER_TRADING_V3_FIXED_STARTING_CASH
      || cutoffMs < Date.parse(competition.startsAt)
      || cutoffMs > Date.parse(competition.endsAt)
    ) {
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID" };
    }

    const entries = await loadEntries(supabase, competitionId, competition);
    if (!entries) return { ok: false, error: "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID" };

    if (expectedKind === "private_league") {
      const memberships = await loadPrivateLeagueMemberships(supabase, competitionId, entries);
      if (!memberships || memberships.size !== entries.length) {
        return { ok: false, error: "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID" };
      }
    }

    const accounts = await loadAccounts(supabase, competitionId, competition, entries);
    if (!accounts) return { ok: false, error: "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID" };

    const fillsByAccount = await loadLedgerEvidence(supabase, competition, entries, evaluationCutoff);
    if (!fillsByAccount) return { ok: false, error: "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID" };

    const participants = entries.map((entry) => ({
      userId: entry.userId,
      accountId: entry.accountId,
      fills: fillsByAccount.get(entry.accountId) ?? [],
    }));
    if (participants.length !== entries.length || accounts.size !== participants.length) {
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_EVIDENCE_INVALID" };
    }

    return {
      ok: true,
      evidence: {
        competition,
        evaluationCutoff,
        participants,
      },
    };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_LOAD_FAILED" };
  }
}

/**
 * Loads challenge valuation evidence from immutable verified fills at one
 * common cutoff. Challenge semantics and the existing export remain unchanged.
 */
export async function loadPaperCompetitionValuationEvidenceV3(input: {
  competitionId: string;
  evaluationCutoff: string;
}): Promise<PaperCompetitionValuationEvidenceResultV3> {
  return loadPaperCompetitionValuationEvidenceForKindV3(input, "challenge");
}

/**
 * Loads private-league valuation evidence with an additional exact membership
 * consistency boundary before account and ledger evidence can be trusted.
 */
export async function loadPrivatePaperLeagueValuationEvidenceV3(input: {
  competitionId: string;
  evaluationCutoff: string;
}): Promise<PaperCompetitionValuationEvidenceResultV3> {
  return loadPaperCompetitionValuationEvidenceForKindV3(input, "private_league");
}
