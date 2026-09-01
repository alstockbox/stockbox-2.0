import type { AnalysisReport, MarketPricePoint } from "./types";
import { currencyUnit, economicCurrencyCode } from "./currency-units";

type CurrencyPricePoint = MarketPricePoint & { currency?: string | null; provider?: string };
export type ReportHistoryCurrencyState = "aligned" | "repaired" | "mismatch" | "unknown" | "not_applicable";

function capAlignment(report: AnalysisReport, ceiling: number): void {
  if (report.confidenceBreakdown) {
    report.confidenceBreakdown.currencyAlignment = Math.min(report.confidenceBreakdown.currencyAlignment, ceiling);
  }
  if (report.engine?.confidenceBreakdown) {
    report.engine.confidenceBreakdown.currencyAlignment = Math.min(report.engine.confidenceBreakdown.currencyAlignment, ceiling);
  }
  if (report.engine?.scores.confidenceBreakdown) {
    report.engine.scores.confidenceBreakdown.currencyAlignment = Math.min(report.engine.scores.confidenceBreakdown.currencyAlignment, ceiling);
  }
}

function normalizePoint(point: CurrencyPricePoint, targetCurrency: string): CurrencyPricePoint | null {
  const targetUnit = currencyUnit(targetCurrency);
  if (!targetUnit || !Number.isFinite(point.close) || point.close <= 0) return null;
  const sourceCurrency = point.currency?.trim() || targetCurrency;
  const sourceUnit = currencyUnit(sourceCurrency);
  if (!sourceUnit || sourceUnit.economicCurrency !== targetUnit.economicCurrency) return null;
  const close = point.close * sourceUnit.quoteToEconomicScale / targetUnit.quoteToEconomicScale;
  if (!Number.isFinite(close) || close <= 0) return null;
  return { ...point, close, currency: targetCurrency };
}

export function enforceReportHistoricalCurrencyIntegrity(report: AnalysisReport): ReportHistoryCurrencyState {
  const historical = report.historical;
  const history = (historical?.price ?? []) as CurrencyPricePoint[];
  if (!history.length) return "not_applicable";

  const targetCurrency = report.market?.currency?.trim() || null;
  if (!targetCurrency || !economicCurrencyCode(targetCurrency)) {
    capAlignment(report, 25);
    return "unknown";
  }

  let repaired = false;
  const normalized: CurrencyPricePoint[] = [];
  for (const point of history) {
    const sourceCurrency = point.currency?.trim() || null;
    if (sourceCurrency && economicCurrencyCode(sourceCurrency) !== economicCurrencyCode(targetCurrency)) {
      historical!.price = [];
      if (report.market) report.market.priceHistory = [];
      capAlignment(report, 0);
      return "mismatch";
    }
    const next = normalizePoint(point, targetCurrency);
    if (!next) {
      historical!.price = [];
      if (report.market) report.market.priceHistory = [];
      capAlignment(report, 0);
      return "mismatch";
    }
    if (!sourceCurrency || sourceCurrency !== targetCurrency || Math.abs(next.close - point.close) > 1e-9) repaired = true;
    normalized.push(next);
  }

  historical!.price = normalized;
  if (report.market?.priceHistory?.length) {
    report.market.priceHistory = normalized;
  }
  return repaired ? "repaired" : "aligned";
}
