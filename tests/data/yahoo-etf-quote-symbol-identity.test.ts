import { afterEach, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooEtfData } from "../../src/lib/data/yahoo-etf";

const company: CompanySearchResult = {
  ticker: "QQQ",
  name: "Invesco QQQ Trust",
  securityType: "ETF/Fund",
};

function response(json: unknown) {
  return {
    ok: true,
    json: async () => json,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("ignores an explicitly mismatched Yahoo quote while preserving verified ETF summary metadata", async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/v10/finance/quoteSummary/")) {
      return response({
        quoteSummary: {
          result: [{
            fundProfile: {
              categoryName: "Large Growth",
              family: "Invesco",
              feesExpensesInvestment: {
                annualReportExpenseRatio: { raw: 0.002 },
              },
            },
            topHoldings: {
              holdings: [
                { symbol: "AAPL", holdingName: "Apple", holdingPercent: { raw: 0.6 } },
                { symbol: "MSFT", holdingName: "Microsoft", holdingPercent: { raw: 0.4 } },
              ],
            },
          }],
        },
      });
    }

    if (url.includes("/v7/finance/quote?")) {
      return response({
        quoteResponse: {
          result: [{
            symbol: "MSFT",
            quoteType: "EQUITY",
            category: "Technology",
            totalAssets: 999_000_000,
            averageDailyVolume3Month: 5_000_000,
            regularMarketPrice: 500,
          }],
        },
      });
    }

    throw new Error(`Unexpected Yahoo URL: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  const result = await fetchYahooEtfData(company);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.data.category).toBe("Large Growth");
  expect(result.data.fundFamily).toBe("Invesco");
  expect(result.data.input.expenseRatio).toBe(0.002);
  expect(result.data.quoteType).toBeNull();
  expect(result.data.input.assetsUnderManagement).toBeNull();
  expect(result.data.input.averageDailyDollarVolume).toBeNull();
});
