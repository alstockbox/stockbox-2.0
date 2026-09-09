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

export type PortfolioLedgerPerformance = {
  costBasisBaseByPosition: Map<string, number | null>;
  realizedProfitLossBase: number | null;
  dividendIncomeBase: number | null;
  standaloneFeesBase: number | null;
  tradingFeesBase: number | null;
  totalFeesBase: number | null;
};

const EPSILON = 1e-10;

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveRate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normalizedTicker(value: string) {
  return value.trim().toUpperCase();
}

function normalizedCurrency(value: string) {
  return value.trim().toUpperCase();
}

function transactionSort(left: PortfolioTransactionInput, right: PortfolioTransactionInput) {
  const dateOrder = left.executedAt.localeCompare(right.executedAt);
  if (dateOrder !== 0) return dateOrder;
  return (left.id ?? "").localeCompare(right.id ?? "");
}

export function buildPortfolioPositions(transactions: PortfolioTransactionInput[]): PortfolioPosition[] {
  const sorted = [...transactions].sort(transactionSort);
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

export function calculatePortfolioLedgerPerformance(
  transactions: PortfolioTransactionInput[],
  fxToBaseByTransactionId: ReadonlyMap<string, number | null>,
): PortfolioLedgerPerformance {
  const states = new Map<string, { quantity: number; baseCost: number | null }>();
  let realizedProfitLossBase = 0;
  let realizedComplete = true;
  let dividendIncomeBase = 0;
  let dividendsComplete = true;
  let standaloneFeesBase = 0;
  let standaloneFeesComplete = true;
  let tradingFeesBase = 0;
  let tradingFeesComplete = true;

  for (const transaction of [...transactions].sort(transactionSort)) {
    const ticker = normalizedTicker(transaction.ticker);
    const currency = normalizedCurrency(transaction.currency);
    if (!ticker || !/^[A-Z]{3}$/.test(currency)) continue;
    const key = `${ticker}:${currency}`;
    const rate = transaction.id ? positiveRate(fxToBaseByTransactionId.get(transaction.id)) : null;

    if (transaction.type === "buy") {
      const quantity = finiteNonNegative(transaction.quantity);
      const price = finiteNonNegative(transaction.price);
      if (quantity === null || quantity <= 0 || price === null) continue;
      const fees = finiteNonNegative(transaction.fees) ?? 0;
      const state = states.get(key) ?? { quantity: 0, baseCost: 0 };
      const nativeCost = quantity * price + fees;
      state.baseCost = state.baseCost === null || rate === null ? null : state.baseCost + nativeCost * rate;
      state.quantity += quantity;
      states.set(key, state);
      if (fees > 0) {
        if (rate === null) tradingFeesComplete = false;
        else tradingFeesBase += fees * rate;
      }
      continue;
    }

    if (transaction.type === "sell") {
      const quantity = finiteNonNegative(transaction.quantity);
      const price = finiteNonNegative(transaction.price);
      const fees = finiteNonNegative(transaction.fees) ?? 0;
      const state = states.get(key);
      if (quantity === null || quantity <= 0 || price === null || !state || state.quantity <= EPSILON) {
        realizedComplete = false;
        continue;
      }
      const soldQuantity = Math.min(quantity, state.quantity);
      if (quantity > state.quantity + EPSILON) realizedComplete = false;
      const allocatedBaseCost = state.baseCost === null ? null : (state.baseCost / state.quantity) * soldQuantity;
      if (allocatedBaseCost === null || rate === null) {
        realizedComplete = false;
      } else {
        realizedProfitLossBase += (soldQuantity * price - fees) * rate - allocatedBaseCost;
      }
      if (fees > 0) {
        if (rate === null) tradingFeesComplete = false;
        else tradingFeesBase += fees * rate;
      }
      state.quantity -= soldQuantity;
      if (state.baseCost !== null && allocatedBaseCost !== null) {
        state.baseCost = Math.max(0, state.baseCost - allocatedBaseCost);
      }
      if (state.quantity <= EPSILON) states.delete(key);
      else states.set(key, state);
      continue;
    }

    const cashAmount = finiteNonNegative(transaction.cashAmount);
    if (cashAmount === null) continue;
    if (transaction.type === "dividend") {
      if (rate === null) dividendsComplete = false;
      else dividendIncomeBase += cashAmount * rate;
    } else if (transaction.type === "fee") {
      if (rate === null) standaloneFeesComplete = false;
      else standaloneFeesBase += cashAmount * rate;
    }
  }

  const costBasisBaseByPosition = new Map(
    [...states.entries()].map(([key, state]) => [key, state.baseCost] as const),
  );
  const realized = realizedComplete ? realizedProfitLossBase : null;
  const dividends = dividendsComplete ? dividendIncomeBase : null;
  const standaloneFees = standaloneFeesComplete ? standaloneFeesBase : null;
  const tradingFees = tradingFeesComplete ? tradingFeesBase : null;

  return {
    costBasisBaseByPosition,
    realizedProfitLossBase: realized,
    dividendIncomeBase: dividends,
    standaloneFeesBase: standaloneFees,
    tradingFeesBase: tradingFees,
    totalFeesBase: tradingFees === null || standaloneFees === null ? null : tradingFees + standaloneFees,
  };
}

export function calculatePortfolioTotalProfitLoss(input: {
  realizedProfitLossBase: number | null;
  unrealizedProfitLossBase: number | null;
  dividendIncomeBase: number | null;
  standaloneFeesBase: number | null;
}) {
  const realized = finiteNumber(input.realizedProfitLossBase);
  const unrealized = finiteNumber(input.unrealizedProfitLossBase);
  const dividends = finiteNumber(input.dividendIncomeBase);
  const standaloneFees = finiteNumber(input.standaloneFeesBase);
  if (realized === null || unrealized === null || dividends === null || standaloneFees === null) return null;
  return realized + unrealized + dividends - standaloneFees;
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
