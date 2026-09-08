import { randomUUID } from "node:crypto";
import {
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
import {
  analyzeCompany as analyzeOperatingCompany,
  fetchConfiguredMarketData,
  searchCompanies,
} from "./enhanced-provider";
import { classifyFundStructure } from "./fund-structure-classification";
import { deriveInvestmentCompanyCapitalAllocation } from "./investment-company-capital-allocation";
import { deriveInvestmentCompanyDividendQuality } from "./investment-company-dividend-quality";
import { deriveInvestmentCompanyGovernance } from "./investment-company-governance";
import { enrichInvestmentCompanyHoldingsQuality } from "./investment-company-holdings-quality";
import {
  deriveInvestmentCompanyAnnualNavGrowth,
  deriveInvestmentCompanyNavGrowth,
  type InvestmentCompanyNavGrowth,
} from "./investment-company-nav-history";
import { deriveInvestmentCompanyShareholderReturns } from "./investment-company-shareholder-return";
import { fetchOfficialInvestmentCompanyGovernance } from "./official-investment-company-governance";
import { fetchOfficialInvestmentCompanyHoldings } from "./official-investment-company-holdings";
import {
  fetchOfficialInvestmentCompanyKeyRatios,
  selectVerifiedAnnualLeverageRatio,
} from "./official-investment-company-key-ratios";
import { fetchOfficialInvestmentCompanyLeverage } from "./official-investment-company-leverage";
import { fetchOfficialInvestmentCompanyNav } from "./official-investment-company-nav";
import { inferSecurityType } from "./security-classification";
import { fetchYahooEtfData } from "./yahoo-etf";
import { fetchYahooEtfHoldingFundamentals } from "./yahoo-etf-holding-fundamentals";
import { fetchYahooLongHistory } from "./yahoo-long-history";

export { searchCompanies };

const INVESTMENT_COMPANY_DISCLOSURE_MAX_AGE_DAYS = 120;

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
  const coverage = Math.round(result.score.coverage * 100);
  const type = (result.subtype ?? "equity_etf").replaceAll("_", " ").toUpperCase();
  const missing = result.score.missing.length ? ` Missing/N/A factors: ${result.score.missing.join(", ")}.` : "";
  return {
    oneSentence: `${company.name} is analyzed as ${type} with StockBox ETF score ${score} at ${coverage}% factor coverage.`,
    summary: `StockBox used the ETF-specific model instead of corporate revenue, margin and P/E scoring. The model evaluates underlying holdings where available, look-through valuation, cost, diversification, liquidity, tracking quality, risk-adjusted returns, concentration, fund stability and product structure.${missing}`,
  };
}

function isOfficialDisclosureComparable(disclosureAsOf: string | null, marketAsOf: string | null): boolean {
  if (!disclosureAsOf || !marketAsOf) return false;
  const disclosureMs = Date.parse(disclosureAsOf);
  const marketMs = Date.parse(marketAsOf);
  if (!Number.isFinite(disclosureMs) || !Number.isFinite(marketMs)) return false;
  const ageDays = (marketMs - disclosureMs) / 86_400_000;
  return ageDays >= 0 && ageDays <= INVESTMENT_COMPANY_DISCLOSURE_MAX_AGE_DAYS;
}

function emptyInvestmentCompanyNavGrowth(): InvestmentCompanyNavGrowth {
  return { navGrowth1y: null, navGrowth3yCagr: null, navGrowth5yCagr: null };
}

function marketYearFromDate(marketAsOf: string | null): number | undefined {
  if (!marketAsOf) return undefined;
  const timestamp = Date.parse(marketAsOf);
  return Number.isFinite(timestamp) ? new Date(timestamp).getUTCFullYear() : undefined;
}

async function analyzeEtfSecurity(args: AnalyzeArgs): Promise<CoreAnalyzeResult> {
  const accessedAt = new Date().toISOString();
  const [marketResult, etfResult] = await Promise.all([
    fetchConfiguredMarketData(args.company),
    fetchYahooEtfData(args.company),
  ]);
  const market = marketResult.ok ? marketResult.data : null;
  if (!etfResult.ok) {
    return {
      ok: false,
      error: "ETF-specific metadata is unavailable for this security.",
      sources: [],
      warnings: [etfResult.message],
      providerDiagnostics: [marketResult.diagnostic, etfResult.diagnostic],
    };
  }

  const fundStructure = classifyFundStructure({
    company: args.company,
    quoteType: etfResult.data.quoteType,
    category: etfResult.data.category,
  });
  if (fundStructure.structure !== "exchange_traded_fund") {
    const closedEnd = fundStructure.structure === "closed_end_fund";
    return {
      ok: false,
      error: closedEnd
        ? "Closed-end fund specialist analysis is not yet available for this security."
        : "Fund structure could not be verified well enough to select a specialist model.",
      sources: [etfResult.data.source],
      warnings: [fundStructure.reason],
      providerDiagnostics: [marketResult.diagnostic, etfResult.data.diagnostic],
    };
  }

  const input = {
    ...etfResult.data.input,
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
  const sources = [etfResult.data.source];
  const providerDiagnostics: ProviderDiagnostic[] = [marketResult.diagnostic, etfResult.data.diagnostic];
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
    modelVersion: "universal-security-v1",
    reportSchemaVersion: "universal-security-v1",
    dataCoverage: analysis.score.coverage,
    market: market ?? undefined,
    dataAsOf: market?.date ?? null,
    dataStatus: market || etfResult.ok ? "current" : "unavailable",
    providerDiagnostics,
    securityClassification: classification,
    securityAnalysis: { etf: analysis },
  };
  report.score.missingData = [...new Set([...report.score.missingData, ...analysis.warnings])];
  return {
    ok: true,
    data: report,
    sources,
    warnings: analysis.warnings,
  };
}

async function enrichInvestmentCompanyReport(
  report: UniversalSecurityReport,
  company: CompanySearchResult,
): Promise<UniversalSecurityReport> {
  if (report.analysisArchetype !== "holding_company") return report;
  const latest = report.engine?.metrics.latestPeriod ?? null;
  const marketDate = report.dataAsOf ?? report.market?.date ?? null;
  const marketYear = marketYearFromDate(marketDate);
  const [officialNav, longHistory, officialHoldings, officialKeyRatios, officialLeverage, officialGovernance] = await Promise.all([
    fetchOfficialInvestmentCompanyNav(company),
    marketDate ? fetchYahooLongHistory(company) : Promise.resolve(null),
    fetchOfficialInvestmentCompanyHoldings(company),
    fetchOfficialInvestmentCompanyKeyRatios(company),
    fetchOfficialInvestmentCompanyLeverage(company),
    fetchOfficialInvestmentCompanyGovernance(company),
  ]);
  const navComparable = officialNav.ok
    && isOfficialDisclosureComparable(officialNav.data.navAsOf, marketDate);
  const holdingsComparable = officialHoldings.ok
    && isOfficialDisclosureComparable(officialHoldings.data.asOf, marketDate);
  const leverageComparable = officialLeverage.ok
    && isOfficialDisclosureComparable(officialLeverage.data.asOf, marketDate);
  const governanceComparable = officialGovernance.ok
    && isOfficialDisclosureComparable(officialGovernance.data.asOf, marketDate);
  const governance = officialGovernance.ok && governanceComparable
    ? deriveInvestmentCompanyGovernance(officialGovernance.data.directors)
    : null;
  const governanceContributes = governance?.score !== null && governance?.score !== undefined;
  const annualLeverageRatio = officialKeyRatios.ok
    ? selectVerifiedAnnualLeverageRatio(officialKeyRatios.data.years, marketYear)
    : null;
  const annualLeverageContributes = annualLeverageRatio !== null;
  const verifiedLeverageRatio = annualLeverageRatio
    ?? (leverageComparable && officialLeverage.ok ? officialLeverage.data.ratio : null);
  const capitalAllocation = officialKeyRatios.ok && marketYear !== undefined
    ? deriveInvestmentCompanyCapitalAllocation(
      officialKeyRatios.data.years.filter((point) => point.year < marketYear),
    )
    : null;
  const capitalAllocationContributes = capitalAllocation?.score !== null && capitalAllocation?.score !== undefined;
  const dividendQuality = officialKeyRatios.ok && marketYear !== undefined
    ? deriveInvestmentCompanyDividendQuality(
      officialKeyRatios.data.years.filter((point) => point.year < marketYear),
    )
    : null;
  const dividendQualityContributes = dividendQuality?.score !== null && dividendQuality?.score !== undefined;
  const datedNavGrowth = officialNav.ok && navComparable && officialNav.data.navAsOf
    ? deriveInvestmentCompanyNavGrowth(officialNav.data.navPerShareHistory, officialNav.data.navAsOf)
    : emptyInvestmentCompanyNavGrowth();
  const annualNavGrowth = officialNav.ok && marketYear !== undefined
    ? deriveInvestmentCompanyAnnualNavGrowth(officialNav.data.annualNavPerShareHistory, marketYear)
    : emptyInvestmentCompanyNavGrowth();
  const navGrowth: InvestmentCompanyNavGrowth = {
    navGrowth1y: datedNavGrowth.navGrowth1y ?? annualNavGrowth.navGrowth1y,
    navGrowth3yCagr: datedNavGrowth.navGrowth3yCagr ?? annualNavGrowth.navGrowth3yCagr,
    navGrowth5yCagr: datedNavGrowth.navGrowth5yCagr ?? annualNavGrowth.navGrowth5yCagr,
  };
  const shareholderReturns = longHistory?.ok && marketDate
    ? deriveInvestmentCompanyShareholderReturns(longHistory.data.adjustedPriceHistory, marketDate)
    : { shareholderReturn3yCagr: null, shareholderReturn5yCagr: null };
  const shareholderReturnContributes = shareholderReturns.shareholderReturn3yCagr !== null
    || shareholderReturns.shareholderReturn5yCagr !== null;
  let investmentHoldings: EtfHolding[] | undefined = holdingsComparable
    ? officialHoldings.data.holdings.map((holding) => ({
      name: holding.name,
      weight: holding.weight,
      issuerFundamentalsEligible: holding.issuerFundamentalsEligible,
    }))
    : undefined;
  const holdingsQualitySources = [];
  const holdingsQualityDiagnostics: ProviderDiagnostic[] = [];
  let holdingsQualityMessage: string | null = null;

  if (investmentHoldings?.length) {
    const enrichment = await enrichInvestmentCompanyHoldingsQuality(
      investmentHoldings,
      {
        searchCompanies,
        fetchHoldingFundamentals: fetchYahooEtfHoldingFundamentals,
      },
      { maxSearches: 12 },
    );
    investmentHoldings = enrichment.holdings;
    holdingsQualitySources.push(...enrichment.sources);
    holdingsQualityDiagnostics.push(...enrichment.diagnostics);
    if (!enrichment.targetReached) {
      holdingsQualityMessage = enrichment.budgetExhausted
        ? "Investment-company holdings-quality enrichment reached its search budget before 80% of total portfolio weight had verified quality evidence; unresolved and private holdings remain in the denominator and holdings quality stays N/A."
        : "Investment-company holdings quality could not be verified across 80% of total official portfolio weight; unresolved and private holdings remain in the denominator and holdings quality stays N/A.";
    }
  }

  const analysis = analyzeInvestmentCompany({
    sharePrice: report.market?.price ?? null,
    dilutedShares: report.market?.sharesOutstanding ?? latest?.currentSharesOutstanding ?? latest?.sharesDiluted ?? null,
    holdingCompanyLeverageRatio: verifiedLeverageRatio,
    capitalAllocationScore: capitalAllocation?.score ?? null,
    managementGovernanceScore: governance?.score ?? null,
    dividendQualityScore: dividendQuality?.score ?? null,
    reportedNav: navComparable ? officialNav.data.reportedNav : null,
    reportedNavPerShare: navComparable ? officialNav.data.reportedNavPerShare : null,
    ...navGrowth,
    ...shareholderReturns,
    holdings: investmentHoldings,
  });

  if (officialNav.ok) {
    const navSources = [
      officialNav.data.source,
      ...(officialNav.data.historySource ? [officialNav.data.historySource] : []),
    ];
    for (const source of navSources) {
      if (!report.sources.some((existing) => (
        existing.provider === source.provider
        && existing.url === source.url
        && existing.version === source.version
      ))) {
        report.sources = [...report.sources, source];
      }
    }
    report.providerDiagnostics = [
      ...(report.providerDiagnostics ?? []),
      officialNav.data.diagnostic,
    ];
    if (!navComparable) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        `Official NAV dated ${officialNav.data.navAsOf ?? "unknown"} is not comparable with market data dated ${marketDate ?? "unknown"} and was excluded from specialist coverage.`,
      ])];
    }
  } else {
    report.providerDiagnostics = [
      ...(report.providerDiagnostics ?? []),
      officialNav.diagnostic,
    ];
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      `Official investment-company NAV unavailable: ${officialNav.message}`,
    ])];
  }

  if (officialHoldings.ok) {
    const holdingsSource = officialHoldings.data.source;
    if (!report.sources.some((existing) => (
      existing.provider === holdingsSource.provider
      && existing.url === holdingsSource.url
      && existing.version === holdingsSource.version
    ))) {
      report.sources = [...report.sources, holdingsSource];
    }
    const holdingsDiagnostic: ProviderDiagnostic = holdingsComparable
      ? officialHoldings.data.diagnostic
      : {
        ...officialHoldings.data.diagnostic,
        status: "partial",
        reason: "official_holdings_stale_or_unverifiable_for_market_comparison",
      };
    report.providerDiagnostics = [...(report.providerDiagnostics ?? []), holdingsDiagnostic];
    if (!holdingsComparable) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        `Official holdings dated ${officialHoldings.data.asOf} are not comparable with market data dated ${marketDate ?? "unknown"} and were excluded from specialist coverage.`,
      ])];
    }
  } else {
    report.providerDiagnostics = [
      ...(report.providerDiagnostics ?? []),
      officialHoldings.diagnostic,
    ];
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      `Official investment-company holdings unavailable: ${officialHoldings.message}`,
    ])];
  }

  if (officialKeyRatios.ok) {
    const keyRatioSource = officialKeyRatios.data.source;
    if (!report.sources.some((existing) => (
      existing.provider === keyRatioSource.provider
      && existing.url === keyRatioSource.url
      && existing.version === keyRatioSource.version
    ))) {
      report.sources = [...report.sources, keyRatioSource];
    }
    const keyRatiosContribute = annualLeverageContributes || capitalAllocationContributes || dividendQualityContributes;
    const keyRatioDiagnostic: ProviderDiagnostic = keyRatiosContribute
      ? officialKeyRatios.data.diagnostic
      : {
        ...officialKeyRatios.data.diagnostic,
        status: "partial",
        reason: "official_key_ratios_not_usable_for_specialist_factors",
      };
    report.providerDiagnostics = [...(report.providerDiagnostics ?? []), keyRatioDiagnostic];
    if (!annualLeverageContributes) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        `Official annual leverage history does not contain a valid issuer ratio in the market year or immediately preceding year for market data dated ${marketDate ?? "unknown"}; annual leverage was excluded from specialist coverage.`,
      ])];
    }
    if (!capitalAllocationContributes) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        `Official capital-allocation evidence is incomplete or unsuitable (${capitalAllocation?.reason ?? "market_year_unavailable"}); capital allocation remains N/A.`,
      ])];
    }
    if (!dividendQualityContributes) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        `Official dividend-quality evidence is incomplete or unsuitable (${dividendQuality?.reason ?? "market_year_unavailable"}); dividend quality remains N/A.`,
      ])];
    }
  }

  if (officialLeverage.ok) {
    const leverageSource = officialLeverage.data.source;
    if (!report.sources.some((existing) => (
      existing.provider === leverageSource.provider
      && existing.url === leverageSource.url
      && existing.version === leverageSource.version
    ))) {
      report.sources = [...report.sources, leverageSource];
    }
    const leverageDiagnostic: ProviderDiagnostic = leverageComparable
      ? officialLeverage.data.diagnostic
      : {
        ...officialLeverage.data.diagnostic,
        status: "partial",
        reason: "official_leverage_stale_or_unverifiable_for_market_comparison",
      };
    report.providerDiagnostics = [...(report.providerDiagnostics ?? []), leverageDiagnostic];
    if (!leverageComparable && !annualLeverageContributes) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        `Official leverage dated ${officialLeverage.data.asOf} is not comparable with market data dated ${marketDate ?? "unknown"} and was excluded from specialist coverage.`,
      ])];
    }
  } else if (!annualLeverageContributes) {
    report.providerDiagnostics = [
      ...(report.providerDiagnostics ?? []),
      officialLeverage.diagnostic,
    ];
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      `Official investment-company leverage unavailable: ${officialLeverage.message}`,
    ])];
  }

  if (officialGovernance.ok) {
    if (governanceComparable && governanceContributes) {
      for (const source of officialGovernance.data.sources) {
        if (!report.sources.some((existing) => (
          existing.provider === source.provider
          && existing.url === source.url
          && existing.version === source.version
        ))) {
          report.sources = [...report.sources, source];
        }
      }
      report.providerDiagnostics = [...(report.providerDiagnostics ?? []), officialGovernance.data.diagnostic];
    } else {
      report.providerDiagnostics = [...(report.providerDiagnostics ?? []), {
        ...officialGovernance.data.diagnostic,
        status: "partial",
        reason: governanceComparable
          ? "official_governance_incomplete_after_derivation"
          : "official_governance_stale_or_unverifiable_for_market_comparison",
      }];
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        governanceComparable
          ? `Official governance evidence is incomplete (${governance?.reason ?? "unknown"}); governance remains N/A.`
          : `Official governance evidence dated ${officialGovernance.data.asOf} is not comparable with market data dated ${marketDate ?? "unknown"} and was excluded from specialist coverage.`,
      ])];
    }
  } else {
    report.providerDiagnostics = [...(report.providerDiagnostics ?? []), officialGovernance.diagnostic];
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      `Official investment-company governance unavailable: ${officialGovernance.message}`,
    ])];
  }

  for (const source of holdingsQualitySources) {
    if (!report.sources.some((existing) => (
      existing.provider === source.provider
      && existing.url === source.url
      && existing.version === source.version
    ))) {
      report.sources = [...report.sources, source];
    }
  }
  for (const diagnostic of holdingsQualityDiagnostics) {
    if (!(report.providerDiagnostics ?? []).some((existing) => (
      existing.provider === diagnostic.provider
      && existing.capability === diagnostic.capability
      && existing.status === diagnostic.status
      && existing.reason === diagnostic.reason
    ))) {
      report.providerDiagnostics = [...(report.providerDiagnostics ?? []), diagnostic];
    }
  }
  if (holdingsQualityMessage) {
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      holdingsQualityMessage,
    ])];
  }

  if (longHistory) {
    const historyDiagnostic = longHistory.diagnostic;
    if (!(report.providerDiagnostics ?? []).some((existing) => (
      existing.provider === historyDiagnostic.provider
      && existing.capability === historyDiagnostic.capability
      && existing.status === historyDiagnostic.status
      && existing.reason === historyDiagnostic.reason
    ))) {
      report.providerDiagnostics = [...(report.providerDiagnostics ?? []), historyDiagnostic];
    }

    if (longHistory.ok && shareholderReturnContributes) {
      const historySource = longHistory.source;
      if (!report.sources.some((existing) => (
        existing.provider === historySource.provider
        && existing.url === historySource.url
        && existing.version === historySource.version
      ))) {
        report.sources = [...report.sources, historySource];
      }
    } else if (!longHistory.ok) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        `Adjusted shareholder-return history unavailable: ${longHistory.reason}.`,
      ])];
    } else if (!shareholderReturnContributes) {
      report.score.missingData = [...new Set([
        ...report.score.missingData,
        "Adjusted shareholder-return history did not contain a fresh current observation and a verified 3Y or 5Y anniversary anchor; shareholder return remains N/A.",
      ])];
    }
  }

  report.securityClassification = classifyUniversalSecurity({
    company: { ticker: report.ticker, name: report.companyName, securityType: "Common Stock" },
    analysisArchetype: "holding_company",
  });
  report.securityAnalysis = { ...(report.securityAnalysis ?? {}), investmentCompany: analysis };
  report.dataCoverage = analysis.score.coverage;
  report.recommendation = recommendationForScore(analysis.score.score, analysis.score.coverage);
  if (analysis.score.score !== null) {
    report.score.score = analysis.score.score;
    report.score.personalizedScore = analysis.score.score;
    report.score.confidence = Math.round(Math.min(report.score.confidence, analysis.score.coverage * 100));
  }
  const missing = analysis.score.missing;
  const gateMessage = specialistCoverageGateMessage("Investment company", analysis.score.coverage);
  const specialistMessages = [
    ...(missing.length
      ? [`Investment-company model requires verified NAV/SOTP inputs for full scoring: ${missing.join(", ")}. Missing NAV inputs remain N/A and are never replaced with consolidated book equity.`]
      : []),
    ...(gateMessage ? [gateMessage] : []),
  ];
  if (specialistMessages.length) {
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      ...specialistMessages,
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
  return { ...core, data: await enrichInvestmentCompanyReport(core.data as UniversalSecurityReport, args.company) };
}
