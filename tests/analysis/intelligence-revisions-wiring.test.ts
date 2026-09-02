import { describe, expect, it } from "vitest";
import { inflectionInputFromReport, mispricingInputFromReport } from "@/lib/analysis/intelligence-snapshot";

describe("intelligence estimate revision wiring", () => {
  it("feeds available revision nets into inflection and value-trap evidence", () => {
    const report = {
      score: { score: 70, personalizedScore: 70, confidence: 80, dimensions: [], missingData: [] },
      dcf: { suitable: false, bear: null, base: null, bull: null },
      redFlags: [],
      metrics: { revenueGrowth1y: null, epsGrowth1y: null, fcfMargin: null, operatingMargin: null, cashConversion: null, debtToEquity: null, interestCoverage: null, priceMomentum3m: null, priceMomentum1y: null },
      historical: { financials: [], price: [] },
      forwardEstimates: { nextYearRevenueGrowth: 0.15, nextYearEpsGrowth: 0.2, revisionNetLastWeek: 2, revisionNetLastMonth: 6 },
      dataStatus: "current",
    } as never;

    const inflection = inflectionInputFromReport(report);
    const mispricing = mispricingInputFromReport(report);

    expect(inflection.expectations?.revisionNetLastWeek).toBe(2);
    expect(inflection.expectations?.revisionNetLastMonth).toBe(6);
    expect(mispricing.revisionNetLastMonth).toBe(6);
  });

  it("keeps missing revisions missing instead of manufacturing neutral zeros", () => {
    const report = {
      score: { score: 70, personalizedScore: 70, confidence: 80, dimensions: [], missingData: [] },
      dcf: { suitable: false, bear: null, base: null, bull: null },
      redFlags: [],
      metrics: { revenueGrowth1y: null, epsGrowth1y: null, fcfMargin: null, operatingMargin: null, cashConversion: null, debtToEquity: null, interestCoverage: null, priceMomentum3m: null, priceMomentum1y: null },
      historical: { financials: [], price: [] },
      forwardEstimates: { nextYearRevenueGrowth: 0.15, nextYearEpsGrowth: 0.2 },
      dataStatus: "current",
    } as never;

    const inflection = inflectionInputFromReport(report);
    expect(inflection.expectations?.revisionNetLastWeek).toBeNull();
    expect(inflection.expectations?.revisionNetLastMonth).toBeNull();
  });
});
