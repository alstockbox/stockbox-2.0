import { analyzeFinancials, presentAnalysisReport, toFinancialAnalysisInput } from "@/lib/analysis/engine";
import { dataDateStatus, DATA_FRESHNESS_THRESHOLDS_DAYS } from "@/lib/analysis/freshness";
import { attachInstitutionalResearch } from "@/lib/analysis/research";
import type {
  AnalysisReport,
  AnalysisSource,
  AnalysisType,
  CompanyFundamentals,
  CompanySearchResult,
  FinancialPeriod,
  InvestmentProfile,
  MarketSnapshot,
  MetricProvenance,
  ProviderDiagnostic,
  ProviderSourceConflict,
} from "@/lib/analysis/types";
import { getMarketDataProviderChain, getServerEnv, type ServerEnv } from "@/lib/env/server";
import { searchCompanyCatalog } from "./company-search";
import { fetchCompanyFundamentalsResult } from "./sec";
import { fetchSecSubmissionEvents } from "./sec-submissions";
import { stooqMarketDataProvider } from "./stooq";
import { providerDiagnostic, type AdapterResult, type MarketDataProvider, type ProviderFailureReason } from "./providers";
import { createTwelveDataMarketProvider, createTwelveDataSearchProvider } from "./twelve-data";
import { yahooMarketDataProvider } from "./yahoo-market";
import { fetchYahooFundamentalsResult, yahooCompanySearchProvider, yahooSymbolForCompany } from "./yahoo-fundamentals";
import { canAttemptConfiguredFundamentals } from "./security-classification";
import { PROVIDER_ADAPTER_VERSIONS, providerAdapterVersion } from "./provider-versions";

export type ProviderResult<T> =
  | { ok: true; data: T; sources: AnalysisSource[]; warnings: string[] }
  | { ok: false; error: string; sources: AnalysisSource[]; warnings: string[] };

type FundamentalsResolution = {
  result: AdapterResult<CompanyFundamentals>;
  diagnostics: ProviderDiagnostic[];
  sources?: Array<Omit<AnalysisSource, "accessedAt">>;
};

const UNSUPPORTED_SECURITY_ERROR = "Live fundamentals are not available for this security.";

function yahooFundamentalsSource(company: CompanySearchResult): Omit<AnalysisSource, "accessedAt"> {
  const symbol = yahooSymbolForCompany(company);
  return {
    name: "Yahoo Finance reported fundamentals",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/financials/`,
    freshness: "Reported annual, quarterly and trailing fundamentals, cached up to 30 minutes.",
    provider: "yahoo-fundamentals",
    capability: "fundamentals",
    dataAsOf: null,
    version: PROVIDER_ADAPTER_VERSIONS.yahooFundamentals,
  };
}

const CORE_FUNDAMENTAL_FIELDS = [
  "revenue", "operatingIncome", "netIncome", "operatingCashFlow", "capitalExpenditures",
  "totalAssets", "totalLiabilities", "totalEquity", "cashAndEquivalents", "totalDebt",
] as const satisfies ReadonlyArray<keyof FinancialPeriod>;

const MERGEABLE_FINANCIAL_FIELDS = [
  "revenue", "grossProfit", "costOfRevenue", "operatingIncome", "ebitda", "netIncome",
  "netIncomeCommonStockholders", "dilutedNetIncomeAvailableToCommon", "epsDiluted", "operatingCashFlow", "capitalExpenditures", "freeCashFlow", "cashAndEquivalents", "totalDebt",
  "totalEquity", "minorityInterest", "totalAssets", "totalLiabilities", "currentAssets", "currentLiabilities",
  "interestExpense", "pretaxIncome", "incomeTaxExpense", "depreciationAndAmortization", "dividendsPaid",
  "sharesDiluted", "currentSharesOutstanding", "restrictedCash", "marketableSecurities", "shortTermDebt",
  "longTermDebt", "commercialPaper", "currentPortionLongTermDebt", "stockBasedCompensation",
  "researchAndDevelopment", "accountsReceivable", "inventory", "netBorrowing", "fundsFromOperations",
  "adjustedFundsFromOperations", "tangibleBookValue",
] as const satisfies ReadonlyArray<keyof FinancialPeriod>;

function finiteMetric(period: FinancialPeriod, field: keyof FinancialPeriod): boolean {
  const value = period[field];
  return typeof value === "number" && Number.isFinite(value);
}

export function fundamentalsCoverageProfile(fundamentals: CompanyFundamentals) {
  const periods = [
    fundamentals.trailingTwelveMonths,
    ...(fundamentals.annualPeriods ?? []),
  ].filter((period): period is FinancialPeriod => Boolean(period));
  const availableFacts = periods.reduce(
    (sum, period) => sum + CORE_FUNDAMENTAL_FIELDS.filter((field) => finiteMetric(period, field)).length,
    0,
  );
  return {
    periodCount: periods.length,
    availableFacts,
    hasFlow: periods.some((period) => [period.revenue, period.netIncome, period.operatingCashFlow]
      .some((value) => typeof value === "number" && Number.isFinite(value))),
    hasBalanceSheet: periods.some((period) => [period.totalAssets, period.totalEquity, period.totalDebt]
      .some((value) => typeof value === "number" && Number.isFinite(value))),
  };
}

function hasUsableFinancialPeriods(fundamentals: CompanyFundamentals): boolean {
  const coverage = fundamentalsCoverageProfile(fundamentals);
  return coverage.periodCount > 0 && coverage.availableFacts > 0;
}

function normalizedProviderCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency ? currency : null;
}

function normalizedProviderTicker(value: string | null | undefined): string | null {
  const ticker = value?.trim().toUpperCase();
  return ticker ? ticker : null;
}

function fundamentalsMatchCompany(company: CompanySearchResult, fundamentals: CompanyFundamentals): boolean {
  if (normalizedProviderTicker(fundamentals.ticker) !== normalizedProviderTicker(company.ticker)) return false;
  if (fundamentals.cik && company.cik) {
    const expected = company.cik.replace(/\D/g, "").padStart(10, "0");
    const actual = fundamentals.cik.replace(/\D/g, "").padStart(10, "0");
    const sourceCiks = (fundamentals.sourceCiks ?? []).map((cik) => cik.replace(/\D/g, "").padStart(10, "0"));
    if (expected !== actual && !sourceCiks.includes(expected)) return false;
  }
  return !company.entityId || !fundamentals.entityId || company.entityId === fundamentals.entityId;
}

function periodKey(period: FinancialPeriod): string | null {
  if (!period.periodEndDate) return null;
  return `${period.periodBasis ?? period.form ?? "unknown"}:${period.periodEndDate}`;
}

function providerRelativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

type MergeConflictPolicy = {
  highThreshold: number;
  mediumThreshold: number;
  comparableValueKinds?: "same" | "reported-or-derived";
};

const DEFAULT_MERGE_CONFLICT_POLICY: MergeConflictPolicy = {
  highThreshold: 0.08,
  mediumThreshold: 0.04,
  comparableValueKinds: "reported-or-derived",
};

const MERGE_CONFLICT_POLICIES: Partial<Record<keyof FinancialPeriod, MergeConflictPolicy>> = {
  ebitda: { highThreshold: 0.25, mediumThreshold: 0.10, comparableValueKinds: "same" },
  freeCashFlow: { highThreshold: 0.20, mediumThreshold: 0.10, comparableValueKinds: "reported-or-derived" },
  totalDebt: { highThreshold: 0.30, mediumThreshold: 0.10, comparableValueKinds: "reported-or-derived" },
  cashAndEquivalents: { highThreshold: 0.15, mediumThreshold: 0.08, comparableValueKinds: "reported-or-derived" },
  totalEquity: { highThreshold: 0.15, mediumThreshold: 0.08, comparableValueKinds: "reported-or-derived" },
  totalAssets: { highThreshold: 0.12, mediumThreshold: 0.06, comparableValueKinds: "reported-or-derived" },
  totalLiabilities: { highThreshold: 0.15, mediumThreshold: 0.08, comparableValueKinds: "reported-or-derived" },
  sharesDiluted: { highThreshold: 0.03, mediumThreshold: 0.015, comparableValueKinds: "reported-or-derived" },
  currentSharesOutstanding: { highThreshold: 0.03, mediumThreshold: 0.015, comparableValueKinds: "reported-or-derived" },
  stockBasedCompensation: { highThreshold: 0.25, mediumThreshold: 0.12, comparableValueKinds: "reported-or-derived" },
  capitalExpenditures: { highThreshold: 0.15, mediumThreshold: 0.08, comparableValueKinds: "reported-or-derived" },
  operatingCashFlow: { highThreshold: 0.12, mediumThreshold: 0.06, comparableValueKinds: "reported-or-derived" },
};

function conflictKey(conflict: ProviderSourceConflict): string {
  return [
    conflict.metric,
    conflict.periodEnd ?? "",
    conflict.primaryProvider,
    conflict.secondaryProvider,
    String(conflict.primaryValue ?? ""),
    String(conflict.secondaryValue ?? ""),
  ].join("|").toLowerCase();
}

function uniqueSourceConflicts(conflicts: ProviderSourceConflict[]): ProviderSourceConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = conflictKey(conflict);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function valuesAreSemanticallyComparable(
  policy: MergeConflictPolicy,
  primaryProvenance: MetricProvenance | undefined,
  secondaryProvenance: MetricProvenance | undefined,
): boolean {
  if (policy.comparableValueKinds !== "same") return true;
  const primaryKind = primaryProvenance?.valueKind;
  const secondaryKind = secondaryProvenance?.valueKind;
  if (!primaryKind || !secondaryKind) return true;
  return primaryKind === secondaryKind;
}

type ShareBasisReconciliation = {
  scale: number;
  primaryProvider: string;
  secondaryProvider: string;
  primaryShares: number;
  secondaryShares: number;
};

function detectShareBasisReconciliation(primary: FinancialPeriod, secondary: FinancialPeriod): ShareBasisReconciliation | null {
  const pEps = primary.epsDiluted, sEps = secondary.epsDiluted;
  const pShares = primary.sharesDiluted, sShares = secondary.sharesDiluted;
  if (![pEps, sEps, pShares, sShares].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  if ((pShares as number) <= 0 || (sShares as number) <= 0 || (pEps as number) * (sEps as number) <= 0) return null;
  const scale = (sShares as number) / (pShares as number);
  if (!(scale >= 1.5 || scale <= 2 / 3)) return null;
  const epsScale = (sEps as number) / (pEps as number);
  if (!Number.isFinite(epsScale) || epsScale <= 0 || Math.abs(epsScale * scale - 1) > 0.03) return null;
  if (providerRelativeDifference((pEps as number) * (pShares as number), (sEps as number) * (sShares as number)) > 0.03) return null;
  return { scale, primaryProvider: primary.provenance?.sharesDiluted?.provider ?? "sec", secondaryProvider: secondary.provenance?.sharesDiluted?.provider ?? "yahoo-fundamentals", primaryShares: pShares as number, secondaryShares: sShares as number };
}

function mergeFinancialPeriod(
  primary: FinancialPeriod,
  secondary: FinancialPeriod,
  conflicts: ProviderSourceConflict[],
): { period: FinancialPeriod; supplemented: number } {
  const primaryCurrency = normalizedProviderCurrency(primary.currency);
  const secondaryCurrency = normalizedProviderCurrency(secondary.currency);
  if (!primaryCurrency || !secondaryCurrency || primaryCurrency !== secondaryCurrency) {
    if (primaryCurrency && secondaryCurrency && primaryCurrency !== secondaryCurrency) {
      conflicts.push({
        metric: "reportingCurrency",
        periodEnd: primary.periodEndDate ?? null,
        primaryProvider: "sec",
        secondaryProvider: "yahoo-fundamentals",
        primaryValue: primaryCurrency,
        secondaryValue: secondaryCurrency,
        relativeDifference: null,
        severity: "high",
        reason: "Same-period provider facts use different reporting currencies.",
      });
    }
    return { period: primary, supplemented: 0 };
  }

  const period: FinancialPeriod = { ...primary, provenance: { ...(primary.provenance ?? {}) } };
  const target = period as unknown as Record<string, unknown>;
  const secondaryRecord = secondary as unknown as Record<string, unknown>;
  const shareBasis = detectShareBasisReconciliation(primary, secondary);
  if (shareBasis) {
    period.shareBasisStatus = "cross_provider_reciprocal";
    period.shareBasisScale = shareBasis.scale;
    conflicts.push({
      metric: "shareBasis", periodEnd: primary.periodEndDate ?? null,
      primaryProvider: shareBasis.primaryProvider, secondaryProvider: shareBasis.secondaryProvider,
      primaryValue: shareBasis.primaryShares, secondaryValue: shareBasis.secondaryShares,
      relativeDifference: providerRelativeDifference(shareBasis.primaryShares, shareBasis.secondaryShares),
      severity: "medium", kind: "share_basis_mismatch", resolved: true,
      reason: "Reciprocal diluted EPS/share ratios preserve implied diluted earnings and indicate a split, ADS or share-unit basis difference rather than an economic disagreement.",
    });
  }
  let supplemented = 0;
  for (const field of MERGEABLE_FINANCIAL_FIELDS) {
    const primaryValue = target[field];
    const secondaryValue = secondaryRecord[field];
    const primaryNumber = typeof primaryValue === "number" && Number.isFinite(primaryValue) ? primaryValue : null;
    const secondaryNumber = typeof secondaryValue === "number" && Number.isFinite(secondaryValue) ? secondaryValue : null;
    if (primaryNumber === null && secondaryNumber !== null) {
      target[field] = secondaryNumber;
      const provenance = secondary.provenance?.[field];
      if (provenance) period.provenance![field] = provenance;
      supplemented += 1;
    } else if (primaryNumber !== null && secondaryNumber !== null) {
      if (shareBasis && (field === "epsDiluted" || field === "sharesDiluted")) continue;
      const primaryProvenance = primary.provenance?.[field];
      const secondaryProvenance = secondary.provenance?.[field];
      const policy = MERGE_CONFLICT_POLICIES[field] ?? DEFAULT_MERGE_CONFLICT_POLICY;
      if (!valuesAreSemanticallyComparable(policy, primaryProvenance, secondaryProvenance)) {
        conflicts.push({
          metric: field,
          periodEnd: primary.periodEndDate ?? null,
          primaryProvider: primaryProvenance?.provider ?? "sec",
          secondaryProvider: secondaryProvenance?.provider ?? "yahoo-fundamentals",
          primaryValue: primaryNumber,
          secondaryValue: secondaryNumber,
          relativeDifference: null,
          severity: "medium",
          reason: "Same-period provider values use different reported/derived definitions and are not directly comparable.",
        });
        continue;
      }
      const difference = providerRelativeDifference(primaryNumber, secondaryNumber);
      if (difference > policy.highThreshold) {
        conflicts.push({
          metric: field,
          periodEnd: primary.periodEndDate ?? null,
          primaryProvider: primaryProvenance?.provider ?? "sec",
          secondaryProvider: secondaryProvenance?.provider ?? "yahoo-fundamentals",
          primaryValue: primaryNumber,
          secondaryValue: secondaryNumber,
          relativeDifference: difference,
          severity: "high",
          reason: `Same-period provider values differ by more than the ${Math.round(policy.highThreshold * 100)}% materiality threshold for ${field}.`,
        });
      } else if (difference > policy.mediumThreshold) {
        conflicts.push({
          metric: field,
          periodEnd: primary.periodEndDate ?? null,
          primaryProvider: primaryProvenance?.provider ?? "sec",
          secondaryProvider: secondaryProvenance?.provider ?? "yahoo-fundamentals",
          primaryValue: primaryNumber,
          secondaryValue: secondaryNumber,
          relativeDifference: difference,
          severity: "medium",
          reason: `Same-period provider values differ by more than the ${Math.round(policy.mediumThreshold * 100)}% review threshold for ${field}.`,
        });
      }
    }
  }
  return { period, supplemented };
}

function mergePeriodCollections(
  primaryPeriods: FinancialPeriod[],
  secondaryPeriods: FinancialPeriod[],
  conflicts: ProviderSourceConflict[],
): { periods: FinancialPeriod[]; supplemented: number } {
  const secondaryByKey = new Map(secondaryPeriods.flatMap((period) => {
    const key = periodKey(period);
    return key ? [[key, period] as const] : [];
  }));
  let supplemented = 0;
  const periods = primaryPeriods.map((primary) => {
    const key = periodKey(primary);
    const secondary = key ? secondaryByKey.get(key) : undefined;
    if (!secondary) return primary;
    secondaryByKey.delete(key as string);
    const merged = mergeFinancialPeriod(primary, secondary, conflicts);
    supplemented += merged.supplemented;
    return merged.period;
  });
  const knownCurrency = periods.map((period) => normalizedProviderCurrency(period.currency)).find(Boolean);
  for (const secondary of secondaryByKey.values()) {
    if (knownCurrency && normalizedProviderCurrency(secondary.currency) === knownCurrency) {
      periods.push(secondary);
      supplemented += CORE_FUNDAMENTAL_FIELDS.filter((field) => finiteMetric(secondary, field)).length;
    }
  }
  return {
    periods: periods.sort((left, right) => (left.periodEndDate ?? "").localeCompare(right.periodEndDate ?? "")),
    supplemented,
  };
}

function classificationForMerge(primary: CompanyFundamentals, secondary: CompanyFundamentals): CompanyFundamentals {
  const primaryArchetype = primary.analysisArchetype;
  const secondaryArchetype = secondary.analysisArchetype;
  if (!primaryArchetype) return secondary;
  if (!secondaryArchetype) return primary;
  const primaryConfidence = primary.classificationDiagnostics?.confidence ?? 0;
  const secondaryConfidence = secondary.classificationDiagnostics?.confidence ?? 0;
  const primaryUnsupported = primaryArchetype === "unknown" && primary.classificationDiagnostics?.ambiguous === false && primaryConfidence >= 0.6;
  const secondaryUnsupported = secondaryArchetype === "unknown" && secondary.classificationDiagnostics?.ambiguous === false && secondaryConfidence >= 0.6;
  if (primaryUnsupported) return primary;
  if (secondaryUnsupported) return secondary;
  if (primaryArchetype === "unknown" && secondaryArchetype !== "unknown") return secondary;
  if (primaryArchetype === "unknown" && secondaryArchetype === "unknown" && secondaryConfidence > primaryConfidence) return secondary;
  return primary;
}

function mergeFundamentals(
  primary: CompanyFundamentals,
  secondary: CompanyFundamentals,
): { fundamentals: CompanyFundamentals; supplemented: number; conflicts: ProviderSourceConflict[] } {
  const conflicts: ProviderSourceConflict[] = [
    ...(primary.sourceConflicts ?? []),
    ...(secondary.sourceConflicts ?? []),
  ];
  const annual = mergePeriodCollections(primary.annualPeriods ?? [], secondary.annualPeriods ?? [], conflicts);
  let trailingTwelveMonths = primary.trailingTwelveMonths;
  let trailingSupplemented = 0;
  if (primary.trailingTwelveMonths && secondary.trailingTwelveMonths && periodKey(primary.trailingTwelveMonths) === periodKey(secondary.trailingTwelveMonths)) {
    const merged = mergeFinancialPeriod(primary.trailingTwelveMonths, secondary.trailingTwelveMonths, conflicts);
    trailingTwelveMonths = merged.period;
    trailingSupplemented = merged.supplemented;
  }
  const classification = classificationForMerge(primary, secondary);
  const otherClassification = classification === primary ? secondary : primary;
  const fundamentals: CompanyFundamentals = {
    ...primary,
    sector: classification.sector ?? otherClassification.sector,
    industry: classification.industry ?? otherClassification.industry,
    analysisArchetype: classification.analysisArchetype ?? otherClassification.analysisArchetype,
    classificationDiagnostics: classification.classificationDiagnostics ?? otherClassification.classificationDiagnostics,
    annualPeriods: annual.periods,
    trailingTwelveMonths: trailingTwelveMonths ?? secondary.trailingTwelveMonths,
    priorTrailingTwelveMonths: primary.priorTrailingTwelveMonths ?? secondary.priorTrailingTwelveMonths,
    reportedMarketCap: primary.reportedMarketCap ?? secondary.reportedMarketCap,
    reportedMarketCapDate: primary.reportedMarketCapDate ?? secondary.reportedMarketCapDate,
    reportedMarketCapCurrency: primary.reportedMarketCapCurrency ?? secondary.reportedMarketCapCurrency,
    reportedSharesOutstanding: primary.reportedSharesOutstanding ?? secondary.reportedSharesOutstanding,
    reportedSharesDate: primary.reportedSharesDate ?? secondary.reportedSharesDate,
    sourceConflicts: uniqueSourceConflicts(conflicts),
  };
  return {
    fundamentals,
    supplemented: annual.supplemented + trailingSupplemented,
    conflicts: fundamentals.sourceConflicts ?? [],
  };
}

async function resolveConfiguredFundamentals(company: CompanySearchResult): Promise<FundamentalsResolution> {
  const diagnostics: ProviderDiagnostic[] = [];
  const fetchSec = async (): Promise<AdapterResult<CompanyFundamentals> | null> => {
    if (!company.cik) return null;
    try {
      return await fetchCompanyFundamentalsResult(company);
    } catch {
      return { ok: false, reason: "upstream_error", message: "SEC fundamentals failed unexpectedly.", diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error") };
    }
  };
  const fetchYahoo = async (): Promise<AdapterResult<CompanyFundamentals>> => {
    try {
      return await fetchYahooFundamentalsResult(company);
    } catch {
      return { ok: false, reason: "upstream_error", message: "Yahoo fundamentals failed unexpectedly.", diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error") };
    }
  };
  const [secResult, yahooResult] = await Promise.all([fetchSec(), fetchYahoo()]);
  if (secResult) {
    diagnostics.push(secResult.ok && !hasUsableFinancialPeriods(secResult.data)
      ? providerDiagnostic("SEC Companyfacts", "fundamentals", "partial", "empty_response")
      : secResult.diagnostic);
  }
  diagnostics.push(yahooResult.ok && !hasUsableFinancialPeriods(yahooResult.data)
    ? providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "partial", "empty_response")
    : yahooResult.diagnostic);

  const validSec = secResult?.ok && fundamentalsMatchCompany(company, secResult.data) && hasUsableFinancialPeriods(secResult.data)
    ? secResult.data
    : null;
  const validYahoo = yahooResult.ok && fundamentalsMatchCompany(company, yahooResult.data) && hasUsableFinancialPeriods(yahooResult.data)
    ? yahooResult.data
    : null;
  const yahooSource = yahooFundamentalsSource(company);

  if (validSec && validYahoo) {
    const merged = mergeFundamentals(validSec, validYahoo);
    const resolverDiagnostic = providerDiagnostic(
      "StockBox fundamentals resolver",
      "fundamentals",
      merged.conflicts.length ? "partial" : "available",
      merged.conflicts.length ? "source_conflict" : merged.supplemented > 0 ? "supplemented_missing_metrics" : "sec_primary",
    );
    diagnostics.push(resolverDiagnostic);
    return {
      result: { ok: true, data: merged.fundamentals, diagnostic: resolverDiagnostic },
      diagnostics,
      sources: merged.supplemented > 0 ? [yahooSource] : [],
    };
  }
  if (validSec && secResult?.ok) return { result: { ok: true, data: validSec, diagnostic: secResult.diagnostic }, diagnostics };
  if (validYahoo && yahooResult.ok) return { result: { ok: true, data: validYahoo, diagnostic: yahooResult.diagnostic }, diagnostics, sources: [yahooSource] };

  const failureResult: AdapterResult<CompanyFundamentals> = !yahooResult.ok
    ? yahooResult
    : secResult && !secResult.ok
      ? secResult
      : { ok: false, reason: "empty_response", message: "Configured fundamentals providers returned no usable financial periods.", diagnostic: providerDiagnostic("StockBox fundamentals resolver", "fundamentals", "unavailable", "empty_response") };
  return { result: failureResult, diagnostics };
}

export async function searchCompanies(query: string) {
  const globalProviders = [yahooCompanySearchProvider];
  if (process.env.GLOBAL_SYMBOL_SEARCH_PROVIDER?.trim().toLowerCase() === "twelve_data" && process.env.TWELVE_DATA_API_KEY) {
    globalProviders.unshift(createTwelveDataSearchProvider(process.env.TWELVE_DATA_API_KEY));
  }
  return searchCompanyCatalog(query, globalProviders);
}

type MarketDataResolution = {
  result: AdapterResult<MarketSnapshot>;
  diagnostics: ProviderDiagnostic[];
  source?: Omit<AnalysisSource, "accessedAt">;
};

type ConfiguredMarketProviderKey = "twelve_data" | "stooq" | "yahoo";

type MarketDataProviderCandidate = {
  key: ConfiguredMarketProviderKey;
  providerId: string;
  label: string;
  configured: boolean;
  reason?: ProviderFailureReason;
  message?: string;
  provider?: MarketDataProvider;
};

export type MarketDataProviderStatus = {
  key: ConfiguredMarketProviderKey;
  providerId: string;
  label: string;
  configured: boolean;
  reason?: ProviderFailureReason;
};

export type MarketDataSmokeResult = {
  symbol: string;
  status: "available" | "unavailable";
  attemptedProviders: Array<{
    provider: string;
    status: ProviderDiagnostic["status"];
    reason?: string;
  }>;
  resolvedProvider: string | null;
  reason: string | null;
  priceDate: string | null;
  historyLength: number | null;
  momentum3MAvailable: boolean;
  momentum1YAvailable: boolean;
  betaAvailable: boolean;
  marketCapAvailable: boolean;
  observedAt: string;
};

function unavailableMarketData(): AdapterResult<MarketSnapshot> {
  return {
    ok: false,
    reason: "not_configured",
    message: "Market data is disabled for this deployment.",
    diagnostic: providerDiagnostic("disabled", "market_data", "unavailable", "not_configured"),
  };
}

function unconfiguredMarketData(candidate: MarketDataProviderCandidate): AdapterResult<MarketSnapshot> {
  return {
    ok: false,
    reason: candidate.reason ?? "not_configured",
    message: candidate.message ?? `${candidate.label} is not configured for this deployment.`,
    diagnostic: providerDiagnostic(candidate.label, "market_data", "unavailable", candidate.reason ?? "not_configured"),
  };
}

function configuredMarketDataProviderCandidates(env: ServerEnv = getServerEnv()): MarketDataProviderCandidate[] {
  return getMarketDataProviderChain(env).map((key) => {
    if (key === "stooq") {
      return {
        key,
        providerId: stooqMarketDataProvider.id,
        label: "Stooq",
        configured: true,
        provider: stooqMarketDataProvider,
      };
    }

    if (key === "yahoo") {
      return {
        key,
        providerId: yahooMarketDataProvider.id,
        label: "Yahoo Finance chart",
        configured: true,
        provider: yahooMarketDataProvider,
      };
    }

    if (env.TWELVE_DATA_API_KEY?.trim()) {
      return {
        key,
        providerId: "twelve-data",
        label: "Twelve Data",
        configured: true,
        provider: createTwelveDataMarketProvider(env.TWELVE_DATA_API_KEY),
      };
    }

    return {
      key,
      providerId: "twelve-data",
      label: "Twelve Data",
      configured: false,
      reason: "not_configured",
      message: "Twelve Data is listed in the market-data provider chain but TWELVE_DATA_API_KEY is not configured.",
    };
  });
}

export function configuredMarketDataProviderStatuses(env: ServerEnv = getServerEnv()): MarketDataProviderStatus[] {
  return configuredMarketDataProviderCandidates(env).map((candidate) => ({
    key: candidate.key,
    providerId: candidate.providerId,
    label: candidate.label,
    configured: candidate.configured,
    reason: candidate.reason,
  }));
}

async function resolveMarketDataFromProviders(
  company: CompanySearchResult,
  providers: MarketDataProvider[],
): Promise<MarketDataResolution> {
  if (!providers.length) {
    const result = unavailableMarketData();
    return { result, diagnostics: [result.diagnostic] };
  }
  const diagnostics: ProviderDiagnostic[] = [];
  let lastResult: AdapterResult<MarketSnapshot> = unavailableMarketData();
  for (const provider of providers) {
    let result: AdapterResult<MarketSnapshot>;
    try {
      result = await provider.fetchMarketData(company);
    } catch {
      result = {
        ok: false,
        reason: "upstream_error",
        message: "The configured market-data provider failed unexpectedly.",
        diagnostic: providerDiagnostic(provider.id, "market_data", "unavailable", "upstream_error"),
      };
      console.error("Market data provider failed unexpectedly", {
        resolvedProvider: provider.id,
        symbol: company.canonicalTicker ?? company.ticker,
        reason: "upstream_error",
      });
    }
    diagnostics.push(result.diagnostic);
    if (result.ok) {
      return {
        result,
        diagnostics,
        source: provider.source?.(company),
      };
    }
    lastResult = result;
  }
  return { result: lastResult, diagnostics };
}

async function resolveMarketDataFromCandidates(
  company: CompanySearchResult,
  candidates: MarketDataProviderCandidate[],
): Promise<MarketDataResolution> {
  if (!candidates.length) {
    const result = unavailableMarketData();
    return { result, diagnostics: [result.diagnostic] };
  }

  const diagnostics: ProviderDiagnostic[] = [];
  let lastResult: AdapterResult<MarketSnapshot> = unavailableMarketData();
  let lastConfiguredResult: AdapterResult<MarketSnapshot> | null = null;

  for (const candidate of candidates) {
    if (!candidate.configured || !candidate.provider) {
      const result = unconfiguredMarketData(candidate);
      diagnostics.push(result.diagnostic);
      lastResult = result;
      continue;
    }

    let result: AdapterResult<MarketSnapshot>;
    try {
      result = await candidate.provider.fetchMarketData(company);
    } catch {
      result = {
        ok: false,
        reason: "upstream_error",
        message: "The configured market-data provider failed unexpectedly.",
        diagnostic: providerDiagnostic(candidate.label, "market_data", "unavailable", "upstream_error"),
      };
      console.error("Market data provider failed unexpectedly", {
        resolvedProvider: candidate.provider.id,
        symbol: company.canonicalTicker ?? company.ticker,
        reason: "upstream_error",
      });
    }
    diagnostics.push(result.diagnostic);
    lastResult = result;
    lastConfiguredResult = result;
    if (result.ok) {
      return {
        result,
        diagnostics,
        source: candidate.provider.source?.(company),
      };
    }
  }

  return { result: lastConfiguredResult ?? lastResult, diagnostics };
}

export async function fetchMarketDataFromProviders(
  company: CompanySearchResult,
  providers: MarketDataProvider[],
): Promise<AdapterResult<MarketSnapshot>> {
  return (await resolveMarketDataFromProviders(company, providers)).result;
}

async function resolveConfiguredMarketData(company: CompanySearchResult): Promise<MarketDataResolution> {
  return resolveMarketDataFromCandidates(company, configuredMarketDataProviderCandidates());
}

export async function fetchConfiguredMarketData(
  company: CompanySearchResult,
): Promise<AdapterResult<MarketSnapshot>> {
  return (await resolveConfiguredMarketData(company)).result;
}

const MARKET_DATA_SMOKE_SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY"];

function smokeCompany(symbol: string): CompanySearchResult {
  return {
    ticker: symbol,
    canonicalTicker: symbol,
    name: symbol,
    exchange: symbol === "SPY" ? "NYSE Arca" : "NASDAQ",
    country: "US",
    currency: "USD",
    providerCapabilities: {
      fundamentals: false,
      marketData: true,
      providerIds: [],
    },
  };
}

export async function smokeConfiguredMarketData(
  symbols: string[] = MARKET_DATA_SMOKE_SYMBOLS,
): Promise<MarketDataSmokeResult[]> {
  return Promise.all(symbols.map(async (symbol) => {
    const resolution = await resolveConfiguredMarketData(smokeCompany(symbol));
    const market = resolution.result.ok ? resolution.result.data : null;
    const latestDiagnostic = resolution.diagnostics.at(-1) ?? resolution.result.diagnostic;
    return {
      symbol,
      status: resolution.result.ok ? "available" : "unavailable",
      attemptedProviders: resolution.diagnostics.map((diagnostic) => ({
        provider: diagnostic.provider,
        status: diagnostic.status,
        reason: diagnostic.reason,
      })),
      resolvedProvider: market?.provider ?? (resolution.result.ok ? resolution.result.diagnostic.provider : null),
      reason: resolution.result.ok ? null : resolution.result.reason,
      priceDate: market?.date ?? null,
      historyLength: market?.historyLength ?? null,
      momentum3MAvailable: market?.performance["3M"] !== undefined,
      momentum1YAvailable: market?.performance["1Y"] !== undefined,
      betaAvailable: market?.beta !== undefined && market.beta !== null,
      marketCapAvailable: market?.marketCap !== undefined && market.marketCap !== null,
      observedAt: latestDiagnostic.observedAt,
    };
  }));
}

function enrichMarketWithFundamentals(
  company: CompanySearchResult, market: MarketSnapshot | null, fundamentals: CompanyFundamentals | null, analysisDate: string,
): MarketSnapshot | null {
  if (!market || !fundamentals) return market;
  const marketCurrency = market.currency?.toUpperCase() ?? null;
  const capCurrency = fundamentals.reportedMarketCapCurrency?.toUpperCase() ?? null;
  const capDate = fundamentals.reportedMarketCapDate;
  const capDateUsable = dataDateStatus(capDate, analysisDate, DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap).status === "current";
  const sharesDate = fundamentals.reportedSharesDate;
  const sharesDateUsable = dataDateStatus(sharesDate, analysisDate, DATA_FRESHNESS_THRESHOLDS_DAYS.sharesOutstanding).status === "current";
  const marketCap = market.marketCap ?? (marketCurrency && capCurrency && marketCurrency === capCurrency && capDateUsable
    ? fundamentals.reportedMarketCap ?? null : null);
  const commonEquity = !company.securityType || company.securityType === "Common Stock";
  const sharesOutstanding = market.sharesOutstanding ?? (commonEquity && sharesDateUsable
    ? fundamentals.reportedSharesOutstanding ?? null : null);
  return {
    ...market,
    marketCap,
    marketCapAsOf: market.marketCap !== undefined && market.marketCap !== null ? market.marketCapAsOf ?? market.date : capDate,
    marketCapCurrency: market.marketCap !== undefined && market.marketCap !== null ? market.marketCapCurrency ?? market.currency : capCurrency,
    sharesOutstanding,
    sharesOutstandingAsOf: market.sharesOutstanding !== undefined && market.sharesOutstanding !== null
      ? market.sharesOutstandingAsOf ?? market.date
      : sharesDate,
  };
}

export async function analyzeCompany({
  company,
  analysisType,
  investmentProfile
}: {
  company: CompanySearchResult;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
}): Promise<ProviderResult<AnalysisReport>> {
  const startedAt = Date.now();
  const accessedAt = new Date().toISOString();
  const sources: AnalysisSource[] = [];
  const warnings: string[] = [];

  if (!canAttemptConfiguredFundamentals(company)) {
    return {
      ok: false,
      error: UNSUPPORTED_SECURITY_ERROR,
      sources,
      warnings: ["This security is discovery-only until supported fundamentals coverage is configured."],
    };
  }

  const deepResearchRequested = analysisType === "deep" || analysisType === "research";
  const [fundamentalsResolution, marketResolution, filingsResult] = await Promise.all([
    resolveConfiguredFundamentals(company),
    resolveConfiguredMarketData(company),
    deepResearchRequested && company.cik ? fetchSecSubmissionEvents(company) : Promise.resolve(null),
  ]);
  const providerOrchestrationMs = Date.now() - startedAt;
  const fundamentalsResult = fundamentalsResolution.result;
  const marketResult = marketResolution.result;
  const fundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;
  const rawMarket = marketResult.ok ? marketResult.data : null;
  const market = enrichMarketWithFundamentals(company, rawMarket, fundamentals, accessedAt);
  const providerDiagnostics = [...fundamentalsResolution.diagnostics, ...marketResolution.diagnostics, ...(filingsResult ? [filingsResult.diagnostic] : [])];

  if (fundamentals) {
    const secCiks = fundamentals.sourceCiks ?? (fundamentals.cik ? [fundamentals.cik] : []);
    for (const sourceCik of secCiks) {
      sources.push({
        name: `SEC Companyfacts CIK ${sourceCik}`,
        url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${sourceCik}.json`,
        accessedAt,
        freshness: "SEC XBRL facts, cached up to 12 hours.",
        provider: "sec-companyfacts",
        capability: "fundamentals",
        dataAsOf: fundamentals.diagnostics?.latestFinancialPeriodEnd ?? null,
        version: PROVIDER_ADAPTER_VERSIONS.secCompanyfacts,
      });
    }
    sources.push(...(fundamentalsResolution.sources ?? []).map((source) => ({
      ...source,
      accessedAt,
      dataAsOf: source.dataAsOf ?? fundamentals.diagnostics?.latestFinancialPeriodEnd ?? null,
    })));
  } else {
    warnings.push(`Fundamental data is unavailable: ${fundamentalsResult.ok ? "unknown provider error" : fundamentalsResult.message}`);
  }

  if (market) {
    if (marketResolution.source) {
      sources.push({
        ...marketResolution.source,
        accessedAt,
        provider: market.provider ?? marketResolution.source.provider,
        capability: "market_data",
        dataAsOf: market.date,
        version: providerAdapterVersion(market.provider ?? marketResolution.source.provider),
      });
    }
  } else {
    warnings.push(`Market price history is unavailable: ${marketResult.ok ? "unknown provider error" : marketResult.message}`);
  }

  if (!fundamentals) {
    return {
      ok: false,
      error: "Fundamental data is unavailable for this company.",
      sources,
      warnings,
    };
  }

  const legacyInput = {
    company,
    market,
    fundamentals,
    analysisType,
    investmentProfile,
    providerDiagnostics,
    analysisDate: accessedAt,
  };
  const canonicalInput = toFinancialAnalysisInput(legacyInput);
  const engineResult = analyzeFinancials(canonicalInput);
  const report = presentAnalysisReport(legacyInput, canonicalInput, engineResult);
  report.sources = sources;
  if (report.engine) {
    const filings = filingsResult?.ok ? {
      status: "available" as const,
      events: filingsResult.data.data,
      evidence: filingsResult.data.evidence,
      dataAsOf: filingsResult.data.dataAsOf,
      coverage: filingsResult.data.coverage,
      confidence: filingsResult.data.confidence,
    } : filingsResult ? {
      status: filingsResult.diagnostic.status === "unsupported" ? "unsupported" as const : "unavailable" as const,
      events: [],
      evidence: [],
      dataAsOf: null,
      coverage: 0,
      confidence: 0,
      reason: filingsResult.message,
    } : undefined;
    attachInstitutionalResearch(report, report.engine, canonicalInput, { market, filings });
    const failedCapabilities = new Set(
      providerDiagnostics.filter((item) => item.status === "unavailable").map((item) => item.capability),
    );
    const fallbackCapabilities = new Set(
      providerDiagnostics
        .filter((item) => failedCapabilities.has(item.capability) && (item.status === "available" || item.status === "partial"))
        .map((item) => item.capability),
    );
    const explicitFallbacks = providerDiagnostics
      .filter((item) => /fallback|supplement/i.test(item.reason ?? ""))
      .map((item) => `${item.capability}: ${item.reason}`);
    const valuationSupport = report.engine.dcf.status === "available"
      ? report.engine.dcf.directionalSupport === false ? "illustrative" as const : "directional" as const
      : report.engine.dcf.status === "inappropriate"
        && report.engine.recommendation.rating !== "No Rating"
        && typeof report.engine.scores.dimensions.valuation.score === "number"
        && (report.engine.scores.specializedCoverage?.overall ?? 0) >= 0.7
        ? "specialized" as const
        : "unavailable" as const;
    report.adminQa = {
      providerAttempts: providerDiagnostics,
      selectedProviders: [...new Set(sources.map((source) => source.provider).filter((provider): provider is string => Boolean(provider)))],
      providerFailures: providerDiagnostics.filter((item) => item.status === "unavailable"),
      fallbacks: [...new Set([
        ...explicitFallbacks,
        ...[...fallbackCapabilities].map((capability) => `${capability}: fallback provider resolved the capability`),
      ])],
      missingDataReasons: report.engine.missingData,
      classificationDiagnostics: report.engine.classificationDiagnostics ?? null,
      timingsMs: {
        providerOrchestration: providerOrchestrationMs,
        total: Date.now() - startedAt,
      },
      sourceConflicts: report.engine.sourceConflicts,
      currencyState: report.engine.currencyAlignment,
      specializedCoverage: report.engine.scores.specializedCoverage?.overall ?? null,
      valuationSupport,
    };
  }
  report.score.missingData = [...new Set([...report.score.missingData, ...warnings])];

  return {
    ok: true,
    data: report,
    sources,
    warnings
  };
}
