import type { MarketCapBand } from "./market-cap";
import type {
  AlphaClassification,
  AlphaDimensionScores,
  AlphaProbabilityCurve,
  AlphaRisk,
} from "./types";

export type HiddenGemsCategory =
  | "highest_breakout"
  | "undervalued"
  | "small_cap"
  | "earnings_inflection"
  | "growth_acceleration"
  | "catalyst"
  | "most_improved";

export type HiddenGemsHorizon = keyof AlphaProbabilityCurve;
export type HiddenGemsRiskBand = "low" | "medium" | "high";

export type AlphaPredictionSnapshot = {
  id: string;
  analysisId: string | null;
  universeSecurityId?: string | null;
  ticker: string;
  companyName: string;
  sector: string | null;
  archetype: string | null;
  marketCap: number | null;
  marketCapCurrency: string | null;
  marketCapBand: MarketCapBand;
  fundamentalScore: number | null;
  alphaScore: number;
  breakoutScore: number;
  classification: AlphaClassification;
  confidence: number;
  scores: AlphaDimensionScores;
  risk: AlphaRisk;
  probabilities: AlphaProbabilityCurve;
  strongestSignals: string[];
  riskSignals: string[];
  modelVersion: string;
  predictionAsOf: string;
};

export type HiddenGem = AlphaPredictionSnapshot & {
  alphaChange: number | null;
  categoryScore: number;
};

export type HiddenGemsFilters = {
  category: HiddenGemsCategory;
  horizon?: HiddenGemsHorizon;
  marketCapBand?: MarketCapBand | "all";
  riskBand?: HiddenGemsRiskBand | "all";
  sector?: string | null;
  minConfidence?: number;
  limit?: number;
};

function riskBand(risk: number): HiddenGemsRiskBand {
  if (risk <= 35) return "low";
  if (risk <= 65) return "medium";
  return "high";
}

function latestWithChange(rows: AlphaPredictionSnapshot[]): HiddenGem[] {
  const byTicker = new Map<string, AlphaPredictionSnapshot[]>();
  for (const row of rows) {
    const ticker = row.ticker.trim().toUpperCase();
    const existing = byTicker.get(ticker) ?? [];
    existing.push(row);
    byTicker.set(ticker, existing);
  }

  const latest: HiddenGem[] = [];
  for (const history of byTicker.values()) {
    history.sort((left, right) => Date.parse(right.predictionAsOf) - Date.parse(left.predictionAsOf));
    const current = history[0];
    if (!current) continue;
    const previous = history[1];
    latest.push({
      ...current,
      alphaChange: previous ? Math.round((current.alphaScore - previous.alphaScore) * 10) / 10 : null,
      categoryScore: 0,
    });
  }
  return latest;
}

function horizonProbability(row: AlphaPredictionSnapshot, horizon: HiddenGemsHorizon): number {
  return row.probabilities[horizon].up25 * 100;
}

function categoryScore(row: HiddenGem, category: HiddenGemsCategory, horizon: HiddenGemsHorizon): number {
  const riskPenalty = row.risk.overall;
  switch (category) {
    case "undervalued":
      return row.scores.undervaluation * 0.55
        + row.alphaScore * 0.25
        + row.scores.quality * 0.15
        + row.scores.growthAcceleration * 0.05
        - riskPenalty * 0.25;
    case "small_cap":
      return row.scores.smallCapAsymmetry * 0.52
        + row.alphaScore * 0.23
        + row.scores.growthAcceleration * 0.12
        + row.scores.quality * 0.13
        - riskPenalty * 0.15;
    case "earnings_inflection":
      return row.scores.earningsInflection * 0.52
        + row.scores.growthAcceleration * 0.18
        + row.alphaScore * 0.20
        + horizonProbability(row, horizon) * 0.10
        - riskPenalty * 0.12;
    case "growth_acceleration":
      return row.scores.growthAcceleration * 0.55
        + row.scores.earningsInflection * 0.15
        + row.alphaScore * 0.20
        + horizonProbability(row, horizon) * 0.10
        - riskPenalty * 0.12;
    case "catalyst":
      return row.scores.catalyst * 0.48
        + row.scores.earningsInflection * 0.12
        + row.alphaScore * 0.20
        + horizonProbability(row, horizon) * 0.20
        - riskPenalty * 0.12;
    case "most_improved":
      return (row.alphaChange ?? -100) * 1.2
        + row.alphaScore * 0.42
        + row.scores.growthAcceleration * 0.18
        - riskPenalty * 0.10;
    case "highest_breakout":
    default:
      return horizonProbability(row, horizon) * 0.55
        + row.breakoutScore * 0.30
        + row.alphaScore * 0.15
        - riskPenalty * 0.08;
  }
}

function categoryEligible(row: HiddenGem, category: HiddenGemsCategory): boolean {
  if (category === "small_cap") return row.marketCapBand === "micro" || row.marketCapBand === "small";
  if (category === "most_improved") return row.alphaChange !== null;
  if (category === "catalyst") return row.scores.catalyst > 50;
  return true;
}

export function rankHiddenGems(rows: AlphaPredictionSnapshot[], filters: HiddenGemsFilters): HiddenGem[] {
  const horizon = filters.horizon ?? "sixMonths";
  const minConfidence = Math.min(1, Math.max(0, filters.minConfidence ?? 0.45));
  const limit = Math.min(100, Math.max(1, Math.floor(filters.limit ?? 25)));

  return latestWithChange(rows)
    .filter((row) => row.confidence >= minConfidence)
    .filter((row) => categoryEligible(row, filters.category))
    .filter((row) => !filters.marketCapBand || filters.marketCapBand === "all" || row.marketCapBand === filters.marketCapBand)
    .filter((row) => !filters.riskBand || filters.riskBand === "all" || riskBand(row.risk.overall) === filters.riskBand)
    .filter((row) => !filters.sector || row.sector === filters.sector)
    .map((row) => ({
      ...row,
      categoryScore: Math.round(categoryScore(row, filters.category, horizon) * 10) / 10,
    }))
    .sort((left, right) =>
      right.categoryScore - left.categoryScore
      || right.confidence - left.confidence
      || right.alphaScore - left.alphaScore
      || left.ticker.localeCompare(right.ticker))
    .slice(0, limit);
}
