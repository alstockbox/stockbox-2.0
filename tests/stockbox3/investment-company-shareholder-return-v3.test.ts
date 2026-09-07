import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveInvestmentCompanyShareholderReturns } from "../../src/lib/data/investment-company-shareholder-return";

const yahooLongHistorySource = readFileSync("src/lib/data/yahoo-long-history.ts", "utf8");
const universalProviderSource = readFileSync("src/lib/data/universal-security-provider.ts", "utf8");

describe("investment-company shareholder return V3", () => {
  it("derives 3Y and 5Y CAGR only from adjusted-close total-return observations", () => {
    const result = deriveInvestmentCompanyShareholderReturns([
      { date: "2021-09-01", adjustedClose: 100 },
      { date: "2023-09-01", adjustedClose: 120 },
      { date: "2026-09-01", adjustedClose: 180 },
    ], "2026-09-05");

    expect(result.shareholderReturn3yCagr).toBeCloseTo((180 / 120) ** (1 / 3) - 1, 10);
    expect(result.shareholderReturn5yCagr).toBeCloseTo((180 / 100) ** (1 / 5) - 1, 10);
  });

  it("accepts a latest adjusted-close observation exactly 45 days before market date", () => {
    const result = deriveInvestmentCompanyShareholderReturns([
      { date: "2023-07-22", adjustedClose: 100 },
      { date: "2026-07-22", adjustedClose: 133.1 },
    ], "2026-09-05");

    expect(result.shareholderReturn3yCagr).toBeCloseTo(0.1, 10);
  });

  it("fails closed when the latest adjusted-close observation is more than 45 days stale", () => {
    const result = deriveInvestmentCompanyShareholderReturns([
      { date: "2023-07-21", adjustedClose: 100 },
      { date: "2026-07-21", adjustedClose: 133.1 },
    ], "2026-09-05");

    expect(result.shareholderReturn3yCagr).toBeNull();
    expect(result.shareholderReturn5yCagr).toBeNull();
  });

  it("requires historical anniversary anchors within 60 days instead of extrapolating", () => {
    const result = deriveInvestmentCompanyShareholderReturns([
      { date: "2023-06-30", adjustedClose: 100 },
      { date: "2026-09-01", adjustedClose: 133.1 },
    ], "2026-09-05");

    expect(result.shareholderReturn3yCagr).toBeNull();
  });

  it("ignores future, malformed and non-positive observations", () => {
    const result = deriveInvestmentCompanyShareholderReturns([
      { date: "2023-09-01", adjustedClose: 100 },
      { date: "bad-date", adjustedClose: 110 },
      { date: "2026-09-01", adjustedClose: 0 },
      { date: "2026-10-01", adjustedClose: 200 },
    ], "2026-09-05");

    expect(result.shareholderReturn3yCagr).toBeNull();
    expect(result.shareholderReturn5yCagr).toBeNull();
  });

  it("wires adjusted close into the investment-company specialist model without close-price proxying", () => {
    expect(yahooLongHistorySource).toContain('url.searchParams.set("includeAdjustedClose", "true")');
    expect(yahooLongHistorySource).toContain("adjustedPriceHistory");
    expect(yahooLongHistorySource).toContain("adjclose");

    expect(universalProviderSource).toContain("deriveInvestmentCompanyShareholderReturns");
    expect(universalProviderSource).toContain("fetchYahooLongHistory");
    expect(universalProviderSource).toContain("longHistory.data.adjustedPriceHistory");
    expect(universalProviderSource).toContain("shareholderReturn3yCagr");
    expect(universalProviderSource).toContain("shareholderReturn5yCagr");
    expect(universalProviderSource).not.toContain("deriveInvestmentCompanyShareholderReturns(longHistory.data.priceHistory");
  });
});
