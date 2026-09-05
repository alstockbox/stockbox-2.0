import { createAdminClient } from "@/lib/supabase/admin";
import {
  derivePaperTradingLedgerV3,
  PAPER_TRADING_V3_POLICY_VERSION,
  type PaperFillV3,
  type PaperOrderIntentV3,
  type PaperTradingAccountStateV3,
  type PaperTradingRejectReasonV3,
} from "./engine-v3";

export type PaperAccountRowV3 = {
  id: string;
  userId: string;
  name: string;
  baseCurrency: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type PaperOrderRowV3 = {
  id: string;
  accountId: string;
  idempotencyKey: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  status: "filled" | "rejected";
  rejectionReason: PaperTradingRejectReasonV3 | null;
  submittedAt: string;
  policyVersion: string;
};

export type PaperAccountLoadResultV3 =
  | {
      ok: true;
      account: PaperAccountRowV3;
      state: PaperTradingAccountStateV3;
      orders: PaperOrderRowV3[];
    }
  | { ok: false; error: string };

export type PaperRepositoryWriteResultV3<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type JsonRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function mapAccount(row: JsonRow): PaperAccountRowV3 | null {
  const id = text(row.id);
  const userId = text(row.user_id);
  const name = text(row.name);
  const baseCurrency = text(row.base_currency)?.toUpperCase() ?? null;
  const status = row.status === "active" || row.status === "archived" ? row.status : null;
  const createdAt = text(row.created_at);
  const updatedAt = text(row.updated_at);
  if (!id || !userId || !name || !baseCurrency || !status || !createdAt || !updatedAt) return null;
  return { id, userId, name, baseCurrency, status, createdAt, updatedAt };
}

function mapOrder(row: JsonRow): PaperOrderRowV3 | null {
  const id = text(row.id);
  const accountId = text(row.account_id);
  const idempotencyKey = text(row.idempotency_key);
  const ticker = text(row.ticker)?.toUpperCase() ?? null;
  const side = row.side === "buy" || row.side === "sell" ? row.side : null;
  const quantity = numeric(row.quantity);
  const status = row.status === "filled" || row.status === "rejected" ? row.status : null;
  const rejectionReason = row.rejection_reason === null
    ? null
    : text(row.rejection_reason) as PaperTradingRejectReasonV3 | null;
  const submittedAt = text(row.submitted_at);
  const policyVersion = text(row.policy_version);
  if (!id || !accountId || !idempotencyKey || !ticker || !side || quantity === null || quantity <= 0 || !status || !submittedAt || !policyVersion) return null;
  if (status === "filled" && rejectionReason !== null) return null;
  if (status === "rejected" && rejectionReason === null) return null;
  return { id, accountId, idempotencyKey, ticker, side, quantity, status, rejectionReason, submittedAt, policyVersion };
}

function mapFill(row: JsonRow, order: PaperOrderRowV3 | undefined): PaperFillV3 | null {
  if (!order || order.status !== "filled") return null;
  const fillId = text(row.id);
  const orderId = text(row.order_id);
  const ticker = text(row.ticker)?.toUpperCase() ?? null;
  const side = row.side === "buy" || row.side === "sell" ? row.side : null;
  const quantity = numeric(row.quantity);
  const price = numeric(row.price);
  const grossAmount = numeric(row.gross_amount);
  const fee = numeric(row.fee);
  const currency = text(row.currency)?.toUpperCase() ?? null;
  const executedAt = text(row.executed_at);
  const marketObservedAt = text(row.market_observed_at);
  const provider = text(row.provider);
  const marketVerification = text(row.market_verification);
  const pricingBasis = text(row.pricing_basis);
  const policyVersion = text(row.policy_version);

  if (
    !fillId
    || !orderId
    || orderId !== order.id
    || !ticker
    || ticker !== order.ticker
    || !side
    || side !== order.side
    || quantity === null
    || Math.abs(quantity - order.quantity) > 1e-9
    || price === null
    || grossAmount === null
    || fee === null
    || !currency
    || !executedAt
    || !marketObservedAt
    || !provider
    || marketVerification !== "VERIFIED"
    || pricingBasis !== "VERIFIED_OBSERVATION_EXACT"
    || policyVersion !== PAPER_TRADING_V3_POLICY_VERSION
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
    policyVersion,
  };
}

export async function loadPaperAccountStateV3(userId: string, accountId: string): Promise<PaperAccountLoadResultV3> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const accountResult = await supabase
      .from("paper_accounts_v3")
      .select("id,user_id,name,base_currency,status,created_at,updated_at")
      .eq("id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (accountResult.error) return { ok: false, error: accountResult.error.message };
    if (!accountResult.data) return { ok: false, error: "PAPER_ACCOUNT_NOT_FOUND" };
    const account = mapAccount(accountResult.data as JsonRow);
    if (!account) return { ok: false, error: "PAPER_ACCOUNT_INVALID" };

    const [cashResult, orderResult, fillResult] = await Promise.all([
      supabase
        .from("paper_cash_balances_v3")
        .select("currency,amount")
        .eq("account_id", accountId)
        .eq("user_id", userId)
        .order("currency"),
      supabase
        .from("paper_orders_v3")
        .select("id,account_id,idempotency_key,ticker,side,quantity,status,rejection_reason,submitted_at,policy_version")
        .eq("account_id", accountId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("paper_fills_v3")
        .select("id,order_id,ticker,side,quantity,price,gross_amount,fee,currency,executed_at,market_observed_at,provider,market_verification,pricing_basis,policy_version")
        .eq("account_id", accountId)
        .eq("user_id", userId)
        .order("executed_at", { ascending: true }),
    ]);

    if (cashResult.error) return { ok: false, error: cashResult.error.message };
    if (orderResult.error) return { ok: false, error: orderResult.error.message };
    if (fillResult.error) return { ok: false, error: fillResult.error.message };

    const cash = (cashResult.data ?? []).map((row) => ({
      currency: text((row as JsonRow).currency)?.toUpperCase() ?? "",
      amount: numeric((row as JsonRow).amount) ?? Number.NaN,
    }));
    if (cash.some((row) => !/^[A-Z]{3}$/.test(row.currency) || !Number.isFinite(row.amount) || row.amount < 0)) {
      return { ok: false, error: "PAPER_CASH_LEDGER_INVALID" };
    }

    const orders = (orderResult.data ?? []).map((row) => mapOrder(row as JsonRow));
    if (orders.some((row) => row === null)) return { ok: false, error: "PAPER_ORDER_LEDGER_INVALID" };
    const validOrders = orders.filter((row): row is PaperOrderRowV3 => row !== null);
    const orderById = new Map(validOrders.map((order) => [order.id, order]));

    const fills = (fillResult.data ?? []).map((row) => {
      const raw = row as JsonRow;
      return mapFill(raw, orderById.get(text(raw.order_id) ?? ""));
    });
    if (fills.some((row) => row === null)) return { ok: false, error: "PAPER_FILL_LEDGER_INVALID" };
    const validFills = fills.filter((row): row is PaperFillV3 => row !== null);
    if (!derivePaperTradingLedgerV3(validFills).ok) return { ok: false, error: "PAPER_FILL_LEDGER_INVALID" };

    return { ok: true, account, state: { cash, fills: validFills }, orders: validOrders };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_ACCOUNT_LOAD_FAILED" };
  }
}

export async function findPaperOrderByIdempotencyV3(input: {
  userId: string;
  accountId: string;
  idempotencyKey: string;
}): Promise<{ ok: true; order: PaperOrderRowV3 | null } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  const key = input.idempotencyKey.trim();
  if (!key) return { ok: false, error: "INVALID_IDEMPOTENCY_KEY" };

  try {
    const { data, error } = await supabase
      .from("paper_orders_v3")
      .select("id,account_id,idempotency_key,ticker,side,quantity,status,rejection_reason,submitted_at,policy_version")
      .eq("account_id", input.accountId)
      .eq("user_id", input.userId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: true, order: null };
    const order = mapOrder(data as JsonRow);
    return order ? { ok: true, order } : { ok: false, error: "PAPER_ORDER_LEDGER_INVALID" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_ORDER_LOOKUP_FAILED" };
  }
}

export function toPaperFillRpcParamsV3(input: { userId: string; accountId: string; fill: PaperFillV3 }) {
  if (
    input.fill.policyVersion !== PAPER_TRADING_V3_POLICY_VERSION
    || input.fill.pricingBasis !== "VERIFIED_OBSERVATION_EXACT"
    || input.fill.fee !== 0
  ) return null;

  return {
    p_user_id: input.userId,
    p_account_id: input.accountId,
    p_idempotency_key: input.fill.idempotencyKey,
    p_ticker: input.fill.ticker,
    p_side: input.fill.side,
    p_quantity: input.fill.quantity,
    p_price: input.fill.price,
    p_currency: input.fill.currency,
    p_market_observed_at: input.fill.marketObservedAt,
    p_provider: input.fill.provider,
    p_market_verification: "VERIFIED",
    p_executed_at: input.fill.executedAt,
  } as const;
}

export function toPaperRejectionRpcParamsV3(input: {
  userId: string;
  accountId: string;
  intent: PaperOrderIntentV3;
  reason: PaperTradingRejectReasonV3;
  submittedAt: string;
}) {
  return {
    p_user_id: input.userId,
    p_account_id: input.accountId,
    p_idempotency_key: input.intent.idempotencyKey,
    p_ticker: input.intent.ticker,
    p_side: input.intent.side,
    p_quantity: input.intent.quantity,
    p_rejection_reason: input.reason,
    p_submitted_at: input.submittedAt,
  } as const;
}

export async function createPaperAccountV3(input: {
  userId: string;
  name: string;
  baseCurrency: string;
  startingCash: number;
}): Promise<PaperRepositoryWriteResultV3<PaperAccountRowV3>> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("create_paper_account_v3", {
      p_user_id: input.userId,
      p_name: input.name,
      p_base_currency: input.baseCurrency,
      p_starting_cash: input.startingCash,
    });
    if (error) return { ok: false, error: error.message };
    const raw = Array.isArray(data) ? data[0] : data;
    const account = raw && typeof raw === "object" ? mapAccount(raw as JsonRow) : null;
    return account ? { ok: true, data: account } : { ok: false, error: "PAPER_ACCOUNT_CREATE_INVALID_RESULT" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_ACCOUNT_CREATE_FAILED" };
  }
}

export async function persistPaperRejectionV3(input: {
  userId: string;
  accountId: string;
  intent: PaperOrderIntentV3;
  reason: PaperTradingRejectReasonV3;
  submittedAt: string;
}): Promise<PaperRepositoryWriteResultV3<PaperOrderRowV3>> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("record_paper_rejection_v3", toPaperRejectionRpcParamsV3(input));
    if (error) return { ok: false, error: error.message };
    const raw = Array.isArray(data) ? data[0] : data;
    const order = raw && typeof raw === "object" ? mapOrder(raw as JsonRow) : null;
    return order ? { ok: true, data: order } : { ok: false, error: "PAPER_REJECTION_INVALID_RESULT" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_REJECTION_WRITE_FAILED" };
  }
}

export async function persistPaperFillV3(input: {
  userId: string;
  accountId: string;
  fill: PaperFillV3;
}): Promise<PaperRepositoryWriteResultV3<PaperFillV3>> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  const params = toPaperFillRpcParamsV3(input);
  if (!params) return { ok: false, error: "PAPER_FILL_POLICY_MISMATCH" };

  try {
    const { data, error } = await supabase.rpc("record_paper_fill_v3", params);
    if (error) return { ok: false, error: error.message };
    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw || typeof raw !== "object") return { ok: false, error: "PAPER_FILL_INVALID_RESULT" };

    const row = raw as JsonRow;
    const persistedOrderId = text(row.order_id);
    const persistedFillId = text(row.id);
    const persistedGross = numeric(row.gross_amount);
    if (!persistedOrderId || !persistedFillId || persistedGross === null) return { ok: false, error: "PAPER_FILL_INVALID_RESULT" };

    return {
      ok: true,
      data: {
        ...input.fill,
        orderId: persistedOrderId,
        fillId: persistedFillId,
        grossAmount: persistedGross,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PAPER_FILL_WRITE_FAILED" };
  }
}
