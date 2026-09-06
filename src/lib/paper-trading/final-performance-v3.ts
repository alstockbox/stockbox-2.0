import {
  derivePaperPerformanceV3,
  type PaperPerformanceResultV3,
} from "./performance-v3";

export const PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION = "stockbox-paper-final-performance-v3.0.0";
export const PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS = 7 * 24 * 60 * 60_000;
export const PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS = "VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF" as const;

export type PaperFinalPerformanceResultV3 =
  | (Omit<Extract<PaperPerformanceResultV3, { status: "VERIFIED" }>, "policyVersion" | "pricingBasis"> & {
      policyVersion: typeof PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION;
      pricingBasis: typeof PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS;
    })
  | (Omit<Extract<PaperPerformanceResultV3, { status: "UNAVAILABLE" }>, "policyVersion"> & {
      policyVersion: typeof PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION;
    });

type PaperFinalPerformanceInputV3 = Omit<Parameters<typeof derivePaperPerformanceV3>[0], "maxQuoteAgeMs">;

/**
 * Final competition pricing remains fail-closed but uses an explicit bounded
 * historical lookback so a weekend or ordinary market holiday does not make an
 * otherwise valid final leaderboard permanently unavailable. The actual
 * provider observation timestamp is preserved; no current quote, interpolation,
 * FX conversion, previous snapshot or fabricated end-time observation is used.
 */
export function derivePaperFinalPerformanceV3(
  input: PaperFinalPerformanceInputV3,
): PaperFinalPerformanceResultV3 {
  const result = derivePaperPerformanceV3({
    ...input,
    maxQuoteAgeMs: PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS,
  });

  if (result.status !== "VERIFIED") {
    return {
      ...result,
      policyVersion: PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION,
    };
  }

  return {
    ...result,
    policyVersion: PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION,
    pricingBasis: PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS,
  };
}
