import { describe, expect, it } from "vitest";
import { getPricingAction } from "../../src/lib/billing/pricing-state";

describe("pricing actions", () => {
  it("shows acquisition actions when signed out", () => {
    expect(getPricingAction("free", "signed_out")).toMatchObject({
      kind: "signup",
      label: "Start free",
      current: false
    });
    expect(getPricingAction("basic", "signed_out")).toMatchObject({
      kind: "signup",
      label: "Get Basic",
      current: false
    });
  });

  it("shows current Free and an upgrade for a Free user", () => {
    expect(getPricingAction("free", "free")).toMatchObject({
      kind: "current",
      label: "Current plan",
      current: true
    });
    expect(getPricingAction("basic", "free")).toMatchObject({
      kind: "checkout",
      label: "Upgrade to Basic",
      current: false
    });
  });

  it("shows Basic as current and routes management to the portal", () => {
    expect(getPricingAction("free", "basic").kind).toBe("none");
    expect(getPricingAction("basic", "basic")).toMatchObject({
      kind: "portal",
      label: "Manage subscription",
      current: true
    });
  });
  it("routes a non-terminal Basic billing problem to the portal without claiming paid access", () => {
    expect(getPricingAction("free", "basic_manage").kind).toBe("none");
    expect(getPricingAction("basic", "basic_manage")).toMatchObject({
      kind: "portal",
      label: "Resolve billing",
      current: false
    });
  });
});
