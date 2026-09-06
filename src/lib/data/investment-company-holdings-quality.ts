import {
  computeLookThroughMetrics,
  type EtfHolding,
} from "@/lib/analysis/universal-security";
import type {
  AnalysisSource,
  CompanySearchResult,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import type { EtfHoldingFundamentalData } from "./etf-look-through-enrichment";
import { resolveInvestmentCompanyHoldingCandidate } from "./investment-company-holding-resolver";

const QUALITY_TARGET_WEIGHT = 0.80;
const DEFAULT_MAX_SEARCHES = 12;

export type InvestmentCompanyHoldingFundamentalsResult =
  | {
      ok: true;
      data: EtfHoldingFundamentalData;
      source: AnalysisSource;
      diagnostic: ProviderDiagnostic;
    }
  | {
      ok: false;
      message?: string;
      diagnostic: ProviderDiagnostic;
    };

export type InvestmentCompanyHoldingsQualityDependencies = {
  searchCompanies: (query: string) => Promise<CompanySearchResult[]>;
  fetchHoldingFundamentals: (holding: EtfHolding) => Promise<InvestmentCompanyHoldingFundamentalsResult>;
};

export type InvestmentCompanyHoldingsQualityResult = {
  holdings: EtfHolding[];
  qualityCoveredWeight: number;
  targetReached: boolean;
  searchedNames: string[];
  attemptedTickers: string[];
  sources: AnalysisSource[];
  diagnostics: ProviderDiagnostic[];
  budgetExhausted: boolean;
};

function contributes(holding: EtfHolding, data: EtfHoldingFundamentalData): boolean {
  return (Object.keys(data) as Array<keyof EtfHoldingFundamentalData>).some((key) => {
    const value = data[key];
    return value !== null && value !== undefined && (holding[key] === null || holding[key] === undefined);
  });
}

function mergeVerifiedFields(holding: EtfHolding, data: EtfHoldingFundamentalData): EtfHolding {
  return {
    ...holding,
    sector: holding.sector ?? data.sector,
    country: holding.country ?? data.country,
    stockBoxScore: holding.stockBoxScore ?? data.stockBoxScore,
    revenueGrowth: holding.revenueGrowth ?? data.revenueGrowth,
    epsGrowth: holding.epsGrowth ?? data.epsGrowth,
    roic: holding.roic ?? data.roic,
    operatingMargin: holding.operatingMargin ?? data.operatingMargin,
    netDebtToEbitda: holding.netDebtToEbitda ?? data.netDebtToEbitda,
    forwardPe: holding.forwardPe ?? data.forwardPe,
    priceBook: holding.priceBook ?? data.priceBook,
    freeCashFlowYield: holding.freeCashFlowYield ?? data.freeCashFlowYield,
    dividendYield: holding.dividendYield ?? data.dividendYield,
  };
}

function qualityWeight(holdings: EtfHolding[]): number {
  return computeLookThroughMetrics(holdings).qualityCoveredWeight;
}

function maximumReachableWeight(holdings: EtfHolding[]): number {
  return Math.min(1, holdings.reduce((sum, holding) => (
    Number.isFinite(holding.weight) && holding.weight > 0 ? sum + holding.weight : sum
  ), 0));
}

function pushUniqueSource(sources: AnalysisSource[], source: AnalysisSource): void {
  if (sources.some((item) => item.provider === source.provider && item.version === source.version)) return;
  sources.push(source);
}

function pushUniqueDiagnostic(diagnostics: ProviderDiagnostic[], diagnostic: ProviderDiagnostic): void {
  if (diagnostics.some((item) => (
    item.provider === diagnostic.provider
    && item.status === diagnostic.status
    && item.reason === diagnostic.reason
  ))) return;
  diagnostics.push(diagnostic);
}

export async function enrichInvestmentCompanyHoldingsQuality(
  holdings: EtfHolding[],
  dependencies: InvestmentCompanyHoldingsQualityDependencies,
  options: { maxSearches?: number } = {},
): Promise<InvestmentCompanyHoldingsQualityResult> {
  const enriched = holdings.map((holding) => ({ ...holding }));
  const maxSearches = Math.max(0, Math.floor(options.maxSearches ?? DEFAULT_MAX_SEARCHES));
  const searchedNames: string[] = [];
  const attemptedTickers: string[] = [];
  const sources: AnalysisSource[] = [];
  const diagnostics: ProviderDiagnostic[] = [];
  let qualityCoveredWeight = qualityWeight(enriched);

  if (qualityCoveredWeight >= QUALITY_TARGET_WEIGHT || maximumReachableWeight(enriched) < QUALITY_TARGET_WEIGHT) {
    return {
      holdings: enriched,
      qualityCoveredWeight,
      targetReached: qualityCoveredWeight >= QUALITY_TARGET_WEIGHT,
      searchedNames,
      attemptedTickers,
      sources,
      diagnostics,
      budgetExhausted: false,
    };
  }

  const candidates = enriched
    .map((holding, index) => ({ holding, index }))
    .filter(({ holding }) => Number.isFinite(holding.weight) && holding.weight > 0)
    .sort((left, right) => right.holding.weight - left.holding.weight);

  let candidateIndex = 0;
  while (
    candidateIndex < candidates.length
    && searchedNames.length < maxSearches
    && qualityCoveredWeight < QUALITY_TARGET_WEIGHT
  ) {
    const candidate = candidates[candidateIndex];
    candidateIndex += 1;
    searchedNames.push(candidate.holding.name);

    let searchResults: CompanySearchResult[];
    try {
      const rawSearchResults = await dependencies.searchCompanies(candidate.holding.name);
      searchResults = Array.isArray(rawSearchResults) ? rawSearchResults : [];
    } catch {
      continue;
    }

    const resolved = resolveInvestmentCompanyHoldingCandidate(candidate.holding.name, searchResults);
    if (!resolved) continue;

    const ticker = (resolved.canonicalTicker ?? resolved.ticker).trim();
    if (!ticker) continue;
    attemptedTickers.push(ticker);
    const holdingWithTicker: EtfHolding = { ...enriched[candidate.index], ticker };
    enriched[candidate.index] = holdingWithTicker;

    let result: InvestmentCompanyHoldingFundamentalsResult;
    try {
      result = await dependencies.fetchHoldingFundamentals(holdingWithTicker);
    } catch {
      continue;
    }
    if (!result.ok || !contributes(holdingWithTicker, result.data)) continue;

    enriched[candidate.index] = mergeVerifiedFields(holdingWithTicker, result.data);
    pushUniqueSource(sources, result.source);
    pushUniqueDiagnostic(diagnostics, result.diagnostic);
    qualityCoveredWeight = qualityWeight(enriched);
  }

  const targetReached = qualityCoveredWeight >= QUALITY_TARGET_WEIGHT;
  return {
    holdings: enriched,
    qualityCoveredWeight,
    targetReached,
    searchedNames,
    attemptedTickers,
    sources,
    diagnostics,
    budgetExhausted: !targetReached && searchedNames.length >= maxSearches && candidateIndex < candidates.length,
  };
}
