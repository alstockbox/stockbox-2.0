import {
  derivePaperTradingLedgerV3,
  PAPER_TRADING_V3_DEFAULT_MAX_QUOTE_AGE_MS,
  PAPER_TRADING_V3_MAX_FUTURE_SKEW_MS,
  type PaperMarketObservationV3,
  type PaperTradingAccountStateV3,
} from "./engine-v3";

export const PAPER_TRADING_V3_FIXED_STARTING_CASH = 100_000;
export const PAPER_PERFORMANCE_V3_POLICY_VERSION = "stockbox-paper-performance-v3.0.0";

export type PaperPerformanceUnavailableReasonV3 =
  | "INVALID_ACCOUNT"
  | "LEDGER_INVALID"
  | "CASH_CURRENCY_MISMATCH"
  | "POSITION_CURRENCY_MISMATCH"
  | "QUOTE_MISSING"
  | "QUOTE_CONFLICT"
  | "QUOTE_NOT_VERIFIED"
  | "QUOTE_TICKER_MISMATCH"
  | "QUOTE_CURRENCY_MISMATCH"
  | "QUOTE_PRICE_INVALID"
  | "QUOTE_TIMESTAMP_INVALID"
  | "QUOTE_FUTURE"
  | "QUOTE_STALE";

export type PaperPerformanceResultV3 =
  | {
      status: "VERIFIED";
      rankEligible: true;
      policyVersion: typeof PAPER_PERFORMANCE_V3_POLICY_VERSION;
      pricingBasis: "VERIFIED_MARK_TO_MARKET";
      baseCurrency: string;
      startingCash: number;
      cashValue: number;
      positionsMarketValue: number;
      equity: number;
      profitLoss: number;
      returnPercent: number;
      openPositionCount: number;
      quoteCount: number;
      evaluatedAt: string;
      oldestQuoteObservedAt: string | null;
    }
  | {
      status: "UNAVAILABLE";
      rankEligible: false;
      policyVersion: typeof PAPER_PERFORMANCE_V3_POLICY_VERSION;
      reason: PaperPerformanceUnavailableReasonV3;
    };

function unavailable(reason: PaperPerformanceUnavailableReasonV3): PaperPerformanceResultV3 {
  return {
    status: "UNAVAILABLE",
    rankEligible: false,
    policyVersion: PAPER_PERFORMANCE_V3_POLICY_VERSION,
    reason,
  };
}

function normalizedCurrency(value: string): string | null {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizedTicker(value: string): string | null {
  const ticker = value.trim().toUpperCase();
  return ticker && ticker.length <= 32 ? ticker : null;
}

function finiteNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Produces a competition-safe account return only when the complete account can
 * be valued in one currency from fresh, verified provider observations.
 *
 * No FX conversion, partial mark-to-market, previous close substitution or
 * request timestamp fallback is permitted here. Missing evidence makes the
 * account temporarily ineligible for ranking instead of creating a guessed
 * performance number.
 */
export function derivePaperPerformanceV3(input: {
  baseCurrency: string;
  startingCash: number;
  state: PaperTradingAccountStateV3;
  quotes: readonly PaperMarketObservationV3[];
  evaluatedAt: string;
  maxQuoteAgeMs?: number;
}): PaperPerformanceResultV3 {
  const baseCurrency = normalizedCurrency(input.baseCurrency);
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const maxQuoteAgeMs = input.maxQuoteAgeMs ?? PAPER_TRADING_V3_DEFAULT_MAX_QUOTE_AGE_MS;
  if (
    !baseCurrency
    || input.startingCash !== PAPER_TRADING_V3_FIXED_STARTING_CASH
    || !Number.isFinite(evaluatedAtMs)
    || !Number.isFinite(maxQuoteAgeMs)
    || maxQuoteAgeMs < 0
  ) {
    return unavailable("INVALID_ACCOUNT");
  }

  if (
    input.state.cash.length !== 1
    || normalizedCurrency(input.state.cash[0]?.currency ?? "") !== baseCurrency
    || !finiteNonnegative(input.state.cash[0]?.amount ?? Number.NaN)
  ) {
    return unavailable("CASH_CURRENCY_MISMATCH");
  }

  const ledger = derivePaperTradingLedgerV3(input.state.fills);
  if (!ledger.ok) return unavailable("LEDGER_INVALID");

  const openPositions = ledger.positions.filter((position) => position.quantity > 1e-9);
  if (ledger.positions.some((position) => normalizedCurrency(position.currency) !== baseCurrency)) {
    return unavailable("POSITION_CURRENCY_MISMATCH");
  }

  const quotesByTicker = new Map<string, PaperMarketObservationV3[]>();
  for (const quote of input.quotes) {
    const ticker = normalizedTicker(quote.ticker);
    if (!ticker) continue;
    const current = quotesByTicker.get(ticker) ?? [];
    current.push(quote);
    quotesByTicker.set(ticker, current);
  }

  let positionsMarketValue = 0;
  let oldestQuoteObservedAt: string | null = null;

  for (const position of openPositions) {
    const ticker = normalizedTicker(position.ticker);
    if (!ticker) return unavailable("LEDGER_INVALID");
    const candidates = quotesByTicker.get(ticker) ?? [];
    if (candidates.length === 0) return unavailable("QUOTE_MISSING");
    if (candidates.length !== 1) return unavailable("QUOTE_CONFLICT");

    const quote = candidates[0];
    if (quote.verification !== "VERIFIED") return unavailable("QUOTE_NOT_VERIFIED");
    if (normalizedTicker(quote.ticker) !== ticker) return unavailable("QUOTE_TICKER_MISMATCH");
    if (normalizedCurrency(quote.currency ?? "") !== baseCurrency) return unavailable("QUOTE_CURRENCY_MISMATCH");
    if (quote.price === null || !finitePositive(quote.price)) return unavailable("QUOTE_PRICE_INVALID");

    const observedAtMs = quote.observedAt ? Date.parse(quote.observedAt) : Number.NaN;
    if (!Number.isFinite(observedAtMs) || !quote.provider?.trim()) return unavailable("QUOTE_TIMESTAMP_INVALID");
    if (observedAtMs > evaluatedAtMs + PAPER_TRADING_V3_MAX_FUTURE_SKEW_MS) return unavailable("QUOTE_FUTURE");
    if (evaluatedAtMs - observedAtMs > maxQuoteAgeMs) return unavailable("QUOTE_STALE");

    positionsMarketValue += position.quantity * quote.price;
    if (!oldestQuoteObservedAt || observedAtMs < Date.parse(oldestQuoteObservedAt)) {
      oldestQuoteObservedAt = quote.observedAt;
    }
  }

  const cashValue = input.state.cash[0].amount;
  const equity = cashValue + positionsMarketValue;
  const profitLoss = equity - input.startingCash;
  const returnPercent = (profitLoss / input.startingCash) * 100;
  if (![positionsMarketValue, equity, profitLoss, returnPercent].every(Number.isFinite)) {
    return unavailable("INVALID_ACCOUNT");
  }

  return {
    status: "VERIFIED",
    rankEligible: true,
    policyVersion: PAPER_PERFORMANCE_V3_POLICY_VERSION,
    pricingBasis: "VERIFIED_MARK_TO_MARKET",
    baseCurrency,
    startingCash: input.startingCash,
    cashValue,
    positionsMarketValue,
    equity,
    profitLoss,
    returnPercent,
    openPositionCount: openPositions.length,
    quoteCount: openPositions.length,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    oldestQuoteObservedAt,
  };
}