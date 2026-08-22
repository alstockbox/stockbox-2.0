import { describe, expect, it } from "vitest";
import {
  effectivePlanKey,
  isCurrentBasicSubscription,
  reusableStripeCustomerId,
  type UserSubscription
} from "../../src/lib/billing/subscriptions";

function basicSubscription(status: string): UserSubscription {
  return {
    planKey: "basic",
    status,
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    currentPeriodEnd: null,
    createdAt: null
  };
}

describe("subscription state", () => {
  it.each(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])(
    "blocks a second Basic checkout while status is %s",
    (status) => {
      const subscription = basicSubscription(status);
      expect(isCurrentBasicSubscription(subscription)).toBe(true);
      expect(effectivePlanKey(subscription)).toBe("basic");
      expect(reusableStripeCustomerId(subscription)).toBe("cus_test");
    }
  );

  it.each(["canceled", "incomplete_expired"])(
    "allows a new checkout after terminal status %s",
    (status) => {
      const subscription = basicSubscription(status);
      expect(isCurrentBasicSubscription(subscription)).toBe(false);
      expect(effectivePlanKey(subscription)).toBe("free");
      expect(reusableStripeCustomerId(subscription)).toBeNull();
    }
  );

  it("does not invent a reusable customer for a missing subscription", () => {
    expect(reusableStripeCustomerId(null)).toBeNull();
  });
});
