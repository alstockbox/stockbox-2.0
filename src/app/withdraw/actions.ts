"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { commerciallyActivePlans } from "@/lib/billing/plans";
import { getUserSubscription } from "@/lib/billing/subscriptions";
import { sendWithdrawalReceiptEmail } from "@/lib/notifications/withdrawal-receipt";
import { checkDistributedRateLimit, rateLimitKeyFromHeaders, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const paidPlanKeys = commerciallyActivePlans.filter((plan) => plan.key !== "free").map((plan) => plan.key);
const withdrawalSchema = z.object({
  consumerName: z.string().trim().min(2).max(120),
  accountEmail: z.string().trim().email().max(254),
  confirmationEmail: z.string().trim().email().max(254),
  contractReference: z.string().trim().min(2).max(200),
  planKey: z.string().refine((value) => paidPlanKeys.includes(value as never)),
  confirm: z.literal("yes"),
});

function digest(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
export async function submitWithdrawalAction(formData: FormData) {
  const parsed = withdrawalSchema.safeParse({
    consumerName: formData.get("consumerName"),
    accountEmail: formData.get("accountEmail"),
    confirmationEmail: formData.get("confirmationEmail"),
    contractReference: formData.get("contractReference"),
    planKey: formData.get("planKey"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) redirect("/withdraw?error=invalid");

  const requestHeaders = await headers();
  const rateLimit = await checkDistributedRateLimit(
    rateLimitKeyFromHeaders(requestHeaders, "withdrawal", digest(parsed.data.accountEmail)),
    RATE_LIMITS.support,
  );
  if (!rateLimit.allowed) redirect("/withdraw?error=rate-limit");

  const user = await getCurrentUser();
  const normalizedAccountEmail = parsed.data.accountEmail.toLowerCase();
  const userMatchesAccount = Boolean(user?.email && user.email.toLowerCase() === normalizedAccountEmail);
  const lookup = userMatchesAccount && user ? await getUserSubscription(user.id) : null;
  const subscription = lookup?.ok ? lookup.subscription : null;
  const rawReceiptToken = randomBytes(32).toString("base64url");
  const receiptTokenHash = digest(rawReceiptToken);
  const resolvedPlanKey = subscription?.stripeSubscriptionId ? subscription.planKey : parsed.data.planKey;
  const admin = createAdminClient();
  if (!admin) redirect("/withdraw?error=unavailable");

  const { data, error } = await admin.from("withdrawal_requests").insert({
    user_id: userMatchesAccount ? user?.id ?? null : null,
    stripe_subscription_id: subscription?.stripeSubscriptionId ?? null,
    plan_key: resolvedPlanKey,
    subscription_status_snapshot: subscription?.status ?? "unverified",
    consumer_name: parsed.data.consumerName,
    account_email: normalizedAccountEmail,
    confirmation_email: parsed.data.confirmationEmail.toLowerCase(),
    contract_reference: parsed.data.contractReference,
    receipt_token_hash: receiptTokenHash,
    receipt_delivery_status: "pending",
    status: "received",
  }).select("id,submitted_at,status").single();

  if (error || !data?.id || !data.submitted_at) redirect("/withdraw?error=unavailable");
  const receiptDeliveryStatus = await sendWithdrawalReceiptEmail({
    id: data.id,
    submittedAt: data.submitted_at,
    consumerName: parsed.data.consumerName,
    confirmationEmail: parsed.data.confirmationEmail.toLowerCase(),
    contractReference: parsed.data.contractReference,
    stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
    planKey: resolvedPlanKey,
    status: data.status ?? "received",
    to: parsed.data.confirmationEmail.toLowerCase(),
  }) ? "sent" : "failed";

  await admin.from("withdrawal_requests").update({
    receipt_delivery_status: receiptDeliveryStatus,
    receipt_delivered_at: receiptDeliveryStatus === "sent" ? new Date().toISOString() : null,
  }).eq("id", data.id);

  redirect(`/withdraw/receipt/${data.id}?token=${encodeURIComponent(rawReceiptToken)}&delivery=${receiptDeliveryStatus}`);
}
