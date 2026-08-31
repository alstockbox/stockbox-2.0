import type { AnalysisReport, FinancialMetrics, InvestmentProfile } from "./types";

export type ComparisonMetricDirection = "higher_is_better" | "lower_is_better" | "contextual" | "neutral";
export type ComparisonGroupId = "valuation" | "growth" | "profitability" | "financialHealth" | "quality" | "dividend";

export type ComparisonMetric = {
  key: string;
  label: string;
  kind: "number" | "percent" | "multiple" | "currency";
  direction: ComparisonMetricDirection;
  read: (report: AnalysisReport) => number | null | undefined;
};

export type ComparisonGroup = {
  id: ComparisonGroupId;
  label: string;
  metrics: ComparisonMetric[];
};

export type ComparisonLens = {
  profile: InvestmentProfile;
  label: string;
  description: string;
  groupOrder: ComparisonGroupId[];
};

const eng = (report: AnalysisReport): Partial<FinancialMetrics> | undefined => report.engine?.metrics;
const latestHistorical = (report: AnalysisReport) => report.historical?.financials.at(-1);

export const comparisonGroups: ComparisonGroup[] = [
  {
    id: "valuation",
    label: "Valuation",
    metrics: [
      { key: "pe", label: "P/E", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.valuation?.priceEarnings },
      { key: "ps", label: "P/S", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.valuation?.priceSales },
      { key: "pb", label: "P/B", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.valuation?.priceBook },
      { key: "evEbitda", label: "EV / EBITDA", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.valuation?.evEbitda },
      { key: "evSales", label: "EV / Sales", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.valuation?.evSales },
      { key: "fcfYield", label: "FCF yield", kind: "percent", direction: "contextual", read: (r) => eng(r)?.valuation?.freeCashFlowYield },
      { key: "earningsYield", label: "Earnings yield", kind: "percent", direction: "contextual", read: (r) => eng(r)?.valuation?.earningsYield },
      { key: "peg", label: "PEG", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.valuation?.peg },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    metrics: [
      { key: "revenueGrowth", label: "Revenue growth", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.growth?.revenueGrowthYoY },
      { key: "revenueCagr3y", label: "Revenue CAGR 3Y", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.growth?.revenueCagr3y },
      { key: "epsGrowth", label: "EPS growth", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.growth?.epsGrowthYoY },
      { key: "epsCagr3y", label: "EPS CAGR 3Y", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.growth?.epsCagr3y },
      { key: "fcfGrowth", label: "FCF growth", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.growth?.freeCashFlowGrowthYoY },
      { key: "fcfCagr3y", label: "FCF CAGR 3Y", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.growth?.freeCashFlowCagr3y },
    ],
  },
  {
    id: "profitability",
    label: "Profitability",
    metrics: [
      { key: "grossMargin", label: "Gross margin", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.margins?.grossMargin },
      { key: "operatingMargin", label: "Operating margin", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.margins?.operatingMargin },
      { key: "netMargin", label: "Net margin", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.margins?.netMargin },
      { key: "fcfMargin", label: "FCF margin", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.margins?.freeCashFlowMargin },
      { key: "roe", label: "ROE", kind: "percent", direction: "contextual", read: (r) => eng(r)?.ratios?.returnOnEquity },
      { key: "roa", label: "ROA", kind: "percent", direction: "contextual", read: (r) => eng(r)?.ratios?.returnOnAssets },
      { key: "roic", label: "ROIC", kind: "percent", direction: "higher_is_better", read: (r) => eng(r)?.ratios?.returnOnInvestedCapital },
    ],
  },
  {
    id: "financialHealth",
    label: "Financial Health",
    metrics: [
      { key: "netDebt", label: "Net debt / cash", kind: "currency", direction: "neutral", read: (r) => eng(r)?.ratios?.netDebt },
      { key: "debtEquity", label: "Debt / equity", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.ratios?.debtToEquity },
      { key: "netDebtEbitda", label: "Net debt / EBITDA", kind: "multiple", direction: "lower_is_better", read: (r) => eng(r)?.ratios?.netDebtToEbitda },
      { key: "interestCoverage", label: "Interest coverage", kind: "multiple", direction: "higher_is_better", read: (r) => eng(r)?.ratios?.interestCoverage },
      { key: "currentRatio", label: "Current ratio", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.ratios?.currentRatio },
      { key: "cashDebt", label: "Cash / debt", kind: "multiple", direction: "higher_is_better", read: (r) => eng(r)?.ratios?.cashToDebt },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    metrics: [
      { key: "cfoNetIncome", label: "CFO / net income", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.cashFlow?.cfoToNetIncome },
      { key: "fcfNetIncome", label: "FCF / net income", kind: "multiple", direction: "contextual", read: (r) => eng(r)?.cashFlow?.freeCashFlowToNetIncome },
      { key: "accrualRatio", label: "Accrual ratio", kind: "percent", direction: "lower_is_better", read: (r) => eng(r)?.cashFlow?.accrualRatio },
      { key: "sbcRevenue", label: "SBC / revenue", kind: "percent", direction: "lower_is_better", read: (r) => eng(r)?.cashFlow?.stockBasedCompensationToRevenue },
    ],
  },
  {
    id: "dividend",
    label: "Dividend",
    metrics: [
      { key: "dividendYield", label: "Dividend yield", kind: "percent", direction: "contextual", read: (r) => r.historical?.valuationContext?.currentDividendYield },
      { key: "dividendCagr5y", label: "Dividend CAGR 5Y", kind: "percent", direction: "higher_is_better", read: (r) => r.historical?.dividendCagr5y },
      { key: "increaseStreak", label: "Dividend increase streak", kind: "number", direction: "higher_is_better", read: (r) => r.historical?.dividendContext?.increaseStreakYears },
      { key: "epsPayout", label: "EPS payout", kind: "percent", direction: "contextual", read: (r) => latestHistorical(r)?.payoutRatio },
      { key: "fcfPayout", label: "FCF payout", kind: "percent", direction: "contextual", read: (r) => latestHistorical(r)?.freeCashFlowPayoutRatio },
    ],
  },
];

const PROFILE_LENSES: Record<InvestmentProfile, ComparisonLens> = {
  dividend: {
    profile: "dividend",
    label: "Dividend",
    description: "Prioritizes dividend growth and resilience, balance-sheet capacity and quality before valuation context.",
    groupOrder: ["dividend", "financialHealth", "quality", "valuation", "profitability", "growth"],
  },
  growth: {
    profile: "growth",
    label: "Growth",
    description: "Prioritizes growth, margins and business quality while keeping valuation and financing risk visible.",
    groupOrder: ["growth", "profitability", "quality", "valuation", "financialHealth", "dividend"],
  },
  value: {
    profile: "value",
    label: "Value",
    description: "Prioritizes valuation context and financial resilience without assuming that the lowest multiple is cheapest.",
    groupOrder: ["valuation", "financialHealth", "quality", "profitability", "growth", "dividend"],
  },
  quality: {
    profile: "quality",
    label: "Quality",
    description: "Prioritizes cash conversion, profitability, ROIC and balance-sheet durability before valuation.",
    groupOrder: ["quality", "profitability", "financialHealth", "growth", "valuation", "dividend"],
  },
  defensive: {
    profile: "defensive",
    label: "Defensive",
    description: "Prioritizes financial resilience, quality and dividend durability before growth and valuation context.",
    groupOrder: ["financialHealth", "quality", "dividend", "profitability", "valuation", "growth"],
  },
  balanced: {
    profile: "balanced",
    label: "Balanced",
    description: "Balances quality, valuation, growth, profitability and financial health without giving an ambiguous metric an automatic win.",
    groupOrder: ["quality", "valuation", "growth", "profitability", "financialHealth", "dividend"],
  },
  long_term: {
    profile: "long_term",
    label: "Long term",
    description: "Prioritizes durable quality, financial health and long-run growth while retaining valuation context.",
    groupOrder: ["quality", "financialHealth", "growth", "profitability", "valuation", "dividend"],
  },
  short_term: {
    profile: "short_term",
    label: "Short term",
    description: "Prioritizes current growth and operating momentum proxies while keeping balance-sheet and valuation context visible.",
    groupOrder: ["growth", "profitability", "valuation", "financialHealth", "quality", "dividend"],
  },
};

export function comparisonLensForProfile(profile: InvestmentProfile): ComparisonLens {
  return PROFILE_LENSES[profile] ?? PROFILE_LENSES.balanced;
}

export function resolveComparisonProfile(reports: AnalysisReport[]): { profile: InvestmentProfile; mixed: boolean } {
  const profiles = [...new Set(reports.map((report) => report.investmentProfile).filter(Boolean))];
  if (profiles.length === 1) return { profile: profiles[0] as InvestmentProfile, mixed: false };
  return { profile: "balanced", mixed: profiles.length > 1 };
}

export type ComparisonWarningOptions = {
  fxNormalized?: boolean;
  fxTargetCurrency?: string;
};

export function comparisonWarnings(
  reports: AnalysisReport[],
  locale: "en" | "sv" = "en",
  options: ComparisonWarningOptions = {},
): string[] {
  if (reports.length < 2) return [];
  const warnings: string[] = [];
  const currencies = [...new Set(reports.map((report) => report.reportingCurrency).filter((value): value is string => Boolean(value)))];
  const archetypes = [...new Set(reports.map((report) => report.analysisArchetype).filter((value): value is NonNullable<AnalysisReport["analysisArchetype"]> => Boolean(value)))];
  const modelVersions = [...new Set(reports.map((report) => report.modelVersion).filter((value): value is string => Boolean(value)))];

  if (currencies.length > 1) {
    if (options.fxNormalized) {
      const target = options.fxTargetCurrency ?? "EUR";
      warnings.push(locale === "sv"
        ? `Valda snapshots använder olika rapporteringsvalutor. Valutadenominerade värden visas i native valuta med en extra ${target}-normalisering från ECB:s referenskurser på eller före respektive snapshot-datum. Source: ECB statistics.`
        : `Selected snapshots use different reporting currencies. Currency-denominated values stay in native currency with an additional ${target} normalization from ECB reference rates on or before each snapshot date. Source: ECB statistics.`);
    } else {
      warnings.push(locale === "sv"
        ? "Valda snapshots använder olika rapporteringsvalutor. Valutadenominerade värden visas i respektive native valuta och rankas inte direkt mot varandra."
        : "Selected snapshots use different reporting currencies. Currency-denominated values stay in native currency and are not ranked directly against each other.");
    }
  }
  if (archetypes.length > 1) {
    warnings.push(locale === "sv"
      ? "Valda snapshots använder olika affärsarketyper. Sektor- och arketypskänsliga mått ska tolkas i kontext, inte som universella vinnare."
      : "Selected snapshots use different business archetypes. Sector- and archetype-sensitive metrics should be interpreted in context, not as universal winners.");
  }
  if (modelVersions.length > 1) {
    warnings.push(locale === "sv"
      ? "Snapshots skapades med olika motorversioner. Faktiska värden visas som sparade och räknas inte om i jämförelsen."
      : "Snapshots were created with different engine versions. Facts are shown as saved and are not recalculated by comparison.");
  }
  return warnings;
}

export function reportSearchMatch(row: { ticker?: string | null; company_name?: string | null; analysis_type?: string | null }, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.ticker, row.company_name, row.analysis_type].some((v) => v?.toLowerCase().includes(q));
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function metric(report: AnalysisReport, group: ComparisonGroupId, key: string) {
  return comparisonGroups.find((g) => g.id === group)?.metrics.find((m) => m.key === key)?.read(report);
}

type DifferenceObservation = {
  label: string;
  group: ComparisonGroupId;
  key: string;
  direction: "higher" | "lower";
};

const OBSERVATIONS: Record<InvestmentProfile, DifferenceObservation[]> = {
  balanced: [
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
  ],
  growth: [
    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },
    { label: "FCF growth", group: "growth", key: "fcfGrowth", direction: "higher" },
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
  ],
  value: [
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },
  ],
  quality: [
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },
  ],
  dividend: [
    { label: "dividend growth", group: "dividend", key: "dividendCagr5y", direction: "higher" },
    { label: "dividend increase streak", group: "dividend", key: "increaseStreak", direction: "higher" },
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
  ],
  defensive: [
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
    { label: "interest coverage", group: "financialHealth", key: "interestCoverage", direction: "higher" },
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
  ],
  long_term: [
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
  ],
  short_term: [
    { label: "revenue growth", group: "growth", key: "revenueGrowth", direction: "higher" },
    { label: "operating margin", group: "profitability", key: "operatingMargin", direction: "higher" },
    { label: "ROIC", group: "profitability", key: "roic", direction: "higher" },
    { label: "net debt / EBITDA", group: "financialHealth", key: "netDebtEbitda", direction: "lower" },
  ],
};

export function objectiveDifferences(
  reports: AnalysisReport[],
  locale: "en" | "sv" = "en",
  profile: InvestmentProfile = resolveComparisonProfile(reports).profile,
) {
  if (reports.length < 2 || reports.length > 5) return [] as string[];
  const out: string[] = [];
  const observations = OBSERVATIONS[profile] ?? OBSERVATIONS.balanced;

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
