import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

function contributorByLabel(result: ReturnType<typeof analyzeFinancials>, dimension: "quality" | "earningsQuality", label: string) {
  return result.scores.dimensions[dimension]?.contributors.find((item) => item.label === label);
}

describe("margin stability applicability", () => {
  it("classifies gross and operating margin stability as unsuitable when required annual revenue is reported as zero", () => {
    const input = structuredClone(durableCompounderInput);
    for (const period of input.annualPeriods.slice(-3)) {
      period.revenue = 0;
      period.grossProfit = 0;
      period.operatingIncome = 0;
    }

    const result = analyzeFinancials(input);
    const gross = contributorByLabel(result, "quality", "Gross margin stability");
    const operating = contributorByLabel(result, "earningsQuality", "Operating margin stability");

    expect(result.metrics.cashFlow.grossMarginStability).toBeNull();
    expect(result.metrics.cashFlow.operatingMarginStability).toBeNull();
    expect(gross).toEqual(expect.objectContaining({
      availability: "unsuitable",
      missingReason: expect.stringMatching(/reported revenue is zero/i),
    }));
    expect(operating).toEqual(expect.objectContaining({
      availability: "unsuitable",
      missingReason: expect.stringMatching(/reported revenue is zero/i),
    }));
  });

  it("keeps genuinely short margin history classified as missing", () => {
    const input = structuredClone(durableCompounderInput);
    input.annualPeriods = input.annualPeriods.slice(-2);

    const result = analyzeFinancials(input);
    const gross = contributorByLabel(result, "quality", "Gross margin stability");
    const operating = contributorByLabel(result, "earningsQuality", "Operating margin stability");

    expect(gross).toEqual(expect.objectContaining({
      availability: "missing",
      missingReason: expect.stringMatching(/three contiguous annual periods/i),
    }));
    expect(operating).toEqual(expect.objectContaining({
      availability: "missing",
      missingReason: expect.stringMatching(/three contiguous annual periods/i),
    }));
  });
});
