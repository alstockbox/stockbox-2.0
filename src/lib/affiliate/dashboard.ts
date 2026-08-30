import { isCommissionPayable, type CommissionStatus } from "@/lib/affiliate/commission";

export type AffiliateCommissionMetric = {
  status: CommissionStatus;
  amountCents: number;
  availableAt: string;
};

export function aggregateAffiliateMetrics(input: {
  clicks: number;
  referrals: number;
  payingCustomers: number;
  commissions: AffiliateCommissionMetric[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  let pendingCents = 0;
  let availableCents = 0;
  let paidCents = 0;
  let lifetimeEarningsCents = 0;

  for (const commission of input.commissions) {
    if (commission.status === "reversed") continue;
    lifetimeEarningsCents += commission.amountCents;
    if (commission.status === "paid") paidCents += commission.amountCents;
    else if (isCommissionPayable(commission.status, commission.availableAt, now)) availableCents += commission.amountCents;
    else if (commission.status === "pending" || commission.status === "approved") pendingCents += commission.amountCents;
  }

  return {
    clicks: input.clicks,
    referrals: input.referrals,
    payingCustomers: input.payingCustomers,
    pendingCents,    availableCents,
    paidCents,
    lifetimeEarningsCents,
    conversionRate: input.clicks > 0 ? (input.payingCustomers / input.clicks) * 100 : 0,
  };
}
