import { findPlan, type PlanKey } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

export type PaidPlanKey = Exclude<PlanKey, "free">;
export type UserSubscription = {
  planKey: PlanKey;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  launchOfferRedeemedAt: string | null;
  launchOfferRedeemedPlans?: string[];
  createdAt: string | null;
};

export type SubscriptionLookup =
  | { ok: true; subscription: UserSubscription | null }
  | { ok: false; subscription: null };

export type SubscriptionBillingState = PlanKey | `${PaidPlanKey}_manage`;

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);
const PAID_ACCESS_STATUSES = new Set(["active", "trialing"]);

export function hasPaidAccessStatus(status: string): boolean {
  return PAID_ACCESS_STATUSES.has(status);
}

export function isPaidPlanKey(planKey: PlanKey): planKey is PaidPlanKey {
  return planKey !== "free";
}

export function isCurrentPaidSubscription(subscription: UserSubscription | null): boolean {
  return Boolean(subscription && isPaidPlanKey(subscription.planKey) && !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status));
}

export function hasActivePaidAccess(subscription: UserSubscription | null): boolean {
  return Boolean(subscription && isPaidPlanKey(subscription.planKey) && hasPaidAccessStatus(subscription.status));
}

export function isCurrentBasicSubscription(subscription: UserSubscription | null): boolean {
  return Boolean(subscription?.planKey === "basic" && isCurrentPaidSubscription(subscription));
}

export function hasActiveBasicAccess(subscription: UserSubscription | null): boolean {
  return Boolean(subscription?.planKey === "basic" && hasActivePaidAccess(subscription));
}

export function subscriptionBillingState(subscription: UserSubscription | null): SubscriptionBillingState {
  if (hasActivePaidAccess(subscription)) return subscription!.planKey;
  if (isCurrentPaidSubscription(subscription)) return `${subscription!.planKey}_manage` as SubscriptionBillingState;
  return "free";
}

export function scheduledSubscriptionEnd(subscription: UserSubscription | null): string | null {
  if (!subscription?.cancelAtPeriodEnd) return null;
  return subscription.cancelAt ?? subscription.currentPeriodEnd;
}

export function reusableStripeCustomerId(subscription: UserSubscription | null): string | null {
  if (!subscription?.stripeCustomerId) return null;
  if (TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) return null;
  return subscription.stripeCustomerId;
}

export function effectivePlanKey(subscription: UserSubscription | null): PlanKey {
  return hasActivePaidAccess(subscription) ? subscription!.planKey : "free";
}

export function subscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Active", trialing: "Trialing", past_due: "Past due", unpaid: "Payment required",
    incomplete: "Incomplete", paused: "Paused", canceled: "Canceled", incomplete_expired: "Expired",
  };
  return labels[status] ?? "Unknown";
}

export async function getUserSubscription(userId: string): Promise<SubscriptionLookup> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, subscription: null };

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_key,status,stripe_customer_id,stripe_subscription_id,current_period_end,cancel_at_period_end,cancel_at,launch_offer_redeemed_at,launch_offer_redeemed_plans,created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[billing] Subscription lookup failed.", { code: error.code, userPresent: Boolean(userId) });
    return { ok: false, subscription: null };
  }
  if (!data) return { ok: true, subscription: null };

  const candidate = typeof data.plan_key === "string" ? findPlan(data.plan_key) : null;
  const planKey: PlanKey = candidate?.key ?? "free";
  return {
    ok: true,
    subscription: {
      planKey,
      status: data.status,
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end === true,
      cancelAt: data.cancel_at,
      launchOfferRedeemedAt: data.launch_offer_redeemed_at,
      launchOfferRedeemedPlans: Array.isArray(data.launch_offer_redeemed_plans)
        ? data.launch_offer_redeemed_plans.filter((value): value is string => typeof value === "string")
        : [],
      createdAt: data.created_at,
    },
  };
}