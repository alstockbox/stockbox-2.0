import type { CompanyFundamentals, MarketSnapshot, ProviderDiagnostic } from "@/lib/analysis/types";
import { providerDiagnostic } from "./providers";

const FIVE_YEARS_MS = 5 * 365.25 * 86_400_000;
const YAHOO_FUNDAMENTALS_PROVIDER = "Yahoo Finance fundamentals";

function validHistoryTimes(market: MarketSnapshot | null): number[] {
  return (market?.priceHistory ?? [])
    .map((point) => Date.parse(`${point.date}T00:00:00Z`))
    .filter((value): value is number => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function hasAtLeastFiveYearsOfMarketHistory(market: MarketSnapshot | null): boolean {
  const times = validHistoryTimes(market);
  if (times.length < 2) return false;
  return (times.at(-1)! - times[0]) >= FIVE_YEARS_MS;
}

export function annualHistoryProviderLimitDiagnostic(input: {
  fundamentals: CompanyFundamentals | null;
  market: MarketSnapshot | null;
  selectedFundamentalsProvider: string | null | undefined;
}): ProviderDiagnostic | null {
  if (input.selectedFundamentalsProvider !== YAHOO_FUNDAMENTALS_PROVIDER) return null;
  if ((input.fundamentals?.annualPeriods ?? []).length !== 4) return null;
  if (!hasAtLeastFiveYearsOfMarketHistory(input.market)) return null;

  return providerDiagnostic(
    YAHOO_FUNDAMENTALS_PROVIDER,
    "fundamentals",
    "partial",
    "annual_history_provider_limit",
  );
}
