import type { FinancialMetrics, Flag, Metrics, RedFlag } from "./types";

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

export function detectFinancialRedFlags(metrics: FinancialMetrics): RedFlag[] {
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

  if (metrics.margins.freeCashFlowMargin !== null && metrics.margins.freeCashFlowMargin < -0.08) {
    flags.push({
      code: "negative_fcf_margin",
      label: "Weak free cash flow",
      severity: "high",
      metric: "freeCashFlowMargin",
      value: metrics.margins.freeCashFlowMargin,
      rationale: "Free cash flow is materially negative relative to revenue.",
    });
  }

  if (metrics.ratios.netDebtToEbitda !== null && metrics.ratios.netDebtToEbitda > 5) {
    flags.push({
      code: "high_leverage",
      label: "High leverage",
      severity: "critical",
      metric: "netDebtToEbitda",
      value: metrics.ratios.netDebtToEbitda,
      rationale: "Net debt exceeds five times EBITDA.",
    });
  }

  if (metrics.ratios.interestCoverage !== null && metrics.ratios.interestCoverage < 1.5) {
    flags.push({
      code: "low_interest_coverage",
      label: "Low interest coverage",
      severity: "critical",
      metric: "interestCoverage",
      value: metrics.ratios.interestCoverage,
      rationale: "Operating income provides limited coverage of interest costs.",
    });
  }

  if (metrics.ratios.cashConversion !== null && metrics.ratios.cashConversion < 0.45) {
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

  return flags;
}
