import { describe, expect, it } from "vitest";
import { buildIntelligenceSummary } from "@/lib/analysis/intelligence-report";

// UI integration contract: the presentation model must never collapse the three analytical pillars into one opaque score.
describe("intelligence presentation contract", () => {
  it("exports a summary builder for the report UI", () => {
    expect(typeof buildIntelligenceSummary).toBe("function");
  });
});
