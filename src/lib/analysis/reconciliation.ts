import { deriveSimpleFreeCashFlow } from "./metrics";
import { isFiniteNumber } from "./math";
import type { FinancialAnalysisInput, FinancialMetrics, ReconciliationCheck } from "./types";

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

function compare(code: string, label: string, left: number | null, right: number | null, tolerance: number): ReconciliationCheck {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) {
    return { code, status: "unavailable", message: `${label} could not be checked because one or more inputs are missing.` };
  }
  const differenceRatio = relativeDifference(left, right);
  return {
    code,
    status: differenceRatio <= tolerance ? "pass" : "warning",
    message: differenceRatio <= tolerance ? `${label} reconciles within tolerance.` : `${label} differs beyond the ${Math.round(tolerance * 100)}% tolerance.`,
    differenceRatio,
  };
}

export function reconcileFinancialData(input: FinancialAnalysisInput, metrics: FinancialMetrics): ReconciliationCheck[] {
  const latest = metrics.latestPeriod;
  const simpleFcf = deriveSimpleFreeCashFlow(latest);
  const shares = input.market?.sharesOutstanding ?? latest?.currentSharesOutstanding ?? latest?.sharesDiluted ?? null;
  const checks = [
    compare(
      "balance_sheet_equation",
      "Assets versus liabilities plus equity",
      latest?.totalAssets ?? null,
      isFiniteNumber(latest?.totalLiabilities) && isFiniteNumber(latest?.totalEquity) ? latest.totalLiabilities + latest.totalEquity : null,
      0.02,
    ),
    compare(
      "gross_profit",
      "Gross profit versus revenue less cost of revenue",
      latest?.grossProfit ?? null,
      isFiniteNumber(latest?.revenue) && isFiniteNumber(latest?.costOfRevenue) ? latest.revenue - latest.costOfRevenue : null,
      0.02,
    ),
    compare(
      "eps_net_income",
      "Diluted EPS times diluted shares versus net income",
      isFiniteNumber(latest?.epsDiluted) && isFiniteNumber(latest?.sharesDiluted) ? latest.epsDiluted * latest.sharesDiluted : null,
      latest?.netIncome ?? null,
      0.08,
    ),
    compare(
      "simple_fcf",
      "Simple FCF versus CFO less absolute capex",
      simpleFcf,
      isFiniteNumber(latest?.operatingCashFlow) && isFiniteNumber(latest?.capitalExpenditures)
        ? latest.operatingCashFlow - Math.abs(latest.capitalExpenditures)
        : null,
      0.000001,
    ),
    compare(
      "market_cap",
      "Market cap versus price times current shares",
      input.market?.marketCap ?? null,
      isFiniteNumber(input.market?.price) && isFiniteNumber(shares) ? input.market.price * shares : null,
      0.05,
    ),
  ];
  const financialCurrency = latest?.currency ?? input.company.currency;
  const marketCurrency = input.market?.currency;
  if (financialCurrency && marketCurrency) {
    checks.push({
      code: "currency_alignment",
      status: financialCurrency === marketCurrency ? "pass" : "warning",
      message: financialCurrency === marketCurrency ? "Financial and market currencies align." : `Financial currency ${financialCurrency} differs from market currency ${marketCurrency}.`,
    });
  } else {
    checks.push({ code: "currency_alignment", status: "unavailable", message: "Currency alignment could not be checked." });
  }
  return checks;
}

export function reconciliationConfidence(checks: ReconciliationCheck[]): number {
  const available = checks.filter((check) => check.status !== "unavailable");
  if (!available.length) return 50;
  const passed = available.filter((check) => check.status === "pass").length;
  return Math.round((passed / available.length) * 100);
}
