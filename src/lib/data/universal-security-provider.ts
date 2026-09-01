import { randomUUID } from "node:crypto";
import {
  analyzeEtf,
  analyzeInvestmentCompany,
  classifyUniversalSecurity,
  type EtfAnalysisResult,
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
import { inferSecurityType } from "./security-classification";
import { fetchYahooEtfData } from "./yahoo-etf";

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
  if (score === null || coverage < 0.5) return "No Rating";
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
  return {
    score: result.score.score,
    personalizedScore: result.score.score,
    confidence: Math.round(Math.min(98, Math.max(5, result.score.coverage * 100))),
    dimensions,
    missingData: result.score.missing,
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
  const type = result.subtype.replaceAll("_", " ").toUpperCase();
  const missing = result.score.missing.length ? ` Missing/N/A factors: ${result.score.missing.join(", ")}.` : "";
  return {
    oneSentence: `${company.name} is analyzed as ${type} with StockBox ETF score ${score} at ${coverage}% factor coverage.`,
    summary: `StockBox used the ETF-specific model instead of corporate revenue, margin and P/E scoring. The model evaluates underlying holdings where available, look-through valuation, cost, diversification, liquidity, tracking quality, risk-adjusted returns, concentration, fund stability and product structure.${missing}`,
  };
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

function enrichInvestmentCompanyReport(report: UniversalSecurityReport): UniversalSecurityReport {
  if (report.analysisArchetype !== "holding_company") return report;
  const latest = report.engine?.metrics.latestPeriod ?? null;
  const analysis = analyzeInvestmentCompany({
    sharePrice: report.market?.price ?? null,
    dilutedShares: report.market?.sharesOutstanding ?? latest?.currentSharesOutstanding ?? latest?.sharesDiluted ?? null,
    cash: latest?.cashAndEquivalents ?? null,
    debt: latest?.totalDebt ?? null,
  });
  report.securityClassification = classifyUniversalSecurity({
    company: { ticker: report.ticker, name: report.companyName, securityType: "Common Stock" },
    analysisArchetype: "holding_company",
  });
  report.securityAnalysis = { ...(report.securityAnalysis ?? {}), investmentCompany: analysis };
  if (analysis.score.score !== null) {
    report.score.score = analysis.score.score;
    report.score.personalizedScore = analysis.score.score;
    report.score.confidence = Math.round(Math.min(report.score.confidence, analysis.score.coverage * 100));
  }
  const missing = analysis.score.missing;
  if (missing.length) {
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      `Investment-company model requires verified NAV/SOTP inputs for full scoring: ${missing.join(", ")}. Missing NAV inputs remain N/A and are never replaced with consolidated book equity.`,
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
  return { ...core, data: enrichInvestmentCompanyReport(core.data as UniversalSecurityReport) };
}
