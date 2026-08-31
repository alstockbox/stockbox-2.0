import { describe, expect, it } from "vitest";
import { buildAnalysis } from "../../src/lib/analysis/engine";
import { answerResearchQuestion } from "../../src/lib/analysis/question-mode";
import { durableCompounderInput, missingDataInput } from "./fixtures";

describe("grounded research question mode", () => {
  it("answers score questions from deterministic report dimensions", () => {
    const report = buildAnalysis({
      company: { ticker: "BOX", name: "Box Systems", country: "US", currency: "USD" },
      analysisType: "research",
      investmentProfile: "balanced",
      market: {
        ticker: "BOX", price: 30, currency: "USD", date: "2026-08-31", volume: 1000, yearHigh: 35, yearLow: 20,
        performance: {}, provider: "fixture",
      },
      fundamentals: {
        ticker: "BOX", name: "Box Systems", sector: "technology", industry: "Cloud software",
        annual: [], annualPeriods: durableCompounderInput.annualPeriods, reportingCurrency: "USD",
      },
      analysisDate: "2026-08-31T00:00:00.000Z",
    });

    const answer = answerResearchQuestion(report, "score");

    expect(answer).toContain("The score is");
    expect(answer).toContain("confidence");
    expect(answer).toContain("Stronger areas");
  });

  it("fails closed for priced-in questions when valuation is unavailable", () => {
    const report = buildAnalysis({
      company: { ticker: "MISS", name: "Missing Data Inc", country: "US", currency: "USD" },
      analysisType: "research",
      investmentProfile: "balanced",
      market: {
        ticker: "MISS", price: 12, currency: "USD", date: "2026-08-31", volume: 1000, yearHigh: 15, yearLow: 5,
        performance: {}, provider: "fixture",
      },
      fundamentals: {
        ticker: "MISS", name: "Missing Data Inc", sector: "industrials", industry: "Manufacturing",
        annual: [], annualPeriods: missingDataInput.annualPeriods, reportingCurrency: "USD",
      },
      analysisDate: "2026-08-31T00:00:00.000Z",
    });

    expect(answerResearchQuestion(report, "priced_in")).toContain("cannot reverse-engineer market expectations");
  });

  it("answers peer questions without implying live peer data", () => {
    const report = buildAnalysis({
      company: { ticker: "BOX", name: "Box Systems", country: "US", currency: "USD" },
      analysisType: "research",
      investmentProfile: "balanced",
      market: {
        ticker: "BOX", price: 30, currency: "USD", date: "2026-08-31", volume: 1000, yearHigh: 35, yearLow: 20,
        performance: {}, provider: "fixture",
      },
      fundamentals: {
        ticker: "BOX", name: "Box Systems", sector: "technology", industry: "Cloud software",
        annual: [], annualPeriods: durableCompounderInput.annualPeriods, reportingCurrency: "USD",
      },
      analysisDate: "2026-08-31T00:00:00.000Z",
    });

    const answer = answerResearchQuestion(report, "peer_benchmark");

    expect(answer).toContain("benchmark");
    expect(answer).toContain("live peer constituents are not configured");
  });
});
