import { describe, expect, it } from "vitest";
import { canTransitionDistributionPackage } from "@/lib/growth/ready-policy";

describe("growth distribution package transitions", () => {
  it("allows founder publishing and deferring from ready", () => {
    expect(canTransitionDistributionPackage("ready", "posted")).toBe(true);
    expect(canTransitionDistributionPackage("ready", "deferred")).toBe(true);
  });

  it("allows restoring a deferred package to ready", () => {
    expect(canTransitionDistributionPackage("deferred", "ready")).toBe(true);
  });

  it("does not bypass readiness gates", () => {
    expect(canTransitionDistributionPackage("failed", "posted")).toBe(false);
    expect(canTransitionDistributionPackage("draft", "posted")).toBe(false);
    expect(canTransitionDistributionPackage("draft", "ready")).toBe(false);
    expect(canTransitionDistributionPackage("unknown", "posted")).toBe(false);
  });
});
