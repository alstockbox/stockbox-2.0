import type {
  AnalysisScenario,
  DcfRangeResult,
  FinancialMetrics,
  ScoreResult,
  ScenarioName,
  ScenarioStatus,
} from "./types";

export function scenarioStatusFor(metrics: FinancialMetrics, scores: ScoreResult, dcf: DcfRangeResult): ScenarioStatus {
  const usefulValuation = dcf.status === "available" || Object.values(metrics.valuation).some((value) => typeof value === "number" && Number.isFinite(value));
  if (scores.stockBoxScore === null && scores.dataCoverage < 0.5 && !usefulValuation) return "insufficient_data";
  return dcf.status === "available" ? "valuation" : "qualitative_research";
}

export function buildAnalysisScenarios(
  metrics: FinancialMetrics,
  scores: ScoreResult,
  dcf: DcfRangeResult,
): AnalysisScenario[] {
  if (scenarioStatusFor(metrics, scores, dcf) === "insufficient_data") return [];
  const valuation = new Map(dcf.scenarios.map((item) => [item.name, item]));
  const make = (
    name: ScenarioName,
    assumptions: string[],
    drivers: string[],
    risks: string[],
    qualitativeOutcome: string,
  ): AnalysisScenario => {
    const result = valuation.get(name);
    return {
      name,
      assumptions,
      drivers,
      risks,
      qualitativeOutcome,
      valuationRange: result
        ? { low: result.perShareValue * 0.95, high: result.perShareValue * 1.05, currency: dcf.currency }
        : null,
      confidence: name === "Base" ? scores.confidence : Math.max(10, scores.confidence - 8),
      keyVariables: ["Revenue growth", "Operating margin", "Free cash flow", "Discount rate"],
    };
  };

  const growth = metrics.growth.revenueCagr3y ?? metrics.growth.revenueGrowthYoY;
  return [
    make(
      "Bull",
      ["Growth remains above the recent normalized trend.", "Cash conversion and margins remain resilient."],
      [growth !== null && growth > 0.1 ? "Established growth momentum" : "Potential growth recovery", "Operating leverage"],
      ["Execution shortfall", "Valuation compression"],
      "The favorable case requires both durable growth and disciplined cash generation.",
    ),
    make(
      "Base",
      ["Recent fundamentals remain broadly representative.", "No major balance-sheet deterioration occurs."],
      ["Reported fundamentals", "Current capital structure"],
      ["Missing forward estimates", "Macroeconomic changes"],
      "The central case follows observed financial performance and the current confidence level.",
    ),
    make(
      "Bear",
      ["Growth slows and margins compress.", "Investors require a higher return for the same cash flows."],
      ["Revenue deceleration", "Cost pressure"],
      ["Negative surprises", "Refinancing pressure", "Competitive erosion"],
      "The downside case becomes more relevant if cash flow weakens or financial risks increase.",
    ),
  ];
}
