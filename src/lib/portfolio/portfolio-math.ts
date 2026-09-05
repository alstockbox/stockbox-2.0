export type PortfolioTransactionType = "buy" | "sell" | "fee" | "dividend";

export type PortfolioTransactionInput = {
  id?: string;
  ticker: string;
  type: PortfolioTransactionType;
  quantity?: number | null;
  price?: number | null;
  cashAmount?: number | null;
  fees?: number | null;
  currency: string;
  executedAt: string;
};

export type PortfolioPosition = {
  ticker: string;
  currency: string;
  quantity: number;
  costBasis: number;
  averagePurchasePrice: number;
  firstPurchaseDate: string | null;
  lastTransactionDate: string | null;
};

export type ValuedPortfolioPosition = PortfolioPosition & {
  currentPrice: number | null;
  marketCurrency: string | null;
  currentMarketValue: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercent: number | null;
  costBasisBase: number | null;
  marketValueBase: number | null;
  unrealizedProfitLossBase: number | null;
  weight: number | null;
  valuationStatus: "available" | "missing_price" | "missing_fx";
};

export type PortfolioTotals = {
  investedCapital: number | null;
  marketValue: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercent: number | null;
  complete: boolean;
};

export type PortfolioLedgerIssueCode = "INVALID_BUY" | "INVALID_SELL" | "SELL_EXCEEDS_POSITION";

export type PortfolioLedgerIssue = {
  code: PortfolioLedgerIssueCode;
  transactionId: string | null;
  ticker: string;
  currency: string;
  executedAt: string;
  requestedQuantity: number | null;
  availableQuantity: number;
};

export type RealizedPortfolioCurrencyResult = {
  currency: string;
  grossProceeds: number;
  costBasisSold: number;
  sellFees: number;
  realizedProfitLoss: number;
  sales: number;
};

export type RealizedPortfolioPerformance = {
  byCurrency: RealizedPortfolioCurrencyResult[];
  issues: PortfolioLedgerIssue[];
  complete: boolean;
};

const EPSILON = 1e-10;

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizedTicker(value: string) {
  return value.trim().toUpperCase();
}

function normalizedCurrency(value: string) {
  return value.trim().toUpperCase();
}

function sortedTransactions(transactions: PortfolioTransactionInput[]) {
  return [...transactions].sort((left, right) => {
    const dateOrder = left.executedAt.localeCompare(right.executedAt);
    if (dateOrder !== 0) return dateOrder;
    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}

export function buildPortfolioPositions(transactions: PortfolioTransactionInput[]): PortfolioPosition[] {
  const sorted = sortedTransactions(transactions);
  const positions = new Map<string, PortfolioPosition>();

  for (const transaction of sorted) {
    const ticker = normalizedTicker(transaction.ticker);
    const currency = normalizedCurrency(transaction.currency);
    if (!ticker || !/^[A-Z]{3}$/.test(currency)) continue;
    const key = `${ticker}:${currency}`;
    const position = positions.get(key) ?? {
      ticker,
      currency,
      quantity: 0,
      costBasis: 0,
      averagePurchasePrice: 0,
      firstPurchaseDate: null,
      lastTransactionDate: null,
    };
    const fees = finiteNonNegative(transaction.fees) ?? 0;

    if (transaction.type === "buy") {
      const quantity = finiteNonNegative(transaction.quantity);
      const price = finiteNonNegative(transaction.price);
      if (quantity === null || quantity <= 0 || price === null) continue;
      position.costBasis += quantity * price + fees;
      position.quantity += quantity;
      position.firstPurchaseDate ??= transaction.executedAt;
    } else if (transaction.type === "sell") {
      const quantity = finiteNonNegative(transaction.quantity);
      if (quantity === null || quantity <= 0 || position.quantity <= EPSILON) continue;
      const soldQuantity = Math.min(quantity, position.quantity);
      const averageCost = position.costBasis / position.quantity;
      position.quantity -= soldQuantity;
      position.costBasis = Math.max(0, position.costBasis - averageCost * soldQuantity);
    }

    position.lastTransactionDate = transaction.executedAt;
    if (position.quantity <= EPSILON) {
      positions.delete(key);
      continue;
    }
    position.averagePurchasePrice = position.costBasis / position.quantity;
    positions.set(key, position);
  }

  return [...positions.values()].sort((left, right) => left.ticker.localeCompare(right.ticker));
}

/**
 * Calculates realized trading P/L without mixing currencies or inventing FX.
 * Any invalid buy/sell or oversell makes the result incomplete and suppresses
 * all monetary aggregates, so callers cannot accidentally present partial
 * realized performance as authoritative.
 */
export function calculateRealizedPortfolioPerformance(
  transactions: PortfolioTransactionInput[],
): RealizedPortfolioPerformance {
  const states = new Map<string, { quantity: number; costBasis: number }>();
  const totals = new Map<string, RealizedPortfolioCurrencyResult>();
  const issues: PortfolioLedgerIssue[] = [];

  for (const transaction of sortedTransactions(transactions)) {
    if (transaction.type !== "buy" && transaction.type !== "sell") continue;
    const ticker = normalizedTicker(transaction.ticker);
    const currency = normalizedCurrency(transaction.currency);
    if (!ticker || !/^[A-Z]{3}$/.test(currency)) continue;
    const key = `${ticker}:${currency}`;
    const state = states.get(key) ?? { quantity: 0, costBasis: 0 };
    const quantity = finiteNonNegative(transaction.quantity);
    const price = finiteNonNegative(transaction.price);
    const fees = finiteNonNegative(transaction.fees) ?? 0;

    if (transaction.type === "buy") {
      if (quantity === null || quantity <= 0 || price === null) {
        issues.push({
          code: "INVALID_BUY",
          transactionId: transaction.id ?? null,
          ticker,
          currency,
          executedAt: transaction.executedAt,
          requestedQuantity: quantity,
          availableQuantity: state.quantity,
        });
        continue;
      }
      state.quantity += quantity;
      state.costBasis += quantity * price + fees;
      states.set(key, state);
      continue;
    }

    if (quantity === null || quantity <= 0 || price === null) {
      issues.push({
        code: "INVALID_SELL",
        transactionId: transaction.id ?? null,
        ticker,
        currency,
        executedAt: transaction.executedAt,
        requestedQuantity: quantity,
        availableQuantity: state.quantity,
      });
      continue;
    }
    if (state.quantity <= EPSILON || quantity - state.quantity > EPSILON) {
      issues.push({
        code: "SELL_EXCEEDS_POSITION",
        transactionId: transaction.id ?? null,
        ticker,
        currency,
        executedAt: transaction.executedAt,
        requestedQuantity: quantity,
        availableQuantity: state.quantity,
      });
      continue;
    }

    const averageCost = state.costBasis / state.quantity;
    const costBasisSold = averageCost * quantity;
    const grossProceeds = price * quantity;
    const realizedProfitLoss = grossProceeds - fees - costBasisSold;
    const currencyTotal = totals.get(currency) ?? {
      currency,
      grossProceeds: 0,
      costBasisSold: 0,
      sellFees: 0,
      realizedProfitLoss: 0,
      sales: 0,
    };
    currencyTotal.grossProceeds += grossProceeds;
    currencyTotal.costBasisSold += costBasisSold;
    currencyTotal.sellFees += fees;
    currencyTotal.realizedProfitLoss += realizedProfitLoss;
    currencyTotal.sales += 1;
    totals.set(currency, currencyTotal);

    state.quantity -= quantity;
    state.costBasis = Math.max(0, state.costBasis - costBasisSold);
    if (state.quantity <= EPSILON) states.delete(key);
    else states.set(key, state);
  }

  if (issues.length > 0) {
    return { byCurrency: [], issues, complete: false };
  }
  return {
    byCurrency: [...totals.values()].sort((left, right) => left.currency.localeCompare(right.currency)),
    issues: [],
    complete: true,
  };
}

export function valuePortfolioPosition(input: {
  position: PortfolioPosition;
  currentPrice: number | null;
  marketCurrency?: string | null;
  costFxToBase: number | null;
  marketFxToBase: number | null;
}): ValuedPortfolioPosition {
  const currentPrice = finiteNonNegative(input.currentPrice);
  const marketCurrency = input.marketCurrency ? normalizedCurrency(input.marketCurrency) : input.position.currency;
  if (currentPrice === null) {
    return { ...input.position, currentPrice: null, marketCurrency, currentMarketValue: null, unrealizedProfitLoss: null, unrealizedProfitLossPercent: null, costBasisBase: null, marketValueBase: null, unrealizedProfitLossBase: null, weight: null, valuationStatus: "missing_price" };
  }
  const currentMarketValue = currentPrice * input.position.quantity;
  const sameCurrency = marketCurrency === input.position.currency;
  const unrealizedProfitLoss = sameCurrency ? currentMarketValue - input.position.costBasis : null;
  const unrealizedProfitLossPercent = sameCurrency && input.position.costBasis > 0
    ? (unrealizedProfitLoss! / input.position.costBasis) * 100
    : null;
  const validCostFx = finiteNonNegative(input.costFxToBase);
  const validMarketFx = finiteNonNegative(input.marketFxToBase);
  if (validCostFx === null || validCostFx <= 0 || validMarketFx === null || validMarketFx <= 0) {
    return { ...input.position, currentPrice, marketCurrency, currentMarketValue, unrealizedProfitLoss, unrealizedProfitLossPercent, costBasisBase: null, marketValueBase: null, unrealizedProfitLossBase: null, weight: null, valuationStatus: "missing_fx" };
  }
  const costBasisBase = input.position.costBasis * validCostFx;
  const marketValueBase = currentMarketValue * validMarketFx;
  const unrealizedProfitLossBase = marketValueBase - costBasisBase;
  return {
    ...input.position,
    currentPrice,
    marketCurrency,
    currentMarketValue,
    unrealizedProfitLoss,
    unrealizedProfitLossPercent,
    costBasisBase,
    marketValueBase,
    unrealizedProfitLossBase,
    weight: null,
    valuationStatus: "available",
  };
}

export function applyPortfolioWeights(positions: ValuedPortfolioPosition[]): ValuedPortfolioPosition[] {
  const total = positions.reduce((sum, position) => sum + (position.marketValueBase ?? 0), 0);
  return positions.map((position) => ({
    ...position,
    weight: position.marketValueBase !== null && total > 0 ? position.marketValueBase / total : null,
  }));
}

export function calculatePortfolioTotals(positions: ValuedPortfolioPosition[]): PortfolioTotals {
  const complete = positions.length > 0 && positions.every((position) => position.valuationStatus === "available");
  if (!complete) {
    return { investedCapital: null, marketValue: null, unrealizedProfitLoss: null, unrealizedProfitLossPercent: null, complete: false };
  }
  const investedCapital = positions.reduce((sum, position) => sum + (position.costBasisBase ?? 0), 0);
  const marketValue = positions.reduce((sum, position) => sum + (position.marketValueBase ?? 0), 0);
  const unrealizedProfitLoss = marketValue - investedCapital;
  return {
    investedCapital,
    marketValue,
    unrealizedProfitLoss,
    unrealizedProfitLossPercent: investedCapital > 0 ? (unrealizedProfitLoss / investedCapital) * 100 : null,
    complete: true,
  };
}

export function weightedAverage(values: Array<{ value: number | null | undefined; weight: number | null | undefined }>) {
  let weighted = 0;
  let weightSum = 0;
  for (const item of values) {
    if (typeof item.value !== "number" || !Number.isFinite(item.value) || typeof item.weight !== "number" || !Number.isFinite(item.weight) || item.weight <= 0) continue;
    weighted += item.value * item.weight;
    weightSum += item.weight;
  }
  return weightSum > 0 ? weighted / weightSum : null;
}

export function diversificationScore(weights: number[]) {
  const valid = weights.filter((weight) => Number.isFinite(weight) && weight > 0);
  if (valid.length <= 1) return valid.length === 1 ? 0 : null;
  const sum = valid.reduce((total, weight) => total + weight, 0);
  if (sum <= 0) return null;
  const normalized = valid.map((weight) => weight / sum);
  const hhi = normalized.reduce((total, weight) => total + weight * weight, 0);
  const minimumHhi = 1 / normalized.length;
  return Math.max(0, Math.min(100, ((1 - hhi) / (1 - minimumHhi)) * 100));
}
