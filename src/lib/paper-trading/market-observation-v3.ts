import type { MarketSnapshot, ProviderDiagnostic } from "@/lib/analysis/types";
import type { PaperMarketObservationV3 } from "./engine-v3";

export const PAPER_MARKET_OBSERVATION_V3_POLICY_VERSION = "stockbox-paper-market-observation-v3.0.0";

export type PaperMarketObservationContextV3 = {
  providerDiagnostic?: ProviderDiagnostic | null;
  unresolvedConflict?: boolean;
};

function normalizedTicker(value: string | null | undefined): string | null {
  const ticker = value?.trim().toUpperCase();
  return ticker ? ticker : null;
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function fullTimestamp(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  // A date-only close is useful for analysis but must never masquerade as an
  // intraday execution quote. Require explicit clock time before verification.
  if (!/T\d{2}:\d{2}/.test(raw)) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function toPaperMarketObservationV3(
  snapshot: MarketSnapshot | null | undefined,
  context: PaperMarketObservationContextV3 = {},
): PaperMarketObservationV3 {
  if (!snapshot) {
    return {
      ticker: "UNKNOWN",
      price: null,
      currency: null,
      observedAt: null,
      provider: null,
      verification: "UNAVAILABLE",
    };
  }

  const ticker = normalizedTicker(snapshot.ticker) ?? "UNKNOWN";
  const price = typeof snapshot.price === "number" && Number.isFinite(snapshot.price) && snapshot.price > 0
    ? snapshot.price
    : null;
  const currency = normalizedCurrency(snapshot.currency);
  const observedAt = fullTimestamp(snapshot.date);
  const provider = snapshot.provider?.trim() || context.providerDiagnostic?.provider?.trim() || null;

  if (context.unresolvedConflict) {
    return { ticker, price, currency, observedAt, provider, verification: "CONFLICT" };
  }

  const diagnostic = context.providerDiagnostic;
  if (diagnostic && (diagnostic.status === "unavailable" || diagnostic.status === "unsupported")) {
    return { ticker, price, currency, observedAt, provider, verification: "UNAVAILABLE" };
  }

  const providerDiagnosticAcceptable = !diagnostic || diagnostic.status === "available" || diagnostic.status === "partial";
  const verification = price !== null && currency !== null && observedAt !== null && provider !== null && providerDiagnosticAcceptable
    ? "VERIFIED"
    : "UNVERIFIED";

  return { ticker, price, currency, observedAt, provider, verification };
}
