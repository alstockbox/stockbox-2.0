import { describe, expect, it } from "vitest";
import {
  parseYahooOutcomeHistoryV3,
  yahooOutcomeSymbolV3,
} from "@/lib/data/outcome-market-history-v3";
import type { CompanySearchResult } from "@/lib/analysis/types";

function company(overrides: Partial<CompanySearchResult>): CompanySearchResult {
  return { ticker: "MSFT", name: "Microsoft", ...overrides };
}

describe("Outcome market history V3", () => {
  it("normalizes Yahoo symbols consistently for US dot classes and global suffixes", () => {
    expect(yahooOutcomeSymbolV3(company({ ticker: "BRK.B", canonicalTicker: "BRK.B", country: "US" }))).toBe("BRK-B");
    expect(yahooOutcomeSymbolV3(company({ ticker: "INVE-B.ST", canonicalTicker: "INVE-B.ST", country: "SE" }))).toBe("INVE-B.ST");
  });

  it("parses daily adjusted closes instead of monthly report history", () => {
    const parsed = parseYahooOutcomeHistoryV3({
      chart: {
        result: [{
          meta: { symbol: "MSFT", currency: "USD" },
          timestamp: [1788220800, 1788307200, 1788393600],
          indicators: {
            quote: [{ close: [100, 102, 104] }],
            adjclose: [{ adjclose: [99, 101, 103] }],
          },
        }],
        error: null,
      },
    }, "MSFT");

    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("Expected parsed outcome history");
    expect(parsed.currency).toBe("USD");
    expect(parsed.priceHistory).toHaveLength(3);
    expect(parsed.priceHistory?.map((point) => point.close)).toEqual([99, 101, 103]);
    expect(parsed.priceHistoryBasis).toBe("adjusted_close");
    expect(parsed.provider).toBe("yahoo-outcome-history-v3");
  });

  it("fails closed on malformed chart responses", () => {
    expect(parseYahooOutcomeHistoryV3({ chart: { result: [], error: null } }, "MSFT")).toBeNull();
    expect(parseYahooOutcomeHistoryV3({ notChart: true }, "MSFT")).toBeNull();
  });
});
