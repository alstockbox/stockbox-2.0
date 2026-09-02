export type Sector =
  | "bank"
  | "insurance"
  | "reit"
  | "saas"
  | "semiconductors"
  | "mining"
  | "industrials"
  | "consumer"
  | "biotech"
  | "general";

export type ValuationMetric =
  | "pe"
  | "forwardPe"
  | "peg"
  | "evEbitda"
  | "evEbit"
  | "evSales"
  | "ps"
  | "pb"
  | "pFcf"
  | "fcfYield"
  | "earningsYield";

export type SignalLevel = "strong" | "neutral" | "weak" | "insufficient";
export type ConfidenceLevel = "High" | "Medium" | "Low";
export type RiskLevel = "Low" | "Moderate" | "Elevated" | "High" | "Extreme";
export type SectorValuationRegime =
  | "Deep Discount"
  | "Discount"
  | "Below Normal"
  | "Normal"
  | "Above Normal"
  | "Premium"
  | "Extreme Premium"
  | "Insufficient data";
export type PremiumJustification =
  | "Strongly justified"
  | "Partially justified"
  | "Neutral"
  | "Weakly justified"
  | "Unjustified"
  | "Insufficient data";

export type CompanyProfile = {
  name: string;
  ticker: string;
  sector: Sector;
  industry?: string;
  currency?: string;
  market?: string;
};

export type CurrentMetrics = Partial<Record<ValuationMetric, number>> & {
  revenueGrowth?: number;
  epsGrowth?: number;
  fcfGrowth?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  fcfMargin?: number;
  fcfConversion?: number;
  roic?: number;
  roe?: number;
  roa?: number;
  netDebtToEbitda?: number;
  debtToEquity?: number;
  interestCoverage?: number;
  currentRatio?: number;
  sharesGrowth?: number;
  revenueGrowthSeries?: number[];
  operatingIncomeGrowthSeries?: number[];
  operatingMarginSeries?: number[];
  fcfMarginSeries?: number[];
};

export type BenchmarkSet = Partial<Record<ValuationMetric, number>> & {
  revenueGrowth?: number;
  epsGrowth?: number;
  fcfGrowth?: number;
  operatingMargin?: number;
  fcfMargin?: number;
  roic?: number;
  roe?: number;
};

export type HistoricalMetricSeries = Partial<Record<ValuationMetric, number[]>>;

export type DataFreshness = {
  priceAsOf?: string;
  financialPeriod?: string;
  lastReportedQuarter?: string;
  ttmPeriod?: string;
  estimateTimestamp?: string;
};

export type CompanyAnalysisInput = {
  company: CompanyProfile;
  current: CurrentMetrics;
  benchmarks?: {
    industry?: BenchmarkSet;
    sector?: BenchmarkSet;
    market?: BenchmarkSet;
    peers?: BenchmarkSet;
    sectorHistory?: HistoricalMetricSeries;
  };
  history?: HistoricalMetricSeries;
  peerCount?: number;
  dataFreshness?: DataFreshness;
};

export type MetricComparison = {
  metric: ValuationMetric;
  current: number;
  benchmark: number;
  premiumPercent: number;
  label: "premium" | "discount" | "in line";
  usable: true;
};

export type HistoricalValuation = {
  metric: ValuationMetric;
  current: number;
  median1Y: number | null;
  median3Y: number | null;
  median5Y: number | null;
  percentile: number | null;
  observations: number;
  status: "available" | "insufficient data";
};

export type StructuredStockAnalysis = {
  company: CompanyProfile;
  applicableMetrics: ValuationMetric[];
  valuation: {
    absolute: {
      label: "Very cheap" | "Cheap" | "Fair" | "Expensive" | "Very expensive" | "Insufficient data";
      evidence: string[];
    };
    industryRelative: MetricComparison[];
    sectorRelative: MetricComparison[];
    marketRelative: MetricComparison[];
    peerRelative: MetricComparison[];
    historical: HistoricalValuation[];
    growthAdjusted: {
      label: "Low valuation / high growth" | "High valuation / high growth" | "High valuation / low growth" | "Low valuation / low growth" | "Balanced" | "Insufficient data";
      evidence: string[];
    };
    qualityAdjusted: {
      label: "Premium Quality / Premium Price" | "Premium Quality / Fair Price" | "Average Quality / Premium Price" | "Weak Quality / Premium Price" | "Balanced" | "Insufficient data";
      evidence: string[];
    };
    premiumJustification: {
      level: PremiumJustification;
      factors: string[];
    };
    sectorRegime: {
      regime: SectorValuationRegime;
      metric: ValuationMetric | null;
      percentile: number | null;
    };
  };
  fundamentals: {
    growth: SignalLevel;
    profitability: SignalLevel;
    financialHealth: SignalLevel;
    capitalEfficiency: SignalLevel;
    cashFlowQuality: SignalLevel;
    marginTrend: SignalLevel;
    dilution: SignalLevel;
    fundamentalMomentum: SignalLevel;
  };
  risks: {
    valueTrapRisk: RiskLevel;
    expectationRisk: RiskLevel;
    flags: string[];
  };
  score: {
    overall: number;
    businessQuality: number;
    valuationAttractiveness: number;
    risk: number;
    components: Record<string, number>;
    explainability: {
      positives: string[];
      negatives: string[];
    };
  };
  confidence: {
    level: ConfidenceLevel;
    score: number;
    reasons: string[];
  };
  dataFreshness: DataFreshness;
  education: Array<{
    term: string;
    beginnerExplanation: string;
    commonMistake: string;
  }>;
  reportLevels: {
    forDummies: string[];
    summary: string[];
    deep: string[];
  };
  dataLimitations: string[];
};

export const METRIC_LABELS: Record<ValuationMetric, string> = {
  pe: "P/E",
  forwardPe: "Forward P/E",
  peg: "PEG",
  evEbitda: "EV/EBITDA",
  evEbit: "EV/EBIT",
  evSales: "EV/Sales",
  ps: "P/S",
  pb: "P/B",
  pFcf: "P/FCF",
  fcfYield: "FCF Yield",
  earningsYield: "Earnings Yield"
};

const LOWER_IS_CHEAPER = new Set<ValuationMetric>([
  "pe",
  "forwardPe",
  "peg",
  "evEbitda",
  "evEbit",
  "evSales",
  "ps",
  "pb",
  "pFcf"
]);
const HIGHER_IS_CHEAPER = new Set<ValuationMetric>(["fcfYield", "earningsYield"]);

const SECTOR_METRICS: Record<Sector, ValuationMetric[]> = {
  bank: ["pb", "pe", "forwardPe", "earningsYield"],
  insurance: ["pb", "pe", "forwardPe", "earningsYield"],
  reit: ["pFcf", "pb", "evEbitda", "fcfYield"],
  saas: ["evSales", "ps", "fcfYield", "pFcf"],
  semiconductors: ["forwardPe", "pe", "evEbitda", "evSales", "pFcf"],
  mining: ["evEbitda", "pb", "pFcf", "fcfYield"],
  industrials: ["evEbitda", "evEbit", "pe", "forwardPe", "pFcf"],
  consumer: ["pe", "forwardPe", "evEbitda", "ps", "pFcf"],
  biotech: ["ps", "evSales", "fcfYield"],
  general: ["pe", "forwardPe", "evEbitda", "ps", "pFcf", "fcfYield"]
};

const MAX_REASONABLE_MULTIPLE: Partial<Record<ValuationMetric, number>> = {
  pe: 120,
  forwardPe: 120,
  peg: 8,
  evEbitda: 80,
  evEbit: 100,
  evSales: 60,
  ps: 60,
  pb: 30,
  pFcf: 150
};

export function analyzeStock(input: CompanyAnalysisInput): StructuredStockAnalysis {
  const applicableMetrics = selectApplicableMetrics(input.company.sector, input.current);
  const limitations: string[] = [];
  const industryRelative = compareBenchmark(input.current, input.benchmarks?.industry, applicableMetrics);
  const sectorRelative = compareBenchmark(input.current, input.benchmarks?.sector, applicableMetrics);
  const marketRelative = compareBenchmark(input.current, input.benchmarks?.market, applicableMetrics);
  const peerRelative = compareBenchmark(input.current, input.benchmarks?.peers, applicableMetrics);
  const historical = applicableMetrics.map((metric) => buildHistorical(metric, input.current[metric], input.history?.[metric]));
  const sectorRegime = buildSectorRegime(input.current, input.benchmarks?.sectorHistory, applicableMetrics);

  collectLimitations(input, applicableMetrics, limitations);

  const valuationPremium = averagePremium([...industryRelative, ...sectorRelative, ...peerRelative]);
  const benchmark = input.benchmarks?.industry ?? input.benchmarks?.sector;
  const qualityScore = scoreQuality(input.current, benchmark);
  const growthScore = scoreGrowth(input.current, benchmark);
  const balanceScore = scoreBalanceSheet(input.current);
  const cashFlowScore = scoreCashFlow(input.current);
  const marginScore = scoreMargins(input.current);
  const dilutionScore = scoreDilution(input.current);
  const momentumScore = scoreMomentum(input.current);
  const valuationScore = scoreValuation(valuationPremium, historical);
  const riskScore = scoreRisk(input.current, valuationPremium, historical, sectorRegime);
  const confidence = confidenceScore(input, applicableMetrics);
  const businessQuality = Math.round(weightedAverage([
    [growthScore, 0.18],
    [qualityScore, 0.24],
    [balanceScore, 0.16],
    [cashFlowScore, 0.16],
    [marginScore, 0.12],
    [dilutionScore, 0.06],
    [momentumScore, 0.08]
  ]));
  const overall = Math.round(weightedAverage([
    [businessQuality, 0.45],
    [valuationScore, 0.25],
    [riskScore, 0.2],
    [confidence.score, 0.1]
  ]));

  const premiumJustification = buildPremiumJustification(valuationPremium, {
    qualityScore,
    growthScore,
    cashFlowScore,
    balanceScore
  });
  const expectationRisk = buildExpectationRisk(valuationPremium, historical, sectorRegime);
  const valueTrapRisk = buildValueTrapRisk(input.current, valuationPremium);
  const absolute = buildAbsoluteValuation(input.current, applicableMetrics);
  const growthAdjusted = buildGrowthAdjustedValuation(valuationPremium, input.current, benchmark);
  const qualityAdjusted = buildQualityAdjustedValuation(valuationPremium, qualityScore);

  return {
    company: input.company,
    applicableMetrics,
    valuation: {
      absolute,
      industryRelative,
      sectorRelative,
      marketRelative,
      peerRelative,
      historical,
      growthAdjusted,
      qualityAdjusted,
      premiumJustification,
      sectorRegime
    },
    fundamentals: {
      growth: signalFromScore(growthScore),
      profitability: signalFromScore(scoreProfitability(input.current)),
      financialHealth: signalFromScore(balanceScore),
      capitalEfficiency: signalFromScore(qualityScore),
      cashFlowQuality: signalFromScore(cashFlowScore),
      marginTrend: signalFromScore(marginScore),
      dilution: signalFromScore(dilutionScore),
      fundamentalMomentum: signalFromScore(momentumScore)
    },
    risks: {
      valueTrapRisk,
      expectationRisk,
      flags: buildRiskFlags(input.current, valuationPremium, expectationRisk, valueTrapRisk)
    },
    score: {
      overall,
      businessQuality,
      valuationAttractiveness: valuationScore,
      risk: riskScore,
      components: {
        growth: growthScore,
        profitability: scoreProfitability(input.current),
        financialHealth: balanceScore,
        capitalEfficiency: qualityScore,
        cashFlowQuality: cashFlowScore,
        valuation: valuationScore,
        momentum: momentumScore,
        stability: marginScore,
        dilution: dilutionScore
      },
      explainability: explainScore({ growthScore, qualityScore, cashFlowScore, balanceScore, valuationScore, riskScore })
    },
    confidence,
    dataFreshness: input.dataFreshness ?? {},
    education: buildEducation(applicableMetrics),
    reportLevels: buildReportLevels(input.company, {
      valuationPremium,
      absolute,
      growthAdjusted,
      qualityAdjusted,
      premiumJustification,
      sectorRegime,
      expectationRisk,
      valueTrapRisk,
      confidence,
      peerCount: input.peerCount,
      historical,
      businessQuality,
      valuationScore
    }),
    dataLimitations: limitations
  };
}

export function selectApplicableMetrics(sector: Sector, current: CurrentMetrics): ValuationMetric[] {
  return SECTOR_METRICS[sector].filter((metric) => isUsableMetric(metric, current[metric])).slice(0, 5);
}

export function premiumDiscountPercent(metric: ValuationMetric, current: number, benchmark: number): number | null {
  if (!isUsableMetric(metric, current) || !isUsableMetric(metric, benchmark) || benchmark === 0) return null;
  const raw = LOWER_IS_CHEAPER.has(metric) ? current / benchmark - 1 : benchmark / current - 1;
  return Number.isFinite(raw) ? raw * 100 : null;
}

export function historicalPercentile(current: number, history: number[]): number | null {
  const clean = cleanSeries(history);
  if (!Number.isFinite(current) || clean.length < 8) return null;
  return (clean.filter((value) => value <= current).length / clean.length) * 100;
}

function compareBenchmark(current: CurrentMetrics, benchmark: BenchmarkSet | undefined, metrics: ValuationMetric[]): MetricComparison[] {
  if (!benchmark) return [];
  return metrics.flatMap((metric) => {
    const currentValue = current[metric];
    const benchmarkValue = benchmark[metric];
    if (typeof currentValue !== "number" || typeof benchmarkValue !== "number") return [];
    const premiumPercent = premiumDiscountPercent(metric, currentValue, benchmarkValue);
    if (premiumPercent === null) return [];
    return [{
      metric,
      current: currentValue,
      benchmark: benchmarkValue,
      premiumPercent,
      label: Math.abs(premiumPercent) < 5 ? "in line" : premiumPercent > 0 ? "premium" : "discount",
      usable: true
    }];
  });
}

function buildHistorical(metric: ValuationMetric, current: number | undefined, history: number[] | undefined): HistoricalValuation {
  if (typeof current !== "number" || !history) {
    return { metric, current: current ?? 0, median1Y: null, median3Y: null, median5Y: null, percentile: null, observations: 0, status: "insufficient data" };
  }
  const clean = cleanSeries(history, metric);
  if (clean.length < 8) {
    return { metric, current, median1Y: null, median3Y: null, median5Y: null, percentile: null, observations: clean.length, status: "insufficient data" };
  }
  return {
    metric,
    current,
    median1Y: median(clean.slice(-252)),
    median3Y: median(clean.slice(-756)),
    median5Y: median(clean.slice(-1260)),
    percentile: historicalPercentile(current, clean),
    observations: clean.length,
    status: "available"
  };
}

function buildSectorRegime(current: CurrentMetrics, sectorHistory: HistoricalMetricSeries | undefined, metrics: ValuationMetric[]): StructuredStockAnalysis["valuation"]["sectorRegime"] {
  for (const metric of metrics) {
    const currentValue = current[metric];
    const history = sectorHistory?.[metric];
    if (typeof currentValue !== "number" || !history) continue;
    const percentile = historicalPercentile(currentValue, history);
    if (percentile !== null) return { metric, percentile, regime: regimeFromPercentile(percentile) };
  }
  return { metric: null, percentile: null, regime: "Insufficient data" };
}

function buildAbsoluteValuation(current: CurrentMetrics, metrics: ValuationMetric[]): StructuredStockAnalysis["valuation"]["absolute"] {
  const evidence: string[] = [];
  const labels = metrics.flatMap((metric) => {
    const value = current[metric];
    if (typeof value !== "number") return [];
    evidence.push(`${METRIC_LABELS[metric]} ${formatNumber(value)}`);
    if (HIGHER_IS_CHEAPER.has(metric)) return value >= 6 ? 35 : value >= 3 ? 50 : 70;
    return value <= 10 ? 35 : value <= 18 ? 50 : value <= 30 ? 65 : value <= 50 ? 78 : 90;
  });
  if (!labels.length) return { label: "Insufficient data", evidence: ["No usable valuation multiple was supplied."] };
  const average = weightedAverage(labels.map((value) => [value, 1]));
  return {
    label: average < 42 ? "Very cheap" : average < 56 ? "Cheap" : average < 68 ? "Fair" : average < 82 ? "Expensive" : "Very expensive",
    evidence
  };
}

function buildGrowthAdjustedValuation(valuationPremium: number | null, current: CurrentMetrics, benchmark?: BenchmarkSet): StructuredStockAnalysis["valuation"]["growthAdjusted"] {
  const growth = current.revenueGrowth ?? current.epsGrowth ?? current.fcfGrowth;
  const benchmarkGrowth = benchmark?.revenueGrowth ?? benchmark?.epsGrowth ?? benchmark?.fcfGrowth;
  if (valuationPremium === null || growth === undefined) return { label: "Insufficient data", evidence: ["Missing valuation premium or growth data."] };
  const relativeGrowth = benchmarkGrowth === undefined ? null : growth - benchmarkGrowth;
  const highValuation = valuationPremium > 15;
  const highGrowth = growth >= 15 || (relativeGrowth !== null && relativeGrowth >= 5);
  const lowValuation = valuationPremium < -15;
  const lowGrowth = growth < 5 || (relativeGrowth !== null && relativeGrowth <= -5);
  const evidence = [`Growth ${formatPercent(growth)}`, `Relative valuation ${formatSignedPercent(valuationPremium)}`];
  if (relativeGrowth !== null) evidence.push(`Growth spread vs benchmark ${formatSignedPercent(relativeGrowth)}`);
  if (highValuation && highGrowth) return { label: "High valuation / high growth", evidence };
  if (highValuation && lowGrowth) return { label: "High valuation / low growth", evidence };
  if (lowValuation && highGrowth) return { label: "Low valuation / high growth", evidence };
  if (lowValuation && lowGrowth) return { label: "Low valuation / low growth", evidence };
  return { label: "Balanced", evidence };
}

function buildQualityAdjustedValuation(valuationPremium: number | null, qualityScore: number): StructuredStockAnalysis["valuation"]["qualityAdjusted"] {
  if (valuationPremium === null) return { label: "Insufficient data", evidence: ["Missing relative valuation data."] };
  const evidence = [`Quality score ${qualityScore}/100`, `Relative valuation ${formatSignedPercent(valuationPremium)}`];
  if (qualityScore >= 75 && valuationPremium > 15) return { label: "Premium Quality / Premium Price", evidence };
  if (qualityScore >= 75 && valuationPremium >= -15) return { label: "Premium Quality / Fair Price", evidence };
  if (qualityScore < 45 && valuationPremium > 15) return { label: "Weak Quality / Premium Price", evidence };
  if (valuationPremium > 15) return { label: "Average Quality / Premium Price", evidence };
  return { label: "Balanced", evidence };
}

function buildPremiumJustification(valuationPremium: number | null, scores: { qualityScore: number; growthScore: number; cashFlowScore: number; balanceScore: number }): StructuredStockAnalysis["valuation"]["premiumJustification"] {
  if (valuationPremium === null) return { level: "Insufficient data", factors: ["No reliable industry, sector, or peer premium could be calculated."] };
  if (valuationPremium <= 10) return { level: "Neutral", factors: ["No large premium needs to be justified."] };
  const factors = [
    scores.growthScore >= 70 ? "growth is stronger than the benchmark profile" : null,
    scores.qualityScore >= 70 ? "returns and profitability support higher quality" : null,
    scores.cashFlowScore >= 70 ? "cash flow conversion supports the reported earnings" : null,
    scores.balanceScore >= 70 ? "financial health reduces balance sheet risk" : null
  ].filter(Boolean) as string[];
  if (factors.length >= 3) return { level: "Strongly justified", factors };
  if (factors.length >= 2) return { level: "Partially justified", factors };
  if (factors.length === 1) return { level: "Weakly justified", factors };
  return { level: "Unjustified", factors: ["The premium is not matched by clear growth, quality, cash flow, or balance sheet support."] };
}

function buildExpectationRisk(valuationPremium: number | null, history: HistoricalValuation[], sectorRegime: StructuredStockAnalysis["valuation"]["sectorRegime"]): RiskLevel {
  const maxHistoricalPercentile = Math.max(0, ...history.map((entry) => entry.percentile ?? 0));
  let points = 0;
  if ((valuationPremium ?? 0) > 50) points += 3;
  else if ((valuationPremium ?? 0) > 25) points += 2;
  else if ((valuationPremium ?? 0) > 10) points += 1;
  if (maxHistoricalPercentile >= 90) points += 3;
  else if (maxHistoricalPercentile >= 75) points += 2;
  if (sectorRegime.regime === "Extreme Premium") points += 2;
  if (sectorRegime.regime === "Premium") points += 1;
  return points >= 6 ? "Extreme" : points >= 4 ? "High" : points >= 2 ? "Elevated" : points >= 1 ? "Moderate" : "Low";
}

function buildValueTrapRisk(current: CurrentMetrics, valuationPremium: number | null): RiskLevel {
  let points = 0;
  if ((valuationPremium ?? 0) < -20) points += 1;
  if ((current.revenueGrowth ?? 0) < 0) points += 2;
  if ((current.operatingMargin ?? 0) < 0) points += 1;
  if ((current.fcfConversion ?? 100) < 50) points += 1;
  if ((current.netDebtToEbitda ?? 0) > 4) points += 2;
  if ((current.roic ?? 10) < 5) points += 1;
  if ((current.sharesGrowth ?? 0) > 8) points += 1;
  return points >= 6 ? "High" : points >= 4 ? "Elevated" : points >= 2 ? "Moderate" : "Low";
}

function buildRiskFlags(current: CurrentMetrics, valuationPremium: number | null, expectationRisk: RiskLevel, valueTrapRisk: RiskLevel): string[] {
  return [
    expectationRisk === "High" || expectationRisk === "Extreme" ? "High expectations: valuation leaves less room for disappointment." : null,
    valueTrapRisk === "Elevated" || valueTrapRisk === "High" ? "Cheapness may reflect fundamental deterioration." : null,
    (current.netDebtToEbitda ?? 0) > 4 ? "Leverage is elevated relative to EBITDA." : null,
    (current.sharesGrowth ?? 0) > 8 ? "Share count is rising quickly, which dilutes per-share results." : null,
    valuationPremium !== null && valuationPremium > 30 && (current.revenueGrowth ?? 0) < 8 ? "Premium valuation is not supported by strong growth." : null
  ].filter(Boolean) as string[];
}

function confidenceScore(input: CompanyAnalysisInput, metrics: ValuationMetric[]) {
  const reasons: string[] = [];
  let score = 35;
  if (metrics.length >= 3) score += 15;
  else reasons.push("fewer than three usable valuation metrics");
  if (input.benchmarks?.industry || input.benchmarks?.sector || input.benchmarks?.peers) score += 20;
  else reasons.push("no industry, sector, or peer benchmark supplied");
  if (input.history && Object.values(input.history).some((series) => (series?.length ?? 0) >= 8)) score += 15;
  else reasons.push("limited historical valuation depth");
  if ((input.peerCount ?? 0) >= 5) score += 10;
  else reasons.push("limited peer set");
  if (input.dataFreshness?.priceAsOf && input.dataFreshness.financialPeriod) score += 5;
  else reasons.push("data freshness metadata is incomplete");
  const bounded = clamp(score, 0, 100);
  return { score: bounded, level: bounded >= 75 ? "High" as const : bounded >= 50 ? "Medium" as const : "Low" as const, reasons };
}

function collectLimitations(input: CompanyAnalysisInput, metrics: ValuationMetric[], limitations: string[]) {
  if (!metrics.length) limitations.push("No sector-relevant valuation metric was usable.");
  if (!input.benchmarks?.industry) limitations.push("Industry benchmark is missing.");
  if (!input.benchmarks?.sector) limitations.push("Sector benchmark is missing.");
  if (!input.history) limitations.push("Own historical valuation series is missing.");
  if (!input.benchmarks?.sectorHistory) limitations.push("Sector historical valuation series is missing.");
  if ((input.peerCount ?? 0) < 5) limitations.push("Peer set is too small for high-confidence peer analysis.");
}

function scoreGrowth(current: CurrentMetrics, benchmark?: BenchmarkSet) {
  const growth = current.revenueGrowth ?? current.epsGrowth ?? current.fcfGrowth;
  if (growth === undefined) return 45;
  const spread = benchmark?.revenueGrowth === undefined ? 0 : growth - benchmark.revenueGrowth;
  return clamp(Math.round(50 + growth * 1.5 + spread), 0, 100);
}

function scoreQuality(current: CurrentMetrics, benchmark?: BenchmarkSet) {
  const roicSpread = current.roic !== undefined && benchmark?.roic !== undefined ? current.roic - benchmark.roic : 0;
  const roeSpread = current.roe !== undefined && benchmark?.roe !== undefined ? current.roe - benchmark.roe : 0;
  const base = [
    current.roic !== undefined ? 50 + current.roic * 1.4 + roicSpread : null,
    current.roe !== undefined ? 45 + current.roe + roeSpread * 0.7 : null,
    current.operatingMargin !== undefined ? 45 + current.operatingMargin : null,
    current.fcfMargin !== undefined ? 45 + current.fcfMargin * 1.2 : null
  ].filter((value): value is number => value !== null);
  if (!base.length) return 45;
  return clamp(Math.round(weightedAverage(base.map((value) => [value, 1]))), 0, 100);
}

function scoreProfitability(current: CurrentMetrics) {
  const metrics = [current.grossMargin, current.operatingMargin, current.netMargin].filter((value): value is number => typeof value === "number");
  if (!metrics.length) return 45;
  return clamp(Math.round(45 + weightedAverage(metrics.map((value) => [value, 1])) * 0.9), 0, 100);
}

function scoreBalanceSheet(current: CurrentMetrics) {
  let score = 65;
  if (current.netDebtToEbitda !== undefined) score += current.netDebtToEbitda <= 0 ? 18 : current.netDebtToEbitda <= 2 ? 8 : current.netDebtToEbitda <= 4 ? -8 : -25;
  if (current.interestCoverage !== undefined) score += current.interestCoverage >= 8 ? 12 : current.interestCoverage >= 3 ? 4 : -18;
  if (current.currentRatio !== undefined) score += current.currentRatio >= 1.5 ? 5 : current.currentRatio < 1 ? -10 : 0;
  if (current.debtToEquity !== undefined) score += current.debtToEquity <= 0.5 ? 5 : current.debtToEquity > 2 ? -10 : 0;
  return clamp(score, 0, 100);
}

function scoreCashFlow(current: CurrentMetrics) {
  let score = 50;
  if (current.fcfConversion !== undefined) score += (current.fcfConversion - 70) * 0.45;
  if (current.fcfMargin !== undefined) score += current.fcfMargin * 1.2;
  if (current.fcfGrowth !== undefined) score += current.fcfGrowth * 0.4;
  return clamp(Math.round(score), 0, 100);
}

function scoreMargins(current: CurrentMetrics) {
  const series = current.operatingMarginSeries ?? current.fcfMarginSeries;
  if (!series || series.length < 4) return current.operatingMargin !== undefined ? clamp(50 + current.operatingMargin, 0, 100) : 45;
  const clean = cleanSeries(series);
  const trend = clean.at(-1)! - clean[0];
  const volatilityPenalty = standardDeviation(clean) * 1.2;
  return clamp(Math.round(55 + trend * 2 - volatilityPenalty), 0, 100);
}

function scoreDilution(current: CurrentMetrics) {
  if (current.sharesGrowth === undefined) return 55;
  if (current.sharesGrowth < -3) return 82;
  if (current.sharesGrowth <= 2) return 70;
  if (current.sharesGrowth <= 8) return 48;
  return 28;
}

function scoreMomentum(current: CurrentMetrics) {
  const scores = [trendScore(current.revenueGrowthSeries), trendScore(current.operatingIncomeGrowthSeries), trendScore(current.operatingMarginSeries)].filter((value): value is number => value !== null);
  if (!scores.length) return scoreGrowth(current);
  return clamp(Math.round(weightedAverage(scores.map((value) => [value, 1]))), 0, 100);
}

function scoreValuation(valuationPremium: number | null, historical: HistoricalValuation[]) {
  let score = 55;
  if (valuationPremium !== null) score -= valuationPremium * 0.45;
  const percentiles = historical.map((entry) => entry.percentile).filter((value): value is number => value !== null);
  if (percentiles.length) score -= (weightedAverage(percentiles.map((value) => [value, 1])) - 50) * 0.35;
  return clamp(Math.round(score), 0, 100);
}

function scoreRisk(current: CurrentMetrics, valuationPremium: number | null, historical: HistoricalValuation[], sectorRegime: StructuredStockAnalysis["valuation"]["sectorRegime"]) {
  return clamp(100 - riskPoints(buildExpectationRisk(valuationPremium, historical, sectorRegime)) * 8 - riskPoints(buildValueTrapRisk(current, valuationPremium)) * 10, 0, 100);
}

function explainScore(scores: { growthScore: number; qualityScore: number; cashFlowScore: number; balanceScore: number; valuationScore: number; riskScore: number }) {
  const positives = [
    scores.growthScore >= 70 ? "Growth lifts the business profile." : null,
    scores.qualityScore >= 70 ? "Capital efficiency and profitability are supportive." : null,
    scores.cashFlowScore >= 70 ? "Cash flow quality supports reported earnings." : null,
    scores.balanceScore >= 70 ? "The balance sheet adds resilience." : null
  ].filter(Boolean) as string[];
  const negatives = [
    scores.valuationScore < 45 ? "Valuation reduces the score." : null,
    scores.riskScore < 55 ? "Risk flags reduce the score." : null,
    scores.cashFlowScore < 45 ? "Weak cash conversion weighs on quality." : null,
    scores.balanceScore < 45 ? "Leverage or liquidity weighs on financial health." : null
  ].filter(Boolean) as string[];
  return { positives, negatives };
}

function buildEducation(metrics: ValuationMetric[]) {
  const entries: Record<ValuationMetric, { term: string; beginnerExplanation: string; commonMistake: string }> = {
    pe: { term: "P/E", beginnerExplanation: "Shows roughly how many kronor investors pay for one krona of annual profit.", commonMistake: "A low P/E is not automatically cheap if profits are falling." },
    forwardPe: { term: "Forward P/E", beginnerExplanation: "Uses expected future profit instead of the latest reported profit.", commonMistake: "Forecasts can be wrong, especially around turning points." },
    peg: { term: "PEG", beginnerExplanation: "Compares P/E with growth to ask whether price and growth fit together.", commonMistake: "PEG is weak when earnings are cyclical or estimates are unreliable." },
    evEbitda: { term: "EV/EBITDA", beginnerExplanation: "Compares the total company value with operating profit before some accounting costs.", commonMistake: "It can ignore heavy investment needs and debt quality." },
    evEbit: { term: "EV/EBIT", beginnerExplanation: "Compares total company value with operating profit after depreciation.", commonMistake: "It still needs sector context to mean much." },
    evSales: { term: "EV/Sales", beginnerExplanation: "Compares total company value with sales, useful when profits are temporarily low or negative.", commonMistake: "Sales are not profit; high revenue does not guarantee a good business." },
    ps: { term: "P/S", beginnerExplanation: "Shows how much investors pay for each krona of revenue.", commonMistake: "It can make weak-margin companies look deceptively attractive." },
    pb: { term: "P/B", beginnerExplanation: "Compares market value with accounting book value, often important for banks.", commonMistake: "Book value quality varies a lot by sector." },
    pFcf: { term: "P/FCF", beginnerExplanation: "Shows how much investors pay for the cash left after running and investing in the business.", commonMistake: "One unusual cash-flow year can distort the ratio." },
    fcfYield: { term: "FCF Yield", beginnerExplanation: "Shows free cash flow as a percentage of company value. Higher is usually cheaper.", commonMistake: "A high yield can be temporary if cash flow is falling." },
    earningsYield: { term: "Earnings Yield", beginnerExplanation: "The inverse of P/E: profit as a percentage of the price.", commonMistake: "It is not the same as a guaranteed return." }
  };
  return metrics.slice(0, 4).map((metric) => entries[metric]);
}

function buildReportLevels(company: CompanyProfile, context: { valuationPremium: number | null; absolute: StructuredStockAnalysis["valuation"]["absolute"]; growthAdjusted: StructuredStockAnalysis["valuation"]["growthAdjusted"]; qualityAdjusted: StructuredStockAnalysis["valuation"]["qualityAdjusted"]; premiumJustification: StructuredStockAnalysis["valuation"]["premiumJustification"]; sectorRegime: StructuredStockAnalysis["valuation"]["sectorRegime"]; expectationRisk: RiskLevel; valueTrapRisk: RiskLevel; confidence: { level: ConfidenceLevel; score: number; reasons: string[] }; peerCount?: number; historical: HistoricalValuation[]; businessQuality: number; valuationScore: number }): StructuredStockAnalysis["reportLevels"] {
  const premiumText = context.valuationPremium === null
    ? "There is not enough comparison data for a robust premium/discount view."
    : `${company.name} trades around ${formatSignedPercent(context.valuationPremium)} versus relevant benchmarks.`;
  const historicalText = strongestHistoricalText(context.historical);

  return {
    forDummies: [
      `${company.name} uses the same analysis engine as Deep Mode, but explained in simpler language.`,
      context.absolute.label === "Insufficient data" ? "StockBox needs more valuation data before it can judge whether the stock is expensive or cheap." : `Valuation looks ${context.absolute.label.toLowerCase()}. ${premiumText}`,
      beginnerJustificationSentence(context.premiumJustification.level),
      `Expectation Risk: ${context.expectationRisk}. A higher valuation usually means the company needs to keep delivering strong results.`,
      `Confidence: ${context.confidence.level}. ${context.confidence.reasons[0] ?? "The data base is relatively complete."}`
    ],
    summary: [
      `Business quality: ${context.businessQuality}/100. Valuation attractiveness: ${context.valuationScore}/100.`,
      premiumText,
      `${context.growthAdjusted.label}; ${context.qualityAdjusted.label}.`,
      `Sector regime: ${context.sectorRegime.regime}. ${historicalText}`,
      `Value Trap Risk: ${context.valueTrapRisk}. Expectation Risk: ${context.expectationRisk}.`
    ],
    deep: [
      `${company.ticker} uses sector-aware metrics for ${company.sector}: ${context.peerCount ? `${context.peerCount} peers supplied` : "peer count unavailable"}.`,
      premiumText,
      `${historicalText} Sector valuation regime is ${context.sectorRegime.regime}${context.sectorRegime.percentile !== null ? ` at the ${formatOrdinal(context.sectorRegime.percentile)} percentile` : ""}.`,
      `Premium justification: ${context.premiumJustification.level}. Factors: ${context.premiumJustification.factors.join("; ")}.`,
      `Confidence ${context.confidence.level} (${context.confidence.score}/100). Missing or weak inputs: ${context.confidence.reasons.join("; ") || "none material"}.`
    ]
  };
}

function strongestHistoricalText(history: HistoricalValuation[]) {
  const strongest = history.filter((entry) => entry.percentile !== null).sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))[0];
  if (!strongest) return "Historical valuation data is insufficient.";
  return `${METRIC_LABELS[strongest.metric]} is in the ${formatOrdinal(strongest.percentile!)} percentile of available history.`;
}

function beginnerJustificationSentence(level: PremiumJustification) {
  if (level === "Insufficient data") return "StockBox cannot judge whether a premium is justified without better comparison data.";
  if (level === "Strongly justified" || level === "Partially justified") return "Part of the valuation seems supported by stronger quality, growth, or cash flow.";
  if (level === "Unjustified" || level === "Weakly justified") return "The valuation deserves caution because support from growth, quality, or cash flow is weak.";
  return "The premium is not large enough to be the main question.";
}

function averagePremium(comparisons: MetricComparison[]) {
  if (!comparisons.length) return null;
  return weightedAverage(comparisons.map((comparison) => [comparison.premiumPercent, 1]));
}

function trendScore(series: number[] | undefined) {
  if (!series || series.length < 4) return null;
  const clean = cleanSeries(series);
  if (clean.length < 4) return null;
  const firstHalf = median(clean.slice(0, Math.floor(clean.length / 2)));
  const secondHalf = median(clean.slice(Math.floor(clean.length / 2)));
  if (firstHalf === null || secondHalf === null) return null;
  return clamp(55 + (secondHalf - firstHalf) * 2.2, 0, 100);
}

function signalFromScore(score: number): SignalLevel {
  if (score >= 70) return "strong";
  if (score >= 45) return "neutral";
  return "weak";
}

function riskPoints(risk: RiskLevel) {
  return ({ Low: 0, Moderate: 1, Elevated: 2, High: 3, Extreme: 4 } as const)[risk];
}

function regimeFromPercentile(percentile: number): SectorValuationRegime {
  if (percentile < 10) return "Deep Discount";
  if (percentile < 25) return "Discount";
  if (percentile < 40) return "Below Normal";
  if (percentile <= 60) return "Normal";
  if (percentile <= 75) return "Above Normal";
  if (percentile <= 90) return "Premium";
  return "Extreme Premium";
}

function isUsableMetric(metric: ValuationMetric, value: number | undefined): value is number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return false;
  const max = MAX_REASONABLE_MULTIPLE[metric];
  return max === undefined || value <= max;
}

function cleanSeries(series: number[], metric?: ValuationMetric) {
  const max = metric ? MAX_REASONABLE_MULTIPLE[metric] : undefined;
  return series.filter((value) => Number.isFinite(value) && value > 0 && (max === undefined || value <= max)).sort((a, b) => a - b);
}

function median(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[middle - 1] + clean[middle]) / 2 : clean[middle];
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function weightedAverage(entries: Array<[number, number]>) {
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight === 0) return 0;
  return entries.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number) {
  return `${formatNumber(value)}%`;
}

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${formatPercent(value)}`;
}

function formatOrdinal(value: number) {
  return `${Math.round(value)}th`;
}
