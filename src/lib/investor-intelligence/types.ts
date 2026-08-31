import type { AnalysisArchetype, ScoreDimensionKey } from "@/lib/analysis/types";

export type ThesisStatus = "STRONG" | "INTACT" | "WATCH" | "WEAKENING" | "BROKEN" | "ARCHIVED";
export type ThesisRuleOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "between";
export type ThesisRuleResultStatus = "passed" | "failed" | "unavailable";
export type Materiality = "NONE" | "MINOR" | "IMPORTANT" | "THESIS_CHANGING";
export type MaterialChangeCategory = "price" | "valuation" | "business" | "stockbox" | "estimates" | "dividend" | "risk";

export type CompanyMetricSnapshot = {
  ticker: string;
  companyName: string;
  capturedAt: string;
  analysisId: string;
  price: number | null;
  priceChange1d: number | null;
  score: number | null;
  personalizedScore: number | null;
  confidence: number | null;
  coverage: number | null;
  fairValue: number | null;
  fairValueLow: number | null;
  fairValueHigh: number | null;
  fairValueUpside: number | null;
  archetype: AnalysisArchetype | null;
  valuation: {
    pe: number | null;
    forwardPe: number | null;
    ps: number | null;
    evSales: number | null;
    evEbitda: number | null;
    fcfYield: number | null;
    dividendYield: number | null;
    historicalPePercentile: number | null;
    peVs5yMedian: number | null;
    peVs10yMedian: number | null;
  };
  fundamentals: {
    revenueGrowth: number | null;
    epsGrowth: number | null;
    fcf: number | null;
    fcfGrowth: number | null;
    fcfMargin: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roic: number | null;
    roe: number | null;
    netDebt: number | null;
    netDebtToEbitda: number | null;
  };
  dividend: {
    yield: number | null;
    payoutRatio: number | null;
    fcfPayoutRatio: number | null;
    growth: number | null;
    dividendPerShare: number | null;
  };
  estimates: {
    revenueGrowth: number | null;
    epsGrowth: number | null;
    fcfGrowth: number | null;
    targetPrice: number | null;
  };
  dimensions: Partial<Record<ScoreDimensionKey, number | null>>;
  riskFlags: Array<{ code?: string; label: string; severity: string }>;
  sourceMeta: Record<string, unknown>;
};

export type PublicCompanyMetricSnapshot = Omit<CompanyMetricSnapshot, "analysisId" | "personalizedScore" | "sourceMeta">;

export type MaterialChange = {
  metricKey: string;
  category: MaterialChangeCategory;
  previousValue: number | null;
  currentValue: number | null;
  absoluteChange: number | null;
  relativeChange: number | null;
  materiality: Materiality;
  reasoning: string;
};

export type ThesisRuleDefinition = {
  id: string;
  label: string;
  metricKey: string;
  operator: ThesisRuleOperator;
  threshold: number | [number, number];
  critical: boolean;
  failureStatus: Exclude<ThesisStatus, "STRONG" | "INTACT" | "ARCHIVED">;
};

export type ThesisRuleEvaluation = {
  ruleId: string;
  label: string;
  metricKey: string;
  status: ThesisRuleResultStatus;
  actual: number | null;
  operator: ThesisRuleOperator;
  threshold: number | [number, number];
  critical: boolean;
  failureStatus: ThesisRuleDefinition["failureStatus"];
  reason: string;
};

export type ThesisEvaluationResult = {
  status: ThesisStatus;
  passed: ThesisRuleEvaluation[];
  failed: ThesisRuleEvaluation[];
  unavailable: ThesisRuleEvaluation[];
  newlyFailed: string[];
  newlyRecovered: string[];
  results: Record<string, ThesisRuleResultStatus>;
  reasoning: string[];
};
