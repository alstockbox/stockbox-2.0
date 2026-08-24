import { describe, expect, it } from "vitest";
import {
  qaSwedishSecurityUniverse,
  swedishSecurityMasterProvider,
} from "../../src/lib/data/security-master";
import { normalizeTicker } from "../../src/lib/data/security-master/normalization";

describe("listed security master", () => {
  it("normalizes Swedish ticker variants without collapsing the listed security", () => {
    expect(normalizeTicker("sive.st")).toBe("SIVE");
    expect(normalizeTicker("VOLV-B.ST")).toBe("VOLVB");
    expect(normalizeTicker("VOLV B")).toBe("VOLVB");
    expect(normalizeTicker("INVE.B")).toBe("INVEB");
    expect(normalizeTicker("ERIC-B.ST")).toBe("ERICB");
  });

  it("exposes source metadata and cached Swedish venue coverage", async () => {
    const securities = await swedishSecurityMasterProvider.listSecurities();
    const metadata = swedishSecurityMasterProvider.sourceMetadata();

    expect(metadata.sourceUrls).toEqual(expect.arrayContaining([
      "https://api.nasdaq.com/api/nordic/screener/shares",
      "https://www.spotlightstockmarket.com/en/market-overview/share-prices/search-share-prices-and-trades/",
      "https://ngm-api-prod.vmate.se/instrument/list",
    ]));
    expect(metadata.notes.join(" ")).toContain("Discovery capability is intentionally separate from fundamentals capability.");
    expect(securities.find((security) => security.ticker === "SIVE")).toEqual(expect.objectContaining({
      isin: "SE0003917798",
      venue: "NASDAQ_STOCKHOLM_MAIN",
      analysisCapability: expect.objectContaining({ fundamentals: "unavailable", marketData: "available" }),
    }));
    expect(securities.find((security) => security.ticker === "VISC")).toEqual(expect.objectContaining({
      isin: "SE0021148160",
      venue: "NASDAQ_STOCKHOLM_MAIN",
    }));
  });

  it("reports venue coverage and catastrophic shrinkage guardrails", async () => {
    const report = await qaSwedishSecurityUniverse();

    expect(report.sourceAgeDays).not.toBeNull();
    expect(report.activeSecuritiesByVenue.NASDAQ_STOCKHOLM_MAIN).toBeGreaterThanOrEqual(390);
    expect(report.activeSecuritiesByVenue.NASDAQ_FIRST_NORTH_STOCKHOLM).toBeGreaterThanOrEqual(315);
    expect(report.activeSecuritiesByVenue.SPOTLIGHT).toBeGreaterThanOrEqual(120);
    expect(report.activeSecuritiesByVenue.NGM_MAIN_REGULATED).toBeGreaterThanOrEqual(5);
    expect(report.activeSecuritiesByVenue.NGM_GROWTH_NORDIC_SME).toBeGreaterThanOrEqual(85);
    expect(report.duplicateSecurityIds).toEqual([]);
    expect(report.missingTickers).toEqual([]);
    expect(report.missingNames).toEqual([]);
    expect(report.catastrophicShrinkage).toEqual([]);
  });

  it.each([
    ["SINCH.ST", "SINCH", "Sinch"],
    ["TEL2-B.ST", "TEL2 B", "Tele2 B"],
    ["KINV-B.ST", "KINV B", "Kinnevik B"],
    ["LATO-B.ST", "LATO B", "Latour B"],
    ["SSAB-A.ST", "SSAB A", "SSAB A"],
    ["BEIJ-B.ST", "BEIJ B", "Beijer Ref B"],
    ["CAST.ST", "CAST", "Castellum"],
    ["FABG.ST", "FABG", "Fabege"],
  ])("contains the production-misrouted Stockholm security %s", async (canonicalTicker, localTicker, name) => {
    const securities = await swedishSecurityMasterProvider.listSecurities();

    expect(securities.find((security) => security.canonicalTicker === canonicalTicker)).toEqual(expect.objectContaining({
      ticker: localTicker,
      name,
      venue: "NASDAQ_STOCKHOLM_MAIN",
      securityId: expect.stringMatching(/^xsto:/),
      isin: expect.any(String),
    }));
  });
});
