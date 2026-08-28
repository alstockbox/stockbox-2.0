import { describe, expect, it } from "vitest";
import {
  effectivePlanKey,
  hasActiveBasicAccess,
  isCurrentBasicSubscription,
  reusableStripeCustomerId,
  scheduledSubscriptionEnd,
  subscriptionBillingState,
  type UserSubscription
} from "../../src/lib/billing/subscriptions";

function basicSubscription(status: string): UserSubscription {
  return {
    planKey: "basic",
    status,
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    launchOfferRedeemedAt: null,
    createdAt: null
  };
}

describe("subscription state", () => {
  it.each(["active", "trialing"])("grants Basic access while status is %s", (status) => {
    const subscription = basicSubscription(status);
    expect(isCurrentBasicSubscription(subscription)).toBe(true);
    expect(hasActiveBasicAccess(subscription)).toBe(true);
    expect(effectivePlanKey(subscription)).toBe("basic");
    expect(subscriptionBillingState(subscription)).toBe("basic");
  });

  it.each(["past_due", "unpaid", "incomplete", "paused"])(
    "keeps %s manageable in billing without granting paid entitlements",
    (status) => {
      const subscription = basicSubscription(status);
      expect(isCurrentBasicSubscription(subscription)).toBe(true);
      expect(hasActiveBasicAccess(subscription)).toBe(false);
      expect(effectivePlanKey(subscription)).toBe("free");
      expect(reusableStripeCustomerId(subscription)).toBe("cus_test");
      expect(subscriptionBillingState(subscription)).toBe("basic_manage");
    }
  );

  it.each(["canceled", "incomplete_expired"])(
    "allows a new checkout after terminal status %s",
    (status) => {
      const subscription = basicSubscription(status);
      expect(isCurrentBasicSubscription(subscription)).toBe(false);
      expect(hasActiveBasicAccess(subscription)).toBe(false);
      expect(effectivePlanKey(subscription)).toBe("free");
      expect(reusableStripeCustomerId(subscription)).toBeNull();
      expect(subscriptionBillingState(subscription)).toBe("free");
    }
  );

  it("uses cancel_at first and period end as fallback for scheduled cancellation", () => {
    const subscription = basicSubscription("active");
    subscription.cancelAtPeriodEnd = true;
    subscription.currentPeriodEnd = "2026-09-30T00:00:00.000Z";
    subscription.cancelAt = "2026-09-28T00:00:00.000Z";
    expect(scheduledSubscriptionEnd(subscription)).toBe("2026-09-28T00:00:00.000Z");
    subscription.cancelAt = null;
    expect(scheduledSubscriptionEnd(subscription)).toBe("2026-09-30T00:00:00.000Z");
    subscription.cancelAtPeriodEnd = false;
    expect(scheduledSubscriptionEnd(subscription)).toBeNull();
  });

  it("does not invent access for a missing subscription", () => {
    expect(hasActiveBasicAccess(null)).toBe(false);
    expect(reusableStripeCustomerId(null)).toBeNull();
    expect(subscriptionBillingState(null)).toBe("free");
  });
});
