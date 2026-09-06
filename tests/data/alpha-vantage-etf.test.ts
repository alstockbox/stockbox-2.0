import { describe, expect, it } from "vitest";
import { parseAlphaVantageEtfProfile } from "../../src/lib/data/alpha-vantage-etf";

const company = { ticker: "QQQ", name: "Invesco QQQ Trust", securityType: "ETF/Fund" as const };

describe("Alpha Vantage ETF profile normalization", () => {
  it("normalizes percentage-point fields and holdings into StockBox fractions", () => {
    const parsed = parseAlphaVantageEtfProfile({
      net_assets: "323000000000",
      net_expense_ratio: "0.20",
      portfolio_turnover: "4.00",
      dividend_yield: "0.65",
      inception_date: "1999-03-10",
      leveraged: "NO",
      sectors: [
        { sector: "Technology", weight: "50.00" },
        { sector: "Other", weight: "50.00" },
      ],
      holdings: [
        { symbol: "AAPL", description: "Apple Inc", weight: "12.00" },
        { symbol: "MSFT", description: "Microsoft Corp", weight: "8.00" },
      ],
    }, company);

    expect(parsed).not.toBeNull();
    expect(parsed?.expenseRatio).toBeCloseTo(0.002);
    expect(parsed?.turnover).toBeCloseTo(0.04);
    expect(parsed?.distributionYield).toBeCloseTo(0.0065);
    expect(parsed?.assetsUnderManagement).toBe(323_000_000_000);
    expect(parsed?.holdings).toHaveLength(2);
    expect(parsed?.holdings?.[0]?.weight).toBeCloseTo(0.12);
    expect(parsed?.top10Weight).toBeCloseTo(0.2);
    expect(parsed?.largestHoldingWeight).toBeCloseTo(0.12);
    expect(parsed?.sectorHhi).toBeCloseTo(0.5);
  });

  it("fails closed on provider information/rate-limit payloads", () => {
    expect(parseAlphaVantageEtfProfile({ Information: "rate limit" }, company)).toBeNull();
    expect(parseAlphaVantageEtfProfile({ "Error Message": "invalid symbol" }, company)).toBeNull();
  });

  it("ignores n/a numeric placeholders instead of converting them to zero", () => {
    const parsed = parseAlphaVantageEtfProfile({
      net_assets: "n/a",
      net_expense_ratio: "N/A",
      portfolio_turnover: "5.00",
    }, company);
    expect(parsed?.assetsUnderManagement).toBeNull();
    expect(parsed?.expenseRatio).toBeNull();
    expect(parsed?.turnover).toBeCloseTo(0.05);
  });
});