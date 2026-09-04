import type { CompanySearchResult, ReitSpecializedMetrics } from "@/lib/analysis/types";
import type { AdapterResult } from "./providers";

export async function fetchSecReitSpecializedData(
  _company: CompanySearchResult,
): Promise<AdapterResult<ReitSpecializedMetrics>> {
  return {
    ok: false,
    reason: "empty_response",
    message: "SEC REIT specialized data is unavailable.",
    diagnostic: {
      provider: "SEC REIT filings",
      capability: "specialized",
      status: "unavailable",
      reason: "empty_response",
      observedAt: new Date().toISOString(),
    },
  };
}
