import { describe, expect, it } from "vitest";
import { buildCompositeFairValue } from "./fair-value";

describe("buildCompositeFairValue", () => {
  it("renormalizes weights across available methods instead of fabricating missing methods", () => {
    const result = buildCompositeFairValue({
      currentPrice: 150,
      methods: [
        { method: "DCF", impliedValue: 200, low: 175, high: 225, baseWeight: 0.4, confidence: 0.8 },
        { method: "HISTORICAL_MULTIPLE", impliedValue: 180, low: 170, high: 195, baseWeight: 0.25, confidence: 0.75 },
        { method: "PEER", impliedValue: null, low: null, high: null, baseWeight: 0.2, confidence: 0, unavailableReason: "No valid peer set" },
        { method: "FORWARD_EARNINGS", impliedValue: null, low: null, high: null, baseWeight: 0.15, confidence: 0, unavailableReason: "Consensus EPS unavailable" },
      ],
    });

    expect(result.status).toBe("available");
    expect(result.methodsUsed).toHaveLength(2);
    expect(result.methodsUsed[0]?.weight).toBeCloseTo(0.4 / 0.65);
    expect(result.methodsUsed[1]?.weight).toBeCloseTo(0.25 / 0.65);
    expect(result.fairValue).toBeCloseTo((200 * 0.4 + 180 * 0.25) / 0.65);
    expect(result.unavailableMethods.map((item) => item.method)).toEqual(["PEER", "FORWARD_EARNINGS"]);
  });

  it("calculates upside and margin of safety from the transparent composite", () => {
    const result = buildCompositeFairValue({
      currentPrice: 80,
      methods: [
        { method: "DCF", impliedValue: 100, low: 90, high: 120, baseWeight: 1, confidence: 0.9 },
      ],
    });

    expect(result.fairValue).toBe(100);
    expect(result.upsideDownside).toBeCloseTo(0.25);
    expect(result.marginOfSafety).toBeCloseTo(0.2);
    expect(result.bear).toBe(90);
    expect(result.bull).toBe(120);
  });

  it("returns unavailable rather than inventing a fair value when no valid method exists", () => {
    const result = buildCompositeFairValue({
      currentPrice: 100,
      methods: [
        { method: "DCF", impliedValue: null, low: null, high: null, baseWeight: 0.4, confidence: 0, unavailableReason: "DCF inappropriate" },
      ],
    });

    expect(result.status).toBe("unavailable");
    expect(result.fairValue).toBeNull();
    expect(result.upsideDownside).toBeNull();
    expect(result.methodsUsed).toEqual([]);
  });

  it("rejects non-positive implied values as unavailable financial outputs", () => {
    const result = buildCompositeFairValue({
      currentPrice: 100,
      methods: [
        { method: "DCF", impliedValue: -10, low: -20, high: 0, baseWeight: 1, confidence: 0.8 },
      ],
    });

    expect(result.status).toBe("unavailable");
    expect(result.fairValue).toBeNull();
  });
});
