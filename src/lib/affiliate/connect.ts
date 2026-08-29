import type Stripe from "stripe";

export function buildAffiliateConnectAccountParams(input: {
  userId: string;
  affiliateId: string;
  email: string | null;
}): Stripe.AccountCreateParams {
  return {
    email: input.email ?? undefined,
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

export function isAffiliateConnectReady(
  account: Pick<Stripe.Account, "payouts_enabled" | "capabilities">
) {
  return account.payouts_enabled === true && account.capabilities?.transfers === "active";
}
