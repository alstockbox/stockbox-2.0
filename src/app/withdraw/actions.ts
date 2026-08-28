"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getUserSubscription } from "@/lib/billing/subscriptions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function submitWithdrawalAction(formData: FormData) {
  const user = await requireUser();
  if (formData.get("confirm") !== "yes") redirect("/withdraw?error=confirm");

  const lookup = await getUserSubscription(user.id);
  const subscription = lookup.ok ? lookup.subscription : null;
  if (!subscription?.stripeSubscriptionId || subscription.planKey !== "basic") {
    redirect("/withdraw?error=no-subscription");
  }

  const admin = createAdminClient();
  if (!admin) redirect("/withdraw?error=unavailable");

  const { data, error } = await admin
    .from("withdrawal_requests")
    .insert({
      user_id: user.id,
      stripe_subscription_id: subscription.stripeSubscriptionId,
      plan_key: subscription.planKey,
      subscription_status_snapshot: subscription.status,
      status: "received",
    })
    .select("id")
    .single();

  if (error || !data?.id) redirect("/withdraw?error=unavailable");
  redirect(`/withdraw/receipt/${data.id}`);
}
