import type { AnalysisArchetype, CompanyProfile, FinancialMetrics, Flag, Metrics, RedFlag, SpecializedCompanyData } from "./types";
import { isFiniteNumber } from "./math";
import { resolveInsurerSubtype } from "./insurer-subtypes";

function detectGreenFlags(metrics: Metrics): Flag[] {
  const flags: Flag[] = [];

  if (metrics.revenueCagr3y !== null && metrics.revenueCagr3y > 0.12) {
    flags.push({
      severity: "low",
      title: "Durable revenue growth",
      detail: "Three-year revenue CAGR is comfortably positive.",
      metric: "revenueCagr3y"
    });
  }

  if (metrics.operatingMargin !== null && metrics.operatingMargin > 0.2) {
    flags.push({
      severity: "low",
      title: "Strong operating margin",
      detail: "The business converts a healthy share of revenue into operating income.",
      metric: "operatingMargin"
    });
  }

  if (metrics.fcfMargin !== null && metrics.fcfMargin > 0.12) {
    flags.push({
      severity: "low",
      title: "Strong free cash flow margin",
      detail: "Free cash flow generation is strong relative to revenue.",
      metric: "fcfMargin"
    });
  }

  if (metrics.debtToEquity !== null && metrics.debtToEquity < 0.5) {
    flags.push({
      severity: "low",
      title: "Conservative leverage",
      detail: "Debt is modest relative to reported equity.",
      metric: "debtToEquity"
    });
  }

  return flags;
}

export function detectArchetypeGreenFlags(
  metrics: Metrics,
  financial: FinancialMetrics,
  archetype: AnalysisArchetype,
  specialized?: SpecializedCompanyData,
  company?: CompanyProfile,
): Flag[] {
  if (archetype === "reit") {
    if (specialized?.kind !== "reit") return [];
    const flags: Flag[] = [];
    if (isFiniteNumber(specialized.fundsFromOperationsGrowth.value) && specialized.fundsFromOperationsGrowth.value > 0.05) flags.push({ severity: "low", title: "FFO growth", detail: "Provider-reported FFO growth is positive.", metric: "epsGrowth1y" });
    if (isFiniteNumber(specialized.occupancy.value) && specialized.occupancy.value >= 0.95) flags.push({ severity: "low", title: "High occupancy", detail: "Reported portfolio occupancy is at least 95%." });
    if (isFiniteNumber(specialized.dividendCoverage.value) && specialized.dividendCoverage.value >= 1.1) flags.push({ severity: "low", title: "Dividend covered by AFFO", detail: "Reported AFFO coverage exceeds 1.1 times." });
    return flags;
  }
  if (archetype === "bank") {
    if (specialized?.kind !== "bank") return [];
    const flags: Flag[] = [];
    if (isFiniteNumber(specialized.cet1CapitalRatio.value) && specialized.cet1CapitalRatio.value >= 0.12) flags.push({ severity: "low", title: "Strong CET1 capital", detail: "Reported CET1 capital ratio is at least 12%." });
    if (isFiniteNumber(specialized.netInterestMargin.value) && specialized.netInterestMargin.value > 0 && isFiniteNumber(specialized.returnOnAssets.value) && specialized.returnOnAssets.value > 0) flags.push({ severity: "low", title: "Positive bank profitability", detail: "Reported NIM and return on assets are positive." });
    return flags;
  }
  if (archetype === "insurer") {
    if (specialized?.kind !== "insurer") return [];
    const subtype = resolveInsurerSubtype(company ?? {});
    if (subtype === "unknown" || subtype === "mixed") return [];
    const flags: Flag[] = [];
    if (isFiniteNumber(specialized.regulatoryCapitalRatio.value) && specialized.regulatoryCapitalRatio.value >= 1.5) flags.push({ severity: "low", title: "Strong insurer capital", detail: "Reported regulatory capital ratio is at least 1.5 times." });
    if (isFiniteNumber(specialized.returnOnEquity.value) && specialized.returnOnEquity.value >= 0.1) flags.push({ severity: "low", title: "Positive insurer returns", detail: "Reported insurer return on equity is at least 10%." });
    if (isFiniteNumber(specialized.premiumGrowth.value) && specialized.premiumGrowth.value >= 0.03) flags.push({ severity: "low", title: "Positive premium growth", detail: "Reported premium growth is at least 3%." });
    if (subtype === "property_casualty" && isFiniteNumber(specialized.combinedRatio.value) && specialized.combinedRatio.value <= 0.95) flags.push({ severity: "low", title: "Profitable underwriting", detail: "Reported combined ratio is at or below 95%." });
    return flags;
  }
  if (["pre_revenue_biotech", "holding_company", "unknown"].includes(archetype)) return [];
  const flags = detectGreenFlags(metrics);
  if (archetype === "cyclical") {
    return flags.filter((flag) => flag.metric !== "revenueGrowth1y").concat(
      financial.trends.operatingMarginChangeYoY !== null && financial.trends.operatingMarginChangeYoY > 0
        ? [{ severity: "low" as const, title: "Margin recovery", detail: "Operating margin is improving from the prior comparable period.", metric: "operatingMargin" as const }]
        : [],
    );
  }
  if (archetype === "software_growth") {
    return flags.filter((flag) => flag.metric !== "debtToEquity");
  }
  return flags;
}

export function detectFinancialRedFlags(
  metrics: FinancialMetrics,
  archetype: AnalysisArchetype = "standard",
  specialized?: SpecializedCompanyData,
  company?: CompanyProfile,
): RedFlag[] {
  const flags: RedFlag[] = [];
  const operatingCompanyApplies = ["standard", "software_growth", "cyclical", "utility"].includes(archetype);

  if (operatingCompanyApplies && metrics.growth.revenueGrowthYoY !== null && metrics.growth.revenueGrowthYoY < -0.12) {
    flags.push({
      code: "revenue_contraction",
      label: "Material revenue contraction",
      severity: "high",
      metric: "revenueGrowthYoY",
      value: metrics.growth.revenueGrowthYoY,
      rationale: "Latest annual revenue fell by more than 12%.",
    });
  }

  const corporateCashFlowApplies = operatingCompanyApplies;
  if (corporateCashFlowApplies && metrics.margins.freeCashFlowMargin !== null && metrics.margins.freeCashFlowMargin < -0.08) {
    flags.push({
      code: "negative_fcf_margin",
      label: "Weak free cash flow",
      severity: "high",
      metric: "freeCashFlowMargin",
      value: metrics.margins.freeCashFlowMargin,
      rationale: "Free cash flow is materially negative relative to revenue.",
    });
  }

  const corporateLeverageApplies = operatingCompanyApplies;
  if (corporateLeverageApplies && metrics.ratios.netDebtToEbitda !== null && metrics.ratios.netDebtToEbitda > 5) {
    flags.push({
      code: "high_leverage",
      label: "High leverage",
      severity: "critical",
      metric: "netDebtToEbitda",
      value: metrics.ratios.netDebtToEbitda,
      rationale: "Net debt exceeds five times EBITDA.",
    });
  }

  if (corporateLeverageApplies && metrics.ratios.interestCoverage !== null && metrics.ratios.interestCoverage < 1.5) {
    flags.push({
      code: "low_interest_coverage",
      label: "Low interest coverage",
      severity: "critical",
      metric: "interestCoverage",
      value: metrics.ratios.interestCoverage,
      rationale: "Operating income provides limited coverage of interest costs.",
    });
  }

  if (corporateCashFlowApplies && metrics.ratios.cashConversion !== null && metrics.ratios.cashConversion < 0.45) {
    flags.push({
      code: "weak_cash_conversion",
      label: "Weak earnings support",
      severity: "medium",
      metric: "cashConversion",
      value: metrics.ratios.cashConversion,
      rationale: "Reported earnings are weakly supported by free cash flow.",
    });
  }

  if (metrics.trends.sharesDilutionYoY !== null && metrics.trends.sharesDilutionYoY > 0.08) {
    flags.push({
      code: "share_dilution",
      label: "Material share dilution",
      severity: "medium",
      metric: "sharesDilutionYoY",
      value: metrics.trends.sharesDilutionYoY,
      rationale: "Diluted shares outstanding increased by more than 8% year over year.",
    });
  }

  if (corporateCashFlowApplies && metrics.cashFlow.accrualRatio !== null && metrics.cashFlow.accrualRatio > 0.12) {
    flags.push({
      code: "large_accrual_gap",
      label: "Large accrual gap",
      severity: "high",
      metric: "accrualRatio",
      value: metrics.cashFlow.accrualRatio,
      rationale: "Net income materially exceeds operating cash flow relative to average assets.",
    });
  }

  if (archetype === "software_growth" && metrics.cashFlow.stockBasedCompensationToRevenue !== null && metrics.cashFlow.stockBasedCompensationToRevenue > 0.2) {
    flags.push({
      code: "sbc_burden",
      label: "High stock-based compensation burden",
      severity: "medium",
      metric: "stockBasedCompensationToRevenue",
      value: metrics.cashFlow.stockBasedCompensationToRevenue,
      rationale: "Stock-based compensation exceeds 20% of revenue.",
    });
  }

  if (operatingCompanyApplies && metrics.trends.operatingMarginChangeYoY !== null && metrics.trends.operatingMarginChangeYoY < -0.05) {
    flags.push({
      code: "margin_compression",
      label: "Operating margin compression",
      severity: "medium",
      metric: "operatingMarginChangeYoY",
      value: metrics.trends.operatingMarginChangeYoY,
      rationale: "Operating margin contracted by more than five percentage points.",
    });
  }

  if (archetype === "bank" && specialized?.kind === "bank") {
    const cet1 = specialized.cet1CapitalRatio.value;
    const grossLoans = specialized.grossLoans.value;
    const nonPerformingLoans = specialized.nonPerformingLoans.value;
    const nonPerformingLoanRatio = isFiniteNumber(grossLoans) && grossLoans > 0 && isFiniteNumber(nonPerformingLoans)
      ? nonPerformingLoans / grossLoans
      : null;
    if (isFiniteNumber(cet1) && cet1 < 0.08) {
      flags.push({ code: "weak_cet1_capital", label: "Weak CET1 capital", severity: "critical", metric: "cet1CapitalRatio", value: cet1, rationale: "Reported CET1 capital is below the model's minimum resilience threshold." });
    }
    if (isFiniteNumber(nonPerformingLoanRatio) && nonPerformingLoanRatio > 0.05) {
      flags.push({ code: "high_nonperforming_loans", label: "High nonperforming loans", severity: "high", metric: "nonPerformingLoans", value: nonPerformingLoanRatio, rationale: "Reported nonperforming loans exceed 5% of gross loans." });
    }
    if (isFiniteNumber(specialized.efficiencyRatio.value) && specialized.efficiencyRatio.value > 0.75) {
      flags.push({ code: "weak_bank_efficiency", label: "Weak bank efficiency", severity: "medium", metric: "efficiencyRatio", value: specialized.efficiencyRatio.value, rationale: "Reported efficiency ratio exceeds 75%." });
    }
  }

  if (archetype === "insurer" && specialized?.kind === "insurer") {
    const subtype = resolveInsurerSubtype(company ?? {});
    if (subtype === "property_casualty" && isFiniteNumber(specialized.combinedRatio.value) && specialized.combinedRatio.value > 1.05) {
      flags.push({ code: "underwriting_loss", label: "Underwriting loss", severity: "high", metric: "combinedRatio", value: specialized.combinedRatio.value, rationale: "Reported combined ratio exceeds 105%." });
    }
    if (isFiniteNumber(specialized.regulatoryCapitalRatio.value) && specialized.regulatoryCapitalRatio.value < 1) {
      flags.push({ code: "weak_insurer_capital", label: "Weak insurer capital", severity: "critical", metric: "regulatoryCapitalRatio", value: specialized.regulatoryCapitalRatio.value, rationale: "Reported regulatory capital ratio is below the model's minimum resilience threshold." });
    }
    if (subtype === "property_casualty" && isFiniteNumber(specialized.reserveDevelopment.value) && specialized.reserveDevelopment.value > 0.08) {
      flags.push({ code: "adverse_reserve_development", label: "Adverse reserve development", severity: "high", metric: "reserveDevelopment", value: specialized.reserveDevelopment.value, rationale: "Reported adverse reserve development exceeds 8%." });
    }
  }

  if (archetype === "reit" && specialized?.kind === "reit") {
    if (isFiniteNumber(specialized.netDebtToEbitdare.value) && specialized.netDebtToEbitdare.value > 8) {
      flags.push({ code: "high_reit_leverage", label: "High REIT leverage", severity: "critical", metric: "netDebtToEbitdare", value: specialized.netDebtToEbitdare.value, rationale: "Reported net debt exceeds eight times EBITDAre." });
    }
    if (isFiniteNumber(specialized.fixedChargeCoverage.value) && specialized.fixedChargeCoverage.value < 1.2) {
      flags.push({ code: "weak_fixed_charge_coverage", label: "Weak fixed-charge coverage", severity: "critical", metric: "fixedChargeCoverage", value: specialized.fixedChargeCoverage.value, rationale: "Reported fixed-charge coverage is below 1.2 times." });
    }
    if (isFiniteNumber(specialized.occupancy.value) && specialized.occupancy.value < 0.8) {
      flags.push({ code: "low_occupancy", label: "Low occupancy", severity: "high", metric: "occupancy", value: specialized.occupancy.value, rationale: "Reported portfolio occupancy is below 80%." });
    }
  }

  return flags;
}
