import { randomUUID } from "node:crypto";
import {
  SPECIALIST_COVERAGE_TARGET,
  specialistCoverageGateMessage,
  specialistCoverageMeetsTarget,
} from "@/lib/analysis/specialist-coverage";
import {
  analyzeEtf,
  analyzeInvestmentCompany,
  classifyUniversalSecurity,
  type EtfAnalysisResult,
  type EtfHolding,
  type InvestmentCompanyAnalysisResult,
  type UniversalSecurityClassification,
  type WeightedSecurityFactor,
} from "@/lib/analysis/universal-security";
import type {
  AnalysisReport,
  AnalysisSource,
  AnalysisType,
  CompanySearchResult,
  DcfRange,
  Flag,
  InvestmentProfile,
  MarketSnapshot,
  Metrics,
  ProviderDiagnostic,
  Recommendation,
  ScoreDimension,
  ScoreDimensionKey,
  StockBoxScore,
} from "@/lib/analysis/types";
import { getServerEnv } from "@/lib/env/server";
import {
  analyzeCompany as analyzeOperatingCompany,
  fetchConfiguredMarketData,
  searchCompanies,
} from "./enhanced-provider";
import {
  enrichEtfLookThroughHoldings,
  type EtfHoldingFundamentalData,
} from "./etf-look-through-enrichment";
import { fetchEtfProviderChain } from "./etf-provider-chain";
import { classifyFundStructure } from "./fund-structure-classification";
import { deriveInvestmentCompanyNavGrowth } from "./investment-company-nav-history";
import { deriveInvestmentCompanyShareholderReturns } from "./investment-company-shareholder-return";
import { fetchOfficialInvestmentCompanyNav } from "./official-investment-company-nav";
import { inferSecurityType } from "./security-classification";
import { fetchYahooEtfHoldingFundamentals } from "./yahoo-etf-holding-fundamentals";
import { fetchYahooLongHistory } from "./yahoo-long-history";

export { searchCompanies };

type AnalyzeArgs = {
  company: CompanySearchResult;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
};

type CoreAnalyzeResult = Awaited<ReturnType<typeof analyzeOperatingCompany>>;

export type UniversalSecurityReport = AnalysisReport & {
  securityClassification?: UniversalSecurityClassification;
  securityAnalysis?: {
    investmentCompany?: InvestmentCompanyAnalysisResult;
    etf?: EtfAnalysisResult;
  };
};

function emptyMetrics(market: MarketSnapshot | null): Metrics {
  return {
    revenueGrowth1y: null,
    revenueCagr3y: null,
    epsGrowth1y: null,
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    fcf: null,
    fcfMargin: null,
    cashConversion: null,
    debtToEquity: null,
    debtToAssets: null,
    netDebt: null,
    interestCoverage: null,
    earningsYield: null,
    fcfYield: null,
    priceMomentum1y: market?.performance["1Y"] ?? null,
    priceMomentum3m: market?.performance["3M"] ?? null,
  };
}

function recommendationForScore(score: number | null, coverage: number): Recommendation {
  if (score === null || !specialistCoverageMeetsTarget(coverage)) return "No Rating";
  if (score >= 85) return "Strong Buy";
  if (score >= 70) return "Buy";
  if (score >= 45) return "Hold";
  if (score >= 30) return "Sell";
  return "Strong Sell";
}

function factorByKey(factors: WeightedSecurityFactor[], key: string): WeightedSecurityFactor | null {
  return factors.find((factor) => factor.key === key) ?? null;
}

function factorGroupScore(factors: WeightedSecurityFactor[], keys: string[]): number | null {
  const available = keys.flatMap((key) => {
    const factor = factorByKey(factors, key);
    return factor?.status === "available" && typeof factor.score === "number" && Number.isFinite(factor.score)
      ? [{ score: factor.score, weight: factor.weight }]
      : [];
  });
  const weight = available.reduce((sum, item) => sum + item.weight, 0);
  return weight > 0 ? available.reduce((sum, item) => sum + item.score * item.weight, 0) / weight : null;
}

function dimension(
  key: ScoreDimensionKey,
  label: string,
  factors: WeightedSecurityFactor[],
  factorKeys: string[],
  overallWeight: number,
): ScoreDimension {
  const selected = factorKeys.flatMap((factorKey) => {
    const factor = factorByKey(factors, factorKey);
    return factor ? [factor] : [];
  });
  const applicableWeight = selected.filter((factor) => factor.status !== "not_applicable").reduce((sum, factor) => sum + factor.weight, 0);
  const availableWeight = selected.filter((factor) => factor.status === "available").reduce((sum, factor) => sum + factor.weight, 0);
  const score = factorGroupScore(factors, factorKeys);
  return {
    key,
    label,
    score,
    rawScore: score,
    adjustedScore: score,
    coverage: applicableWeight > 0 ? availableWeight / applicableWeight : 0,
    plannedWeight: applicableWeight,
    availableWeight,
    weight: overallWeight,
    rationale: selected.map((factor) => factor.rationale).join(" "),
    contributors: selected.map((factor) => ({
      label: factor.label,
      value: factor.value ?? null,
      score: factor.score,
      weight: factor.weight,
      impact: factor.score === null ? "neutral" : factor.score >= 60 ? "positive" : factor.score <= 40 ? "negative" : "neutral",
      availability: factor.status === "available" ? "available" : factor.status === "not_applicable" ? "unsuitable" : "missing",
      missingReason: factor.status === "missing" ? `${factor.label} is unavailable from the current fund-data provider.` : factor.status === "not_applicable" ? "Not applicable to this security type." : undefined,
      source: "StockBox universal security engine",
    })),
  };
}

function etfScore(result: EtfAnalysisResult): StockBoxScore {
  const factors = result.score.factors;
  const dimensions: ScoreDimension[] = [
    dimension("quality", "Underlying holdings quality", factors, ["holdings_quality"], 0.20),
    dimension("valuation", "Look-through valuation", factors, ["valuation", "bond_yield"], 0.15),
    dimension("cashFlow", "Cost efficiency", factors, ["cost"], 0.12),
    dimension("financialHealth", "Diversification", factors, ["diversification", "fund_stability"], 0.14),
    dimension("profitability", "Liquidity / tradability", factors, ["liquidity"], 0.10),
    dimension("earningsQuality", "Tracking quality", factors, ["tracking", "spot_tracking", "roll_yield"], 0.10),
    dimension("momentum", "Risk-adjusted returns", factors, ["risk_adjusted_returns"], 0.08),
    dimension("growth", "Portfolio / credit quality", factors, ["bond_credit"], 0.04),
    dimension("risk", "Concentration & structural risk", factors, ["concentration", "bond_duration", "path_dependency"], 0.07),
  ];
  const gateMessage = specialistCoverageGateMessage("ETF", result.score.coverage);
  return {
    score: result.score.score,
    personalizedScore: result.score.score,
    confidence: Math.round(Math.min(98, Math.max(5, result.score.coverage * 100))),
    dimensions,
    missingData: [...new Set([...result.score.missing, ...(gateMessage ? [gateMessage] : [])])],
  };
}

function dcfNotApplicable(reason: string): DcfRange {
  return { suitable: false, reason, bear: null, base: null, bull: null };
}

function etfFlags(result: EtfAnalysisResult): { red: Flag[]; green: Flag[] } {
  const red: Flag[] = [];
  const green: Flag[] = [];
  const factor = (key: string) => result.score.factors.find((item) => item.key === key);
  const concentration = factor("concentration");
  if (concentration?.score !== null && concentration?.score !== undefined && concentration.score < 35) {
    red.push({ severity: "medium", title: "High concentration", detail: "The ETF has material top-holding concentration; nominal holding count overstates diversification." });
  }
  const cost = factor("cost");
  if (cost?.score !== null && cost?.score !== undefined && cost.score < 35) {
    red.push({ severity: "medium", title: "High fund cost", detail: "The recurring expense ratio is high relative to broad low-cost ETF benchmarks." });
  }
  if (result.subtype === "leveraged_inverse_etf") {
    red.push({ severity: "high", title: "Daily reset and path dependency", detail: "Leverage and daily reset can create volatility decay; long-horizon returns may diverge sharply from leverage times benchmark return." });
  }
  if (result.lookThrough.stockBoxQuality !== null && result.lookThrough.stockBoxQuality >= 80) {
    green.push({ severity: "low", title: "High underlying quality", detail: "The ETF's covered holdings have a strong portfolio-weighted StockBox quality score." });
  }
  const liquidity = factor("liquidity");
  if (liquidity?.score !== null && liquidity?.score !== undefined && liquidity.score >= 80) {
    green.push({ severity: "low", title: "Strong tradability", detail: "Observed spread and trading-volume inputs indicate efficient tradability." });
  }
  return { red, green };
}

function describeEtf(result: EtfAnalysisResult, company: CompanySearchResult): { oneSentence: string; summary: string } {
  const score = result.score.score === null ? "No score" : `${Math.round(result.score.score)}/100`;
  const coverage = Math.round(result.score.coverage * 1000) / 10;
  const type = (result.subtype ?? "equity_etf").replaceAll("_", " ").toUpperCase();
  const missing = result.score.missing.length ? ` Missing/N/A factors: ${result.score.missing.join(", ")}.` : "";
  const gate = specialistCoverageMeetsTarget(result.score.coverage)
    ? ` The ${(SPECIALIST_COVERAGE_TARGET * 100).toFixed(0)}% verified-data rating gate is met.`
    : ` Coverage is below the ${(SPECIALIST_COVERAGE_TARGET * 100).toFixed(0)}% verified-data rating gate, so the recommendation is No Rating.`;
  return {
    oneSentence: `${company.name} is analyzed as ${type} with StockBox ETF score ${score} at ${coverage}% factor coverage.`,
    summary: `StockBox used the ETF-specific model instead of corporate revenue, margin and P/E scoring. The model evaluates underlying holdings where available, look-through valuation, cost, diversification, liquidity, tracking quality, risk-adjusted returns, concentration and fund stability. Investor-jurisdiction tax treatment is excluded unless explicit context is available.${missing}${gate}`,
  };
}

function supportsEquityEtfLookThrough(subtype: string | null | undefined): boolean {
  return subtype === "equity_etf"
    || subtype === "index_etf"
    || subtype === "sector_etf"
    || subtype === "factor_etf";
}

function holdingFundamentalDataContributes(
  holding: EtfHolding,
  data: EtfHoldingFundamentalData,
): boolean {
  return (Object.keys(data) as Array<keyof EtfHoldingFundamentalData>).some((key) => {
    const value = data[key];
    return value !== null && value !== undefined && (holding[key] === null || holding[key] === undefined);
  });
}

const INVESTMENT_COMPANY_NAV_MAX_AGE_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDay(value: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function isOfficialNavComparable(navAsOf: string | null, marketAsOf: string | null | undefined): boolean {
  const navDay = parseIsoDay(navAsOf);
  const marketDay = parseIsoDay(marketAsOf);
  if (navDay === null || marketDay === null) return false;
  const ageDays = (marketDay - navDay) / DAY_MS;
  return ageDays >= 0 && ageDays <= INVESTMENT_COMPANY_NAV_MAX_AGE_DAYS;
}

async function analyzeEtfSecurity(args: AnalyzeArgs): Promise<CoreAnalyzeResult> {
  const accessedAt = new Date().toISOString();
  const env = getServerEnv();
  const [marketResult, etfResult] = await Promise.all([
    fetchConfiguredMarketData(args.company),
    fetchEtfProviderChain(args.company, env.ALPHA_VANTAGE_API_KEY),
  ]);
  const market = marketResult.ok ? marketResult.data : null;
  if (!etfResult.ok) {
    return {
      ok: false,
      error: "ETF-specific metadata is unavailable for this security.",
      sources: [],
      warnings: etfResult.warnings.length ? etfResult.warnings : [etfResult.message],
      providerDiagnostics: [marketResult.diagnostic, ...etfResult.diagnostics],
    };
  }

  const fundStructure = classifyFundStructure({
    company: args.company,
    quoteType: etfResult.data.quoteType,
    category: etfResult.data.category,
  });
  if (fundStructure.structure !== "exchange_traded_fund") {
    const closedEnd = fundStructure.structure === "closed_end_fund";
    const structureWarning = closedEnd
      ? "Closed-end funds require a dedicated specialist model using verified NAV/share, discount or premium to NAV, leverage, distribution quality and coverage, portfolio exposure and liquidity. StockBox will not substitute ETF scoring for those economics."
      : `StockBox could not verify whether this listed fund is an ETF, closed-end fund, or another fund structure. ${fundStructure.reason}`;
    return {
      ok: false,
      error: closedEnd
        ? "Closed-end fund specialist analysis is not yet available for this security."
        : "Fund structure could not be verified well enough to select a specialist model.",
      sources: etfResult.data.sources,
      warnings: [...new Set([...etfResult.data.warnings, structureWarning])],
      providerDiagnostics: [marketResult.diagnostic, ...etfResult.data.diagnostics],
    };
  }

  const holdingSources: AnalysisSource[] = [];
  const holdingDiagnostics: ProviderDiagnostic[] = [];
  let holdings = etfResult.data.input.holdings;
  let lookThroughBudgetWarning: string | null = null;

  if (
    supportsEquityEtfLookThrough(etfResult.data.input.subtype)
    && Array.isArray(holdings)
    && holdings.length > 0
  ) {
    const enrichment = await enrichEtfLookThroughHoldings(
      holdings,
      async (holding) => {
        const result = await fetchYahooEtfHoldingFundamentals(holding);
        if (result.ok && holdingFundamentalDataContributes(holding, result.data)) {
          if (!holdingSources.some((source) => source.provider === result.source.provider && source.version === result.source.version)) {
            holdingSources.push(result.source);
          }
          if (!holdingDiagnostics.some((diagnostic) => diagnostic.provider === result.diagnostic.provider)) {
            holdingDiagnostics.push(result.diagnostic);
          }
        }
        return result;
      },
      { maxRequests: 12 },
    );
    holdings = enrichment.holdings;
    if (enrichment.budgetExhausted && !enrichment.targetReached) {
      lookThroughBudgetWarning = "ETF look-through quality enrichment reached its request budget before 80% of portfolio weight had verified holding-quality evidence; holdings quality remains N/A until the threshold is met.";
    }
  }

  const input = {
    ...etfResult.data.input,
    holdings,
    averageDailyDollarVolume: etfResult.data.input.averageDailyDollarVolume
      ?? (market?.price && market?.volume ? market.price * market.volume : null),
  };
  const analysis = analyzeEtf(input);
  const score = etfScore(analysis);
  const recommendation = recommendationForScore(score.score, analysis.score.coverage);
  const descriptions = describeEtf(analysis, args.company);
  const flags = etfFlags(analysis);
  const classification = classifyUniversalSecurity({
    company: args.company,
    quoteType: etfResult.data.quoteType,
    category: etfResult.data.category,
  });
  const sources = [...etfResult.data.sources, ...holdingSources];
  const providerDiagnostics: ProviderDiagnostic[] = [
    marketResult.diagnostic,
    ...etfResult.data.diagnostics,
    ...holdingDiagnostics,
  ];
  const reportWarnings = [...new Set([
    ...etfResult.data.warnings,
    ...(lookThroughBudgetWarning ? [lookThroughBudgetWarning] : []),
    ...analysis.warnings,
  ])];
  const report: UniversalSecurityReport = {
    id: randomUUID(),
    ticker: args.company.ticker,
    companyName: args.company.name,
    analysisType: args.analysisType,
    investmentProfile: args.investmentProfile,
    generatedAt: accessedAt,
    oneSentence: descriptions.oneSentence,
    summary: descriptions.summary,
    recommendation,
    shortTermAssessment: analysis.subtype === "leveraged_inverse_etf"
      ? "Short-term behavior is dominated by benchmark direction, daily reset, volatility and path dependency."
      : "Short-term ETF behavior depends on the underlying exposure, liquidity and market regime.",
    longTermAssessment: analysis.subtype === "leveraged_inverse_etf"
      ? "Daily-reset leveraged/inverse products require explicit path-dependency analysis and are not modeled as simple long-term leveraged benchmark holdings."
      : "Long-term quality depends on underlying exposure, valuation, fees, diversification and tracking efficiency.",
    metrics: emptyMetrics(market),
    score,
    dcf: dcfNotApplicable("Corporate discounted cash flow is not economically appropriate for an ETF; StockBox uses look-through fund analysis instead."),
    redFlags: flags.red,
    greenFlags: flags.green,
    scenarios: [],
    sources,
    disclaimer: "StockBox is an analytical tool. ETF scores depend on available holdings, fund-structure and market data and are not individualized financial advice or guaranteed outcomes.",
    modelVersion: "universal-security-v2",
    reportSchemaVersion: "universal-security-v2",
    dataCoverage: analysis.score.coverage,
    market: market ?? undefined,
    dataAsOf: market?.date ?? null,
    dataStatus: market || etfResult.ok ? "current" : "unavailable",
    providerDiagnostics,
    securityClassification: classification,
    securityAnalysis: { etf: analysis },
  };
  report.score.missingData = [...new Set([...report.score.missingData, ...reportWarnings])];
  return {
    ok: true,
    data: report,
    sources,
    warnings: reportWarnings,
  };
}

async function enrichInvestmentCompanyReport(
  report: UniversalSecurityReport,
  company: CompanySearchResult,
): Promise<UniversalSecurityReport> {
  if (report.analysisArchetype !== "holding_company") return report;

  const latest = report.engine?.metrics.latestPeriod ?? null;
  const marketDate = report.market?.date ?? null;
  const [officialNav, longHistory] = await Promise.all([
    fetchOfficialInvestmentCompanyNav(company),
    marketDate ? fetchYahooLongHistory(company) : Promise.resolve(null),
  ]);
  const navComparable = officialNav.ok && isOfficialNavComparable(
    officialNav.data.navAsOf,
    marketDate,
  );
  const navFreshnessMessage = officialNav.ok && !navComparable
    ? `Official NAV dated ${officialNav.data.navAsOf ?? "unknown"} is stale or not comparable with market price date ${marketDate ?? "unknown"}. NAV valuation requires verified official NAV no more than ${INVESTMENT_COMPANY_NAV_MAX_AGE_DAYS} days old and not later than the market-price date; the source is retained for provenance but excluded from specialist coverage.`
    : null;
  const navGrowth = officialNav.ok && navComparable && officialNav.data.navAsOf
    ? deriveInvestmentCompanyNavGrowth(officialNav.data.navPerShareHistory, officialNav.data.navAsOf)
    : { navGrowth1y: null, navGrowth3yCagr: null, navGrowth5yCagr: null };
  const shareholderReturns = longHistory?.ok && marketDate
    ? deriveInvestmentCompanyShareholderReturns(longHistory.data.adjustedPriceHistory, marketDate)
    : { shareholderReturn3yCagr: null, shareholderReturn5yCagr: null };
  const shareholderReturnContributes = shareholderReturns.shareholderReturn3yCagr !== null
    || shareholderReturns.shareholderReturn5yCagr !== null;
  const analysis = analyzeInvestmentCompany({
    sharePrice: report.market?.price ?? null,
    dilutedShares: report.market?.sharesOutstanding ?? latest?.currentSharesOutstanding ?? latest?.sharesDiluted ?? null,
    reportedNav: navComparable ? officialNav.data.reportedNav : null,
    reportedNavPerShare: navComparable ? officialNav.data.reportedNavPerShare : null,
    ...navGrowth,
    ...shareholderReturns,
    cash: latest?.cashAndEquivalents ?? null,
    debt: latest?.totalDebt ?? null,
  });

  report.securityClassification = classifyUniversalSecurity({
    company,
    analysisArchetype: "holding_company",
  });
  report.securityAnalysis = { ...(report.securityAnalysis ?? {}), investmentCompany: analysis };
  report.dataCoverage = analysis.score.coverage;
  report.recommendation = recommendationForScore(analysis.score.score, analysis.score.coverage);

  if (officialNav.ok) {
    const navSource = officialNav.data.source;
    if (!report.sources.some((source) => (
      source.provider === navSource.provider
      && source.url === navSource.url
      && source.version === navSource.version
    ))) {
      report.sources = [...report.sources, navSource];
    }
  }

  if (longHistory?.ok && shareholderReturnContributes) {
    const historySource = longHistory.source;
    if (!report.sources.some((source) => (
      source.provider === historySource.provider
      && source.url === historySource.url
      && source.version === historySource.version
    ))) {
      report.sources = [...report.sources, historySource];
    }
  }

  const navDiagnostic: ProviderDiagnostic = officialNav.ok
    ? navComparable
      ? officialNav.data.diagnostic
      : {
        ...officialNav.data.diagnostic,
        status: "partial",
        reason: "official_nav_stale_or_unverifiable_for_market_comparison",
      }
    : officialNav.diagnostic;
  if (!(report.providerDiagnostics ?? []).some((diagnostic) => (
    diagnostic.provider === navDiagnostic.provider
    && diagnostic.status === navDiagnostic.status
    && diagnostic.reason === navDiagnostic.reason
  ))) {
    report.providerDiagnostics = [...(report.providerDiagnostics ?? []), navDiagnostic];
  }

  if (longHistory) {
    const historyDiagnostic: ProviderDiagnostic = longHistory.ok && !shareholderReturnContributes
      ? {
        ...longHistory.diagnostic,
        status: "partial",
        reason: "adjusted_close_history_insufficient_for_3y_5y_shareholder_returns",
      }
      : longHistory.diagnostic;
    if (!(report.providerDiagnostics ?? []).some((diagnostic) => (
      diagnostic.provider === historyDiagnostic.provider
      && diagnostic.status === historyDiagnostic.status
      && diagnostic.reason === historyDiagnostic.reason
    ))) {
      report.providerDiagnostics = [...(report.providerDiagnostics ?? []), historyDiagnostic];
    }
  }

  if (analysis.score.score !== null) {
    report.score.score = analysis.score.score;
    report.score.personalizedScore = analysis.score.score;
  }
  report.score.confidence = Math.round(Math.min(report.score.confidence, Math.max(0, analysis.score.coverage * 100)));
  const missing = analysis.score.missing;
  const gateMessage = specialistCoverageGateMessage("Investment-company", analysis.score.coverage);
  if (missing.length || gateMessage || navFreshnessMessage) {
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      ...(navFreshnessMessage ? [navFreshnessMessage] : []),
      ...(missing.length ? [`Investment-company model requires verified NAV/SOTP inputs for full scoring: ${missing.join(", ")}. Missing NAV inputs remain N/A and are never replaced with consolidated book equity.`] : []),
      ...(gateMessage ? [gateMessage] : []),
    ])];
  }
  return report;
}

export function supportsUniversalSecurityAnalysis(company: CompanySearchResult): boolean {
  const securityType = inferSecurityType(company);
  return securityType === "Common Stock" || securityType === "ETF/Fund";
}

export async function analyzeCompany(args: AnalyzeArgs): Promise<CoreAnalyzeResult> {
  const securityType = inferSecurityType(args.company);
  if (securityType === "ETF/Fund") return analyzeEtfSecurity(args);
  const core = await analyzeOperatingCompany(args);
  if (!core.ok) return core;
  const report = await enrichInvestmentCompanyReport(core.data as UniversalSecurityReport, args.company);
  return {
    ...core,
    data: report,
    sources: report.sources,
  };
}
