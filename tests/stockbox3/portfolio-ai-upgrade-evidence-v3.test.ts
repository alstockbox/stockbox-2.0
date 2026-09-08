import { describe, expect, it } from "vitest";
import {
  buildPortfolioUpgradeDrivers,
  type PortfolioAiCandidate,
} from "../../src/lib/portfolio/portfolio-ai-planner";

const weak: PortfolioAiCandidate = {
  ticker: "WEAK",
  name: "Weak Holding",
  score: 52,
  recommendation: "Hold",
  valuation: 61,
  growth: 58,
  quality: 60,
  risk: 55,
  momentum: 63,
  analyzedAt: "2026-09-06T12:00:00.000Z",
};

const upgrade: PortfolioAiCandidate = {
  ticker: "BEST",
  name: "Best Candidate",
  score: 84,
  recommendation: "Buy",
  valuation: 70,
  growth: 74,
  quality: 88,
  risk: 78,
  momentum: 72,
  analyzedAt: "2026-09-06T12:00:00.000Z",
};

describe("Portfolio AI upgrade evidence V3", () => {
  it("explains a quality-focused upgrade using the strongest profile-relevant dimension improvements", () => {
    const drivers = buildPortfolioUpgradeDrivers({
      weakCandidate: weak,
      upgradeCandidate: upgrade,
      risk: "defensive",
      style: "quality",
      horizon: "long",
      limit: 3,
    });

    expect(drivers).toHaveLength(3);
    expect(drivers[0]?.dimension).toBe("quality");
    expect(drivers[0]?.weakValue).toBe(60);
    expect(drivers[0]?.candidateValue).toBe(88);
    expect(drivers[0]?.improvement).toBe(28);
    expect(drivers.some((driver) => driver.dimension === "risk")).toBe(true);
    expect(drivers.every((driver) => driver.improvement > 0)).toBe(true);
  });

  it("changes driver priority when the user selects a growth-oriented short-horizon profile", () => {
    const drivers = buildPortfolioUpgradeDrivers({
      weakCandidate: weak,
      upgradeCandidate: upgrade,
      risk: "aggressive",
      style: "growth",
      horizon: "short",
      limit: 2,
    });

    expect(drivers).toHaveLength(2);
    expect(drivers.map((driver) => driver.dimension)).toEqual(["growth", "momentum"]);
  });

  it("fails closed when the current holding lacks comparable analysis dimensions", () => {
    const drivers = buildPortfolioUpgradeDrivers({
      weakCandidate: { ...weak, quality: null, risk: null, growth: null, valuation: null, momentum: null },
      upgradeCandidate: upgrade,
      risk: "balanced",
      style: "balanced",
      horizon: "long",
      limit: 3,
    });

    expect(drivers).toEqual([]);
  });
});
