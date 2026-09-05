import { randomUUID } from "node:crypto";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  executePaperMarketOrderV3,
  type PaperOrderIntentV3,
  type PaperTradingRejectReasonV3,
} from "./engine-v3";
import { fetchYahooExecutionQuoteV3 } from "./execution-quote-v3";
import {
  findPaperOrderByIdempotencyV3,
  loadPaperAccountStateV3,
  persistPaperFillV3,
  persistPaperRejectionV3,
  type PaperOrderRowV3,
} from "./repository-v3";

export type PaperOrderServiceResultV3 =
  | { status: "DISABLED" }
  | { status: "KILLED" }
  | { status: "ALREADY_RECORDED"; order: PaperOrderRowV3 }
  | { status: "FILLED"; fillId: string; orderId: string }
  | { status: "REJECTED"; reason: PaperTradingRejectReasonV3; persisted: boolean }
  | { status: "ERROR"; error: string };

type PaperOrderServiceDepsV3 = {
  featureEnabled: () => boolean;
  killed: () => boolean;
  findExisting: typeof findPaperOrderByIdempotencyV3;
  loadAccount: typeof loadPaperAccountStateV3;
  fetchQuote: typeof fetchYahooExecutionQuoteV3;
  persistFill: typeof persistPaperFillV3;
  persistRejection: typeof persistPaperRejectionV3;
  now: () => string;
  randomId: () => string;
};

const defaultDeps: PaperOrderServiceDepsV3 = {
  featureEnabled: () => isFeatureEnabled("paperTrading"),
  killed: () => isKilled("paperTrading"),
  findExisting: findPaperOrderByIdempotencyV3,
  loadAccount: loadPaperAccountStateV3,
  fetchQuote: fetchYahooExecutionQuoteV3,
  persistFill: persistPaperFillV3,
  persistRejection: persistPaperRejectionV3,
  now: () => new Date().toISOString(),
  randomId: () => randomUUID(),
};

function normalizeIntent(input: PaperOrderIntentV3): PaperOrderIntentV3 | null {
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  const ticker = typeof input.ticker === "string" ? input.ticker.trim().toUpperCase() : "";
  const side = input.side;
  const quantity = Number(input.quantity);
  if (
    !idempotencyKey
    || idempotencyKey.length > 128
    || !ticker
    || ticker.length > 32
    || (side !== "buy" && side !== "sell")
    || !Number.isFinite(quantity)
    || quantity <= 0
    || quantity > 1_000_000_000
  ) return null;
  return { idempotencyKey, ticker, side, quantity };
}

function raceRejectReason(error: string): PaperTradingRejectReasonV3 | null {
  const normalized = error.toLowerCase();
  if (normalized.includes("insufficient paper cash")) return "INSUFFICIENT_CASH";
  if (normalized.includes("insufficient paper position")) return "INSUFFICIENT_POSITION";
  if (normalized.includes("ledger") && normalized.includes("invalid")) return "LEDGER_INVALID";
  return null;
}

async function persistRejection(
  deps: PaperOrderServiceDepsV3,
  input: { userId: string; accountId: string; intent: PaperOrderIntentV3; reason: PaperTradingRejectReasonV3; submittedAt: string },
): Promise<PaperOrderServiceResultV3> {
  const persisted = await deps.persistRejection(input);
  return persisted.ok
    ? { status: "REJECTED", reason: input.reason, persisted: true }
    : { status: "REJECTED", reason: input.reason, persisted: false };
}

export async function executePaperOrderServiceV3(
  input: { userId: string; accountId: string; intent: PaperOrderIntentV3 },
  deps: PaperOrderServiceDepsV3 = defaultDeps,
): Promise<PaperOrderServiceResultV3> {
  if (!deps.featureEnabled()) return { status: "DISABLED" };
  if (deps.killed()) return { status: "KILLED" };

  const intent = normalizeIntent(input.intent);
  if (!input.userId.trim() || !input.accountId.trim() || !intent) {
    return { status: "REJECTED", reason: "INVALID_ORDER", persisted: false };
  }

  const existing = await deps.findExisting({
    userId: input.userId,
    accountId: input.accountId,
    idempotencyKey: intent.idempotencyKey,
  });
  if (!existing.ok) return { status: "ERROR", error: existing.error };
  if (existing.order) return { status: "ALREADY_RECORDED", order: existing.order };

  const account = await deps.loadAccount(input.userId, input.accountId);
  if (!account.ok) return { status: "ERROR", error: account.error };
  if (account.account.status !== "active") return { status: "ERROR", error: "PAPER_ACCOUNT_INACTIVE" };

  const serverReceivedAt = deps.now();
  if (!Number.isFinite(Date.parse(serverReceivedAt))) return { status: "ERROR", error: "PAPER_SERVER_TIME_INVALID" };

  const quote = await deps.fetchQuote(intent.ticker);
  const execution = executePaperMarketOrderV3({
    intent,
    trusted: {
      orderId: deps.randomId(),
      fillId: deps.randomId(),
      serverReceivedAt,
    },
    market: quote.observation,
    state: account.state,
  });

  if (execution.status === "REJECTED") {
    return persistRejection(deps, {
      userId: input.userId,
      accountId: input.accountId,
      intent,
      reason: execution.reason,
      submittedAt: serverReceivedAt,
    });
  }

  const stored = await deps.persistFill({ userId: input.userId, accountId: input.accountId, fill: execution.fill });
  if (stored.ok) return { status: "FILLED", fillId: stored.data.fillId, orderId: stored.data.orderId };

  // A concurrent retry or another transaction may have committed this key
  // after the initial lookup. Resolve that deterministically before treating
  // the failed write as an error or persisting a race rejection.
  const afterFailure = await deps.findExisting({
    userId: input.userId,
    accountId: input.accountId,
    idempotencyKey: intent.idempotencyKey,
  });
  if (afterFailure.ok && afterFailure.order) return { status: "ALREADY_RECORDED", order: afterFailure.order };

  const raceReason = raceRejectReason(stored.error);
  if (raceReason) {
    return persistRejection(deps, {
      userId: input.userId,
      accountId: input.accountId,
      intent,
      reason: raceReason,
      submittedAt: serverReceivedAt,
    });
  }

  return { status: "ERROR", error: stored.error };
}
