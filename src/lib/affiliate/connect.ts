import type Stripe from "stripe";

export function isAffiliateConnectEnabled(
  value: string | undefined = process.env.AFFILIATE_CONNECT_ENABLED
) {
  return value?.trim().toLowerCase() === "true";
}

export function buildAffiliateConnectAccountParams(input: {
  userId: string;
  affiliateId: string;
  email: string | null;
}): Stripe.AccountCreateParams {
  return {
    email: input.email ?? undefined,
    business_type: "individual",
    business_profile: {
      product_description: "Individual affiliate receiving referral commission payouts from StockBox.",
    },
    controller: {
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
      stripe_dashboard: { type: "express" },
    },
    capabilities: {
      transfers: { requested: true },
    },
    metadata: {
      stockboxUserId: input.userId,
      stockboxAffiliateId: input.affiliateId,
    },
  };
}

export function shouldReplaceAffiliateConnectAccount(
  account: Pick<Stripe.Account, "business_type" | "details_submitted">
) {
  return account.details_submitted !== true && account.business_type !== "individual";
}

export function isAffiliateConnectReady(
  account: Pick<Stripe.Account, "payouts_enabled" | "capabilities">
) {
  return account.payouts_enabled === true && account.capabilities?.transfers === "active";
}
