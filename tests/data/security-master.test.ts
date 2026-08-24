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
      "https://www.nasdaq.com/products/data/nordic-baltic/nordic-reference-data-files",
      "https://spotlightstockmarket.se/en/",
      "https://mdapi.ngm.se/static/index.html",
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

    expect(report.activeSecuritiesByVenue.NASDAQ_STOCKHOLM_MAIN).toBeGreaterThanOrEqual(25);
    expect(report.activeSecuritiesByVenue.NASDAQ_FIRST_NORTH_STOCKHOLM).toBeGreaterThanOrEqual(8);
    expect(report.activeSecuritiesByVenue.SPOTLIGHT).toBeGreaterThanOrEqual(6);
    expect(report.activeSecuritiesByVenue.NGM_MAIN_REGULATED).toBeGreaterThanOrEqual(2);
    expect(report.activeSecuritiesByVenue.NGM_GROWTH_NORDIC_SME).toBeGreaterThanOrEqual(7);
    expect(report.duplicateSecurityIds).toEqual([]);
    expect(report.missingTickers).toEqual([]);
    expect(report.missingNames).toEqual([]);
    expect(report.catastrophicShrinkage).toEqual([]);
  });
});
