export const RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 =
  "stockbox-recommendation-outcome-benchmark-v3.1.0" as const;

/**
 * Durable lineage for the policy that decides whether recommendation outcomes
 * may use benchmark-relative evidence. v3.1 is the first persisted lineage and
 * fails closed for ETF archetypes until their economic benchmark/index exposure
 * is independently verified. This is deliberately separate from the market
 * benchmark mapping version: selecting whether a benchmark is valid evidence is
 * a different policy decision from mapping an equity listing to a broad index.
 */
export type RecommendationOutcomeBenchmarkPolicyVersionV3 =
  typeof RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3;
