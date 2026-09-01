import { describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "@/lib/analysis/types";
import {
  groupWatchlistRowsByCanonicalTicker,
  loadSignalsForWatchlistGroup,
} from "@/lib/monitoring/watchlist-monitor";

const company = {
  ticker: "AAPL",
  canonicalTicker: "AAPL",
  name: "Apple Inc.",
  securityType: "Common Stock",
  providerCapabilities: {
    fundamentals: true,
    marketData: true,
    providerIds: ["yahoo"],
  },
} as CompanySearchResult;

const rows = ["u1", "u2", "u3"].map((userId, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  user_id: userId,
  ticker: index === 2 ? "aapl" : "AAPL",
  company_name: "Apple Inc.",
  alert_preferences: null,
  monitoring_enabled: true,
  monitoring_frequency: "daily" as const,
}));

describe("canonical watchlist fan-out", () => {
  it("groups users following the same canonical ticker into one provider refresh", async () => {
    expect(groupWatchlistRowsByCanonicalTicker(rows)).toHaveLength(1);
    const search = vi.fn(async () => [company]);
    const fetchBundle = vi.fn(async () => ({
      company,
      organizationNumber: null,
      identity: { gleif: null, openFigi: null },
      macro: null,
      insider: null,
      positioning: null,
      bolagsverket: null,
      diagnostics: [],
      sources: [],
    }));

    await loadSignalsForWatchlistGroup(rows, {
      searchCompanies: search,
      fetchOfficialResearchBundle: fetchBundle,
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(fetchBundle).toHaveBeenCalledTimes(1);
  });
});
