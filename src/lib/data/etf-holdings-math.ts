import type { EtfHolding } from "@/lib/analysis/universal-security";

export const ETF_HHI_MIN_REPRESENTED_WEIGHT = 0.95;

export type EtfHoldingConcentrationSummary = {
  representedWeight: number;
  top10Weight: number | null;
  largestHoldingWeight: number | null;
  holdingsHhi: number | null;
};

function normalizedWeight(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 1.5 ? value / 100 : value;
}

export function summarizeEtfHoldingConcentration(
  holdings: EtfHolding[],
): EtfHoldingConcentrationSummary {
  const weights = holdings
    .flatMap((holding) => {
      const weight = normalizedWeight(holding.weight);
      return weight === null ? [] : [weight];
    })
    .sort((left, right) => right - left);

  const representedWeight = Math.min(1, weights.reduce((sum, weight) => sum + weight, 0));
  const top10Weight = weights.length
    ? weights.slice(0, 10).reduce((sum, weight) => sum + weight, 0)
    : null;
  const largestHoldingWeight = weights[0] ?? null;
  const holdingsHhi = representedWeight >= ETF_HHI_MIN_REPRESENTED_WEIGHT
    ? weights.reduce((sum, weight) => sum + weight ** 2, 0)
    : null;

  return {
    representedWeight,
    top10Weight,
    largestHoldingWeight,
    holdingsHhi,
  };
}
