import type {
  FinancialAnalysisInput,
  FinancialAnalysisResult,
  MetricProvenance,
  ProviderDiagnostic,
  SpecializedMetric,
} from "./types";
import {
  resolveRequiredDataProfile,
  type CoverageMetricKey,
  type CoverageRequirement,
  type RequiredDataProfile,
} from "./required-data-profiles";

export type CoverageVerificationStatus =
  | "NOT_APPLICABLE"
  | "NOT_REPORTED_BY_COMPANY"
  | "SOURCE_UNAVAILABLE"
  | "STOCKBOX_RETRIEVAL_FAILURE"
  | "DATA_CONFLICT"
  | "VERIFIED";

export type CoverageValueKind = "raw" | "calculated";

export type CoverageProvenance = {
  source: string | null;
  timestamp: string | null;
  reportingPeriod: string | null;
  currency: string | null;
  valueKind: CoverageValueKind;
  formula: string | null;
  confidence: number;
  verificationStatus: CoverageVerificationStatus;
  sourcePriority: number | null;
};

export type CoverageEvidenceOverride = {
  status: CoverageVerificationStatus;
  reason: string;
  source?: string | null;
  timestamp?: string | null;
  reportingPeriod?: string | null;
  currency?: string | null;
  valueKind?: CoverageValueKind;
  formula?: string | null;
  confidence?: number;
  sourcePriority?: number | null;
};

export type CoverageAssessmentContext = {
  /**
   * Upstream ingestion may provide explicit evidence that a filing does not
   * report a metric, or that StockBox itself failed to retrieve it. The
   * coverage layer never invents those distinctions when evidence is absent.
   */
  evidence?: Partial<Record<CoverageMetricKey, CoverageEvidenceOverride>>;
};

export type CoverageDataPoint = {
  key: CoverageMetricKey;
  label: string;
  weight: number;
  critical: boolean;
  requiredWhenReported: boolean;
  countsTowardCoverage: boolean;
  status: CoverageVerificationStatus;
  value: number | null;
  reason: string;
  provenance: CoverageProvenance;
  companyQualityImpact: "none" | "disclosure_concern";
};

export type CoverageAssessment = {
  policyVersion: "stockbox-coverage-policy-v3.0.0";
  profileId: RequiredDataProfile["id"];
  profileLabel: string;
  verifiedCoverage: number;
  retrievalCoverage: number;
  disclosureCoverage: number | null;
  dataPoints: CoverageDataPoint[];
  blockingIssues: CoverageDataPoint[];
  stockboxFailureCount: number;
  sourceUnavailableCount: number;
  companyDisclosureGapCount: number;
  conflictCount: number;
  verifiedCount: number;
  conditionalMetricCount: number;
  recommendationEligible: boolean;
  fairness: {
    stockboxFailuresPenalizeCompanyQuality: false;
    sourceUnavailablePenalizesCompanyQuality: false;
    dataConflictsPenalizeCompanyQuality: false;
    confirmedNonReportingMayCreateDisclosureConcern: true;
  };
};

type MetricObservation = {
  value: number | null;
  provenance?: MetricProvenance;
  source?: string | null;
  timestamp?: string | null;
  reportingPeriod?: string | null;
  currency?: string | null;
  calculated?: boolean;
  formula?: string | null;
  confidence?: number;
  sourcePriority?: number | null;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function latestPeriod(input: FinancialAnalysisInput, result: FinancialAnalysisResult) {
  return result.metrics.latestPeriod ?? input.trailingTwelveMonths ?? input.annualPeriods.at(-1) ?? null;
}

function metricProvenance(period: ReturnType<typeof latestPeriod>, ...keys: string[]) {
  for (const key of keys) {
    const provenance = period?.provenance?.[key];
    if (provenance) return provenance;
  }
  return undefined;
}

function specialistObservation(metric: SpecializedMetric | undefined): MetricObservation {
  return {
    value: finite(metric?.value) ? metric.value : null,
    provenance: metric?.provenance,
    timestamp: metric?.dataAsOf ?? metric?.provenance?.filedAt ?? null,
    reportingPeriod: metric?.provenance?.periodEnd ?? metric?.dataAsOf ?? null,
    source: metric?.provenance?.source ?? null,
    confidence: metric?.value !== null && metric?.value !== undefined ? 90 : 0,
  };
}

function observeMetric(
  key: CoverageMetricKey,
  input: FinancialAnalysisInput,
  result: FinancialAnalysisResult,
): MetricObservation {
  const period = latestPeriod(input, result);
  const market = input.market;
  const specialized = input.specialized;

  switch (key) {
    case "revenue":
      return { value: finite(period?.revenue) ? period.revenue : null, provenance: metricProvenance(period, "revenue"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "grossProfit":
      return { value: finite(period?.grossProfit) ? period.grossProfit : null, provenance: metricProvenance(period, "grossProfit"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "operatingIncome":
      return { value: finite(period?.operatingIncome) ? period.operatingIncome : null, provenance: metricProvenance(period, "operatingIncome"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "netIncome":
      return { value: finite(period?.netIncome) ? period.netIncome : null, provenance: metricProvenance(period, "netIncome"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "operatingCashFlow":
      return { value: finite(period?.operatingCashFlow) ? period.operatingCashFlow : null, provenance: metricProvenance(period, "operatingCashFlow"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "capitalExpenditures":
      return { value: finite(period?.capitalExpenditures) ? period.capitalExpenditures : null, provenance: metricProvenance(period, "capitalExpenditures", "capex"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "freeCashFlow": {
      const value = result.metrics.cashFlow.simpleFreeCashFlow;
      return {
        value: finite(value) ? value : null,
        provenance: result.metrics.provenance.freeCashFlow ?? metricProvenance(period, "freeCashFlow"),
        currency: period?.currency ?? null,
        reportingPeriod: period?.periodEndDate ?? null,
        calculated: true,
        formula: "operating cash flow - capital expenditures",
      };
    }
    case "cashAndEquivalents":
      return { value: finite(period?.cashAndEquivalents) ? period.cashAndEquivalents : null, provenance: metricProvenance(period, "cashAndEquivalents", "cash"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "totalDebt":
      return { value: finite(period?.totalDebt) ? period.totalDebt : null, provenance: metricProvenance(period, "totalDebt", "debt"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "totalEquity":
      return { value: finite(period?.totalEquity) ? period.totalEquity : null, provenance: metricProvenance(period, "totalEquity", "equity"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "currentSharesOutstanding":
      return {
        value: finite(market?.sharesOutstanding) ? market.sharesOutstanding : finite(period?.currentSharesOutstanding) ? period.currentSharesOutstanding : null,
        provenance: metricProvenance(period, "currentSharesOutstanding"),
        source: market?.provider ?? null,
        timestamp: market?.sharesOutstandingAsOf ?? null,
        reportingPeriod: market?.sharesOutstandingAsOf ?? period?.periodEndDate ?? null,
      };
    case "marketPrice":
      return {
        value: finite(market?.price) ? market.price : null,
        source: market?.provider ?? null,
        timestamp: market?.priceDate ?? null,
        reportingPeriod: market?.priceDate ?? null,
        currency: market?.currency ?? null,
        confidence: finite(market?.price) ? 95 : 0,
      };
    case "marketCap":
      return {
        value: finite(result.metrics.valuation.marketCap) ? result.metrics.valuation.marketCap : null,
        source: market?.provider ?? null,
        timestamp: market?.marketCapAsOf ?? market?.priceDate ?? null,
        reportingPeriod: market?.marketCapAsOf ?? null,
        currency: market?.marketCapCurrency ?? market?.currency ?? null,
        calculated: result.metrics.provenance.marketCap?.valueKind === "derived",
        provenance: result.metrics.provenance.marketCap,
      };
    case "stockBasedCompensation":
      return { value: finite(period?.stockBasedCompensation) ? period.stockBasedCompensation : null, provenance: metricProvenance(period, "stockBasedCompensation"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "researchAndDevelopment":
      return { value: finite(period?.researchAndDevelopment) ? period.researchAndDevelopment : null, provenance: metricProvenance(period, "researchAndDevelopment"), currency: period?.currency ?? null, reportingPeriod: period?.periodEndDate ?? null };
    case "netInterestMargin":
      return specialized?.kind === "bank" ? specialistObservation(specialized.netInterestMargin) : { value: null };
    case "cet1CapitalRatio":
      return specialized?.kind === "bank" ? specialistObservation(specialized.cet1CapitalRatio) : { value: null };
    case "grossLoans":
      return specialized?.kind === "bank" ? specialistObservation(specialized.grossLoans) : { value: null };
    case "deposits":
      return specialized?.kind === "bank" ? specialistObservation(specialized.deposits) : { value: null };
    case "nonPerformingLoans":
      return specialized?.kind === "bank" ? specialistObservation(specialized.nonPerformingLoans) : { value: null };
    case "loanLossProvisions":
      return specialized?.kind === "bank" ? specialistObservation(specialized.loanLossProvisions) : { value: null };
    case "returnOnEquity":
      if (specialized?.kind === "bank") return specialistObservation(specialized.returnOnEquity);
      if (specialized?.kind === "insurer") return specialistObservation(specialized.returnOnEquity);
      return { value: finite(result.metrics.ratios.returnOnEquity) ? result.metrics.ratios.returnOnEquity : null, calculated: true, provenance: result.metrics.provenance.returnOnEquity };
    case "tangibleBookValuePerShare":
      return specialized?.kind === "bank" ? specialistObservation(specialized.tangibleBookValuePerShare) : { value: null };
    case "combinedRatio":
      return specialized?.kind === "insurer" ? specialistObservation(specialized.combinedRatio) : { value: null };
    case "regulatoryCapitalRatio":
      return specialized?.kind === "insurer" ? specialistObservation(specialized.regulatoryCapitalRatio) : { value: null };
    case "reserveDevelopment":
      return specialized?.kind === "insurer" ? specialistObservation(specialized.reserveDevelopment) : { value: null };
    case "fundsFromOperations":
      return specialized?.kind === "reit" ? specialistObservation(specialized.fundsFromOperations) : { value: null };
    case "adjustedFundsFromOperations":
      return specialized?.kind === "reit" ? specialistObservation(specialized.adjustedFundsFromOperations) : { value: null };
    case "occupancy":
      return specialized?.kind === "reit" ? specialistObservation(specialized.occupancy) : { value: null };
    case "sameStoreNoiGrowth":
      return specialized?.kind === "reit" ? specialistObservation(specialized.sameStoreNoiGrowth) : { value: null };
    case "netDebtToEbitdare":
      return specialized?.kind === "reit" ? specialistObservation(specialized.netDebtToEbitdare) : { value: null };
    case "fixedChargeCoverage":
      return specialized?.kind === "reit" ? specialistObservation(specialized.fixedChargeCoverage) : { value: null };
    case "arr":
    case "retention":
    case "productionVolume":
    case "reserves":
    case "costOfProduction":
      return { value: null };
  }
}

function normalizedProviderFailure(diagnostics: ProviderDiagnostic[] | undefined) {
  const unavailable = (diagnostics ?? []).filter((item) => item.status === "unavailable");
  const retrievalFailure = unavailable.some((item) =>
    /timeout|timed out|network|failed|failure|error|429|5\d\d|retriev/i.test(item.reason ?? ""),
  );
  return { unavailable: unavailable.length > 0, retrievalFailure };
}

function hasMetricConflict(key: CoverageMetricKey, result: FinancialAnalysisResult) {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return result.sourceConflicts.some((conflict) => {
    const metric = conflict.metric.toLowerCase().replace(/[^a-z0-9]/g, "");
    return !conflict.resolved && (metric === normalizedKey || metric.includes(normalizedKey) || normalizedKey.includes(metric));
  });
}

function provenanceFromObservation(
  observation: MetricObservation,
  status: CoverageVerificationStatus,
): CoverageProvenance {
  const provenance = observation.provenance;
  const calculated = observation.calculated || provenance?.valueKind === "derived";
  return {
    source: observation.source ?? provenance?.provider ?? provenance?.source ?? null,
    timestamp: observation.timestamp ?? provenance?.filedAt ?? provenance?.periodEnd ?? null,
    reportingPeriod: observation.reportingPeriod ?? provenance?.periodEnd ?? null,
    currency: observation.currency ?? provenance?.unit ?? null,
    valueKind: calculated ? "calculated" : "raw",
    formula: observation.formula ?? (calculated && provenance?.inputs?.length ? `derived from: ${provenance.inputs.join(", ")}` : null),
    confidence: observation.confidence ?? (status === "VERIFIED" ? (provenance ? 95 : 85) : 0),
    verificationStatus: status,
    sourcePriority: observation.sourcePriority ?? null,
  };
}

function pointFromRequirement(
  requirement: CoverageRequirement,
  input: FinancialAnalysisInput,
  result: FinancialAnalysisResult,
  context: CoverageAssessmentContext,
): CoverageDataPoint {
  const override = context.evidence?.[requirement.key];
  const observation = observeMetric(requirement.key, input, result);
  const providerState = normalizedProviderFailure(result.diagnostics.providerDiagnostics);
  const conflict = hasMetricConflict(requirement.key, result);

  let status: CoverageVerificationStatus;
  let reason: string;

  if (override) {
    status = override.status;
    reason = override.reason;
  } else if (conflict) {
    status = "DATA_CONFLICT";
    reason = "Unresolved same-metric source conflict. The datapoint must not be used for a directional recommendation until resolved.";
  } else if (finite(observation.value)) {
    status = "VERIFIED";
    reason = "A finite canonical datapoint is available from the existing verified analysis pipeline.";
  } else if (requirement.requiredWhenReported) {
    status = "SOURCE_UNAVAILABLE";
    reason = "Conditional company-type metric is tracked, but current ingestion cannot prove that the company reports it. It is excluded from the hard coverage denominator.";
  } else if (providerState.retrievalFailure) {
    status = "STOCKBOX_RETRIEVAL_FAILURE";
    reason = "A provider diagnostic indicates a retrieval/transport failure. This is a StockBox coverage problem and must not reduce company quality.";
  } else {
    status = "SOURCE_UNAVAILABLE";
    reason = providerState.unavailable
      ? "One or more relevant data sources are unavailable. Company quality is not penalized."
      : "The canonical pipeline has no verified value and there is not enough evidence to claim the company failed to report it.";
  }

  const countsTowardCoverage = !requirement.requiredWhenReported && status !== "NOT_APPLICABLE";
  const baseProvenance = provenanceFromObservation(observation, status);
  const provenance: CoverageProvenance = override
    ? {
        source: override.source ?? baseProvenance.source,
        timestamp: override.timestamp ?? baseProvenance.timestamp,
        reportingPeriod: override.reportingPeriod ?? baseProvenance.reportingPeriod,
        currency: override.currency ?? baseProvenance.currency,
        valueKind: override.valueKind ?? baseProvenance.valueKind,
        formula: override.formula ?? baseProvenance.formula,
        confidence: override.confidence ?? baseProvenance.confidence,
        verificationStatus: override.status,
        sourcePriority: override.sourcePriority ?? baseProvenance.sourcePriority,
      }
    : baseProvenance;

  return {
    key: requirement.key,
    label: requirement.label,
    weight: requirement.weight,
    critical: Boolean(requirement.critical),
    requiredWhenReported: Boolean(requirement.requiredWhenReported),
    countsTowardCoverage,
    status,
    value: observation.value,
    reason,
    provenance,
    companyQualityImpact: status === "NOT_REPORTED_BY_COMPANY" ? "disclosure_concern" : "none",
  };
}

function weightedRatio(points: CoverageDataPoint[], accepted: Set<CoverageVerificationStatus>) {
  const applicable = points.filter((point) => point.countsTowardCoverage);
  const denominator = applicable.reduce((sum, point) => sum + point.weight, 0);
  if (denominator <= 0) return 0;
  const numerator = applicable
    .filter((point) => accepted.has(point.status))
    .reduce((sum, point) => sum + point.weight, 0);
  return numerator / denominator;
}

export function assessCoverageV3(
  input: FinancialAnalysisInput,
  result: FinancialAnalysisResult,
  context: CoverageAssessmentContext = {},
): CoverageAssessment {
  const profile = resolveRequiredDataProfile(input);
  const dataPoints = profile.requirements.map((requirement) =>
    pointFromRequirement(requirement, input, result, context),
  );
  const verifiedCoverage = weightedRatio(dataPoints, new Set(["VERIFIED"]));
  const retrievalCoverage = weightedRatio(dataPoints, new Set(["VERIFIED", "NOT_REPORTED_BY_COMPANY"]));
  const disclosureKnown = dataPoints.filter(
    (point) => point.countsTowardCoverage && (point.status === "VERIFIED" || point.status === "NOT_REPORTED_BY_COMPANY"),
  );
  const disclosureWeight = disclosureKnown.reduce((sum, point) => sum + point.weight, 0);
  const verifiedDisclosureWeight = disclosureKnown
    .filter((point) => point.status === "VERIFIED")
    .reduce((sum, point) => sum + point.weight, 0);
  const disclosureCoverage = disclosureWeight > 0 ? verifiedDisclosureWeight / disclosureWeight : null;
  const blockingIssues = dataPoints.filter(
    (point) => point.countsTowardCoverage && point.critical && ["DATA_CONFLICT", "STOCKBOX_RETRIEVAL_FAILURE", "SOURCE_UNAVAILABLE"].includes(point.status),
  );

  return {
    policyVersion: "stockbox-coverage-policy-v3.0.0",
    profileId: profile.id,
    profileLabel: profile.label,
    verifiedCoverage,
    retrievalCoverage,
    disclosureCoverage,
    dataPoints,
    blockingIssues,
    stockboxFailureCount: dataPoints.filter((point) => point.status === "STOCKBOX_RETRIEVAL_FAILURE").length,
    sourceUnavailableCount: dataPoints.filter((point) => point.status === "SOURCE_UNAVAILABLE").length,
    companyDisclosureGapCount: dataPoints.filter((point) => point.status === "NOT_REPORTED_BY_COMPANY").length,
    conflictCount: dataPoints.filter((point) => point.status === "DATA_CONFLICT").length,
    verifiedCount: dataPoints.filter((point) => point.status === "VERIFIED").length,
    conditionalMetricCount: dataPoints.filter((point) => point.requiredWhenReported).length,
    recommendationEligible:
      profile.id !== "unknown" &&
      blockingIssues.length === 0 &&
      verifiedCoverage >= 0.7 &&
      result.dataStatus === "current",
    fairness: {
      stockboxFailuresPenalizeCompanyQuality: false,
      sourceUnavailablePenalizesCompanyQuality: false,
      dataConflictsPenalizeCompanyQuality: false,
      confirmedNonReportingMayCreateDisclosureConcern: true,
    },
  };
}
