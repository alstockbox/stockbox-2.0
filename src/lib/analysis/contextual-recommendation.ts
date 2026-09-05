import type { Recommendation } from "./types";
import type { Locale } from "@/lib/i18n/types";

export type ContextualRecommendationAction = "buy" | "hold" | "sell" | "wait" | "avoid" | "none";

export function contextualRecommendation(
  recommendation: Recommendation,
  inPortfolio: boolean,
  locale: Locale,
): { label: string; action: ContextualRecommendationAction } {
  const isSwedish = locale === "sv";

  if (recommendation === "No Rating") {
    return { label: isSwedish ? "Ingen rekommendation" : "No rating", action: "none" };
  }

  if (recommendation === "Strong Buy" || recommendation === "Buy") {
    return { label: isSwedish ? "Köp" : "Buy", action: "buy" };
  }

  if (recommendation === "Hold") {
    return inPortfolio
      ? { label: isSwedish ? "Håll" : "Hold", action: "hold" }
      : { label: isSwedish ? "Vänta" : "Wait", action: "wait" };
  }

  return inPortfolio
    ? { label: isSwedish ? "Sälj" : "Sell", action: "sell" }
    : { label: isSwedish ? "Undvik" : "Avoid", action: "avoid" };
}
