export const INVESTOR_METRICS = [
  { key: "price", label: "Price", group: "price", input: "number" },
  { key: "score", label: "StockBox Score", group: "stockbox", input: "number" },
  { key: "personalizedScore", label: "Profile Score", group: "stockbox", input: "number" },
  { key: "confidence", label: "Confidence", group: "stockbox", input: "percent" },
  { key: "coverage", label: "Data coverage", group: "stockbox", input: "percent" },
  { key: "fairValueUpside", label: "Fair value upside", group: "valuation", input: "percent" },
  { key: "valuation.pe", label: "P/E", group: "valuation", input: "number" },
  { key: "valuation.forwardPe", label: "Forward P/E", group: "valuation", input: "number" },
  { key: "valuation.fcfYield", label: "FCF yield", group: "valuation", input: "percent" },
  { key: "valuation.dividendYield", label: "Dividend yield", group: "dividend", input: "percent" },
  { key: "valuation.historicalPePercentile", label: "Historical P/E percentile", group: "valuation", input: "percent" },
  { key: "fundamentals.revenueGrowth", label: "Revenue growth", group: "fundamental", input: "percent" },
  { key: "fundamentals.epsGrowth", label: "EPS growth", group: "fundamental", input: "percent" },
  { key: "fundamentals.fcf", label: "Free cash flow", group: "fundamental", input: "number" },
  { key: "fundamentals.fcfGrowth", label: "FCF growth", group: "fundamental", input: "percent" },
  { key: "fundamentals.fcfMargin", label: "FCF margin", group: "fundamental", input: "percent" },
  { key: "fundamentals.grossMargin", label: "Gross margin", group: "fundamental", input: "percent" },
  { key: "fundamentals.operatingMargin", label: "Operating margin", group: "fundamental", input: "percent" },
  { key: "fundamentals.netMargin", label: "Net margin", group: "fundamental", input: "percent" },
  { key: "fundamentals.roic", label: "ROIC", group: "quality", input: "percent" },
  { key: "fundamentals.roe", label: "ROE", group: "quality", input: "percent" },
  { key: "fundamentals.netDebtToEbitda", label: "Net debt / EBITDA", group: "risk", input: "number" },
  { key: "dividend.yield", label: "Dividend yield", group: "dividend", input: "percent" },
  { key: "dividend.payoutRatio", label: "Payout ratio", group: "dividend", input: "percent" },
  { key: "dividend.fcfPayoutRatio", label: "FCF payout ratio", group: "dividend", input: "percent" },
  { key: "dividend.growth", label: "Dividend growth", group: "dividend", input: "percent" },
  { key: "estimates.revenueGrowth", label: "Revenue estimate growth", group: "estimates", input: "percent" },
  { key: "estimates.epsGrowth", label: "EPS estimate growth", group: "estimates", input: "percent" },
] as const;

export type InvestorMetricKey = typeof INVESTOR_METRICS[number]["key"];
export type InvestorMetric = typeof INVESTOR_METRICS[number];

export function getInvestorMetric(key: string): InvestorMetric | null {
  return INVESTOR_METRICS.find((metric) => metric.key === key) ?? null;
}

export function metricInputToCanonical(metric: InvestorMetric, value: number) {
  return metric.input === "percent" ? value / 100 : value;
}

export function canonicalMetricToDisplay(metric: InvestorMetric, value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return metric.input === "percent" ? `${(value * 100).toFixed(1)}%` : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
