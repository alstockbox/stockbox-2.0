import { describe, expect, it } from "vitest";
import { contextualRecommendation } from "../../src/lib/analysis/contextual-recommendation";

describe("contextual recommendation", () => {
  it.each([
    ["Strong Buy", true, "sv", "Köp", "buy"],
    ["Buy", true, "sv", "Köp", "buy"],
    ["Hold", true, "sv", "Håll", "hold"],
    ["Sell", true, "sv", "Sälj", "sell"],
    ["Strong Sell", true, "sv", "Sälj", "sell"],
    ["Strong Buy", false, "sv", "Köp", "buy"],
    ["Buy", false, "sv", "Köp", "buy"],
    ["Hold", false, "sv", "Vänta", "wait"],
    ["Sell", false, "sv", "Undvik", "avoid"],
    ["Strong Sell", false, "sv", "Undvik", "avoid"],
    ["Hold", true, "en", "Hold", "hold"],
    ["Hold", false, "en", "Wait", "wait"],
    ["Sell", false, "en", "Avoid", "avoid"],
  ] as const)("maps %s with inPortfolio=%s in %s", (recommendation, inPortfolio, locale, label, action) => {
    expect(contextualRecommendation(recommendation, inPortfolio, locale)).toEqual({ label, action });
  });

  it("keeps No Rating explicit", () => {
    expect(contextualRecommendation("No Rating", true, "sv")).toEqual({ label: "Ingen rekommendation", action: "none" });
    expect(contextualRecommendation("No Rating", false, "en")).toEqual({ label: "No rating", action: "none" });
  });
});
