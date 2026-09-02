export type MoneyOre = bigint;
export type QuantityMicros = bigint;

export const QUANTITY_SCALE = 1_000_000n;

export type PaperPosition = {
  symbol: string;
  quantityMicros: QuantityMicros;
  costBasisOre: MoneyOre;
  realizedPnlOre: MoneyOre;
};

export type PaperBuyInput = {
  symbol: string;
  quantityMicros: QuantityMicros;
  executionPriceOre: MoneyOre;
  feeOre?: MoneyOre;
};

export type PaperSellInput = {
  quantityMicros: QuantityMicros;
  executionPriceOre: MoneyOre;
  feeOre?: MoneyOre;
};

export type PaperTradeResult = {
  position: PaperPosition | null;
  cashDeltaOre: MoneyOre;
  realizedPnlDeltaOre: MoneyOre;
  grossTradeValueOre: MoneyOre;
  relievedCostBasisOre: MoneyOre;
};

function assertPositive(value: bigint, label: string) {
  if (value <= 0n) throw new Error(`${label} must be greater than zero.`);
}

function assertNonNegative(value: bigint, label: string) {
  if (value < 0n) throw new Error(`${label} must not be negative.`);
}

function divideRounded(numerator: bigint, denominator: bigint) {
  if (denominator === 0n) throw new Error("Cannot divide by zero.");
  return (numerator + denominator / 2n) / denominator;
}

export function tradeValueOre(quantityMicros: QuantityMicros, executionPriceOre: MoneyOre) {
  assertPositive(quantityMicros, "quantityMicros");
  assertPositive(executionPriceOre, "executionPriceOre");
  return divideRounded(quantityMicros * executionPriceOre, QUANTITY_SCALE);
}

export function averageCostOre(position: PaperPosition) {
  if (position.quantityMicros === 0n) return 0n;
  return divideRounded(position.costBasisOre * QUANTITY_SCALE, position.quantityMicros);
}

export function applyPaperBuy(position: PaperPosition | null, input: PaperBuyInput): PaperTradeResult {
  assertPositive(input.quantityMicros, "quantityMicros");
  assertPositive(input.executionPriceOre, "executionPriceOre");
  const feeOre = input.feeOre ?? 0n;
  assertNonNegative(feeOre, "feeOre");

  if (position && position.symbol !== input.symbol) {
    throw new Error("Cannot apply a buy to a different symbol position.");
  }

  const grossTradeValueOre = tradeValueOre(input.quantityMicros, input.executionPriceOre);
  const nextPosition: PaperPosition = {
    symbol: input.symbol,
    quantityMicros: (position?.quantityMicros ?? 0n) + input.quantityMicros,
    costBasisOre: (position?.costBasisOre ?? 0n) + grossTradeValueOre + feeOre,
    realizedPnlOre: position?.realizedPnlOre ?? 0n
  };

  return {
    position: nextPosition,
    cashDeltaOre: -(grossTradeValueOre + feeOre),
    realizedPnlDeltaOre: 0n,
    grossTradeValueOre,
    relievedCostBasisOre: 0n
  };
}

export function applyPaperSell(position: PaperPosition, input: PaperSellInput): PaperTradeResult {
  assertPositive(input.quantityMicros, "quantityMicros");
  assertPositive(input.executionPriceOre, "executionPriceOre");
  const feeOre = input.feeOre ?? 0n;
  assertNonNegative(feeOre, "feeOre");

  if (input.quantityMicros > position.quantityMicros) {
    throw new Error("Cannot sell more than the current paper position.");
  }

  const grossTradeValueOre = tradeValueOre(input.quantityMicros, input.executionPriceOre);
  const relievedCostBasisOre = divideRounded(position.costBasisOre * input.quantityMicros, position.quantityMicros);
  const realizedPnlDeltaOre = grossTradeValueOre - feeOre - relievedCostBasisOre;
  const remainingQuantity = position.quantityMicros - input.quantityMicros;
  const remainingCostBasis = position.costBasisOre - relievedCostBasisOre;
  const nextRealizedPnl = position.realizedPnlOre + realizedPnlDeltaOre;

  return {
    position:
      remainingQuantity === 0n
        ? null
        : {
            symbol: position.symbol,
            quantityMicros: remainingQuantity,
            costBasisOre: remainingCostBasis,
            realizedPnlOre: nextRealizedPnl
          },
    cashDeltaOre: grossTradeValueOre - feeOre,
    realizedPnlDeltaOre,
    grossTradeValueOre,
    relievedCostBasisOre
  };
}

export function unrealizedPnlOre(position: PaperPosition, marketPriceOre: MoneyOre) {
  const marketValueOre = tradeValueOre(position.quantityMicros, marketPriceOre);
  return marketValueOre - position.costBasisOre;
}
