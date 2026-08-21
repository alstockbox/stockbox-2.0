import type { PlanKey } from "@/lib/billing/plans";

export type BillingViewerState = "signed_out" | "free" | "basic" | "unknown";
export type PricingAction = {
  kind: "signup" | "checkout" | "portal" | "current" | "disabled" | "none";
  label: string;
  current: boolean;
};

export function getPricingAction(
  plan: PlanKey,
  viewer: BillingViewerState
): PricingAction {
  if (plan === "free") {
    if (viewer === "signed_out") {
      return { kind: "signup", label: "Start free", current: false };
    }
    if (viewer === "free") {
      return { kind: "current", label: "Current plan", current: true };
    }
    return { kind: "none", label: "", current: false };
  }

  if (plan !== "basic") {
    return { kind: "none", label: "", current: false };
  }

  if (viewer === "signed_out") {
    return { kind: "signup", label: "Get Basic", current: false };
  }
  if (viewer === "free") {
    return { kind: "checkout", label: "Upgrade to Basic", current: false };
  }
  if (viewer === "basic") {
    return { kind: "portal", label: "Manage subscription", current: true };
  }
  return { kind: "disabled", label: "Subscriptions unavailable", current: false };
}
