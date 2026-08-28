import type { InvestmentProfile, ScoreDimensionKey, Sector } from "./types";
import { normalizeWeights } from "./math";

export const MODEL_VERSION = "stockbox-analysis-engine-v2.7.0";
export const REPORT_SCHEMA_VERSION = "stockbox-analysis-report-v5";
export const SCORE_POLICY_VERSION = "stockbox-score-policy-v8";
export const STATIC_BENCHMARK_VERSION = "stockbox-static-benchmarks-v1";
export const DCF_ASSUMPTION_POLICY_VERSION = "stockbox-dcf-assumptions-v4";

export const SCORE_COVERAGE_POLICY = {
  dimensionMinimum: 0.5,
  dimensionFull: 0.75,
  overallMinimum: 0.55,
} as const;

export const MIN_DIRECTIONAL_VALUATION_CONFIDENCE = 45;

export interface SectorBenchmarks {
  revenueGrowthWeak: number;
  revenueGrowthStrong: number;
  grossMarginWeak: number;
  grossMarginStrong: number;
  operatingMarginWeak: number;
  operatingMarginStrong: number;
  netMarginWeak: number;
  netMarginStrong: number;
  roeWeak: number;
  roeStrong: number;
  roaWeak: number;
  roaStrong: number;
  roicWeak: number;
  roicStrong: number;
  currentRatioWeak: number;
  currentRatioStrong: number;
  netDebtToEbitdaWeak: number;
  netDebtToEbitdaStrong: number;
  interestCoverageWeak: number;
  interestCoverageStrong: number;
  peAttractive: number;
  peExpensive: number;
  evEbitdaAttractive: number;
  evEbitdaExpensive: number;
  evSalesAttractive: number;
  evSalesExpensive: number;
  fcfYieldWeak: number;
  fcfYieldStrong: number;
  betaLowRisk: number;
  betaHighRisk: number;
  maxDcfGrowth: number;
}

const defaultBenchmarks: SectorBenchmarks = {
  revenueGrowthWeak: -0.02,
  revenueGrowthStrong: 0.12,
  grossMarginWeak: 0.25,
  grossMarginStrong: 0.55,
  operatingMarginWeak: 0.05,
  operatingMarginStrong: 0.22,
  netMarginWeak: 0.03,
  netMarginStrong: 0.16,
  roeWeak: 0.04,
  roeStrong: 0.18,
  roaWeak: 0.02,
  roaStrong: 0.1,
  roicWeak: 0.04,
  roicStrong: 0.16,
  currentRatioWeak: 0.9,
  currentRatioStrong: 1.6,
  netDebtToEbitdaWeak: 4,
  netDebtToEbitdaStrong: 1,
  interestCoverageWeak: 2,
  interestCoverageStrong: 8,
  peAttractive: 12,
  peExpensive: 35,
  evEbitdaAttractive: 7,
  evEbitdaExpensive: 22,
  evSalesAttractive: 1.5,
  evSalesExpensive: 8,
  fcfYieldWeak: 0.015,
  fcfYieldStrong: 0.07,
  betaLowRisk: 0.8,
  betaHighRisk: 1.8,
  maxDcfGrowth: 0.16,
};

const sectorOverrides: Partial<Record<Sector, Partial<SectorBenchmarks>>> = {
  technology: {
    revenueGrowthStrong: 0.2,
    grossMarginWeak: 0.4,
    grossMarginStrong: 0.75,
    operatingMarginStrong: 0.28,
    evSalesAttractive: 3,
    evSalesExpensive: 14,
    peAttractive: 18,
    peExpensive: 55,
    maxDcfGrowth: 0.22,
  },
  financials: {
    revenueGrowthStrong: 0.08,
    netMarginWeak: 0.08,
    netMarginStrong: 0.28,
    roeWeak: 0.06,
    roeStrong: 0.16,
    roaWeak: 0.004,
    roaStrong: 0.018,
    peAttractive: 8,
    peExpensive: 20,
    fcfYieldWeak: 0.01,
    fcfYieldStrong: 0.05,
    maxDcfGrowth: 0.08,
  },
  utilities: {
    revenueGrowthStrong: 0.06,
    operatingMarginStrong: 0.26,
    netDebtToEbitdaWeak: 5.5,
    netDebtToEbitdaStrong: 2.5,
    peAttractive: 11,
    peExpensive: 26,
    maxDcfGrowth: 0.07,
  },
  energy: {
    grossMarginWeak: 0.18,
    grossMarginStrong: 0.45,
    operatingMarginWeak: 0.02,
    operatingMarginStrong: 0.2,
    peAttractive: 8,
    peExpensive: 24,
    evEbitdaAttractive: 4,
    evEbitdaExpensive: 12,
    maxDcfGrowth: 0.08,
  },
  realEstate: {
    revenueGrowthStrong: 0.08,
    currentRatioWeak: 0.6,
    currentRatioStrong: 1.1,
    netDebtToEbitdaWeak: 7,
    netDebtToEbitdaStrong: 3,
    peAttractive: 10,
    peExpensive: 28,
    maxDcfGrowth: 0.08,
  },
};

export function benchmarksForSector(sector: Sector | undefined): SectorBenchmarks {
  return { ...defaultBenchmarks, ...(sector ? sectorOverrides[sector] : undefined) };
}

export const baseSectorWeights: Record<ScoreDimensionKey, number> = normalizeWeights({
  growth: 0.14,
  profitability: 0.16,
  financialHealth: 0.15,
  valuation: 0.15,
  cashFlow: 0.12,
  earningsQuality: 0.1,
  quality: 0.12,
  momentum: 0.04,
  risk: 0.04,
});

export const sectorWeightOverrides: Partial<Record<Sector, Partial<Record<ScoreDimensionKey, number>>>> = {
  technology: {
    growth: 0.2,
    profitability: 0.16,
    financialHealth: 0.12,
    valuation: 0.14,
    cashFlow: 0.13,
    earningsQuality: 0.08,
    quality: 0.14,
    momentum: 0.06,
    risk: 0.04,
  },
  financials: {
    growth: 0.12,
    profitability: 0.16,
    financialHealth: 0.22,
    valuation: 0.18,
    cashFlow: 0.04,
    earningsQuality: 0.1,
    quality: 0.14,
    momentum: 0.04,
    risk: 0.08,
  },
  utilities: {
    growth: 0.08,
    profitability: 0.16,
    financialHealth: 0.2,
    valuation: 0.18,
    cashFlow: 0.16,
    earningsQuality: 0.1,
    quality: 0.1,
    momentum: 0.03,
    risk: 0.07,
  },
};

export function weightsForSector(sector: Sector | undefined): Record<ScoreDimensionKey, number> {
  return normalizeWeights({
    ...baseSectorWeights,
    ...(sector ? sectorWeightOverrides[sector] : undefined),
  });
}

export const profileWeights: Record<InvestmentProfile, Record<ScoreDimensionKey, number>> = {
  balanced: baseSectorWeights,
  growth: normalizeWeights({
    growth: 0.28,
    profitability: 0.15,
    financialHealth: 0.1,
    valuation: 0.11,
    cashFlow: 0.11,
    earningsQuality: 0.08,
    quality: 0.14,
    momentum: 0.05,
    risk: 0.03,
  }),
  value: normalizeWeights({
    growth: 0.08,
    profitability: 0.14,
    financialHealth: 0.18,
    valuation: 0.3,
    cashFlow: 0.15,
    earningsQuality: 0.08,
    quality: 0.1,
    momentum: 0.02,
    risk: 0.02,
  }),
  quality: normalizeWeights({
    growth: 0.1,
    profitability: 0.22,
    financialHealth: 0.18,
    valuation: 0.08,
    cashFlow: 0.14,
    earningsQuality: 0.12,
    quality: 0.23,
    momentum: 0.01,
    risk: 0.02,
  }),
  dividend: normalizeWeights({
    growth: 0.08,
    profitability: 0.16,
    financialHealth: 0.2,
    valuation: 0.13,
    cashFlow: 0.21,
    earningsQuality: 0.1,
    quality: 0.12,
    momentum: 0.01,
    risk: 0.05,
  }),
  long_term: normalizeWeights({
    growth: 0.18,
    profitability: 0.18,
    financialHealth: 0.14,
    valuation: 0.1,
    cashFlow: 0.15,
    earningsQuality: 0.1,
    quality: 0.21,
    momentum: 0.0,
    risk: 0.02,
  }),
  short_term: normalizeWeights({
    growth: 0.15,
    profitability: 0.08,
    financialHealth: 0.08,
    valuation: 0.2,
    cashFlow: 0.06,
    earningsQuality: 0.05,
    quality: 0.05,
    momentum: 0.28,
    risk: 0.05,
  }),
};

export function weightsForSectorAndProfile(
  sector: Sector | undefined,
  profile: InvestmentProfile,
): Record<ScoreDimensionKey, number> {
  const sectorWeights = weightsForSector(sector);
  if (profile === "balanced") return sectorWeights;
  const adjusted = Object.fromEntries(
    (Object.keys(baseSectorWeights) as ScoreDimensionKey[]).map((key) => [
      key,
      sectorWeights[key] * (profileWeights[profile][key] / baseSectorWeights[key]),
    ]),
  ) as Record<ScoreDimensionKey, number>;
  return normalizeWeights(adjusted);
}

export const shortTermWeights: Record<ScoreDimensionKey, number> = normalizeWeights({
  growth: 0.15,
  profitability: 0.06,
  financialHealth: 0.1,
  valuation: 0.2,
  cashFlow: 0.04,
  earningsQuality: 0.04,
  quality: 0.05,
  momentum: 0.26,
  risk: 0.1,
});

export const longTermWeights: Record<ScoreDimensionKey, number> = normalizeWeights({
  growth: 0.18,
  profitability: 0.18,
  financialHealth: 0.14,
  valuation: 0.1,
  cashFlow: 0.15,
  earningsQuality: 0.1,
  quality: 0.21,
  momentum: 0,
  risk: 0.02,
});
