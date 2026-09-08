import type { AnalysisSource, CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import { buildDepositaryReceiptFxRequest } from "./depositary-receipt-fx";
import { resolveComparisonFxContexts, type ComparisonFxContext } from "./ecb-fx";

const ECB_REFERENCE_RATE_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

export async function resolveDepositaryReceiptFxContext(
  company: CompanySearchResult,
  market: MarketSnapshot | null,
): Promise<ComparisonFxContext | null> {
  const request = buildDepositaryReceiptFxRequest(company, market);
  if (!request) return null;

  const contexts = await resolveComparisonFxContexts([
    { id: request.id, currency: request.currency, date: request.date },
  ], request.targetCurrency);
  return contexts.get(request.id) ?? null;
}

export function depositaryReceiptFxSource(
  context: ComparisonFxContext | null,
  accessedAt: string,
): AnalysisSource | null {
  if (!context || context.status !== "normalized" || !context.rateDate) return null;
  return {
    name: "ECB euro foreign exchange reference rates",
    url: ECB_REFERENCE_RATE_URL,
    accessedAt,
    freshness: "ECB reference rate at or before the ADR market-data date; maximum accepted lag is seven calendar days.",
    provider: context.provider,
    capability: "market_data",
    dataAsOf: context.rateDate,
    version: context.methodologyVersion,
  };
}
