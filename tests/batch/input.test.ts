import { describe, expect, it } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import {
  findExactBatchCompany,
  mapWithConcurrency,
  MAX_BATCH_ROWS,
  parseBatchInput,
} from "../../src/lib/batch/input";

describe("batch input", () => {
  it("normalizes separators and removes duplicate tickers", () => {
    const parsed = parseBatchInput("aapl, MSFT\nAAPL; volv-b.st");

    expect(parsed.symbols).toEqual(["AAPL", "MSFT", "VOLV-B.ST"]);
    expect(parsed.duplicates).toEqual(["AAPL"]);
    expect(parsed.invalid).toEqual([]);
  });

  it("ignores common CSV headers and reports invalid values", () => {
    const parsed = parseBatchInput("ticker\nAAPL\nBAD/TICKER");

    expect(parsed.symbols).toEqual(["AAPL"]);
    expect(parsed.invalid).toEqual(["BAD/TICKER"]);
  });
  it("imports the ticker column from a headed CSV", () => {
    const parsed = parseBatchInput("Ticker,Company Name\nAAPL,Apple Inc.\nMSFT,Microsoft Corp.");

    expect(parsed.symbols).toEqual(["AAPL", "MSFT"]);
    expect(parsed.invalid).toEqual([]);
  });

  it("marks inputs above the release ceiling", () => {
    const input = Array.from({ length: MAX_BATCH_ROWS + 1 }, (_, index) => `T${index}`).join(",");
    expect(parseBatchInput(input).overLimit).toBe(true);
  });

  it("prefers the exact common stock with live fundamentals", () => {
    const results: CompanySearchResult[] = [
      {
        ticker: "JPM-PD",
        canonicalTicker: "JPM-PD",
        name: "JPMorgan preferred",
        securityType: "Preferred",
      },
      {
        ticker: "JPM",
        canonicalTicker: "JPM",
        name: "JPMorgan Chase & Co.",
        securityType: "Common Stock",
        providerCapabilities: {
          fundamentals: true,
          marketData: true,
          providerIds: ["sec"],
        },
      },
    ];

    expect(findExactBatchCompany("jpm", results)?.ticker).toBe("JPM");
  });

  it("does not treat an exchange-suffix local ticker root as an exact batch match", () => {
    const results: CompanySearchResult[] = [
      {
        ticker: "PRO",
        canonicalTicker: "PRO.ST",
        name: "Promimic",
        country: "SE",
        exchange: "Nasdaq First North Growth Market Stockholm",
        securityType: "Common Stock",
        providerCapabilities: {
          fundamentals: false,
          marketData: true,
          providerIds: ["swedish-listed-security-master"],
        },
      },
    ];

    expect(findExactBatchCompany("PRO", results)).toBeNull();
    expect(findExactBatchCompany("PRO.ST", results)?.canonicalTicker).toBe("PRO.ST");
  });

  it("preserves result order while enforcing concurrency", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
