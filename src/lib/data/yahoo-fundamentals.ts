import type { CompanyFundamentals, CompanySearchResult } from "@/lib/analysis/types";
import {
  YAHOO_FUNDAMENTALS_CAPABILITIES,
  fetchYahooFundamentalsResult as fetchCoreYahooFundamentalsResult,
} from "./yahoo-fundamentals-core";
import type { AdapterResult, FundamentalsProvider } from "./providers";

export * from "./yahoo-fundamentals-core";

export async function fetchYahooFundamentalsResult(
  company: CompanySearchResult,
): Promise<AdapterResult<CompanyFundamentals>> {
  return fetchCoreYahooFundamentalsResult(company);
}

export const yahooFundamentalsProvider: FundamentalsProvider = {
  id: "yahoo-fundamentals",
  capabilities: YAHOO_FUNDAMENTALS_CAPABILITIES,
  fetchFundamentals: fetchYahooFundamentalsResult,
};
