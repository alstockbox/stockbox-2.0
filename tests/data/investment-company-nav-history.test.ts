import { describe, expect, it } from "vitest";
import {
  deriveInvestmentCompanyNavGrowth,
  type NavPerShareObservation,
} from "../../src/lib/data/investment-company-nav-history";

function observations(values: Array<[string, number]>): NavPerShareObservation[] {
  return values.map(([date, navPerShare]) => ({ date, navPerShare }));
}

describe("investment-company NAV/share history", () => {
  it("derives 1Y growth and 3Y/5Y CAGR only from dated NAV/share observations", () => {
    const result = deriveInvestmentCompanyNavGrowth(observations([
      ["2026-08-31", 200],
      ["2025-08-29", 180],
      ["2023-08-31", 150],
      ["2021-08-31", 120],
    ]), "2026-08-31");

    expect(result.navGrowth1y).toBeCloseTo(200 / 180 - 1, 10);
    expect(result.navGrowth3yCagr).toBeCloseTo((200 / 150) ** (1 / 3) - 1, 10);
    expect(result.navGrowth5yCagr).toBeCloseTo((200 / 120) ** (1 / 5) - 1, 10);
  });

  it("accepts a historical anchor exactly 60 days from its target anniversary", () => {
    const result = deriveInvestmentCompanyNavGrowth(observations([
      ["2026-08-31", 200],
      ["2025-10-30", 180],
    ]), "2026-08-31");

    expect(result.navGrowth1y).toBeCloseTo(200 / 180 - 1, 10);
  });

  it("leaves a period unavailable when the nearest historical observation is more than 60 days from the target anniversary", () => {
    const result = deriveInvestmentCompanyNavGrowth(observations([
      ["2026-08-31", 200],
      ["2025-10-31", 180],
      ["2023-12-01", 150],
    ]), "2026-08-31");

    expect(result.navGrowth1y).toBeNull();
    expect(result.navGrowth3yCagr).toBeNull();
  });

  it("does not substitute total NAV, duplicate invalid dates, or non-positive NAV/share values", () => {
    const result = deriveInvestmentCompanyNavGrowth([
      { date: "2026-08-31", navPerShare: 200 },
      { date: "not-a-date", navPerShare: 180 },
      { date: "2025-08-31", navPerShare: 0 },
      { date: "2023-08-31", navPerShare: -10 },
    ], "2026-08-31");

    expect(result.navGrowth1y).toBeNull();
    expect(result.navGrowth3yCagr).toBeNull();
    expect(result.navGrowth5yCagr).toBeNull();
  });

  it("requires the reference NAV/share observation itself to be present instead of extrapolating a latest value", () => {
    const result = deriveInvestmentCompanyNavGrowth(observations([
      ["2026-08-01", 195],
      ["2025-08-31", 180],
    ]), "2026-08-31");

    expect(result).toEqual({
      navGrowth1y: null,
      navGrowth3yCagr: null,
      navGrowth5yCagr: null,
    });
  });
});
