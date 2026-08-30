import { findPlan, type PlanKey } from "@/lib/billing/plans";
import type { SubscriptionBillingState } from "@/lib/billing/subscriptions";

export type BillingViewerState = "signed_out" | "unknown" | SubscriptionBillingState;
export type PricingAction = {
  kind: "signup" | "checkout" | "portal" | "current" | "disabled" | "none";
  label: string;
  current: boolean;
};

function paidPlanName(plan: PlanKey) {
  return findPlan(plan)?.name ?? plan;
}

function isManageState(viewer: BillingViewerState): boolean {
  return typeof viewer === "string" && viewer.endsWith("_manage");
}

export function getPricingAction(plan: PlanKey, viewer: BillingViewerState): PricingAction {
  if (plan === "free") {
    if (viewer === "signed_out") return { kind: "signup", label: "Start free", current: false };
    if (viewer === "free") return { kind: "current", label: "Current plan", current: true };
    return { kind: "none", label: "", current: false };
  }

  const name = paidPlanName(plan);
  if (viewer === "signed_out") return { kind: "signup", label: `Get ${name}`, current: false };
  if (viewer === "free") return { kind: "checkout", label: `Upgrade to ${name}`, current: false };
  if (viewer === "unknown") return { kind: "disabled", label: "Subscriptions unavailable", current: false };
  if (isManageState(viewer)) return { kind: "portal", label: "Resolve billing", current: false };
  if (viewer === plan) return { kind: "portal", label: "Manage subscription", current: true };
  return { kind: "portal", label: `Change to ${name}`, current: false };
}