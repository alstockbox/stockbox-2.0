import { describe, expect, it } from "vitest";
import type { AnalysisReport, CompanySearchResult, ProviderDiagnostic } from "../../src/lib/analysis/types";
import {
  classifyAnalysisFailure,
  isBalanceSheetFreshnessGap,
  isHistoricalComparabilityGap,
  isNonPositiveMetricLimit,
  isTtmOrPeriodGap,
  noExactMatchRootCauses,
  providerFailureRootCause,
  providerFailureStatus,
  providerDiagnosticRootCauses,
  reportRootCauses,
  symbolNotFoundRootCauses,
  unsupportedSecurityRootCauses,
} from "../../scripts/diagnostics/user-large-ticker-classification";

function reportWithMissingData(
  field: string,
  reason: string,
  overrides: Partial<{
    analysisArchetype: string;
    currencyAlignment: string;
    dataStatus: string;
    dataCoverage: number;
    qualityScore: number | null;
    valuationScore: number | null;
    specializedCoverage: { overall: number };
    stockBoxScore: number | null;
  }> = {},
): AnalysisReport {
  return {
    engine: {
      analysisArchetype: overrides.analysisArchetype ?? "standard",
      currencyAlignment: overrides.currencyAlignment ?? "aligned",
      dataCoverage: overrides.dataCoverage ?? 1,
      dataStatus: overrides.dataStatus ?? "current",
      missingData: [{ field, reason, impact: "score", severity: "high" }],
      scores: {
        stockBoxScore: overrides.stockBoxScore === undefined ? 70 : overrides.stockBoxScore,
        specializedCoverage: overrides.specializedCoverage,
        dimensions: {
          quality: { score: overrides.qualityScore === undefined ? 70 : overrides.qualityScore },
          valuation: { score: overrides.valuationScore === undefined ? 70 : overrides.valuationScore },
        },
      },
    },
  } as unknown as AnalysisReport;
}

describe("large ticker diagnostic root-cause classification", () => {
  it("does not classify stale TTM balance dates as generic TTM calculation gaps", () => {
    const staleBalance = {
      field: "balance_sheet_freshness",
      reason: "Balance-sheet facts are 91 days older than the TTM flow endpoint.",
    };

    expect(isTtmOrPeriodGap(staleBalance)).toBe(false);
    expect(isBalanceSheetFreshnessGap(staleBalance)).toBe(true);
    expect(reportRootCauses(reportWithMissingData(staleBalance.field, staleBalance.reason))).toEqual([
      "completed",
      "balance_sheet_freshness_gap",
      "ttm_balance_lag_gap",
    ]);
  });

  it("keeps period-basis, history, and economic-limit gaps separate", () => {
    expect(isTtmOrPeriodGap({
      field: "return_metric_balance_alignment",
      reason: "Current and prior-year instant balances are not aligned closely enough for TTM return metrics.",
    })).toBe(true);
    expect(isHistoricalComparabilityGap({
      field: "Revenue CAGR 3Y",
      reason: "Revenue CAGR 3Y requires comparable latest and three-year-prior annual periods.",
    })).toBe(true);
    expect(isNonPositiveMetricLimit({
      field: "P/E",
      reason: "P/E is not meaningful when common earnings are non-positive.",
    })).toBe(true);
  });

  it("separates empty fundamental data from generic provider failures", () => {
    expect(providerFailureRootCause("Fundamental data is unavailable for this company.")).toBe("provider_data_unavailable");
    expect(providerFailureRootCause("Yahoo Finance fundamentals request failed with HTTP 503.")).toBe("provider_failure");
    expect(providerFailureRootCause("Yahoo Finance chart request timed out.")).toBe("provider_timeout");
    expect(providerFailureStatus("Fundamental data is unavailable for this company.")).toBe("provider_data_unavailable");
    expect(providerFailureStatus("Yahoo Finance fundamentals request failed with HTTP 503.")).toBe("provider_failure");
    expect(providerFailureStatus("Yahoo Finance chart request timed out.")).toBe("provider_failure");
  });

  it("does not classify common-stock fundamentals coverage gaps as unsupported securities", () => {
    const company = {
      ticker: "STATE",
      canonicalTicker: "STATE.ST",
      name: "Safestate Group",
      securityType: "Common Stock",
      providerCapabilities: {
        fundamentals: false,
        marketData: true,
        providerIds: ["swedish-listed-security-master"],
      },
      analysisCapability: {
        fundamentals: "unavailable",
        marketData: "available",
        reason: "No configured live fundamentals provider for this listed security.",
      },
    } as CompanySearchResult;

    const classification = classifyAnalysisFailure(
      "Fundamental data is unavailable for this company.",
      company,
      [],
    );

    expect(classification.status).toBe("provider_data_unavailable");
    expect(classification.rootCauses).toEqual(expect.arrayContaining([
      "provider_data_unavailable",
      "fundamentals_provider_gap",
    ]));
    expect(classification.rootCauses).not.toContain("unsupported_security");
    expect(classification.rootCauses).not.toContain("other_security_unsupported");
  });

  it("keeps true unsupported security types out of provider-data buckets", () => {
    const company = {
      ticker: "PDI",
      canonicalTicker: "PDI",
      name: "PIMCO Dynamic Income Fund",
      securityType: "ETF/Fund",
      providerCapabilities: {
        fundamentals: false,
        marketData: true,
        providerIds: ["yahoo-search"],
      },
      analysisCapability: {
        fundamentals: "unavailable",
        marketData: "available",
        reason: "Security type is outside the supported common-stock analysis scope.",
      },
    } as CompanySearchResult;

    expect(classifyAnalysisFailure(
      "Live fundamentals are not available for this security.",
      company,
      [],
    )).toEqual({
      status: "unsupported",
      rootCauses: ["unsupported_security", "fund_or_etf_unsupported"],
    });
  });

  it("classifies provider diagnostic reasons without treating them as engine errors", () => {
    const diagnostics: ProviderDiagnostic[] = [
      {
        provider: "Yahoo Finance fundamentals",
        capability: "fundamentals",
        status: "partial",
        reason: "empty_response",
        observedAt: "2026-08-30T00:00:00.000Z",
      },
      {
        provider: "Yahoo Finance chart",
        capability: "market_data",
        status: "partial",
        reason: "history_short",
        observedAt: "2026-08-30T00:00:00.000Z",
      },
      {
        provider: "Yahoo Finance chart",
        capability: "market_data",
        status: "unavailable",
        reason: "impossible_price",
        observedAt: "2026-08-30T00:00:00.000Z",
      },
      {
        provider: "Yahoo Finance chart",
        capability: "market_data",
        status: "unavailable",
        reason: "timeout",
        observedAt: "2026-08-30T00:00:00.000Z",
      },
    ];

    expect(providerDiagnosticRootCauses(diagnostics)).toEqual([
      "fundamentals_empty_response",
      "market_history_short",
      "market_price_invalid",
      "provider_timeout",
    ]);
  });

  it("classifies unconfigured provider capabilities separately from data-empty responses", () => {
    const diagnostics: ProviderDiagnostic[] = [
      {
        provider: "SEC Companyfacts",
        capability: "fundamentals",
        status: "unavailable",
        reason: "not_configured",
        observedAt: "2026-08-30T00:00:00.000Z",
      },
      {
        provider: "SEC Submissions",
        capability: "filings_events",
        status: "unavailable",
        reason: "not_configured",
        observedAt: "2026-08-30T00:00:00.000Z",
      },
    ];

    expect(providerDiagnosticRootCauses(diagnostics)).toEqual([
      "provider_not_configured",
      "sec_provider_not_configured",
      "filings_events_provider_not_configured",
    ]);
  });

  it("does not treat non-freshness data unavailability as a freshness gap", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "financial_currency_consistency",
      "At least one financial period contains conflicting monetary currencies; growth and scoring require one verified reporting currency per period.",
      { dataStatus: "unavailable" },
    ));

    expect(causes).toContain("currency_alignment_gap");
    expect(causes).toContain("mixed_reporting_currency_gap");
    expect(causes).not.toContain("market_financial_currency_mismatch_gap");
    expect(causes).not.toContain("freshness_gap");
  });

  it("does not treat missing same-currency market-cap inputs as a currency gap", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "P/E",
      "P/E requires a current same-currency market cap.",
    ));

    expect(causes).toContain("market_cap_input_gap");
    expect(causes).not.toContain("currency_alignment_gap");
  });

  it("separates market/financial currency mismatch from mixed reporting currencies", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "currencyAlignment",
      "Financial and market currencies differ; valuation metrics require aligned currency data or explicit FX conversion.",
      { currencyAlignment: "mismatch" },
    ));

    expect(causes).toEqual(expect.arrayContaining([
      "currency_alignment_gap",
      "market_financial_currency_mismatch_gap",
    ]));
    expect(causes).not.toContain("mixed_reporting_currency_gap");
  });

  it("does not turn currency-blocked downstream valuation metrics into market-cap input gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "FCF yield",
      "FCF yield requires a current same-currency market cap.",
      { currencyAlignment: "mismatch", valuationScore: null },
    ));

    expect(causes).toEqual(expect.arrayContaining([
      "valuation_unavailable",
      "currency_alignment_gap",
      "market_financial_currency_mismatch_gap",
    ]));
    expect(causes).not.toContain("market_cap_input_gap");
  });

  it("keeps genuinely stale financial statements in the freshness gap", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "staleFinancialData",
      "Latest reliable financial statements are too old for a current analysis.",
      { dataStatus: "stale" },
    ));

    expect(causes).toContain("freshness_gap");
  });

  it("separates missing reliable financial statements from generic low coverage", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "annualPeriods",
      "No reliable financial period is available.",
    ));

    expect(causes).toContain("financial_statement_availability_gap");
    expect(causes).not.toContain("provider_data_unavailable");
  });

  it("separates known specialist provider gaps from unscored archetype gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "netInterestMargin",
      "Net interest margin (NIM) is unavailable from the current specialized bank-data provider phase.",
      {
        analysisArchetype: "bank",
        specializedCoverage: { overall: 0.45 },
      },
    ));

    expect(causes).toContain("specialized_provider_gap");
    expect(causes).not.toContain("unscored_archetype_gap");
    expect(causes).not.toContain("archetype_or_specialized_gap");
  });

  it("separates unsupported specialist models from known specialist provider gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "Archetype-specific valuation model",
      "Industry description identifies an asset-management business; a specialized asset-manager model is required before corporate methodology can be used.",
      {
        analysisArchetype: "unknown",
        stockBoxScore: null,
      },
    ));

    expect(causes).toContain("unscored_archetype_gap");
    expect(causes).toContain("asset_manager_model_gap");
    expect(causes).not.toContain("specialized_provider_gap");
    expect(causes).not.toContain("archetype_or_specialized_gap");
  });

  it("separates missing specialty-finance, capital-markets, diversified-financial, and shell models", () => {
    const lender = reportRootCauses(reportWithMissingData(
      "Archetype-specific valuation model",
      "Industry description identifies a credit-services or specialty-finance business; a specialized lender/receivables model is required before corporate methodology can be used.",
      { analysisArchetype: "unknown", stockBoxScore: null },
    ));
    const capitalMarkets = reportRootCauses(reportWithMissingData(
      "Archetype-specific valuation model",
      "Industry description identifies a capital-markets business; a specialized capital-markets model is required before corporate methodology can be used.",
      { analysisArchetype: "unknown", stockBoxScore: null },
    ));
    const diversified = reportRootCauses(reportWithMissingData(
      "Archetype-specific valuation model",
      "Industry description identifies a financial conglomerate; a specialized diversified-financial model is required before corporate methodology can be used.",
      { analysisArchetype: "unknown", stockBoxScore: null },
    ));
    const shell = reportRootCauses(reportWithMissingData(
      "Archetype-specific valuation model",
      "Industry description identifies a shell or acquisition company; a specialized pre-combination vehicle model is required before corporate methodology can be used.",
      { analysisArchetype: "unknown", stockBoxScore: null },
    ));

    expect(lender).toEqual(expect.arrayContaining(["unscored_archetype_gap", "lender_receivables_model_gap"]));
    expect(capitalMarkets).toEqual(expect.arrayContaining(["unscored_archetype_gap", "capital_markets_model_gap"]));
    expect(diversified).toEqual(expect.arrayContaining(["unscored_archetype_gap", "diversified_financial_model_gap"]));
    expect(shell).toEqual(expect.arrayContaining(["unscored_archetype_gap", "pre_combination_vehicle_model_gap"]));
  });

  it("separates insufficient archetype evidence from named specialist model gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "archetype_classification",
      "Archetype classification is uncertain: Available SIC and industry evidence is insufficient for a reliable archetype.",
      { analysisArchetype: "unknown", stockBoxScore: null },
    ));

    expect(causes).toEqual(expect.arrayContaining(["unscored_archetype_gap", "insufficient_archetype_evidence_gap"]));
    expect(causes).not.toContain("asset_manager_model_gap");
    expect(causes).not.toContain("lender_receivables_model_gap");
  });

  it("separates holding-company NAV gaps from generic archetype gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "NAV discount / premium",
      "Holding-company analysis requires real look-through NAV per share or SOTP data; consolidated book equity is not substituted for NAV.",
      {
        analysisArchetype: "holding_company",
        stockBoxScore: null,
      },
    ));

    expect(causes).toContain("holding_company_nav_gap");
    expect(causes).not.toContain("archetype_or_specialized_gap");
  });

  it("separates share-basis conflicts from currency and generic valuation gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "shareBasisAlignment",
      "Reported market cap materially disagrees with current quote price times current shares; market-based valuation is withheld until the listing share basis is reconciled.",
    ));

    expect(causes).toContain("share_basis_alignment_gap");
    expect(causes).not.toContain("currency_alignment_gap");
    expect(causes).not.toContain("archetype_or_specialized_gap");
  });

  it("separates missing market-cap inputs from currency and share-basis conflicts", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "marketCap",
      "Market cap requires a reported value or both price and shares.",
      { valuationScore: null },
    ));

    expect(causes).toContain("valuation_unavailable");
    expect(causes).toContain("market_cap_input_gap");
    expect(causes).toContain("market_cap_or_shares_provider_gap");
    expect(causes).not.toContain("currency_alignment_gap");
    expect(causes).not.toContain("share_basis_alignment_gap");
  });

  it("separates capital-structure valuation inputs from market-cap inputs", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "enterpriseValue",
      "EV requires market cap, reported debt and reported cash.",
      { valuationScore: null },
    ));

    expect(causes).toContain("valuation_unavailable");
    expect(causes).toContain("capital_structure_input_gap");
    expect(causes).not.toContain("market_cap_input_gap");
  });

  it("separates labelled normalized-tax fallback from generic valuation gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "normalizedTaxRate",
      "No stable reported effective tax rate; a labelled 21% fallback is used only for FCFF.",
    ));

    expect(causes).toContain("tax_rate_fallback_gap");
    expect(causes).not.toContain("valuation_unavailable");
    expect(causes).not.toContain("provider_failure");
  });

  it("separates debt/cash and WACC capital-structure gaps", () => {
    const debtCash = reportRootCauses(reportWithMissingData(
      "netDebt",
      "Reported debt and cash are required; missing debt is not zero.",
    ));
    const wacc = reportRootCauses(reportWithMissingData(
      "wacc",
      "Market-value capital weights and reported debt are required when no explicit discount rate is configured.",
    ));

    expect(debtCash).toEqual(expect.arrayContaining(["capital_structure_input_gap", "debt_cash_input_gap"]));
    expect(wacc).toEqual(expect.arrayContaining(["capital_structure_input_gap", "wacc_capital_weights_gap"]));
  });

  it("does not treat currency-blocked EV as a capital-structure input gap", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "enterpriseValue",
      "EV requires market cap, reported debt and reported cash.",
      { currencyAlignment: "mismatch", valuationScore: null },
    ));

    expect(causes).toEqual(expect.arrayContaining([
      "valuation_unavailable",
      "currency_alignment_gap",
      "market_financial_currency_mismatch_gap",
    ]));
    expect(causes).not.toContain("capital_structure_input_gap");
  });

  it("separates earnings and cash-flow valuation inputs from capital-structure inputs", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "FCF yield",
      "FCF yield requires operating cash flow and capex, or provider-reported free cash flow, for the selected cash-flow period.",
      { valuationScore: null },
    ));

    expect(causes).toContain("valuation_unavailable");
    expect(causes).toContain("valuation_cash_earnings_input_gap");
    expect(causes).not.toContain("capital_structure_input_gap");
  });

  it("separates EPS-to-net-income reconciliation warnings from economic metric limits", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "eps_net_income",
      "Diluted EPS times diluted shares versus diluted income available to common shareholders differs beyond the 8% tolerance.",
    ));

    expect(causes).toContain("eps_net_income_reconciliation_gap");
    expect(causes).not.toContain("non_positive_metric_limit");
  });

  it("separates TTM EPS reconciliation gaps from generic EPS reconciliation gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "eps_net_income",
      "TTM diluted EPS times diluted shares and diluted income available to common shareholders have a same-direction magnitude mismatch beyond the 8% tolerance.",
    ));

    expect(causes).toContain("eps_net_income_reconciliation_gap");
    expect(causes).toContain("ttm_eps_reconciliation_gap");
    expect(causes).not.toContain("annual_eps_reconciliation_gap");
  });

  it("separates annual EPS reconciliation gaps from TTM EPS reconciliation gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "eps_net_income",
      "Annual diluted EPS times diluted shares and diluted income available to common shareholders have opposite signs.",
    ));

    expect(causes).toContain("eps_net_income_reconciliation_gap");
    expect(causes).toContain("annual_eps_reconciliation_gap");
    expect(causes).not.toContain("ttm_eps_reconciliation_gap");
  });

  it("separates EPS sign conflicts from EPS magnitude reconciliation mismatches", () => {
    const signConflict = reportRootCauses(reportWithMissingData(
      "eps_net_income",
      "Diluted EPS times diluted shares and diluted income available to common shareholders have opposite signs.",
    ));
    const magnitudeMismatch = reportRootCauses(reportWithMissingData(
      "eps_net_income",
      "Diluted EPS times diluted shares and diluted income available to common shareholders have a same-direction magnitude mismatch beyond the 8% tolerance.",
    ));

    expect(signConflict).toEqual(expect.arrayContaining([
      "eps_net_income_reconciliation_gap",
      "eps_sign_reconciliation_gap",
    ]));
    expect(signConflict).not.toContain("eps_magnitude_reconciliation_gap");
    expect(magnitudeMismatch).toEqual(expect.arrayContaining([
      "eps_net_income_reconciliation_gap",
      "eps_magnitude_reconciliation_gap",
    ]));
    expect(magnitudeMismatch).not.toContain("eps_sign_reconciliation_gap");
  });

  it("separates historical depth gaps from non-positive endpoint limits", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "Gross margin stability",
      "Gross margin stability requires at least three contiguous annual periods with reported gross profit and reported revenue.",
    ));

    expect(causes).toContain("history_depth_gap");
    expect(causes).not.toContain("non_positive_metric_limit");
  });

  it("separates non-positive earnings, FCF, EBITDA, revenue, and capital-base limits", () => {
    const earnings = reportRootCauses(reportWithMissingData(
      "P/E",
      "P/E is not meaningful when common earnings are non-positive.",
    ));
    const fcf = reportRootCauses(reportWithMissingData(
      "FCF/share CAGR 3Y",
      "FCF/share CAGR is not meaningful when FCF/share is non-positive at either endpoint.",
    ));
    const fcff = reportRootCauses(reportWithMissingData(
      "baseFcff",
      "Positive FCFF is required for an FCFF DCF.",
    ));
    const ebitda = reportRootCauses(reportWithMissingData(
      "EV / EBITDA",
      "EV / EBITDA is not meaningful when EBITDA is non-positive.",
    ));
    const revenue = reportRootCauses(reportWithMissingData(
      "Revenue CAGR 3Y",
      "Revenue CAGR 3Y is not meaningful when revenue is non-positive at either endpoint.",
    ));
    const capitalBase = reportRootCauses(reportWithMissingData(
      "ROIC",
      "Current invested capital must be positive for ROIC.",
    ));

    expect(earnings).toEqual(expect.arrayContaining(["non_positive_metric_limit", "earnings_non_positive_limit"]));
    expect(fcf).toEqual(expect.arrayContaining(["non_positive_metric_limit", "fcf_non_positive_limit"]));
    expect(fcff).toEqual(expect.arrayContaining(["non_positive_metric_limit", "fcff_non_positive_dcf_limit"]));
    expect(ebitda).toEqual(expect.arrayContaining(["non_positive_metric_limit", "ebitda_non_positive_limit"]));
    expect(revenue).toEqual(expect.arrayContaining(["non_positive_metric_limit", "revenue_non_positive_limit"]));
    expect(capitalBase).toEqual(expect.arrayContaining(["non_positive_metric_limit", "capital_base_non_positive_limit"]));
  });

  it("separates same-root listing mismatches from fuzzy symbol search mismatches", () => {
    const sameRoot = noExactMatchRootCauses("MAXD", [
      { ticker: "MAXD.MU", canonicalTicker: "MAXD.MU", name: "Maxd listing" },
    ] as CompanySearchResult[]);
    const fuzzy = noExactMatchRootCauses("FI", [
      { ticker: "FINE.ST", canonicalTicker: "FINE.ST", name: "Finepart" },
    ] as CompanySearchResult[]);

    expect(sameRoot).toEqual(["symbol_mismatch_or_delisted", "same_root_listing_mismatch"]);
    expect(fuzzy).toEqual(["symbol_mismatch_or_delisted", "fuzzy_symbol_search_mismatch"]);
  });

  it("separates provider-confirmed inactive symbols from listing-root mismatches", () => {
    const causes = noExactMatchRootCauses(
      "PRO",
      [{ ticker: "PRO", canonicalTicker: "PRO.ST", name: "Promimic" }] as CompanySearchResult[],
      [{
        provider: "Yahoo Finance chart",
        capability: "market_data",
        status: "unavailable",
        reason: "not_found",
        observedAt: "2026-08-30T00:00:00.000Z",
      }],
    );

    expect(causes).toEqual([
      "symbol_mismatch_or_delisted",
      "symbol_inactive_or_delisted",
      "same_root_listing_mismatch",
    ]);
  });

  it("keeps empty search results distinct from fuzzy candidate mismatches", () => {
    const causes = symbolNotFoundRootCauses("ZZZZ", [{
      provider: "Yahoo Finance chart",
      capability: "market_data",
      status: "unavailable",
      reason: "not_found",
      observedAt: "2026-08-30T00:00:00.000Z",
    }]);

    expect(causes).toEqual(["symbol_not_found", "symbol_inactive_or_delisted"]);
    expect(causes).not.toContain("fuzzy_symbol_search_mismatch");
  });

  it("separates unsupported fund, preferred, ADR, and other security types", () => {
    expect(unsupportedSecurityRootCauses({ ticker: "PDI", name: "PIMCO Dynamic Income Fund", securityType: "ETF/Fund" } as CompanySearchResult))
      .toEqual(["unsupported_security", "fund_or_etf_unsupported"]);
    expect(unsupportedSecurityRootCauses({ ticker: "JPM-PD", name: "JPMorgan preferred", securityType: "Preferred" } as CompanySearchResult))
      .toEqual(["unsupported_security", "preferred_security_unsupported"]);
    expect(unsupportedSecurityRootCauses({ ticker: "BABA", name: "Alibaba ADR", securityType: "ADR" } as CompanySearchResult))
      .toEqual(["unsupported_security", "adr_security_unsupported"]);
    expect(unsupportedSecurityRootCauses({ ticker: "ROP.SW", name: "Roche participation certificate", securityType: "Other" } as CompanySearchResult))
      .toEqual(["unsupported_security", "other_security_unsupported"]);
  });

  it("separates bank specialist gaps by margin, regulatory capital, and asset quality", () => {
    const margin = reportRootCauses(reportWithMissingData(
      "netInterestMargin",
      "Net interest margin (NIM) is unavailable from the current specialized bank-data provider phase.",
      { analysisArchetype: "bank", specializedCoverage: { overall: 0.45 } },
    ));
    const capital = reportRootCauses(reportWithMissingData(
      "cet1CapitalRatio",
      "CET1 capital ratio is unavailable from the current specialized bank-data provider phase.",
      { analysisArchetype: "bank", specializedCoverage: { overall: 0.45 } },
    ));
    const assetQuality = reportRootCauses(reportWithMissingData(
      "nonperformingLoans",
      "Nonperforming loans is unavailable from the current specialized bank-data provider phase.",
      { analysisArchetype: "bank", specializedCoverage: { overall: 0.45 } },
    ));

    expect(margin).toEqual(expect.arrayContaining(["specialized_provider_gap", "bank_margin_provider_gap"]));
    expect(capital).toEqual(expect.arrayContaining(["specialized_provider_gap", "bank_regulatory_capital_provider_gap"]));
    expect(assetQuality).toEqual(expect.arrayContaining(["specialized_provider_gap", "bank_asset_quality_provider_gap"]));
  });

  it("separates insurer regulatory and reserve specialist gaps from bank provider gaps", () => {
    const causes = reportRootCauses(reportWithMissingData(
      "regulatoryCapitalRatio",
      "Regulatory capital ratio is unavailable from the current specialized insurer-data provider phase.",
      { analysisArchetype: "insurer", specializedCoverage: { overall: 0.45 } },
    ));

    expect(causes).toEqual(expect.arrayContaining(["specialized_provider_gap", "insurer_regulatory_reserve_provider_gap"]));
    expect(causes).not.toContain("bank_regulatory_capital_provider_gap");
  });
});
