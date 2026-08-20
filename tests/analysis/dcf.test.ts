import { describe, expect, it } from "vitest";
import { computeDcfRange, computeDiscountedCashFlow } from "../../src/lib/analysis";
import { durableCompounderInput, missingDataInput } from "./fixtures";

describe("DCF calculations", () => {
  it("computes a known discounted cash flow result", () => {
    const result = computeDiscountedCashFlow({
      baseFreeCashFlow: 100,
      forecastYears: 2,
      discountRate: 0.1,
      terminalGrowthRate: 0.02,
      fcfGrowthRates: [0, 0],
      netDebt: 0,
      sharesOutstanding: 10,
    });

    expect(result.presentValueOfCashFlows).toBeCloseTo(173.55, 2);
    expect(result.terminalValue).toBeCloseTo(1275, 2);
    expect(result.presentValueOfTerminalValue).toBeCloseTo(1053.72, 2);
    expect(result.enterpriseValue).toBeCloseTo(1227.27, 2);
    expect(result.perShareValue).toBeCloseTo(122.73, 2);
  });

  it("generates a deterministic bear/base/bull DCF range when inputs are suitable", () => {
    const result = computeDcfRange(durableCompounderInput);

    expect(result.status).toBe("available");
    expect(result.scenarios.map((scenario) => scenario.name)).toEqual(["Bear", "Base", "Bull"]);
    expect(result.low).toBeLessThan(result.mid as number);
    expect(result.mid).toBeLessThan(result.high as number);
    expect(result.scenarios[1].assumptions.forecastYears).toBe(5);
  });

  it("refuses DCF when positive FCF or shares are missing", () => {
    const result = computeDcfRange(missingDataInput);

    expect(result.status).toBe("unavailable");
    expect(result.low).toBeNull();
    expect(result.missingData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "baseFreeCashFlow", impact: "dcf" }),
        expect.objectContaining({ field: "sharesOutstanding", impact: "dcf" }),
      ]),
    );
  });
});
