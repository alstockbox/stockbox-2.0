import type { PlanKey } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

export type UserSubscription = {
  planKey: PlanKey;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string | null;
};

export type SubscriptionLookup =
  | { ok: true; subscription: UserSubscription | null }
  | { ok: false; subscription: null };

const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

export function isCurrentBasicSubscription(subscription: UserSubscription | null): boolean {
  return Boolean(
    subscription?.planKey === "basic" &&
      !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)
  );
}

export function effectivePlanKey(subscription: UserSubscription | null): "free" | "basic" {
  return isCurrentBasicSubscription(subscription) ? "basic" : "free";
}

export function subscriptionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Active",
    trialing: "Trialing",
    past_due: "Past due",
    unpaid: "Payment required",
    incomplete: "Incomplete",
    paused: "Paused",
    canceled: "Canceled",
    incomplete_expired: "Expired"
  };
  return labels[status] ?? "Active";
}

export async function getUserSubscription(userId: string): Promise<SubscriptionLookup> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, subscription: null };

  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "plan_key,status,stripe_customer_id,stripe_subscription_id,current_period_end,created_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[billing] Subscription lookup failed.", {
      code: error.code,
      userPresent: Boolean(userId)
    });
    return { ok: false, subscription: null };
  }

  if (!data) return { ok: true, subscription: null };

  const planKey: PlanKey = data.plan_key === "basic" ? "basic" : "free";
  return {
    ok: true,
    subscription: {
      planKey,
      status: data.status,
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      currentPeriodEnd: data.current_period_end,
      createdAt: data.created_at
    }
  };
}
