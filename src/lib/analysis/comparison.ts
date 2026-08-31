import type { AnalysisReport, FinancialMetrics } from "./types";

export type ComparisonMetric = {
  key: string; label: string; kind: "number" | "percent" | "multiple" | "currency";
  read: (report: AnalysisReport) => number | null | undefined;
};
export type ComparisonGroup = { id: "valuation" | "growth" | "profitability" | "financialHealth" | "quality"; label: string; metrics: ComparisonMetric[] };

const eng = (report: AnalysisReport): Partial<FinancialMetrics> | undefined => report.engine?.metrics;
export const comparisonGroups: ComparisonGroup[] = [
  { id: "valuation", label: "Valuation", metrics: [
    { key: "pe", label: "P/E", kind: "multiple", read: (r) => eng(r)?.valuation?.priceEarnings },
    { key: "ps", label: "P/S", kind: "multiple", read: (r) => eng(r)?.valuation?.priceSales },
    { key: "pb", label: "P/B", kind: "multiple", read: (r) => eng(r)?.valuation?.priceBook },
    { key: "evEbitda", label: "EV / EBITDA", kind: "multiple", read: (r) => eng(r)?.valuation?.evEbitda },
    { key: "evSales", label: "EV / Sales", kind: "multiple", read: (r) => eng(r)?.valuation?.evSales },
    { key: "fcfYield", label: "FCF yield", kind: "percent", read: (r) => eng(r)?.valuation?.freeCashFlowYield },
    { key: "earningsYield", label: "Earnings yield", kind: "percent", read: (r) => eng(r)?.valuation?.earningsYield },
    { key: "peg", label: "PEG", kind: "multiple", read: (r) => eng(r)?.valuation?.peg },
  ]},
  { id: "growth", label: "Growth", metrics: [
    { key: "revenueGrowth", label: "Revenue growth", kind: "percent", read: (r) => eng(r)?.growth?.revenueGrowthYoY },
    { key: "revenueCagr3y", label: "Revenue CAGR 3Y", kind: "percent", read: (r) => eng(r)?.growth?.revenueCagr3y },
    { key: "epsGrowth", label: "EPS growth", kind: "percent", read: (r) => eng(r)?.growth?.epsGrowthYoY },
    { key: "epsCagr3y", label: "EPS CAGR 3Y", kind: "percent", read: (r) => eng(r)?.growth?.epsCagr3y },
    { key: "fcfGrowth", label: "FCF growth", kind: "percent", read: (r) => eng(r)?.growth?.freeCashFlowGrowthYoY },
    { key: "fcfCagr3y", label: "FCF CAGR 3Y", kind: "percent", read: (r) => eng(r)?.growth?.freeCashFlowCagr3y },
  ]},
  { id: "profitability", label: "Profitability", metrics: [
    { key: "grossMargin", label: "Gross margin", kind: "percent", read: (r) => eng(r)?.margins?.grossMargin },
    { key: "operatingMargin", label: "Operating margin", kind: "percent", read: (r) => eng(r)?.margins?.operatingMargin },
    { key: "netMargin", label: "Net margin", kind: "percent", read: (r) => eng(r)?.margins?.netMargin },
    { key: "fcfMargin", label: "FCF margin", kind: "percent", read: (r) => eng(r)?.margins?.freeCashFlowMargin },
    { key: "roe", label: "ROE", kind: "percent", read: (r) => eng(r)?.ratios?.returnOnEquity },
    { key: "roa", label: "ROA", kind: "percent", read: (r) => eng(r)?.ratios?.returnOnAssets },
    { key: "roic", label: "ROIC", kind: "percent", read: (r) => eng(r)?.ratios?.returnOnInvestedCapital },
  ]},
  { id: "financialHealth", label: "Financial Health", metrics: [
    { key: "netDebt", label: "Net debt / cash", kind: "currency", read: (r) => eng(r)?.ratios?.netDebt },
    { key: "debtEquity", label: "Debt / equity", kind: "multiple", read: (r) => eng(r)?.ratios?.debtToEquity },
    { key: "netDebtEbitda", label: "Net debt / EBITDA", kind: "multiple", read: (r) => eng(r)?.ratios?.netDebtToEbitda },
    { key: "interestCoverage", label: "Interest coverage", kind: "multiple", read: (r) => eng(r)?.ratios?.interestCoverage },
    { key: "currentRatio", label: "Current ratio", kind: "multiple", read: (r) => eng(r)?.ratios?.currentRatio },
    { key: "cashDebt", label: "Cash / debt", kind: "multiple", read: (r) => eng(r)?.ratios?.cashToDebt },
  ]},
  { id: "quality", label: "Quality", metrics: [
    { key: "cfoNetIncome", label: "CFO / net income", kind: "multiple", read: (r) => eng(r)?.cashFlow?.cfoToNetIncome },
    { key: "fcfNetIncome", label: "FCF / net income", kind: "multiple", read: (r) => eng(r)?.cashFlow?.freeCashFlowToNetIncome },
    { key: "accrualRatio", label: "Accrual ratio", kind: "percent", read: (r) => eng(r)?.cashFlow?.accrualRatio },
    { key: "sbcRevenue", label: "SBC / revenue", kind: "percent", read: (r) => eng(r)?.cashFlow?.stockBasedCompensationToRevenue },
  ]},
];

export function reportSearchMatch(row: { ticker?: string | null; company_name?: string | null; analysis_type?: string | null }, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.ticker, row.company_name, row.analysis_type].some((v) => v?.toLowerCase().includes(q));
}
function finite(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }
function metric(report: AnalysisReport, group: ComparisonGroup["id"], key: string) {
  return comparisonGroups.find((g) => g.id === group)?.metrics.find((m) => m.key === key)?.read(report);
}
export function objectiveDifferences(reports: AnalysisReport[], locale: "en" | "sv" = "en") {
  if (reports.length < 2 || reports.length > 5) return [] as string[];
  const out: string[] = [];

  const observations: Array<{ label: string; group: ComparisonGroup["id"]; key: string; direction: "higher" | "lower" }> = [
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
  ];

  for (const observation of observations) {
    const available = reports.flatMap((report) => {
      const value = metric(report, observation.group, observation.key);
      return finite(value) ? [{ report, value }] : [];
    });
    if (available.length < 2) continue;
    const values = available.map((item) => item.value);
    if (Math.max(...values) - Math.min(...values) < 1e-9) continue;
    const standout = [...available].sort((left, right) => observation.direction === "higher" ? right.value - left.value : left.value - right.value)[0];
    if (reports.length === 2) {
      out.push(locale === "sv"
        ? `${standout.report.ticker} har ${observation.direction === "higher" ? "högre" : "lägre"} ${observation.label} i de valda rapportsnapshotsen.`
        : `${standout.report.ticker} has the ${observation.direction} ${observation.label} in the selected report snapshots.`);
    } else {
      out.push(locale === "sv"
        ? `${standout.report.ticker} har ${observation.direction === "higher" ? "högst" : "lägst"} ${observation.label} bland de valda rapportsnapshotsen.`
        : `${standout.report.ticker} has the ${observation.direction === "higher" ? "highest" : "lowest"} ${observation.label} among the selected report snapshots.`);
    }
  }

  if (reports.length === 2) {
    const [left, right] = reports;
    const leftPe = metric(left, "valuation", "pe");
    const rightPe = metric(right, "valuation", "pe");
    if (finite(leftPe) && finite(rightPe) && Math.abs(leftPe - rightPe) >= 1e-9) {
      out.push(locale === "sv"
        ? `P/E skiljer sig mellan ${left.ticker} (${leftPe.toFixed(1)}×) och ${right.ticker} (${rightPe.toFixed(1)}×); lägre P/E behandlas inte som bättre utan historisk och fundamental kontext.`
        : `P/E differs between ${left.ticker} (${leftPe.toFixed(1)}×) and ${right.ticker} (${rightPe.toFixed(1)}×); the lower P/E is not treated as better without historical and fundamental context.`);
    }
  }

  return out.slice(0, 5);
}
