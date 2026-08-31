import type {
  AnalysisArchetype,
  FinancialMetrics,
  HistoricalDiscountQuality,
  HistoricalDiscountSignal,
  HistoricalDiscountSignalStatus,
  HistoricalFinancialPoint,
  HistoricalValuationContext,
} from "./types";
import { isFiniteNumber } from "./math";

export const HISTORICAL_DISCOUNT_QUALITY_VERSION = "historical-discount-quality-v1";

const SIGNAL_WEIGHTS = {
  growth: 0.15,
  freeCashFlow: 0.15,
  roic: 0.15,
  margins: 0.15,
  leverage: 0.10,
  dilution: 0.10,
  cashConversion: 0.10,
  earningsStability: 0.10,
} as const;

const OPERATING_ARCHETYPES: AnalysisArchetype[] = ["standard", "software_growth", "cyclical", "utility"];

function signal(
  key: HistoricalDiscountSignal["key"],
  label: string,
  status: HistoricalDiscountSignalStatus,
  detail: string,
  value?: number | null,
): HistoricalDiscountSignal {
  return {
    key,
    label,
    status,
    detail,
    value: isFiniteNumber(value) ? value : null,
    weight: SIGNAL_WEIGHTS[key],
  };
}

function severityScore(status: HistoricalDiscountSignalStatus): number | null {
  if (status === "healthy") return 0;
  if (status === "warning") return 0.5;
  if (status === "severe") return 1;
  return null;
}

function growthSignal(metrics: FinancialMetrics): HistoricalDiscountSignal {
  const value = metrics.growth.revenueGrowthYoY;
  if (!isFiniteNumber(value)) return signal("growth", "Growth deterioration", "unavailable", "Comparable revenue growth is unavailable.");
  if (value <= -0.10) return signal("growth", "Growth deterioration", "severe", "Comparable revenue declined by at least 10% year over year.", value);
  if (value < 0) return signal("growth", "Growth deterioration", "warning", "Comparable revenue growth is negative.", value);
  return signal("growth", "Growth deterioration", "healthy", "Comparable revenue growth is non-negative.", value);
}

function fcfSignal(metrics: FinancialMetrics, archetype: AnalysisArchetype): HistoricalDiscountSignal {
  if (!OPERATING_ARCHETYPES.includes(archetype)) {
    return signal("freeCashFlow", "Free-cash-flow deterioration", "not_applicable", "Corporate free-cash-flow deterioration is not used for this company archetype.");
  }
  const growth = metrics.growth.freeCashFlowGrowthYoY;
  const margin = metrics.margins.freeCashFlowMargin;
  if (isFiniteNumber(margin) && margin < 0) {
    return signal("freeCashFlow", "Free-cash-flow deterioration", "severe", "Free cash flow margin is negative.", margin);
  }
  if (isFiniteNumber(growth)) {
    if (growth <= -0.20) return signal("freeCashFlow", "Free-cash-flow deterioration", "severe", "Comparable free cash flow fell by at least 20%.", growth);
    if (growth < -0.05) return signal("freeCashFlow", "Free-cash-flow deterioration", "warning", "Comparable free cash flow declined by more than 5%.", growth);
    return signal("freeCashFlow", "Free-cash-flow deterioration", "healthy", "Comparable free cash flow is not materially deteriorating.", growth);
  }
  if (isFiniteNumber(margin)) {
    if (margin < 0.05) return signal("freeCashFlow", "Free-cash-flow deterioration", "warning", "Free cash flow remains positive but the margin is below 5%.", margin);
    return signal("freeCashFlow", "Free-cash-flow deterioration", "healthy", "Free cash flow margin is positive and no comparable decline is available.", margin);
  }
  return signal("freeCashFlow", "Free-cash-flow deterioration", "unavailable", "Comparable free cash flow and FCF margin are unavailable.");
}

function finiteHistory(
  points: HistoricalFinancialPoint[],
  selector: (point: HistoricalFinancialPoint) => number | null,
): Array<{ year: number; value: number }> {
  return [...points]
    .sort((left, right) => left.fiscalYear - right.fiscalYear)
    .flatMap((point) => {
      const value = selector(point);
      return isFiniteNumber(value) ? [{ year: point.fiscalYear, value }] : [];
    });
}

function roicSignal(points: HistoricalFinancialPoint[], archetype: AnalysisArchetype): HistoricalDiscountSignal {
  if (!OPERATING_ARCHETYPES.includes(archetype)) {
    return signal("roic", "ROIC downtrend", "not_applicable", "StockBox ROIC deterioration is not used for this company archetype.");
  }
  const values = finiteHistory(points, (point) => point.returnOnInvestedCapital).slice(-4);
  if (values.length < 3) return signal("roic", "ROIC downtrend", "unavailable", "At least three comparable annual ROIC observations are required.");
  const current = values.at(-1)!.value;
  const prior = values.slice(0, -1).reduce((sum, point) => sum + point.value, 0) / (values.length - 1);
  const drop = prior - current;
  const relativeDrop = prior > 0 ? drop / prior : null;
  if (drop >= 0.05 || (isFiniteNumber(relativeDrop) && relativeDrop >= 0.35)) {
    return signal("roic", "ROIC downtrend", "severe", "Latest ROIC is materially below its recent annual baseline.", drop);
  }
  if (drop >= 0.02 || (isFiniteNumber(relativeDrop) && relativeDrop >= 0.20)) {
    return signal("roic", "ROIC downtrend", "warning", "Latest ROIC is below its recent annual baseline.", drop);
  }
  return signal("roic", "ROIC downtrend", "healthy", "Latest ROIC is broadly stable versus its recent annual baseline.", drop);
}

function marginSignal(metrics: FinancialMetrics, archetype: AnalysisArchetype): HistoricalDiscountSignal {
  if (!OPERATING_ARCHETYPES.includes(archetype)) {
    return signal("margins", "Margin compression", "not_applicable", "Operating-margin deterioration is not used for this company archetype.");
  }
  const change = metrics.trends.operatingMarginChangeYoY;
  if (!isFiniteNumber(change)) return signal("margins", "Margin compression", "unavailable", "Comparable operating-margin change is unavailable.");
  if (change <= -0.05) return signal("margins", "Margin compression", "severe", "Operating margin contracted by at least five percentage points.", change);
  if (change <= -0.02) return signal("margins", "Margin compression", "warning", "Operating margin contracted by at least two percentage points.", change);
  return signal("margins", "Margin compression", "healthy", "Operating margin is not materially compressing.", change);
}

function leverageSignal(points: HistoricalFinancialPoint[], archetype: AnalysisArchetype): HistoricalDiscountSignal {
  if (!OPERATING_ARCHETYPES.includes(archetype)) {
    return signal("leverage", "Leverage deterioration", "not_applicable", "Debt-to-equity deterioration is not compared across this company archetype.");
  }
  const values = finiteHistory(points, (point) => point.debtToEquity).slice(-2);
  if (values.length < 2) return signal("leverage", "Leverage deterioration", "unavailable", "Two comparable debt-to-equity observations are required.");
  const [prior, current] = values;
  const increase = prior.value > 0 ? current.value / prior.value - 1 : current.value > 0 ? 1 : 0;
  if ((increase >= 0.50 && current.value >= 0.75) || current.value >= 2) {
    return signal("leverage", "Leverage deterioration", "severe", "Debt-to-equity increased materially and is at an elevated level.", increase);
  }
  if (increase >= 0.25 && current.value >= 0.50) {
    return signal("leverage", "Leverage deterioration", "warning", "Debt-to-equity increased by at least 25% from the prior comparable year.", increase);
  }
  return signal("leverage", "Leverage deterioration", "healthy", "Debt-to-equity is not materially deteriorating.", increase);
}

function dilutionSignal(metrics: FinancialMetrics): HistoricalDiscountSignal {
  const value = metrics.trends.sharesDilutionYoY;
  if (!isFiniteNumber(value)) return signal("dilution", "Share dilution", "unavailable", "Comparable diluted-share growth is unavailable.");
  if (value >= 0.08) return signal("dilution", "Share dilution", "severe", "Diluted share count increased by at least 8% year over year.", value);
  if (value > 0.03) return signal("dilution", "Share dilution", "warning", "Diluted share count increased by more than 3% year over year.", value);
  return signal("dilution", "Share dilution", "healthy", "Share dilution is limited or the share count is falling.", value);
}

function cashConversionSignal(metrics: FinancialMetrics, archetype: AnalysisArchetype): HistoricalDiscountSignal {
  if (!OPERATING_ARCHETYPES.includes(archetype)) {
    return signal("cashConversion", "Cash-conversion weakness", "not_applicable", "Corporate cash-conversion quality is not used for this company archetype.");
  }
  const value = metrics.ratios.cashConversion;
  if (!isFiniteNumber(value)) return signal("cashConversion", "Cash-conversion weakness", "unavailable", "Comparable cash conversion is unavailable.");
  if (value < 0.50) return signal("cashConversion", "Cash-conversion weakness", "severe", "Less than half of reported earnings are supported by free cash flow.", value);
  if (value < 0.80) return signal("cashConversion", "Cash-conversion weakness", "warning", "Free-cash-flow conversion is below 80% of reported earnings.", value);
  return signal("cashConversion", "Cash-conversion weakness", "healthy", "Free-cash-flow conversion provides solid support for reported earnings.", value);
}

function earningsStabilitySignal(points: HistoricalFinancialPoint[], archetype: AnalysisArchetype): HistoricalDiscountSignal {
  const values = finiteHistory(points, (point) => point.eps).slice(-5);
  if (values.length < 4) return signal("earningsStability", "Earnings instability", "unavailable", "At least four annual EPS observations are required.");
  const nonPositive = values.filter((point) => point.value <= 0).length;
  const positiveChanges: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const prior = values[index - 1].value;
    const current = values[index].value;
    if (prior > 0 && current > 0) positiveChanges.push(current / prior - 1);
  }
  const largeSwings = positiveChanges.filter((change) => Math.abs(change) >= (archetype === "cyclical" ? 0.70 : 0.50)).length;
  const mean = positiveChanges.length ? positiveChanges.reduce((sum, value) => sum + value, 0) / positiveChanges.length : 0;
  const variance = positiveChanges.length
    ? positiveChanges.reduce((sum, value) => sum + (value - mean) ** 2, 0) / positiveChanges.length
    : 0;
  const volatility = Math.sqrt(variance);
  const warningVolatility = archetype === "cyclical" ? 0.50 : 0.35;
  if (nonPositive >= 2 || largeSwings >= 2) {
    return signal("earningsStability", "Earnings instability", "severe", "Recent EPS history contains repeated losses or multiple large year-to-year swings.", volatility);
  }
  if (nonPositive === 1 || volatility >= warningVolatility) {
    return signal("earningsStability", "Earnings instability", "warning", "Recent EPS history contains a loss year or elevated year-to-year volatility.", volatility);
  }
  return signal("earningsStability", "Earnings instability", "healthy", "Recent EPS history is comparatively stable.", volatility);
}

function classify(deteriorationScore: number, discount: number) {
  if (deteriorationScore <= 0.10) return discount <= -0.10 ? "STRONG" as const : "REASONABLE" as const;
  if (deteriorationScore <= 0.25) return "REASONABLE" as const;
  if (deteriorationScore <= 0.45) return "MIXED" as const;
  if (deteriorationScore <= 0.65) return "QUESTIONABLE" as const;
  return "MISLEADING" as const;
}

export function evaluateHistoricalDiscountQuality(input: {
  valuation: HistoricalValuationContext | undefined;
  metrics: FinancialMetrics;
  financials: HistoricalFinancialPoint[];
  archetype: AnalysisArchetype;
}): HistoricalDiscountQuality {
  const currentPe = input.valuation?.currentPriceEarnings ?? null;
  const medianPe = input.valuation?.referencePriceEarningsMedian ?? null;
  const discount = isFiniteNumber(currentPe) && currentPe > 0 && isFiniteNumber(medianPe) && medianPe > 0
    ? currentPe / medianPe - 1
    : null;
  const signals = [
    growthSignal(input.metrics),
    fcfSignal(input.metrics, input.archetype),
    roicSignal(input.financials, input.archetype),
    marginSignal(input.metrics, input.archetype),
    leverageSignal(input.financials, input.archetype),
    dilutionSignal(input.metrics),
    cashConversionSignal(input.metrics, input.archetype),
    earningsStabilitySignal(input.financials, input.archetype),
  ];
  const applicable = signals.filter((item) => item.status !== "not_applicable");
  const evaluated = applicable.filter((item) => severityScore(item.status) !== null);
  const applicableWeight = applicable.reduce((sum, item) => sum + item.weight, 0);
  const evaluatedWeight = evaluated.reduce((sum, item) => sum + item.weight, 0);
  const coverage = applicableWeight > 0 ? evaluatedWeight / applicableWeight : 0;
  const weightedDeterioration = evaluated.reduce((sum, item) => sum + item.weight * (severityScore(item.status) ?? 0), 0);
  const deteriorationScore = evaluatedWeight > 0 ? weightedDeterioration / evaluatedWeight : null;

  if (discount === null || !input.valuation) {
    return {
      methodVersion: HISTORICAL_DISCOUNT_QUALITY_VERSION,
      status: "insufficient",
      classification: "INSUFFICIENT DATA",
      discountToReferenceMedian: discount,
      referenceWindow: input.valuation?.referenceWindow ?? null,
      coverage,
      evaluatedSignalCount: evaluated.length,
      applicableSignalCount: applicable.length,
      deteriorationScore,
      signals,
      summary: "Historical discount quality cannot be assessed without a valid current P/E and historical reference median.",
    };
  }
  if (discount >= 0) {
    return {
      methodVersion: HISTORICAL_DISCOUNT_QUALITY_VERSION,
      status: "not_discount",
      classification: null,
      discountToReferenceMedian: discount,
      referenceWindow: input.valuation.referenceWindow,
      coverage,
      evaluatedSignalCount: evaluated.length,
      applicableSignalCount: applicable.length,
      deteriorationScore,
      signals,
      summary: "Current P/E is not below the selected historical reference median, so discount-quality classification is not applicable.",
    };
  }
  if (evaluated.length < 4 || coverage < 0.60 || deteriorationScore === null) {
    return {
      methodVersion: HISTORICAL_DISCOUNT_QUALITY_VERSION,
      status: "discount",
      classification: "INSUFFICIENT DATA",
      discountToReferenceMedian: discount,
      referenceWindow: input.valuation.referenceWindow,
      coverage,
      evaluatedSignalCount: evaluated.length,
      applicableSignalCount: applicable.length,
      deteriorationScore,
      signals,
      summary: "Current P/E is below history, but there is not enough comparable deterioration evidence to judge the quality of the discount.",
    };
  }
  const classification = classify(deteriorationScore, discount);
  const warnings = evaluated.filter((item) => item.status === "warning" || item.status === "severe");
  return {
    methodVersion: HISTORICAL_DISCOUNT_QUALITY_VERSION,
    status: "discount",
    classification,
    discountToReferenceMedian: discount,
    referenceWindow: input.valuation.referenceWindow,
    coverage,
    evaluatedSignalCount: evaluated.length,
    applicableSignalCount: applicable.length,
    deteriorationScore,
    signals,
    summary: warnings.length
      ? `${warnings.length} deterioration signal${warnings.length === 1 ? "" : "s"} reduce the quality of the historical P/E discount.`
      : "No material deterioration signal was found in the comparable evidence used by this versioned rule set.",
  };
}
