import type { EtfAnalysisInput, EtfHolding } from "@/lib/analysis/universal-security";

export type EtfInputMergeResult = {
  input: EtfAnalysisInput;
  fallbackFields: Array<keyof EtfAnalysisInput>;
};

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function normalizedHoldingWeight(weight: number): number | null {
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return weight > 1.5 ? weight / 100 : weight;
}

function representedPortfolioWeight(holdings: EtfHolding[] | null | undefined): number {
  if (!holdings?.length) return 0;
  const total = holdings.reduce((sum, holding) => {
    const normalized = normalizedHoldingWeight(holding.weight);
    return sum + (normalized ?? 0);
  }, 0);
  return Math.min(1, Math.max(0, total));
}

export function mergeEtfAnalysisInputs(
  primary: EtfAnalysisInput,
  fallback: EtfAnalysisInput,
): EtfInputMergeResult {
  const output: Record<string, unknown> = { ...primary };
  const fallbackFields: Array<keyof EtfAnalysisInput> = [];

  for (const [rawKey, value] of Object.entries(fallback)) {
    if (rawKey === "holdings" || !hasValue(value)) continue;
    if (hasValue(output[rawKey])) continue;
    output[rawKey] = value;
    fallbackFields.push(rawKey as keyof EtfAnalysisInput);
  }

  const primaryHoldings = primary.holdings ?? [];
  const fallbackHoldings = fallback.holdings ?? [];
  const primaryWeight = representedPortfolioWeight(primaryHoldings);
  const fallbackWeight = representedPortfolioWeight(fallbackHoldings);

  // Prefer the primary provider when both sets represent essentially the same share
  // of the portfolio. A fallback may replace holdings only when it materially improves
  // represented portfolio weight; row count alone is not evidence of better coverage.
  if (
    fallbackHoldings.length > 0
    && (
      primaryHoldings.length === 0
      || fallbackWeight > primaryWeight + 0.05
    )
  ) {
    output.holdings = fallbackHoldings;
    fallbackFields.push("holdings");
  }

  return {
    input: output as EtfAnalysisInput,
    fallbackFields,
  };
}
