import type { AnalysisArchetype, FinancialMetrics, Flag, Metrics, RedFlag, SpecializedCompanyData } from "./types";

export function detectRedFlags(metrics: Metrics): Flag[] {
  const flags: Flag[] = [];

  if (metrics.revenueGrowth1y !== null && metrics.revenueGrowth1y < -0.15) {
    flags.push({
      severity: "high",
      title: "Revenue contraction",
      detail: "Latest annual revenue declined by more than 15%.",
      metric: "revenueGrowth1y"
    });
  }

  if (metrics.fcf !== null && metrics.fcf < 0) {
    flags.push({
      severity: "high",
      title: "Negative free cash flow",
      detail: "Operating cash flow after capital expenditure is negative.",
      metric: "fcf"
    });
  }

  if (metrics.debtToEquity !== null && metrics.debtToEquity > 2.5) {
    flags.push({
      severity: "medium",
      title: "Elevated leverage",
      detail: "Debt is high relative to reported equity.",
      metric: "debtToEquity"
    });
  }

  if (metrics.interestCoverage !== null && metrics.interestCoverage < 2) {
    flags.push({
      severity: "high",
      title: "Weak interest coverage",
      detail: "Operating income gives limited coverage of interest expense.",
      metric: "interestCoverage"
    });
  }

  if (metrics.cashConversion !== null && metrics.cashConversion < 0.5) {
    flags.push({
      severity: "medium",
      title: "Weak cash conversion",
      detail: "Accounting earnings are not strongly supported by free cash flow.",
      metric: "cashConversion"
    });
  }

  return flags;
}

export function detectGreenFlags(metrics: Metrics): Flag[] {
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
): Flag[] {
  if (archetype === "reit") {
    if (specialized?.kind !== "reit") return [];
    const flags: Flag[] = [];
    if ((specialized.fundsFromOperationsGrowth.value ?? 0) > 0.05) flags.push({ severity: "low", title: "FFO growth", detail: "Provider-reported FFO growth is positive.", metric: "epsGrowth1y" });
    if ((specialized.occupancy.value ?? 0) >= 0.95) flags.push({ severity: "low", title: "High occupancy", detail: "Reported portfolio occupancy is at least 95%." });
    if ((specialized.dividendCoverage.value ?? 0) >= 1.1) flags.push({ severity: "low", title: "Dividend covered by AFFO", detail: "Reported AFFO coverage exceeds 1.1 times." });
    return flags;
  }
  if (archetype === "bank") {
    if (specialized?.kind !== "bank") return [];
    const flags: Flag[] = [];
    if ((specialized.cet1CapitalRatio.value ?? 0) >= 0.12) flags.push({ severity: "low", title: "Strong CET1 capital", detail: "Reported CET1 capital ratio is at least 12%." });
    if ((specialized.netInterestMargin.value ?? 0) > 0 && (specialized.returnOnAssets.value ?? 0) > 0) flags.push({ severity: "low", title: "Positive bank profitability", detail: "Reported NIM and return on assets are positive." });
    return flags;
  }
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
): RedFlag[] {
  const flags: RedFlag[] = [];

  if (metrics.growth.revenueGrowthYoY !== null && metrics.growth.revenueGrowthYoY < -0.12) {
    flags.push({
      code: "revenue_contraction",
      label: "Material revenue contraction",
      severity: "high",
      metric: "revenueGrowthYoY",
      value: metrics.growth.revenueGrowthYoY,
      rationale: "Latest annual revenue fell by more than 12%.",
    });
  }

  const corporateCashFlowApplies = !["bank", "insurer", "reit"].includes(archetype);
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

  const corporateLeverageApplies = !["bank", "insurer", "reit", "holding_company"].includes(archetype);
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

  if (!["bank", "insurer", "reit"].includes(archetype) && metrics.trends.operatingMarginChangeYoY !== null && metrics.trends.operatingMarginChangeYoY < -0.05) {
    flags.push({
      code: "margin_compression",
      label: "Operating margin compression",
      severity: "medium",
      metric: "operatingMarginChangeYoY",
      value: metrics.trends.operatingMarginChangeYoY,
      rationale: "Operating margin contracted by more than five percentage points.",
    });
  }

  return flags;
}
