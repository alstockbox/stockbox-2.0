import type {
  FinancialAnalysisInput,
  FinancialAnalysisResult,
  FinancialPeriod,
  ProviderDiagnostic,
} from "./types";

export const DATA_ANOMALY_V3_POLICY_VERSION = "stockbox-data-anomaly-policy-v3.0.0" as const;

export type DataAnomalyV3Code =
  | "DATA_UNAVAILABLE"
  | "STALE_FINANCIAL_DATA"
  | "FUTURE_DATED_FINANCIAL"
  | "FINANCIAL_CURRENCY_MISMATCH"
  | "UNRESOLVED_SOURCE_CONFLICT"
  | "PROVIDER_RETRIEVAL_FAILURE"
  | "NONFINITE_INPUT"
  | "ENTITY_IDENTITY_UNCERTAIN"
  | "BALANCE_SHEET_IDENTITY_MISMATCH"
  | "MARKET_CAP_SHARE_BASIS_MISMATCH";

export type DataAnomalyV3Severity = "info" | "warning" | "high" | "critical";

export type DataAnomalyV3 = {
  code: DataAnomalyV3Code;
  severity: DataAnomalyV3Severity;
  blockingForRecommendation: boolean;
  companyQualityImpact: "none";
  scope: "company_identity" | "financials" | "market" | "provider" | "cross_source";
  metric: string | null;
  periodEnd: string | null;
  reason: string;
  evidence: Record<string, string | number | boolean | null>;
};

export type DataAnomalyAssessmentV3 = {
  policyVersion: typeof DATA_ANOMALY_V3_POLICY_VERSION;
  anomalies: DataAnomalyV3[];
  blockingAnomalies: DataAnomalyV3[];
  integrityScore: number;
  recommendationIntegrityEligible: boolean;
  counts: {
    info: number;
    warning: number;
    high: number;
    critical: number;
    blocking: number;
  };
  fairness: {
    systemIntegrityAnomaliesPenalizeCompanyQuality: false;
  };
};

const DAY_MS = 86_400_000;
const FUTURE_DATE_TOLERANCE_DAYS = 1;
const BALANCE_SHEET_WARNING_THRESHOLD = 0.05;
const MARKET_CAP_SHARE_WARNING_THRESHOLD = 0.15;
const MARKET_CAP_DATE_TOLERANCE_DAYS = 5;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

function anomaly(
  value: Omit<DataAnomalyV3, "companyQualityImpact">,
): DataAnomalyV3 {
  return { ...value, companyQualityImpact: "none" };
}

function financialPeriods(input: FinancialAnalysisInput): FinancialPeriod[] {
  return [
    input.trailingTwelveMonths,
    input.priorTrailingTwelveMonths,
    ...input.annualPeriods,
  ].filter((period): period is FinancialPeriod => Boolean(period));
}

function futureFinancialAnomalies(input: FinancialAnalysisInput): DataAnomalyV3[] {
  const analysisTime = parseDate(input.analysisDate ?? new Date().toISOString());
  if (analysisTime === null) return [];

  const anomalies: DataAnomalyV3[] = [];
  for (const period of financialPeriods(input)) {
    for (const [field, date] of [
      ["periodEndDate", period.periodEndDate],
      ["balanceSheetDate", period.balanceSheetDate],
    ] as const) {
      const timestamp = parseDate(date);
      if (timestamp === null) continue;
      const daysAhead = (timestamp - analysisTime) / DAY_MS;
      if (daysAhead <= FUTURE_DATE_TOLERANCE_DAYS) continue;
      anomalies.push(anomaly({
        code: "FUTURE_DATED_FINANCIAL",
        severity: "critical",
        blockingForRecommendation: true,
        scope: "financials",
        metric: field,
        periodEnd: period.periodEndDate ?? null,
        reason: "A financial statement date is materially in the future relative to the analysis timestamp.",
        evidence: {
          financialDate: date ?? null,
          analysisDate: input.analysisDate ?? null,
          daysAhead: Math.round(daysAhead * 10) / 10,
        },
      }));
    }
  }
  return anomalies;
}

function unresolvedProviderFailures(diagnostics: ProviderDiagnostic[]): DataAnomalyV3[] {
  const byCapability = new Map<ProviderDiagnostic["capability"], ProviderDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const existing = byCapability.get(diagnostic.capability) ?? [];
    existing.push(diagnostic);
    byCapability.set(diagnostic.capability, existing);
  }

  const anomalies: DataAnomalyV3[] = [];
  for (const [capability, attempts] of byCapability.entries()) {
    const failed = attempts.filter((attempt) => attempt.status === "unavailable");
    if (!failed.length) continue;
    const recovered = attempts.some((attempt) => attempt.status === "available" || attempt.status === "partial");
    if (recovered) continue;

    const latest = failed.at(-1)!;
    const essential = capability === "fundamentals" || capability === "market_data";
    anomalies.push(anomaly({
      code: "PROVIDER_RETRIEVAL_FAILURE",
      severity: essential ? "high" : "warning",
      blockingForRecommendation: essential,
      scope: "provider",
      metric: capability,
      periodEnd: null,
      reason: "A provider capability failed without a successful fallback. This is a StockBox retrieval issue and must not be attributed to company quality.",
      evidence: {
        capability,
        failedAttempts: failed.length,
        latestProvider: latest.provider,
        latestObservedAt: latest.observedAt,
        latestReason: latest.reason ?? null,
      },
    }));
  }
  return anomalies;
}

function sourceConflictAnomalies(result: FinancialAnalysisResult): DataAnomalyV3[] {
  return result.sourceConflicts
    .filter((conflict) => conflict.resolved !== true)
    .map((conflict) => anomaly({
      code: "UNRESOLVED_SOURCE_CONFLICT",
      severity: conflict.severity === "high" ? "critical" : "high",
      blockingForRecommendation: true,
      scope: "cross_source",
      metric: conflict.metric,
      periodEnd: conflict.periodEnd,
      reason: conflict.reason,
      evidence: {
        primaryProvider: conflict.primaryProvider,
        secondaryProvider: conflict.secondaryProvider,
        relativeDifference: conflict.relativeDifference ?? null,
        conflictKind: conflict.kind ?? null,
      },
    }));
}

function nonfiniteInputAnomalies(input: FinancialAnalysisInput): DataAnomalyV3[] {
  const anomalies: DataAnomalyV3[] = [];
  const numericFinancialFields = [
    "revenue",
    "grossProfit",
    "operatingIncome",
    "netIncome",
    "operatingCashFlow",
    "capitalExpenditures",
    "cashAndEquivalents",
    "totalDebt",
    "totalEquity",
    "totalAssets",
    "totalLiabilities",
    "sharesDiluted",
    "currentSharesOutstanding",
  ] as const;

  for (const period of financialPeriods(input)) {
    for (const field of numericFinancialFields) {
      const value = period[field];
      if (typeof value !== "number" || Number.isFinite(value)) continue;
      anomalies.push(anomaly({
        code: "NONFINITE_INPUT",
        severity: "critical",
        blockingForRecommendation: true,
        scope: "financials",
        metric: field,
        periodEnd: period.periodEndDate ?? null,
        reason: "A canonical numeric financial input is NaN or infinite and cannot be used safely.",
        evidence: { valueKind: String(value) },
      }));
    }
  }

  for (const field of ["price", "marketCap", "sharesOutstanding", "beta"] as const) {
    const value = input.market?.[field];
    if (typeof value !== "number" || Number.isFinite(value)) continue;
    anomalies.push(anomaly({
      code: "NONFINITE_INPUT",
      severity: "critical",
      blockingForRecommendation: true,
      scope: "market",
      metric: field,
      periodEnd: input.market?.priceDate ?? null,
      reason: "A canonical numeric market input is NaN or infinite and cannot be used safely.",
      evidence: { valueKind: String(value) },
    }));
  }

  return anomalies;
}

function balanceSheetIdentityAnomalies(input: FinancialAnalysisInput): DataAnomalyV3[] {
  const anomalies: DataAnomalyV3[] = [];
  for (const period of financialPeriods(input)) {
    if (!positive(period.totalAssets) || !finite(period.totalLiabilities) || !finite(period.totalEquity)) continue;
    const expectedAssets = period.totalLiabilities + period.totalEquity;
    const difference = relativeDifference(period.totalAssets, expectedAssets);
    if (difference <= BALANCE_SHEET_WARNING_THRESHOLD) continue;

    anomalies.push(anomaly({
      code: "BALANCE_SHEET_IDENTITY_MISMATCH",
      severity: difference >= 0.20 ? "high" : "warning",
      // Accounting presentation, NCI and taxonomy semantics can create apparent
      // mismatches. V3 surfaces this for reconciliation but does not hard-block
      // a recommendation on this heuristic alone.
      blockingForRecommendation: false,
      scope: "financials",
      metric: "totalAssets=totalLiabilities+totalEquity",
      periodEnd: period.balanceSheetDate ?? period.periodEndDate ?? null,
      reason: "Reported balance-sheet totals do not reconcile within the conservative anomaly tolerance.",
      evidence: {
        relativeDifference: Math.round(difference * 10_000) / 10_000,
        threshold: BALANCE_SHEET_WARNING_THRESHOLD,
      },
    }));
  }
  return anomalies;
}

function marketCapShareBasisAnomaly(input: FinancialAnalysisInput): DataAnomalyV3[] {
  const market = input.market;
  if (!market || !positive(market.price) || !positive(market.marketCap) || !positive(market.sharesOutstanding)) return [];

  const priceCurrency = normalizedCurrency(market.currency);
  const capCurrency = normalizedCurrency(market.marketCapCurrency ?? market.currency);
  if (!priceCurrency || !capCurrency || priceCurrency !== capCurrency) return [];

  const priceDate = parseDate(market.priceDate);
  const capDate = parseDate(market.marketCapAsOf);
  const sharesDate = parseDate(market.sharesOutstandingAsOf);
  if (priceDate === null || capDate === null || sharesDate === null) return [];
  const maxGapDays = Math.max(
    Math.abs(priceDate - capDate),
    Math.abs(priceDate - sharesDate),
    Math.abs(capDate - sharesDate),
  ) / DAY_MS;
  if (maxGapDays > MARKET_CAP_DATE_TOLERANCE_DAYS) return [];

  const impliedMarketCap = market.price * market.sharesOutstanding;
  const difference = relativeDifference(market.marketCap, impliedMarketCap);
  if (difference <= MARKET_CAP_SHARE_WARNING_THRESHOLD) return [];

  return [anomaly({
    code: "MARKET_CAP_SHARE_BASIS_MISMATCH",
    severity: difference >= 0.50 ? "high" : "warning",
    // This can reflect share classes, ADR ratios or corporate actions, so it is
    // never a standalone hard block until security/share-basis semantics prove it.
    blockingForRecommendation: false,
    scope: "market",
    metric: "marketCap≈price*sharesOutstanding",
    periodEnd: market.priceDate ?? null,
    reason: "Market capitalization materially differs from same-date price multiplied by shares outstanding; share-basis reconciliation is required.",
    evidence: {
      relativeDifference: Math.round(difference * 10_000) / 10_000,
      threshold: MARKET_CAP_SHARE_WARNING_THRESHOLD,
      maximumDateGapDays: Math.round(maxGapDays * 10) / 10,
      currency: priceCurrency,
    },
  })];
}

function identityAnomaly(input: FinancialAnalysisInput): DataAnomalyV3[] {
  const confidence = input.company.entityIdentityConfidence;
  if (!finite(confidence) || confidence >= 50) return [];
  return [anomaly({
    code: "ENTITY_IDENTITY_UNCERTAIN",
    severity: "critical",
    blockingForRecommendation: true,
    scope: "company_identity",
    metric: "entityIdentityConfidence",
    periodEnd: null,
    reason: "Company/listing identity confidence is below the minimum safe threshold for a directional recommendation.",
    evidence: { entityIdentityConfidence: confidence, minimumRequired: 50 },
  })];
}

function statusAnomalies(result: FinancialAnalysisResult): DataAnomalyV3[] {
  if (result.dataStatus === "unavailable") {
    return [anomaly({
      code: "DATA_UNAVAILABLE",
      severity: "critical",
      blockingForRecommendation: true,
      scope: "financials",
      metric: null,
      periodEnd: result.diagnostics.latestFinancialPeriodEnd,
      reason: "Canonical financial data is unavailable for a current assessment.",
      evidence: {},
    })];
  }
  if (result.dataStatus === "stale") {
    return [anomaly({
      code: "STALE_FINANCIAL_DATA",
      severity: "high",
      blockingForRecommendation: true,
      scope: "financials",
      metric: null,
      periodEnd: result.diagnostics.latestFinancialPeriodEnd,
      reason: "Canonical financial data exceeds the current-analysis freshness threshold.",
      evidence: { dataAgeDays: result.diagnostics.dataAgeDays },
    })];
  }
  return [];
}

function currencyAnomaly(result: FinancialAnalysisResult): DataAnomalyV3[] {
  if (result.currencyAlignment !== "mismatch") return [];
  return [anomaly({
    code: "FINANCIAL_CURRENCY_MISMATCH",
    severity: "critical",
    blockingForRecommendation: true,
    scope: "financials",
    metric: "currencyAlignment",
    periodEnd: result.diagnostics.latestFinancialPeriodEnd,
    reason: "Financial and valuation currencies are not safely aligned for a directional assessment.",
    evidence: { currencyAlignment: result.currencyAlignment },
  })];
}

function dedupe(anomalies: DataAnomalyV3[]): DataAnomalyV3[] {
  const seen = new Set<string>();
  return anomalies.filter((item) => {
    const key = [item.code, item.scope, item.metric ?? "", item.periodEnd ?? "", item.reason].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function integrityPenalty(item: DataAnomalyV3): number {
  if (item.severity === "critical") return 35;
  if (item.severity === "high") return 20;
  if (item.severity === "warning") return 8;
  return 2;
}

export function assessDataAnomaliesV3(
  input: FinancialAnalysisInput,
  result: FinancialAnalysisResult,
): DataAnomalyAssessmentV3 {
  const diagnostics = result.diagnostics.providerDiagnostics ?? input.providerDiagnostics ?? [];
  const anomalies = dedupe([
    ...statusAnomalies(result),
    ...currencyAnomaly(result),
    ...identityAnomaly(input),
    ...futureFinancialAnomalies(input),
    ...sourceConflictAnomalies(result),
    ...unresolvedProviderFailures(diagnostics),
    ...nonfiniteInputAnomalies(input),
    ...balanceSheetIdentityAnomalies(input),
    ...marketCapShareBasisAnomaly(input),
  ]);
  const blockingAnomalies = anomalies.filter((item) => item.blockingForRecommendation);
  const penalty = anomalies.reduce((sum, item) => sum + integrityPenalty(item), 0);
  const counts = {
    info: anomalies.filter((item) => item.severity === "info").length,
    warning: anomalies.filter((item) => item.severity === "warning").length,
    high: anomalies.filter((item) => item.severity === "high").length,
    critical: anomalies.filter((item) => item.severity === "critical").length,
    blocking: blockingAnomalies.length,
  };

  return {
    policyVersion: DATA_ANOMALY_V3_POLICY_VERSION,
    anomalies,
    blockingAnomalies,
    integrityScore: Math.max(0, 100 - penalty),
    recommendationIntegrityEligible: blockingAnomalies.length === 0,
    counts,
    fairness: {
      systemIntegrityAnomaliesPenalizeCompanyQuality: false,
    },
  };
}
