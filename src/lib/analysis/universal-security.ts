import { clamp, isFiniteNumber, scoreHigherIsBetter, scoreLowerIsBetter, scoreTargetRange } from "./math";
import type { AnalysisArchetype, CompanySearchResult } from "./types";

export type UniversalSecurityKind =
  | "operating_company"
  | "investment_company"
  | "bank"
  | "insurance"
  | "reit"
  | "real_estate"
  | "utility"
  | "commodity_mining"
  | "pre_profit_growth"
  | "equity_etf"
  | "index_etf"
  | "sector_etf"
  | "factor_etf"
  | "bond_etf"
  | "commodity_etf"
  | "leveraged_inverse_etf";

export type UniversalSecurityClassification = {
  kind: UniversalSecurityKind;
  confidence: number;
  reason: string;
  analysisArchetype?: AnalysisArchetype;
};

export type WeightedSecurityFactor = {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  value?: number | null;
  status: "available" | "missing" | "not_applicable";
  rationale: string;
};

export type WeightedSecurityScore = {
  score: number | null;
  coverage: number;
  availableWeight: number;
  applicableWeight: number;
  factors: WeightedSecurityFactor[];
  missing: string[];
};

export type LookThroughHolding = {
  ticker?: string;
  name: string;
  weight: number;
  stockBoxScore?: number | null;
  revenueGrowth?: number | null;
  epsGrowth?: number | null;
  roic?: number | null;
  operatingMargin?: number | null;
  netDebtToEbitda?: number | null;
  forwardPe?: number | null;
  priceBook?: number | null;
  freeCashFlowYield?: number | null;
  dividendYield?: number | null;
  sector?: string | null;
  country?: string | null;
};

export type LookThroughMetrics = {
  coveredWeight: number;
  stockBoxQuality: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  roic: number | null;
  operatingMargin: number | null;
  netDebtToEbitda: number | null;
  forwardPe: number | null;
  priceBook: number | null;
  freeCashFlowYield: number | null;
  dividendYield: number | null;
  top10Weight: number | null;
  largestHoldingWeight: number | null;
  holdingsHhi: number | null;
  sectorHhi: number | null;
  countryHhi: number | null;
};

export type SotPSegment = {
  name: string;
  bearValue: number | null;
  baseValue: number | null;
  bullValue: number | null;
  source?: string;
};

export type SotPResult = {
  bearEquityValue: number | null;
  baseEquityValue: number | null;
  bullEquityValue: number | null;
  bearNavPerShare: number | null;
  baseNavPerShare: number | null;
  bullNavPerShare: number | null;
};

export type InvestmentCompanyAnalysisInput = {
  sharePrice?: number | null;
  dilutedShares?: number | null;
  reportedNav?: number | null;
  reportedNavPerShare?: number | null;
  listedHoldingsValue?: number | null;
  unlistedHoldingsValue?: number | null;
  cash?: number | null;
  debt?: number | null;
  otherLiabilities?: number | null;
  navGrowth1y?: number | null;
  navGrowth3yCagr?: number | null;
  navGrowth5yCagr?: number | null;
  shareholderReturn3yCagr?: number | null;
  shareholderReturn5yCagr?: number | null;
  capitalAllocationScore?: number | null;
  managementGovernanceScore?: number | null;
  diversificationScore?: number | null;
  dividendQualityScore?: number | null;
  holdings?: LookThroughHolding[];
  sotpSegments?: SotPSegment[];
  historicalDiscountMedian1y?: number | null;
  historicalDiscountMedian3y?: number | null;
  historicalDiscountMedian5y?: number | null;
};

export type InvestmentCompanyAnalysisResult = {
  kind: "investment_company";
  score: WeightedSecurityScore;
  nav: {
    total: number | null;
    perShare: number | null;
    discountPremium: number | null;
    source: "reported_nav_per_share" | "reported_nav" | "component_nav" | "sotp_base" | "unavailable";
    relativeToHistoricalMedian: number | null;
  };
  lookThrough: LookThroughMetrics;
  sotp: SotPResult | null;
};

export type EtfHolding = LookThroughHolding;

export type EtfAnalysisInput = {
  subtype?: Exclude<UniversalSecurityKind, "operating_company" | "investment_company" | "bank" | "insurance" | "reit" | "real_estate" | "utility" | "commodity_mining" | "pre_profit_growth">;
  expenseRatio?: number | null;
  trackingDifference?: number | null;
  trackingError?: number | null;
  bidAskSpread?: number | null;
  turnover?: number | null;
  assetsUnderManagement?: number | null;
  fundAgeYears?: number | null;
  averageDailyDollarVolume?: number | null;
  numberOfHoldings?: number | null;
  top10Weight?: number | null;
  largestHoldingWeight?: number | null;
  holdingsHhi?: number | null;
  sectorHhi?: number | null;
  countryHhi?: number | null;
  sharpeRatio3y?: number | null;
  volatility3y?: number | null;
  maxDrawdown3y?: number | null;
  structureTaxEfficiencyScore?: number | null;
  holdings?: EtfHolding[];
  weightedForwardPe?: number | null;
  weightedPriceBook?: number | null;
  weightedFreeCashFlowYield?: number | null;
  weightedDividendYield?: number | null;
  distributionYield?: number | null;
  dividendGrowth3y?: number | null;
  payoutSustainabilityScore?: number | null;
  yieldToMaturity?: number | null;
  effectiveDuration?: number | null;
  investmentGradeWeight?: number | null;
  highYieldWeight?: number | null;
  averageCreditScore?: number | null;
  creditSpread?: number | null;
  rollYield?: number | null;
  contangoBackwardation?: number | null;
  spotTrackingDifference?: number | null;
  leverageFactor?: number | null;
  dailyReset?: boolean | null;
  volatilityDecayEstimate?: number | null;
};

export type EtfAnalysisResult = {
  kind: "etf";
  subtype: EtfAnalysisInput["subtype"];
  score: WeightedSecurityScore;
  lookThrough: LookThroughMetrics;
  warnings: string[];
};

const ETF_PATTERN = /\betf\b|exchange[-\s]traded|\bucits\b|\bindex fund\b|\btracker\b/i;
const LEVERAGED_PATTERN = /\b(?:2x|3x|ultra|leveraged|inverse|short|bear)\b/i;
const BOND_PATTERN = /\b(?:bond|treasury|fixed income|corporate debt|government debt|aggregate bond|high yield)\b/i;
const COMMODITY_PATTERN = /\b(?:commodity|gold|silver|copper|oil|crude|natural gas|uranium|wheat|agriculture)\b/i;
const FACTOR_PATTERN = /\b(?:factor|quality|value|momentum|minimum volatility|low volatility|multifactor|smart beta)\b/i;
const SECTOR_PATTERN = /\b(?:technology|semiconductor|healthcare|financial|energy|utilities|industrials|materials|real estate|consumer|communication)\b/i;
const HOLDING_PATTERN = /\b(?:investment company|investmentbolag|investment holding|holding company|diversified investments|business development company|\bbdc\b)\b/i;

export function classifyUniversalSecurity(input: {
  company?: Pick<CompanySearchResult, "securityType" | "name" | "ticker"> | null;
  analysisArchetype?: AnalysisArchetype | null;
  industry?: string | null;
  sector?: string | null;
  quoteType?: string | null;
  category?: string | null;
}): UniversalSecurityClassification {
  const text = [input.company?.name, input.company?.ticker, input.industry, input.sector, input.quoteType, input.category]
    .filter(Boolean)
    .join(" ");
  const explicitFund = input.company?.securityType === "ETF/Fund" || /\bETF\b/i.test(input.quoteType ?? "") || ETF_PATTERN.test(text);
  if (explicitFund) {
    if (LEVERAGED_PATTERN.test(text)) return { kind: "leveraged_inverse_etf", confidence: 0.96, reason: "Fund metadata or name identifies a leveraged/inverse exchange-traded product." };
    if (BOND_PATTERN.test(text)) return { kind: "bond_etf", confidence: 0.94, reason: "Fund metadata or name identifies fixed-income exposure." };
    if (COMMODITY_PATTERN.test(text)) return { kind: "commodity_etf", confidence: 0.9, reason: "Fund metadata or name identifies commodity exposure." };
    if (FACTOR_PATTERN.test(text)) return { kind: "factor_etf", confidence: 0.88, reason: "Fund metadata or name identifies systematic factor exposure." };
    if (SECTOR_PATTERN.test(text)) return { kind: "sector_etf", confidence: 0.82, reason: "Fund metadata or name identifies concentrated sector exposure." };
    if (/\b(?:s&p|nasdaq|msci|ftse|stoxx|index|benchmark)\b/i.test(text)) return { kind: "index_etf", confidence: 0.86, reason: "Fund metadata or name identifies benchmark/index tracking." };
    return { kind: "equity_etf", confidence: 0.72, reason: "Security is an ETF/fund and no more specific fund regime is reliably established." };
  }

  if (input.analysisArchetype === "holding_company" || HOLDING_PATTERN.test(text)) {
    return { kind: "investment_company", confidence: input.analysisArchetype === "holding_company" ? 0.95 : 0.82, reason: "The issuer is an investment/holding company and requires NAV/SOTP analysis.", analysisArchetype: "holding_company" };
  }
  const archetype = input.analysisArchetype ?? "standard";
  const kindByArchetype: Partial<Record<AnalysisArchetype, UniversalSecurityKind>> = {
    bank: "bank",
    insurer: "insurance",
    reit: "reit",
    property_company: "real_estate",
    utility: "utility",
    cyclical: /mining|materials|oil|gas|commodity/i.test(text) ? "commodity_mining" : "operating_company",
    pre_revenue_biotech: "pre_profit_growth",
  };
  return {
    kind: kindByArchetype[archetype] ?? "operating_company",
    confidence: input.analysisArchetype ? 0.92 : 0.65,
    reason: input.analysisArchetype ? `Existing StockBox archetype ${input.analysisArchetype} maps to the operating-company regime.` : "No specialist security regime was identified; operating-company analysis applies.",
    analysisArchetype: archetype,
  };
}

function normalizeFraction(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  return Math.abs(value) > 2 ? value / 100 : value;
}

function percentageScore(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null;
  return clamp(value, 0, 100);
}

function scoreByAnchors(value: number | null, anchors: Array<[number, number]>): number | null {
  if (!isFiniteNumber(value) || !anchors.length) return null;
  const sorted = [...anchors].sort((a, b) => a[0] - b[0]);
  if (value <= sorted[0][0]) return clamp(sorted[0][1], 0, 100);
  if (value >= sorted.at(-1)![0]) return clamp(sorted.at(-1)![1], 0, 100);
  for (let index = 1; index < sorted.length; index += 1) {
    const left = sorted[index - 1];
    const right = sorted[index];
    if (value <= right[0]) {
      const progress = (value - left[0]) / (right[0] - left[0]);
      return clamp(left[1] + progress * (right[1] - left[1]), 0, 100);
    }
  }
  return null;
}

export function aggregateApplicableFactors(
  factors: WeightedSecurityFactor[],
  minimumCoverage = 0.45,
): WeightedSecurityScore {
  const applicable = factors.filter((factor) => factor.status !== "not_applicable");
  const applicableWeight = applicable.reduce((sum, factor) => sum + Math.max(0, factor.weight), 0);
  const available = applicable.filter((factor) => factor.status === "available" && isFiniteNumber(factor.score));
  const availableWeight = available.reduce((sum, factor) => sum + Math.max(0, factor.weight), 0);
  const coverage = applicableWeight > 0 ? availableWeight / applicableWeight : 0;
  const raw = availableWeight > 0
    ? available.reduce((sum, factor) => sum + (factor.score as number) * Math.max(0, factor.weight), 0) / availableWeight
    : null;
  const score = raw === null || coverage < minimumCoverage
    ? null
    : clamp(50 + (raw - 50) * Math.min(1, coverage / 0.8), 0, 100);
  return {
    score: isFiniteNumber(score) ? Math.round(score * 10) / 10 : null,
    coverage,
    availableWeight,
    applicableWeight,
    factors,
    missing: applicable.filter((factor) => factor.status === "missing").map((factor) => factor.label),
  };
}

function weightedMetric(holdings: LookThroughHolding[], getter: (holding: LookThroughHolding) => number | null | undefined): number | null {
  const valid = holdings.filter((holding) => isFiniteNumber(holding.weight) && holding.weight > 0 && isFiniteNumber(getter(holding)));
  const weight = valid.reduce((sum, holding) => sum + holding.weight, 0);
  if (weight <= 0) return null;
  return valid.reduce((sum, holding) => sum + (getter(holding) as number) * holding.weight, 0) / weight;
}

function harmonicMetric(holdings: LookThroughHolding[], getter: (holding: LookThroughHolding) => number | null | undefined): number | null {
  const valid = holdings.filter((holding) => isFiniteNumber(holding.weight) && holding.weight > 0 && isFiniteNumber(getter(holding)) && (getter(holding) as number) > 0);
  const weight = valid.reduce((sum, holding) => sum + holding.weight, 0);
  if (weight <= 0) return null;
  const denominator = valid.reduce((sum, holding) => sum + holding.weight / (getter(holding) as number), 0);
  return denominator > 0 ? weight / denominator : null;
}

function hhiFromBuckets(values: Array<string | null | undefined>, weights: number[]): number | null {
  const buckets = new Map<string, number>();
  values.forEach((value, index) => {
    const weight = weights[index];
    if (!value || !isFiniteNumber(weight) || weight <= 0) return;
    buckets.set(value, (buckets.get(value) ?? 0) + weight);
  });
  const total = [...buckets.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return [...buckets.values()].reduce((sum, value) => sum + (value / total) ** 2, 0);
}

export function computeLookThroughMetrics(holdings: LookThroughHolding[] = []): LookThroughMetrics {
  const validWeights = holdings.filter((holding) => isFiniteNumber(holding.weight) && holding.weight > 0);
  const totalWeight = validWeights.reduce((sum, holding) => sum + holding.weight, 0);
  const normalized = totalWeight > 1.5
    ? validWeights.map((holding) => ({ ...holding, weight: holding.weight / 100 }))
    : validWeights;
  const coveredWeight = normalized.reduce((sum, holding) => sum + holding.weight, 0);
  const sortedWeights = normalized.map((holding) => holding.weight).sort((a, b) => b - a);
  return {
    coveredWeight,
    stockBoxQuality: weightedMetric(normalized, (holding) => holding.stockBoxScore),
    revenueGrowth: weightedMetric(normalized, (holding) => holding.revenueGrowth),
    epsGrowth: weightedMetric(normalized, (holding) => holding.epsGrowth),
    roic: weightedMetric(normalized, (holding) => holding.roic),
    operatingMargin: weightedMetric(normalized, (holding) => holding.operatingMargin),
    netDebtToEbitda: weightedMetric(normalized, (holding) => holding.netDebtToEbitda),
    forwardPe: harmonicMetric(normalized, (holding) => holding.forwardPe),
    priceBook: harmonicMetric(normalized, (holding) => holding.priceBook),
    freeCashFlowYield: weightedMetric(normalized, (holding) => holding.freeCashFlowYield),
    dividendYield: weightedMetric(normalized, (holding) => holding.dividendYield),
    top10Weight: sortedWeights.length ? sortedWeights.slice(0, 10).reduce((sum, weight) => sum + weight, 0) : null,
    largestHoldingWeight: sortedWeights[0] ?? null,
    holdingsHhi: sortedWeights.length ? sortedWeights.reduce((sum, weight) => sum + weight ** 2, 0) : null,
    sectorHhi: hhiFromBuckets(normalized.map((holding) => holding.sector), normalized.map((holding) => holding.weight)),
    countryHhi: hhiFromBuckets(normalized.map((holding) => holding.country), normalized.map((holding) => holding.weight)),
  };
}

export function computeSotP(
  segments: SotPSegment[] | undefined,
  options: { cash?: number | null; debt?: number | null; otherLiabilities?: number | null; dilutedShares?: number | null },
): SotPResult | null {
  if (!segments?.length) return null;
  const scenario = (field: "bearValue" | "baseValue" | "bullValue") => {
    const values = segments.map((segment) => segment[field]);
    if (!values.every(isFiniteNumber)) return null;
    const assets = values.reduce((sum, value) => sum + (value as number), 0);
    const cash = isFiniteNumber(options.cash) ? options.cash : 0;
    const debt = isFiniteNumber(options.debt) ? options.debt : 0;
    const liabilities = isFiniteNumber(options.otherLiabilities) ? options.otherLiabilities : 0;
    return assets + cash - debt - liabilities;
  };
  const bear = scenario("bearValue");
  const base = scenario("baseValue");
  const bull = scenario("bullValue");
  const perShare = (value: number | null) => isFiniteNumber(value) && isFiniteNumber(options.dilutedShares) && options.dilutedShares > 0
    ? value / options.dilutedShares
    : null;
  return {
    bearEquityValue: bear,
    baseEquityValue: base,
    bullEquityValue: bull,
    bearNavPerShare: perShare(bear),
    baseNavPerShare: perShare(base),
    bullNavPerShare: perShare(bull),
  };
}

function investmentNav(input: InvestmentCompanyAnalysisInput, sotp: SotPResult | null) {
  if (isFiniteNumber(input.reportedNavPerShare) && input.reportedNavPerShare > 0) {
    const total = isFiniteNumber(input.dilutedShares) && input.dilutedShares > 0 ? input.reportedNavPerShare * input.dilutedShares : null;
    return { total, perShare: input.reportedNavPerShare, source: "reported_nav_per_share" as const };
  }
  if (isFiniteNumber(input.reportedNav) && input.reportedNav > 0) {
    const perShare = isFiniteNumber(input.dilutedShares) && input.dilutedShares > 0 ? input.reportedNav / input.dilutedShares : null;
    return { total: input.reportedNav, perShare, source: "reported_nav" as const };
  }
  const components = [input.listedHoldingsValue, input.unlistedHoldingsValue, input.cash, input.debt, input.otherLiabilities];
  if ([input.listedHoldingsValue, input.unlistedHoldingsValue].some(isFiniteNumber)) {
    const total = (isFiniteNumber(input.listedHoldingsValue) ? input.listedHoldingsValue : 0)
      + (isFiniteNumber(input.unlistedHoldingsValue) ? input.unlistedHoldingsValue : 0)
      + (isFiniteNumber(input.cash) ? input.cash : 0)
      - (isFiniteNumber(input.debt) ? input.debt : 0)
      - (isFiniteNumber(input.otherLiabilities) ? input.otherLiabilities : 0);
    const perShare = isFiniteNumber(input.dilutedShares) && input.dilutedShares > 0 ? total / input.dilutedShares : null;
    if (isFiniteNumber(total) && total > 0) return { total, perShare, source: "component_nav" as const };
  }
  if (isFiniteNumber(sotp?.baseEquityValue) && sotp!.baseEquityValue! > 0) return { total: sotp!.baseEquityValue, perShare: sotp!.baseNavPerShare, source: "sotp_base" as const };
  void components;
  return { total: null, perShare: null, source: "unavailable" as const };
}

export function analyzeInvestmentCompany(input: InvestmentCompanyAnalysisInput): InvestmentCompanyAnalysisResult {
  const lookThrough = computeLookThroughMetrics(input.holdings);
  const sotp = computeSotP(input.sotpSegments, input);
  const nav = investmentNav(input, sotp);
  const discountPremium = isFiniteNumber(input.sharePrice) && input.sharePrice > 0 && isFiniteNumber(nav.perShare) && nav.perShare > 0
    ? input.sharePrice / nav.perShare - 1
    : null;
  const historicalMedian = [input.historicalDiscountMedian5y, input.historicalDiscountMedian3y, input.historicalDiscountMedian1y].find(isFiniteNumber) ?? null;
  const relativeToHistoricalMedian = isFiniteNumber(discountPremium) && isFiniteNumber(historicalMedian) ? discountPremium - historicalMedian : null;
  const navGrowth = [input.navGrowth5yCagr, input.navGrowth3yCagr, input.navGrowth1y].find(isFiniteNumber) ?? null;
  const shareholderReturn = [input.shareholderReturn5yCagr, input.shareholderReturn3yCagr].find(isFiniteNumber) ?? null;
  const grossAssets = isFiniteNumber(nav.total) && isFiniteNumber(input.debt) ? nav.total + input.debt : null;
  const grossLeverageToNav = isFiniteNumber(input.debt) && isFiniteNumber(grossAssets) && grossAssets > 0 ? input.debt / grossAssets : null;
  const holdingsQuality = percentageScore(input.holdings?.length ? lookThrough.stockBoxQuality : null);
  const factors: WeightedSecurityFactor[] = [
    {
      key: "nav_valuation", label: "NAV valuation / discount", weight: 0.22, value: discountPremium,
      score: scoreByAnchors(discountPremium, [[-0.3, 100], [-0.15, 85], [-0.05, 65], [0, 52], [0.1, 35], [0.3, 10]]),
      status: isFiniteNumber(discountPremium) ? "available" : "missing",
      rationale: "Investment-company valuation is anchored to verified NAV/SOTP; consolidated P/E is not substituted.",
    },
    {
      key: "holdings_quality", label: "Underlying holdings quality", weight: 0.18, value: lookThrough.stockBoxQuality,
      score: holdingsQuality, status: isFiniteNumber(holdingsQuality) ? "available" : "missing",
      rationale: "Look-through quality is the portfolio-weighted quality of underlying holdings.",
    },
    {
      key: "nav_growth", label: "NAV/share growth", weight: 0.15, value: navGrowth,
      score: scoreHigherIsBetter(navGrowth, -0.03, 0.15), status: isFiniteNumber(navGrowth) ? "available" : "missing",
      rationale: "Per-share NAV compounding is the primary growth measure for an investment company.",
    },
    {
      key: "capital_allocation", label: "Capital allocation", weight: 0.12, value: input.capitalAllocationScore ?? null,
      score: percentageScore(input.capitalAllocationScore), status: isFiniteNumber(input.capitalAllocationScore) ? "available" : "missing",
      rationale: "Capital allocation must be supported by an explicit, auditable assessment rather than inferred from accounting earnings.",
    },
    {
      key: "shareholder_returns", label: "Historical shareholder returns", weight: 0.10, value: shareholderReturn,
      score: scoreHigherIsBetter(shareholderReturn, -0.03, 0.15), status: isFiniteNumber(shareholderReturn) ? "available" : "missing",
      rationale: "Long-run total shareholder return provides an outcome check on NAV compounding and capital allocation.",
    },
    {
      key: "leverage", label: "Holding-company leverage", weight: 0.08, value: grossLeverageToNav,
      score: scoreLowerIsBetter(grossLeverageToNav, 0.45, 0.05), status: isFiniteNumber(grossLeverageToNav) ? "available" : "missing",
      rationale: "Holding-company leverage is measured relative to look-through asset value rather than operating EBITDA.",
    },
    {
      key: "governance", label: "Management / governance", weight: 0.06, value: input.managementGovernanceScore ?? null,
      score: percentageScore(input.managementGovernanceScore), status: isFiniteNumber(input.managementGovernanceScore) ? "available" : "missing",
      rationale: "Governance is scored only when explicit evidence is available.",
    },
    {
      key: "diversification", label: "Diversification", weight: 0.05, value: input.diversificationScore ?? null,
      score: percentageScore(input.diversificationScore) ?? scoreByAnchors(lookThrough.holdingsHhi, [[0.03, 95], [0.07, 80], [0.15, 55], [0.3, 25]]),
      status: isFiniteNumber(input.diversificationScore) || isFiniteNumber(lookThrough.holdingsHhi) ? "available" : "missing",
      rationale: "Diversification reflects actual portfolio concentration rather than raw holding count.",
    },
    {
      key: "dividend_quality", label: "Dividend quality", weight: 0.04, value: input.dividendQualityScore ?? null,
      score: percentageScore(input.dividendQualityScore), status: isFiniteNumber(input.dividendQualityScore) ? "available" : "missing",
      rationale: "Dividend quality is a secondary factor and is excluded from the score when no reliable evidence exists.",
    },
  ];
  return {
    kind: "investment_company",
    score: aggregateApplicableFactors(factors, 0.45),
    nav: { ...nav, discountPremium, relativeToHistoricalMedian },
    lookThrough,
    sotp,
  };
}

function resolvedEtfConcentration(input: EtfAnalysisInput, lookThrough: LookThroughMetrics) {
  return {
    top10: normalizeFraction(input.top10Weight) ?? lookThrough.top10Weight,
    largest: normalizeFraction(input.largestHoldingWeight) ?? lookThrough.largestHoldingWeight,
    holdingsHhi: input.holdingsHhi ?? lookThrough.holdingsHhi,
    sectorHhi: input.sectorHhi ?? lookThrough.sectorHhi,
    countryHhi: input.countryHhi ?? lookThrough.countryHhi,
  };
}

function etfHoldingsQuality(input: EtfAnalysisInput, lookThrough: LookThroughMetrics): number | null {
  if (isFiniteNumber(lookThrough.stockBoxQuality)) return clamp(lookThrough.stockBoxQuality, 0, 100);
  const roic = lookThrough.roic;
  const growth = lookThrough.epsGrowth ?? lookThrough.revenueGrowth;
  const margin = lookThrough.operatingMargin;
  const scores = [scoreHigherIsBetter(roic, 0.02, 0.2), scoreHigherIsBetter(growth, -0.05, 0.15), scoreHigherIsBetter(margin, 0.04, 0.25)].filter(isFiniteNumber);
  if (!scores.length) return null;
  void input;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function etfValuationScore(input: EtfAnalysisInput, lookThrough: LookThroughMetrics): number | null {
  const pe = input.weightedForwardPe ?? lookThrough.forwardPe;
  const pb = input.weightedPriceBook ?? lookThrough.priceBook;
  const fcfYield = normalizeFraction(input.weightedFreeCashFlowYield) ?? lookThrough.freeCashFlowYield;
  const scores = [
    scoreLowerIsBetter(pe, 35, 12),
    scoreLowerIsBetter(pb, 6, 1.5),
    scoreHigherIsBetter(fcfYield, 0.01, 0.07),
  ].filter(isFiniteNumber);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function etfDiversificationScore(input: EtfAnalysisInput, lookThrough: LookThroughMetrics): number | null {
  const concentration = resolvedEtfConcentration(input, lookThrough);
  const countScore = scoreByAnchors(input.numberOfHoldings ?? null, [[10, 20], [30, 50], [100, 80], [500, 95]]);
  const hhiScore = scoreByAnchors(concentration.holdingsHhi, [[0.02, 100], [0.05, 85], [0.1, 65], [0.2, 35], [0.4, 10]]);
  const sectorScore = scoreByAnchors(concentration.sectorHhi, [[0.1, 95], [0.2, 75], [0.4, 45], [0.7, 15]]);
  const scores = [countScore, hhiScore, sectorScore].filter(isFiniteNumber);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function etfConcentrationScore(input: EtfAnalysisInput, lookThrough: LookThroughMetrics): number | null {
  const concentration = resolvedEtfConcentration(input, lookThrough);
  const top10Score = scoreByAnchors(concentration.top10, [[0.2, 95], [0.35, 80], [0.5, 55], [0.75, 20]]);
  const largestScore = scoreByAnchors(concentration.largest, [[0.03, 95], [0.08, 80], [0.15, 55], [0.3, 20]]);
  const scores = [top10Score, largestScore].filter(isFiniteNumber);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function etfLiquidityScore(input: EtfAnalysisInput): number | null {
  const spread = normalizeFraction(input.bidAskSpread);
  const spreadScore = scoreLowerIsBetter(spread, 0.01, 0.0005);
  const volumeScore = scoreByAnchors(input.averageDailyDollarVolume ?? null, [[100_000, 15], [1_000_000, 45], [10_000_000, 75], [100_000_000, 95]]);
  const scores = [spreadScore, volumeScore].filter(isFiniteNumber);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function etfTrackingScore(input: EtfAnalysisInput): number | null {
  const diff = isFiniteNumber(input.trackingDifference) ? Math.abs(normalizeFraction(input.trackingDifference) as number) : null;
  const error = isFiniteNumber(input.trackingError) ? Math.abs(normalizeFraction(input.trackingError) as number) : null;
  const diffScore = scoreLowerIsBetter(diff, 0.02, 0.001);
  const errorScore = scoreLowerIsBetter(error, 0.04, 0.002);
  const scores = [diffScore, errorScore].filter(isFiniteNumber);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function etfRiskAdjustedReturnScore(input: EtfAnalysisInput): number | null {
  const sharpeScore = scoreByAnchors(input.sharpeRatio3y ?? null, [[-0.3, 10], [0, 35], [0.5, 60], [1, 80], [1.5, 95]]);
  const drawdown = isFiniteNumber(input.maxDrawdown3y) ? Math.abs(normalizeFraction(input.maxDrawdown3y) as number) : null;
  const drawdownScore = scoreLowerIsBetter(drawdown, 0.6, 0.15);
  const scores = [sharpeScore, drawdownScore].filter(isFiniteNumber);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function etfStabilityScore(input: EtfAnalysisInput): number | null {
  const aumScore = scoreByAnchors(input.assetsUnderManagement ?? null, [[10_000_000, 20], [100_000_000, 55], [1_000_000_000, 80], [10_000_000_000, 95]]);
  const ageScore = scoreByAnchors(input.fundAgeYears ?? null, [[0.5, 20], [2, 55], [5, 80], [10, 95]]);
  const scores = [aumScore, ageScore].filter(isFiniteNumber);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function bondEtfOverlay(input: EtfAnalysisInput): WeightedSecurityFactor[] {
  const ig = normalizeFraction(input.investmentGradeWeight);
  const hy = normalizeFraction(input.highYieldWeight);
  return [
    {
      key: "bond_yield", label: "Yield to maturity", weight: 0.08, value: normalizeFraction(input.yieldToMaturity),
      score: scoreTargetRange(normalizeFraction(input.yieldToMaturity), -0.01, 0.025, 0.08, 0.16), status: isFiniteNumber(input.yieldToMaturity) ? "available" : "missing",
      rationale: "Bond ETF return potential is anchored to portfolio yield, without treating a high yield as automatically low risk.",
    },
    {
      key: "bond_credit", label: "Credit quality", weight: 0.07, value: ig,
      score: isFiniteNumber(ig) ? scoreHigherIsBetter(ig, 0.25, 0.95) : isFiniteNumber(hy) ? scoreLowerIsBetter(hy, 0.75, 0.05) : null,
      status: isFiniteNumber(ig) || isFiniteNumber(hy) ? "available" : "missing",
      rationale: "Credit quality uses the actual investment-grade/high-yield mix.",
    },
    {
      key: "bond_duration", label: "Interest-rate sensitivity", weight: 0.05, value: input.effectiveDuration ?? null,
      score: scoreTargetRange(input.effectiveDuration ?? null, 0, 1.5, 7, 18), status: isFiniteNumber(input.effectiveDuration) ? "available" : "missing",
      rationale: "Duration is treated as risk exposure rather than operating-company leverage.",
    },
  ];
}

function commodityEtfOverlay(input: EtfAnalysisInput): WeightedSecurityFactor[] {
  const rollYield = normalizeFraction(input.rollYield);
  const spotDiff = isFiniteNumber(input.spotTrackingDifference) ? Math.abs(normalizeFraction(input.spotTrackingDifference) as number) : null;
  return [
    {
      key: "roll_yield", label: "Roll yield / futures structure", weight: 0.12, value: rollYield,
      score: scoreHigherIsBetter(rollYield, -0.12, 0.08), status: isFiniteNumber(rollYield) ? "available" : "missing",
      rationale: "Commodity ETFs are evaluated for contango/backwardation and roll economics rather than corporate earnings.",
    },
    {
      key: "spot_tracking", label: "Spot tracking quality", weight: 0.08, value: spotDiff,
      score: scoreLowerIsBetter(spotDiff, 0.08, 0.005), status: isFiniteNumber(spotDiff) ? "available" : "missing",
      rationale: "Tracking quality measures how efficiently the product delivers the stated commodity exposure.",
    },
  ];
}

function leveragedEtfOverlay(input: EtfAnalysisInput): WeightedSecurityFactor[] {
  const leverage = isFiniteNumber(input.leverageFactor) ? Math.abs(input.leverageFactor) : null;
  const decay = isFiniteNumber(input.volatilityDecayEstimate) ? Math.abs(normalizeFraction(input.volatilityDecayEstimate) as number) : null;
  const structuralScore = leverage === null ? null : clamp(85 - Math.max(0, leverage - 1) * 25 - (input.dailyReset === true ? 15 : 0) - (isFiniteNumber(decay) ? Math.min(30, decay * 150) : 0), 0, 100);
  return [{
    key: "path_dependency", label: "Leverage / path dependency", weight: 0.20, value: leverage,
    score: structuralScore, status: isFiniteNumber(structuralScore) ? "available" : "missing",
    rationale: "Daily reset, leverage and volatility decay are explicit structural risks; long-horizon compounding is not assumed to equal leverage times index return.",
  }];
}

export function analyzeEtf(input: EtfAnalysisInput): EtfAnalysisResult {
  const subtype = input.subtype ?? "equity_etf";
  const lookThrough = computeLookThroughMetrics(input.holdings);
  const holdingsQuality = etfHoldingsQuality(input, lookThrough);
  const valuation = etfValuationScore(input, lookThrough);
  const fee = normalizeFraction(input.expenseRatio);
  const diversification = etfDiversificationScore(input, lookThrough);
  const liquidity = etfLiquidityScore(input);
  const tracking = etfTrackingScore(input);
  const riskAdjusted = etfRiskAdjustedReturnScore(input);
  const concentration = etfConcentrationScore(input, lookThrough);
  const stability = etfStabilityScore(input);
  const taxStructure = percentageScore(input.structureTaxEfficiencyScore);
  const equityApplicable = !["bond_etf", "commodity_etf"].includes(subtype);
  const factors: WeightedSecurityFactor[] = [
    {
      key: "holdings_quality", label: "Underlying holdings quality", weight: 0.20, value: lookThrough.stockBoxQuality,
      score: holdingsQuality, status: equityApplicable ? (isFiniteNumber(holdingsQuality) ? "available" : "missing") : "not_applicable",
      rationale: "Equity ETF quality is computed look-through from actual holdings; it is not an ETF-level profitability ratio.",
    },
    {
      key: "valuation", label: "Look-through valuation", weight: 0.15, value: input.weightedForwardPe ?? lookThrough.forwardPe,
      score: valuation, status: equityApplicable ? (isFiniteNumber(valuation) ? "available" : "missing") : "not_applicable",
      rationale: "ETF valuation aggregates underlying securities, using harmonic aggregation for positive valuation multiples.",
    },
    {
      key: "cost", label: "Expense ratio / cost", weight: 0.12, value: fee,
      score: scoreLowerIsBetter(fee, 0.01, 0.0005), status: isFiniteNumber(fee) ? "available" : "missing",
      rationale: "Lower recurring fund costs improve investor capture of the underlying exposure.",
    },
    {
      key: "diversification", label: "Diversification", weight: 0.12, value: input.holdingsHhi ?? lookThrough.holdingsHhi,
      score: diversification, status: isFiniteNumber(diversification) ? "available" : "missing",
      rationale: "Diversification uses concentration mathematics and exposure breadth, not holding count alone.",
    },
    {
      key: "liquidity", label: "Liquidity / tradability", weight: 0.10, value: normalizeFraction(input.bidAskSpread),
      score: liquidity, status: isFiniteNumber(liquidity) ? "available" : "missing",
      rationale: "Bid/ask spread and traded dollar volume measure practical execution quality.",
    },
    {
      key: "tracking", label: "Tracking quality", weight: 0.10, value: normalizeFraction(input.trackingDifference),
      score: tracking, status: isFiniteNumber(tracking) ? "available" : "missing",
      rationale: "Tracking difference and tracking error determine how faithfully the fund delivers its mandate.",
    },
    {
      key: "risk_adjusted_returns", label: "Risk-adjusted returns", weight: 0.08, value: input.sharpeRatio3y ?? null,
      score: riskAdjusted, status: isFiniteNumber(riskAdjusted) ? "available" : "missing",
      rationale: "Historical return is judged relative to volatility and drawdown rather than raw performance alone.",
    },
    {
      key: "concentration", label: "Concentration risk", weight: 0.06, value: normalizeFraction(input.top10Weight) ?? lookThrough.top10Weight,
      score: concentration, status: isFiniteNumber(concentration) ? "available" : "missing",
      rationale: "Top-holding concentration is scored separately from nominal diversification.",
    },
    {
      key: "fund_stability", label: "Fund size / stability", weight: 0.04, value: input.assetsUnderManagement ?? null,
      score: stability, status: isFiniteNumber(stability) ? "available" : "missing",
      rationale: "AUM and operating history provide a bounded closure/operational-stability signal.",
    },
    {
      key: "structure_tax", label: "Structure / tax efficiency", weight: 0.03, value: input.structureTaxEfficiencyScore ?? null,
      score: taxStructure, status: isFiniteNumber(taxStructure) ? "available" : "missing",
      rationale: "Structure and tax efficiency are scored only from explicit jurisdiction/product evidence.",
    },
  ];

  if (subtype === "bond_etf") factors.push(...bondEtfOverlay(input));
  if (subtype === "commodity_etf") factors.push(...commodityEtfOverlay(input));
  if (subtype === "leveraged_inverse_etf") factors.push(...leveragedEtfOverlay(input));

  const score = aggregateApplicableFactors(factors, subtype === "leveraged_inverse_etf" ? 0.35 : 0.4);
  const warnings: string[] = [];
  if (subtype === "leveraged_inverse_etf") warnings.push("Leveraged/inverse ETFs use daily-reset and path-dependency logic; long-term returns can materially diverge from leverage times benchmark returns.");
  if (subtype === "commodity_etf") warnings.push("Commodity ETF analysis must include futures structure and roll yield when the product uses futures; corporate P/E and profitability are not applicable.");
  if (subtype === "bond_etf") warnings.push("Bond ETF analysis uses yield, duration and credit quality; equity profitability metrics are not applicable.");
  if (score.coverage < 0.6) warnings.push("ETF score is coverage-limited because one or more fund-specific inputs are unavailable; missing factors are shown as N/A, not scored as zero.");
  return { kind: "etf", subtype, score, lookThrough, warnings };
}
