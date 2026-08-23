import type {
  AnalysisScenario,
  DcfRangeResult,
  FinancialMetrics,
  Metrics,
  ScoreResult,
  Scenario,
  ScenarioName,
  ScenarioStatus,
} from "./types";

export function scenarioStatusFor(metrics: FinancialMetrics, scores: ScoreResult, dcf: DcfRangeResult): ScenarioStatus {
  const usefulValuation = dcf.status === "available" || Object.values(metrics.valuation).some((value) => typeof value === "number" && Number.isFinite(value));
  if (scores.stockBoxScore === null && scores.dataCoverage < 0.5 && !usefulValuation) return "insufficient_data";
  return dcf.status === "available" ? "valuation" : "qualitative_research";
}

export function buildScenarios(metrics: Metrics, confidence: number): Scenario[] {
  const growthPositive = (metrics.revenueCagr3y ?? metrics.revenueGrowth1y ?? 0) > 0.08;
  const cashStrong = (metrics.fcfMargin ?? 0) > 0.08;
  const valuationSupport = (metrics.fcfYield ?? metrics.earningsYield ?? 0) > 0.04;

  return [
    {
      caseName: "Bull",
      assumptions: [
        growthPositive ? "Revenue growth remains above market average." : "Growth stabilizes from current levels.",
        cashStrong ? "Free cash flow remains resilient." : "Cash conversion improves toward peer norms.",
        valuationSupport ? "Current valuation leaves room for multiple support." : "Valuation pressure eases as fundamentals improve."
      ],
      drivers: ["Revenue durability", "Margin discipline", "Cash flow conversion"],
      risks: ["Execution risk", "Market multiple compression", "Unexpected macro pressure"],
      qualitativeOutcome: "The model can justify a favorable outcome if growth and cash flow both hold up.",
      confidence: Math.min(95, confidence + 5)
    },
    {
      caseName: "Base",
      assumptions: [
        "Recent growth and profitability remain broadly representative.",
        "No major deterioration in balance-sheet risk.",
        "Valuation remains tied to delivered cash flow and earnings quality."
      ],
      drivers: ["Reported fundamentals", "Observed market trend", "Balance-sheet resilience"],
      risks: ["Missing data may hide important changes", "Future estimates are not fully modeled"],
      qualitativeOutcome: "The base case follows the current StockBox score and confidence level.",
      confidence
    },
    {
      caseName: "Bear",
      assumptions: [
        "Growth slows or reverses.",
        "Margins compress under competitive or macro pressure.",
        "Investors demand a lower multiple for the same fundamentals."
      ],
      drivers: ["Revenue deceleration", "Margin pressure", "Leverage or cash-flow weakness"],
      risks: ["Negative surprises", "Rising discount rates", "Unresolved red flags"],
      qualitativeOutcome: "The downside case becomes more relevant if red flags persist or cash generation weakens.",
      confidence: Math.max(25, confidence - 10)
    }
  ];
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
