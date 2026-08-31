import type {
  CompanyMetricSnapshot,
  MaterialChange,
  MaterialChangeCategory,
  Materiality,
} from "./types";

type MetricPolicy = {
  key: string;
  category: MaterialChangeCategory;
  label: string;
};

const CORE_METRICS: MetricPolicy[] = [
  { key: "price", category: "price", label: "Price" },
  { key: "score", category: "stockbox", label: "StockBox Score" },
  { key: "personalizedScore", category: "stockbox", label: "Profile Score" },
  { key: "confidence", category: "stockbox", label: "Confidence" },
  { key: "coverage", category: "stockbox", label: "Coverage" },
  { key: "fairValue", category: "valuation", label: "Fair value" },
  { key: "fairValueUpside", category: "valuation", label: "Fair-value upside" },
  { key: "valuation.pe", category: "valuation", label: "P/E" },
  { key: "valuation.forwardPe", category: "valuation", label: "Forward P/E" },
  { key: "valuation.ps", category: "valuation", label: "P/S" },
  { key: "valuation.evSales", category: "valuation", label: "EV/Sales" },
  { key: "valuation.evEbitda", category: "valuation", label: "EV/EBITDA" },
  { key: "valuation.fcfYield", category: "valuation", label: "FCF yield" },
  { key: "valuation.historicalPePercentile", category: "valuation", label: "Historical P/E percentile" },
  { key: "fundamentals.revenueGrowth", category: "business", label: "Revenue growth" },
  { key: "fundamentals.epsGrowth", category: "business", label: "EPS growth" },
  { key: "fundamentals.fcf", category: "business", label: "Free cash flow" },
  { key: "fundamentals.fcfGrowth", category: "business", label: "FCF growth" },
  { key: "fundamentals.fcfMargin", category: "business", label: "FCF margin" },
  { key: "fundamentals.grossMargin", category: "business", label: "Gross margin" },
  { key: "fundamentals.operatingMargin", category: "business", label: "Operating margin" },
  { key: "fundamentals.netMargin", category: "business", label: "Net margin" },
  { key: "fundamentals.roic", category: "business", label: "ROIC" },
  { key: "fundamentals.roe", category: "business", label: "ROE" },
  { key: "fundamentals.netDebt", category: "risk", label: "Net debt" },
  { key: "fundamentals.netDebtToEbitda", category: "risk", label: "Net debt / EBITDA" },
  { key: "dividend.yield", category: "dividend", label: "Dividend yield" },
  { key: "dividend.payoutRatio", category: "dividend", label: "Payout ratio" },
  { key: "dividend.fcfPayoutRatio", category: "dividend", label: "FCF payout ratio" },
  { key: "dividend.growth", category: "dividend", label: "Dividend growth" },
  { key: "dividend.dividendPerShare", category: "dividend", label: "Dividend per share" },
  { key: "estimates.revenueGrowth", category: "estimates", label: "Revenue estimate growth" },
  { key: "estimates.epsGrowth", category: "estimates", label: "EPS estimate growth" },
  { key: "estimates.fcfGrowth", category: "estimates", label: "FCF estimate growth" },
  { key: "estimates.targetPrice", category: "estimates", label: "Analyst target price" },
];

function readMetric(snapshot: CompanyMetricSnapshot, metricKey: string): number | null {
  let current: unknown = snapshot;
  for (const part of metricKey.split(".")) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function relativeChange(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function crossesBoundary(previous: number, current: number, boundary: number) {
  return (previous < boundary && current >= boundary) || (previous > boundary && current <= boundary);
}

function classify(policy: MetricPolicy, previous: number | null, current: number | null): { materiality: Materiality; reasoning: string } {
  if (previous === null || current === null) {
    return {
      materiality: "MINOR",
      reasoning: `${policy.label} availability changed. This is a data-coverage change, not a financial conclusion.`,
    };
  }

  const absolute = current - previous;
  const relative = relativeChange(previous, current);

  if (policy.key === "fundamentals.fcf" && previous > 0 && current < 0) {
    return { materiality: "IMPORTANT", reasoning: "Free cash flow moved from positive to negative, which can affect valuation and financial resilience." };
  }

  if (["fundamentals.operatingMargin", "fundamentals.grossMargin", "fundamentals.netMargin", "fundamentals.fcfMargin"].includes(policy.key)) {
    if (absolute <= -0.05) return { materiality: "IMPORTANT", reasoning: `${policy.label} deteriorated by ${Math.abs(absolute * 100).toFixed(1)} percentage points.` };
    return { materiality: "MINOR", reasoning: `${policy.label} changed by ${(absolute * 100).toFixed(1)} percentage points.` };
  }

  if (["fundamentals.revenueGrowth", "fundamentals.epsGrowth", "fundamentals.fcfGrowth"].includes(policy.key)) {
    if (absolute <= -0.05) return { materiality: "IMPORTANT", reasoning: `${policy.label} slowed materially versus the prior snapshot.` };
    return { materiality: "MINOR", reasoning: `${policy.label} changed versus the prior snapshot.` };
  }

  if (policy.key === "price") {
    if (relative !== null && Math.abs(relative) >= 0.1) return { materiality: "IMPORTANT", reasoning: `Price moved ${(relative * 100).toFixed(1)}%, large enough to materially affect valuation context.` };
    return { materiality: "MINOR", reasoning: `Price moved ${relative === null ? "from its previous level" : `${(relative * 100).toFixed(1)}%`}; price movement alone does not imply a thesis change.` };
  }

  if (policy.key === "score" || policy.key === "personalizedScore") {
    if (Math.abs(absolute) >= 8) return { materiality: "IMPORTANT", reasoning: `${policy.label} changed by ${absolute.toFixed(1)} points.` };
    return { materiality: "MINOR", reasoning: `${policy.label} changed by ${absolute.toFixed(1)} points.` };
  }

  if (policy.key === "confidence" || policy.key === "coverage") {
    if (absolute <= -0.15) return { materiality: "IMPORTANT", reasoning: `${policy.label} dropped materially; conclusions should be reviewed with lower data certainty.` };
    return { materiality: "MINOR", reasoning: `${policy.label} changed modestly.` };
  }

  if (policy.key === "fairValueUpside") {
    if (Math.abs(absolute) >= 0.1) return { materiality: "IMPORTANT", reasoning: `Fair-value upside changed by ${(absolute * 100).toFixed(1)} percentage points.` };
    return { materiality: "MINOR", reasoning: "Fair-value upside changed, but not enough on its own to be classified as important." };
  }

  if (policy.key === "valuation.historicalPePercentile") {
    if (crossesBoundary(previous, current, 0.25) || crossesBoundary(previous, current, 0.75)) {
      return { materiality: "IMPORTANT", reasoning: "Historical P/E percentile crossed a valuation quartile boundary." };
    }
    return { materiality: "MINOR", reasoning: "Historical P/E percentile changed within the same broad valuation zone." };
  }

  if (policy.key === "dividend.dividendPerShare" && previous > 0 && current < previous * 0.95) {
    return { materiality: "IMPORTANT", reasoning: "Dividend per share decreased materially versus the previous snapshot." };
  }

  if (policy.key === "fundamentals.netDebtToEbitda") {
    if (absolute >= 0.75 || crossesBoundary(previous, current, 2)) return { materiality: "IMPORTANT", reasoning: "Leverage increased enough to change financial-risk context." };
    return { materiality: "MINOR", reasoning: "Leverage changed modestly." };
  }

  if (policy.category === "valuation" && relative !== null && Math.abs(relative) >= 0.15) {
    return { materiality: "IMPORTANT", reasoning: `${policy.label} changed materially relative to the prior snapshot.` };
  }

  if (policy.category === "estimates" && relative !== null && Math.abs(relative) >= 0.08) {
    return { materiality: "IMPORTANT", reasoning: `${policy.label} was revised materially.` };
  }

  return { materiality: "MINOR", reasoning: `${policy.label} changed versus the previous valid snapshot.` };
}

export function detectMaterialChanges(input: {
  previous: CompanyMetricSnapshot;
  current: CompanyMetricSnapshot;
  thesisFailures?: Set<string>;
}): MaterialChange[] {
  if (input.previous.ticker !== input.current.ticker) {
    throw new Error("Cannot compare metric snapshots for different tickers.");
  }

  const dimensionPolicies: MetricPolicy[] = Array.from(new Set([
    ...Object.keys(input.previous.dimensions),
    ...Object.keys(input.current.dimensions),
  ])).map((key) => ({ key: `dimensions.${key}`, category: "stockbox" as const, label: `${key} score` }));

  return [...CORE_METRICS, ...dimensionPolicies].flatMap((policy) => {
    const previousValue = readMetric(input.previous, policy.key);
    const currentValue = readMetric(input.current, policy.key);
    if (previousValue === currentValue) return [];

    const absoluteChange = previousValue !== null && currentValue !== null ? currentValue - previousValue : null;
    const relChange = relativeChange(previousValue, currentValue);
    const base = classify(policy, previousValue, currentValue);
    const thesisChanging = input.thesisFailures?.has(policy.key) === true;

    return [{
      metricKey: policy.key,
      category: policy.category,
      previousValue,
      currentValue,
      absoluteChange,
      relativeChange: relChange,
      materiality: thesisChanging ? "THESIS_CHANGING" : base.materiality,
      reasoning: thesisChanging
        ? `${policy.label} now violates an explicit investment thesis requirement; ${base.reasoning}`
        : base.reasoning,
    } satisfies MaterialChange];
  });
}
