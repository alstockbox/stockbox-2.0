import { describe, expect, it } from "vitest";
import {
  parseNasdaqTraderDirectory,
  parseSecTickerExchangeDirectory,
  type AlphaUniverseSecurity,
} from "../../src/lib/alpha/universe";

const nasdaqText = [
  "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
  "GOOD|Good Systems Inc. - Common Stock|Q|N|N|100|N|N",
  "TEST|Test Security Inc. - Common Stock|Q|Y|N|100|N|N",
  "FUND|Example ETF|G|N|N|100|Y|N",
  "WARR|Example Holdings - Warrant|S|N|N|100|N|N",
  "PREF|Example Bank - Depositary Shares Preferred|Q|N|N|100|N|N",
  "File Creation Time: 0901202621:30|||||||",
].join("\n");

const otherText = [
  "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
  "NYSEC|NYSE Company Inc. Common Stock|N|NYSEC|N|100|N|NYSEC",
  "ARCAETF|Index Fund ETF|P|ARCAETF|Y|100|N|ARCAETF",
  "UNIT|Acquisition Corp Unit|N|UNIT|N|100|N|UNIT",
  "File Creation Time: 0901202621:31|||||||",
].join("\n");

function byTicker(rows: AlphaUniverseSecurity[], ticker: string) {
  return rows.find((row) => row.ticker === ticker);
}

describe("Nasdaq Trader official security universe", () => {
  it("parses eligible common equities and excludes test, ETF, warrant, preferred and unit securities", () => {
    const nasdaq = parseNasdaqTraderDirectory(nasdaqText, "nasdaq_listed");
    const other = parseNasdaqTraderDirectory(otherText, "other_listed");

    expect(nasdaq.securities.map((row) => row.ticker)).toEqual(["GOOD"]);
    expect(other.securities.map((row) => row.ticker)).toEqual(["NYSEC"]);
    expect(byTicker(nasdaq.securities, "GOOD")?.exchange).toBe("NASDAQ");
    expect(byTicker(other.securities, "NYSEC")?.exchange).toBe("NYSE");
  });

  it("preserves the source-reported local creation timestamp without inventing a timezone", () => {
    const first = parseNasdaqTraderDirectory(nasdaqText, "nasdaq_listed");
    const second = parseNasdaqTraderDirectory(nasdaqText, "nasdaq_listed");

    expect(first.sourceTimestampRaw).toBe("0901202621:30");
    expect(first.securities[0]?.sourceKey).toBe("nasdaq_trader:nasdaq_listed:GOOD");
    expect(second.securities[0]?.sourceKey).toBe(first.securities[0]?.sourceKey);
  });

  it("fails closed when the expected header or source timestamp is missing", () => {
    expect(() => parseNasdaqTraderDirectory("GOOD|Good Systems", "nasdaq_listed")).toThrow();
    expect(() => parseNasdaqTraderDirectory(
      "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nGOOD|Good Systems|Q|N|N|100|N|N",
      "nasdaq_listed",
    )).toThrow(/creation time/i);
  });
});

describe("SEC ticker/CIK identity enrichment", () => {
  it("maps current exchange-listed ticker identities to zero-padded CIKs", () => {
    const directory = parseSecTickerExchangeDirectory({
      fields: ["cik", "name", "ticker", "exchange"],
      data: [
        [1234, "GOOD SYSTEMS INC", "GOOD", "Nasdaq"],
        [987654, "NYSE COMPANY INC", "NYSEC", "NYSE"],
        [44, "NO TICKER", null, "Nasdaq"],
      ],
    });

    expect(directory.get("GOOD")?.cik).toBe("0000001234");
    expect(directory.get("NYSEC")?.cik).toBe("0000987654");
    expect(directory.has("NO TICKER")).toBe(false);
  });

  it("fails closed on an incompatible SEC payload", () => {
    expect(() => parseSecTickerExchangeDirectory({ fields: ["ticker"], data: [] })).toThrow(/SEC/i);
  });
});
