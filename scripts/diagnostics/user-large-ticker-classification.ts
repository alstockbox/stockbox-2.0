import type { AnalysisReport, CompanySearchResult, MissingDataItem, ProviderDiagnostic } from "../../src/lib/analysis/types";

export type BatchRootCause =
  | "completed"
  | "input_invalid"
  | "symbol_not_found"
  | "symbol_mismatch_or_delisted"
  | "symbol_inactive_or_delisted"
  | "same_root_listing_mismatch"
  | "fuzzy_symbol_search_mismatch"
  | "unsupported_security"
  | "fund_or_etf_unsupported"
  | "preferred_security_unsupported"
  | "adr_security_unsupported"
  | "other_security_unsupported"
  | "provider_failure"
  | "provider_timeout"
  | "provider_not_configured"
  | "sec_provider_not_configured"
  | "filings_events_provider_not_configured"
  | "provider_data_unavailable"
  | "fundamentals_provider_gap"
  | "fundamentals_empty_response"
  | "market_history_short"
  | "market_price_invalid"
  | "analysis_engine_error"
  | "low_coverage"
  | "quality_unavailable"
  | "valuation_unavailable"
  | "market_cap_input_gap"
  | "market_cap_or_shares_provider_gap"
  | "capital_structure_input_gap"
  | "debt_cash_input_gap"
  | "wacc_capital_weights_gap"
  | "valuation_cash_earnings_input_gap"
  | "tax_rate_fallback_gap"
  | "specialized_provider_gap"
  | "unscored_archetype_gap"
  | "asset_manager_model_gap"
  | "lender_receivables_model_gap"
  | "capital_markets_model_gap"
  | "diversified_financial_model_gap"
  | "pre_combination_vehicle_model_gap"
  | "insufficient_archetype_evidence_gap"
  | "holding_company_nav_gap"
  | "share_basis_alignment_gap"
  | "bank_margin_provider_gap"
  | "bank_regulatory_capital_provider_gap"
  | "bank_asset_quality_provider_gap"
  | "bank_efficiency_provider_gap"
  | "insurer_regulatory_reserve_provider_gap"
  | "financial_statement_availability_gap"
  | "eps_net_income_reconciliation_gap"
  | "ttm_eps_reconciliation_gap"
  | "annual_eps_reconciliation_gap"
  | "eps_sign_reconciliation_gap"
  | "eps_magnitude_reconciliation_gap"
  | "currency_alignment_gap"
  | "market_financial_currency_mismatch_gap"
  | "mixed_reporting_currency_gap"
  | "freshness_gap"
  | "balance_sheet_freshness_gap"
  | "ttm_balance_lag_gap"
  | "ttm_or_period_gap"
  | "historical_comparability_gap"
  | "history_depth_gap"
  | "non_positive_metric_limit"
  | "earnings_non_positive_limit"
  | "fcf_non_positive_limit"
  | "fcff_non_positive_dcf_limit"
  | "ebitda_non_positive_limit"
  | "revenue_non_positive_limit"
  | "capital_base_non_positive_limit"
  | "zero_denominator_metric_limit";

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function normalizedSymbolRoot(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^["']|["']$/g, "")
    .replace(/\..*$/, "")
    .replace(/[-=^].*$/, "");
}

function hasInactiveSymbolDiagnostic(diagnostics: ProviderDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) =>
    diagnostic.capability === "market_data"
    && diagnostic.status === "unavailable"
    && /not_found|delist|inactive|No data found/i.test(diagnostic.reason ?? "")
  );
}

export function symbolNotFoundRootCauses(
  _query: string,
  diagnostics: ProviderDiagnostic[] = [],
): BatchRootCause[] {
  return unique([
    "symbol_not_found",
    ...(hasInactiveSymbolDiagnostic(diagnostics) ? ["symbol_inactive_or_delisted" as const] : []),
  ]);
}

export function noExactMatchRootCauses(
  query: string,
  candidates: CompanySearchResult[],
  diagnostics: ProviderDiagnostic[] = [],
): BatchRootCause[] {
  const requestedRoot = normalizedSymbolRoot(query);
  const hasSameRootCandidate = Boolean(requestedRoot) && candidates.some((candidate) =>
    [candidate.ticker, candidate.canonicalTicker, ...(candidate.providerTickers ?? [])]
      .some((symbol) => normalizedSymbolRoot(symbol) === requestedRoot)
  );
  return unique([
    "symbol_mismatch_or_delisted",
    ...(hasInactiveSymbolDiagnostic(diagnostics) ? ["symbol_inactive_or_delisted" as const] : []),
    hasSameRootCandidate ? "same_root_listing_mismatch" : "fuzzy_symbol_search_mismatch",
  ]);
}

export function unsupportedSecurityRootCauses(company: CompanySearchResult): BatchRootCause[] {
  if (company.securityType === "ETF/Fund") return ["unsupported_security", "fund_or_etf_unsupported"];
  if (company.securityType === "Preferred") return ["unsupported_security", "preferred_security_unsupported"];
  if (company.securityType === "ADR") return ["unsupported_security", "adr_security_unsupported"];
  return ["unsupported_security", "other_security_unsupported"];
}

export type AnalysisFailureClassification = {
  status: "unsupported" | "provider_data_unavailable" | "provider_failure";
  rootCauses: BatchRootCause[];
};

function isUnsupportedSecurityType(company: CompanySearchResult): boolean {
  return (company.securityType ?? "Common Stock") !== "Common Stock";
}

function hasConfiguredFundamentalsGap(company: CompanySearchResult): boolean {
  return !isUnsupportedSecurityType(company)
    && (
      company.providerCapabilities?.fundamentals === false
      || company.analysisCapability?.fundamentals === "unavailable"
    );
}

function isFundamentalsUnavailableError(error: string): boolean {
  return /fundamental data is unavailable|fundamentals? (?:are|is) not available|no configured live fundamentals provider/i.test(error);
}

export function classifyAnalysisFailure(
  error: string,
  company: CompanySearchResult,
  diagnostics: ProviderDiagnostic[] = [],
): AnalysisFailureClassification {
  if (isUnsupportedSecurityType(company)) {
    return {
      status: "unsupported",
      rootCauses: unsupportedSecurityRootCauses(company),
    };
  }

  const providerRootCause = isFundamentalsUnavailableError(error)
    ? "provider_data_unavailable"
    : providerFailureRootCause(error);
  const rootCauses = unique([
    providerRootCause,
    ...(hasConfiguredFundamentalsGap(company) ? ["fundamentals_provider_gap" as const] : []),
    ...providerDiagnosticRootCauses(diagnostics),
  ]);

  return {
    status: providerRootCause === "provider_data_unavailable" ? "provider_data_unavailable" : providerFailureStatus(error),
    rootCauses,
  };
}

export function providerDiagnosticRootCauses(diagnostics: ProviderDiagnostic[]): BatchRootCause[] {
  const causes: BatchRootCause[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.status === "available") continue;
    const reason = diagnostic.reason ?? "";
    if (/not_configured/i.test(reason)) {
      causes.push("provider_not_configured");
      if (/sec/i.test(diagnostic.provider) && diagnostic.capability === "fundamentals") {
        causes.push("sec_provider_not_configured");
      }
      if (diagnostic.capability === "filings_events") {
        causes.push("filings_events_provider_not_configured");
      }
    }
    if (/timeout|timed out/i.test(reason)) {
      causes.push("provider_timeout");
    }
    if (diagnostic.capability === "fundamentals" && /empty_response/i.test(reason)) {
      causes.push("fundamentals_empty_response");
    }
    if (diagnostic.capability === "market_data" && /history_short/i.test(reason)) {
      causes.push("market_history_short");
    }
    if (diagnostic.capability === "market_data" && /impossible_price/i.test(reason)) {
      causes.push("market_price_invalid");
    }
  }
  return unique(causes);
}

export function reportRootCauses(report: AnalysisReport): BatchRootCause[] {
  const causes: BatchRootCause[] = ["completed"];
  const engine = report.engine;
  if (!engine) return causes;
  if ((engine.dataCoverage ?? 0) < 0.7) causes.push("low_coverage");
  if (engine.scores.dimensions.quality.score === null) causes.push("quality_unavailable");
  if (engine.scores.dimensions.valuation.score === null) causes.push("valuation_unavailable");
  const marketCapBlocker = engine.currencyAlignment !== "aligned"
    || engine.missingData.some(isMarketFinancialCurrencyMismatchGap)
    || engine.missingData.some(isShareBasisAlignmentGap);
  if (engine.missingData.some((item) =>
    isMarketCapInputGap(item) && (!marketCapBlocker || !isDownstreamMarketCapMetricGap(item))
  )) causes.push("market_cap_input_gap");
  if (engine.missingData.some(isMarketCapOrSharesProviderGap)) causes.push("market_cap_or_shares_provider_gap");
  if (engine.missingData.some((item) =>
    isCapitalStructureInputGap(item) && (!marketCapBlocker || !isEnterpriseValueDependencyGap(item))
  )) causes.push("capital_structure_input_gap");
  if (engine.missingData.some(isDebtCashInputGap)) causes.push("debt_cash_input_gap");
  if (engine.missingData.some(isWaccCapitalWeightsGap)) causes.push("wacc_capital_weights_gap");
  if (engine.missingData.some(isValuationCashEarningsInputGap)) causes.push("valuation_cash_earnings_input_gap");
  if (engine.missingData.some(isTaxRateFallbackGap)) causes.push("tax_rate_fallback_gap");
  if (isKnownSpecialistArchetype(engine.analysisArchetype) && (
    (engine.scores.specializedCoverage?.overall ?? 1) < 0.7
    || engine.missingData.some(isSpecializedProviderGap)
  )) causes.push("specialized_provider_gap");
  if (engine.missingData.some(isBankMarginProviderGap)) causes.push("bank_margin_provider_gap");
  if (engine.missingData.some(isBankRegulatoryCapitalProviderGap)) causes.push("bank_regulatory_capital_provider_gap");
  if (engine.missingData.some(isBankAssetQualityProviderGap)) causes.push("bank_asset_quality_provider_gap");
  if (engine.missingData.some(isBankEfficiencyProviderGap)) causes.push("bank_efficiency_provider_gap");
  if (engine.missingData.some(isInsurerRegulatoryReserveProviderGap)) causes.push("insurer_regulatory_reserve_provider_gap");
  if (
    engine.analysisArchetype === "holding_company"
    && (engine.scores.stockBoxScore === null || engine.missingData.some(isHoldingCompanyNavGap))
  ) causes.push("holding_company_nav_gap");
  if (
    ["unknown", "pre_revenue_biotech"].includes(engine.analysisArchetype)
    && engine.scores.stockBoxScore === null
  ) causes.push("unscored_archetype_gap");
  if (engine.missingData.some(isAssetManagerModelGap)) causes.push("asset_manager_model_gap");
  if (engine.missingData.some(isLenderReceivablesModelGap)) causes.push("lender_receivables_model_gap");
  if (engine.missingData.some(isCapitalMarketsModelGap)) causes.push("capital_markets_model_gap");
  if (engine.missingData.some(isDiversifiedFinancialModelGap)) causes.push("diversified_financial_model_gap");
  if (engine.missingData.some(isPreCombinationVehicleModelGap)) causes.push("pre_combination_vehicle_model_gap");
  if (engine.missingData.some(isInsufficientArchetypeEvidenceGap)) causes.push("insufficient_archetype_evidence_gap");
  if (engine.missingData.some(isShareBasisAlignmentGap)) causes.push("share_basis_alignment_gap");
  if (engine.missingData.some(isFinancialStatementAvailabilityGap)) causes.push("financial_statement_availability_gap");
  if (engine.missingData.some(isEpsNetIncomeReconciliationGap)) causes.push("eps_net_income_reconciliation_gap");
  if (engine.missingData.some(isTtmEpsReconciliationGap)) causes.push("ttm_eps_reconciliation_gap");
  if (engine.missingData.some(isAnnualEpsReconciliationGap)) causes.push("annual_eps_reconciliation_gap");
  if (engine.missingData.some(isEpsSignReconciliationGap)) causes.push("eps_sign_reconciliation_gap");
  if (engine.missingData.some(isEpsMagnitudeReconciliationGap)) causes.push("eps_magnitude_reconciliation_gap");
  if (engine.currencyAlignment !== "aligned" || engine.missingData.some(isCurrencyDataGap)) causes.push("currency_alignment_gap");
  if (engine.currencyAlignment === "mismatch" || engine.missingData.some(isMarketFinancialCurrencyMismatchGap)) {
    causes.push("market_financial_currency_mismatch_gap");
  }
  if (engine.missingData.some(isMixedReportingCurrencyGap)) causes.push("mixed_reporting_currency_gap");
  if (engine.dataStatus === "stale" || engine.missingData.some(isFreshnessGap)) causes.push("freshness_gap");
  if (engine.missingData.some(isBalanceSheetFreshnessGap)) causes.push("balance_sheet_freshness_gap");
  if (engine.missingData.some(isTtmBalanceLagGap)) causes.push("ttm_balance_lag_gap");
  if (engine.missingData.some(isTtmOrPeriodGap)) causes.push("ttm_or_period_gap");
  if (engine.missingData.some(isHistoricalComparabilityGap)) causes.push("historical_comparability_gap");
  if (engine.missingData.some(isHistoryDepthGap)) causes.push("history_depth_gap");
  if (engine.missingData.some(isNonPositiveMetricLimit)) causes.push("non_positive_metric_limit");
  if (engine.missingData.some(isEarningsNonPositiveLimit)) causes.push("earnings_non_positive_limit");
  if (engine.missingData.some(isFcfNonPositiveLimit)) causes.push("fcf_non_positive_limit");
  if (engine.missingData.some(isFcffNonPositiveDcfLimit)) causes.push("fcff_non_positive_dcf_limit");
  if (engine.missingData.some(isEbitdaNonPositiveLimit)) causes.push("ebitda_non_positive_limit");
  if (engine.missingData.some(isRevenueNonPositiveLimit)) causes.push("revenue_non_positive_limit");
  if (engine.missingData.some(isCapitalBaseNonPositiveLimit)) causes.push("capital_base_non_positive_limit");
  if (engine.missingData.some(isZeroDenominatorMetricLimit)) causes.push("zero_denominator_metric_limit");
  return unique(causes);
}

function isKnownSpecialistArchetype(archetype: string): boolean {
  return ["bank", "insurer", "reit"].includes(archetype);
}

function isSpecializedProviderGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /current specialized (?:bank|insurer|reit)-data provider phase|from specialized bank data|from specialized insurer data|requires specialist reserve or policy data|from specialized REIT data/i.test(text);
}

function isBankMarginProviderGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /netInterestMargin|Net interest margin|NIM is unavailable/i.test(text);
}

function isBankRegulatoryCapitalProviderGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /cet1CapitalRatio|CET1 capital ratio/i.test(text);
}

function isBankAssetQualityProviderGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /nonperformingLoans|netChargeOffs|loanLossProvisions|Nonperforming loans|Net charge-offs|Loan-loss provisions/i.test(text);
}

function isBankEfficiencyProviderGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /Efficiency ratio.*specialized bank data|net interest income, noninterest income, noninterest expense/i.test(text);
}

function isInsurerRegulatoryReserveProviderGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /regulatoryCapitalRatio|reserveDevelopment|Regulatory capital ratio|Reserve development|requires specialist reserve or policy data/i.test(text);
}

function isAssetManagerModelGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /Archetype-specific .*model.*specialized asset-manager model|asset-management business/i.test(text);
}

function isLenderReceivablesModelGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /Archetype-specific .*model.*specialized lender\/receivables model|credit-services or specialty-finance business/i.test(text);
}

function isCapitalMarketsModelGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /Archetype-specific .*model.*specialized capital-markets model|capital-markets business/i.test(text);
}

function isDiversifiedFinancialModelGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /Archetype-specific .*model.*specialized diversified-financial model|financial conglomerate/i.test(text);
}

function isPreCombinationVehicleModelGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /Archetype-specific .*model.*specialized pre-combination vehicle model|shell or acquisition company/i.test(text);
}

function isInsufficientArchetypeEvidenceGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /archetype_classification.*insufficient|insufficient for a reliable archetype|insufficient to choose an economically suitable scoring model/i.test(text);
}

function isHoldingCompanyNavGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /NAV \/ share|NAV discount|SOTP data|look-through NAV/i.test(text);
}

function isShareBasisAlignmentGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /shareBasisAlignment|listing-specific share basis|quote price times current shares|market cap materially disagrees/i.test(text);
}

function isFinancialStatementAvailabilityGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /annualPeriods.*No reliable financial period|No reliable financial period is available|revenue.*Revenue is unavailable for the latest reliable period/i.test(text);
}

function isEpsNetIncomeReconciliationGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /eps_net_income|Diluted EPS times diluted shares versus diluted income available to common shareholders differs/i.test(text);
}

function isEpsSignReconciliationGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /eps_net_income.*opposite signs|Diluted EPS times diluted shares.*opposite signs/i.test(text);
}

function isTtmEpsReconciliationGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /eps_net_income.*\bTTM\b|\bTTM\b diluted EPS times diluted shares/i.test(text);
}

function isAnnualEpsReconciliationGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /eps_net_income.*\b(?:Annual|FY)\b|\b(?:Annual|FY)\b diluted EPS times diluted shares/i.test(text);
}

function isEpsMagnitudeReconciliationGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /eps_net_income.*magnitude mismatch|same-direction magnitude mismatch/i.test(text);
}

function isMarketCapInputGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /marketCap.*reported value or both price and shares|(?:P\/E|P \/ E|P \/ Book|FCF yield).*current same-currency market cap|sharesOutstanding.*Current shares are required for per-share value/i.test(text);
}

function isMarketCapOrSharesProviderGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /marketCap.*reported value or both price and shares|sharesOutstanding.*Current shares are required for per-share value/i.test(text);
}

function isDownstreamMarketCapMetricGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /(?:P\/E|P \/ E|P \/ Book|FCF yield).*current same-currency market cap/i.test(text);
}

function isCapitalStructureInputGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /enterpriseValue.*EV requires market cap, reported debt and reported cash|(?:EV \/ EBITDA|EV \/ Sales).*enterprise value from current market cap plus reported debt and cash|netDebt.*Reported debt and cash are required|wacc.*Market-value capital weights and reported debt/i.test(text);
}

function isEnterpriseValueDependencyGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /enterpriseValue.*EV requires market cap, reported debt and reported cash|(?:EV \/ EBITDA|EV \/ Sales).*enterprise value from current market cap plus reported debt and cash/i.test(text);
}

function isDebtCashInputGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /netDebt.*Reported debt and cash are required|reported debt and cash; missing debt is not zero/i.test(text);
}

function isWaccCapitalWeightsGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /wacc.*Market-value capital weights and reported debt|Market-value capital weights and reported debt are required/i.test(text);
}

function isValuationCashEarningsInputGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /P\/E requires net income available to common shareholders|FCF yield requires operating cash flow and capex, or provider-reported free cash flow/i.test(text);
}

function isTaxRateFallbackGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /normalizedTaxRate.*labelled .*fallback|stable reported effective tax rate.*fallback/i.test(text);
}

export function isBalanceSheetFreshnessGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /balance_sheet_freshness|Balance-sheet facts are .*older than the TTM flow endpoint/i.test(text);
}

function isTtmBalanceLagGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /balance_sheet_freshness.*TTM flow endpoint|Balance-sheet facts are .*older than the TTM flow endpoint/i.test(text);
}

function isFreshnessGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /staleFinancialData|futureFinancialData|fundamental_data_freshness|marketPriceFreshness|market_cap_freshness|shares_outstanding_freshness|too old for a current analysis|future-dated|freshness could not be established/i.test(text);
}

function isCurrencyDataGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /currencyAlignment|marketCapCurrency|financialCurrencyConsistency|financial_currency_consistency|Financial and market currencies differ|FX conversion|mixed reporting currencies|conflicting monetary currencies/i.test(text);
}

function isMarketFinancialCurrencyMismatchGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /currencyAlignment|marketCapCurrency|Financial and market currencies differ|FX conversion|reported market cap currency does not align/i.test(text);
}

function isMixedReportingCurrencyGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /financialCurrencyConsistency|financial_currency_consistency|mixed reporting currencies|conflicting monetary currencies/i.test(text);
}

export function isTtmOrPeriodGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /return_metric_balance_alignment|returnMetricAverageBalances|balanceSheetAlignment|TTM capital-structure inputs|TTM flow metrics do not share|Current and prior-year instant balances|Comparable prior-year instant balances/i.test(text);
}

export function isHistoricalComparabilityGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /comparable latest and three-year-prior|three-year-prior annual period|annual periods are required|comparable latest and prior annual|requires reported revenue in both comparable periods|Two positive, comparable annual or TTM revenue periods are required/i.test(text);
}

function isHistoryDepthGap(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /requires at least three contiguous annual periods|requires diluted share counts in both comparable annual periods|Diluted share count is missing|Diluted EPS is missing/i.test(text);
}

export function isNonPositiveMetricLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /not meaningful when .*non-positive|is not meaningful when .*non-positive|prior TTM FCF is non-positive|common earnings are non-positive|EBITDA is non-positive|invested capital must be positive|Positive FCFF is required/i.test(text);
}

function isEarningsNonPositiveLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /(?:P\/E|P \/ E).*common earnings are non-positive|EPS CAGR.*diluted EPS is non-positive/i.test(text);
}

function isFcfNonPositiveLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /FCF\/share CAGR.*FCF\/share is non-positive|FCF growth.*(?:prior-year FCF|prior TTM FCF) is non-positive/i.test(text);
}

function isFcffNonPositiveDcfLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /baseFcff.*Positive FCFF is required|Positive FCFF is required for an FCFF DCF/i.test(text);
}

function isEbitdaNonPositiveLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /EBITDA is non-positive/i.test(text);
}

function isRevenueNonPositiveLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /Revenue.*revenue is non-positive|EV \/ Sales.*revenue is non-positive/i.test(text);
}

function isCapitalBaseNonPositiveLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /invested capital must be positive|book value .*non-positive|tangible book value .*non-positive/i.test(text);
}

function isZeroDenominatorMetricLimit(item: Pick<MissingDataItem, "field" | "reason">): boolean {
  const text = `${item.field} ${item.reason}`;
  return /not finite when reported .*zero|reported debt is zero|reported revenue is zero|interest expense is zero/i.test(text);
}

export function providerFailureRootCause(error: string): BatchRootCause {
  if (/fundamental data is unavailable/i.test(error)) return "provider_data_unavailable";
  if (/timeout|timed out/i.test(error)) return "provider_timeout";
  return "provider_failure";
}

export type ProviderFailureStatus = "provider_data_unavailable" | "provider_failure";

export function providerFailureStatus(error: string): ProviderFailureStatus {
  return providerFailureRootCause(error) === "provider_data_unavailable"
    ? "provider_data_unavailable"
    : "provider_failure";
}
