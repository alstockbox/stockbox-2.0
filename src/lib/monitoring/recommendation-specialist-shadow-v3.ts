// Backwards-compatible import path. The specialist Recommendation V3 builder is
// domain analysis logic and now lives in the analysis layer so live providers
// and background review workers share one implementation.
export * from "@/lib/analysis/recommendation-specialist-shadow-v3";
