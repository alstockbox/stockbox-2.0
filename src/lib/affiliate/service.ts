import { affiliateLink, maskEmail } from "@/lib/affiliate/attribution";
import { aggregateAffiliateMetrics, type AffiliateCommissionMetric } from "@/lib/affiliate/dashboard";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AffiliateDashboardData = {
  userId: string;
  displayName: string;
  email: string | null;
  code: string;
  status: string;
  commissionPercent: number;
  monthlyAnalysisLimit: number;
  payoutEnabled: boolean;
  connectAccountId: string | null;
  link: string;
  metrics: ReturnType<typeof aggregateAffiliateMetrics>;
  recentCommissions: Array<{
    id: string;
    customer: string;
    amountCents: number;
    status: string;
    createdAt: string;
  }>;
  payouts: Array<{
    id: string;
    amountCents: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }>;
  giveawayCampaigns: Array<{
    id: string;
    label: string;
    planKey: string;
    durationMonths: number;
    claimExpiresAt: string | null;
    status: string;
    createdAt: string;
    codes: Array<{ code: string; status: string; redeemedAt: string | null }>;
  }>;
};
export async function getAffiliateDashboardData(userId: string): Promise<AffiliateDashboardData | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const [{ data: profile }, { data: affiliate }] = await Promise.all([
    supabase.from("profiles").select("email").eq("id", userId).maybeSingle(),
    supabase.from("affiliates")
      .select("id,user_id,display_name,code,status,commission_basis_points,monthly_analysis_limit,payout_enabled,stripe_connect_account_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!affiliate) return null;

  const [clickResult, referralResult, commissionResult, payoutResult, giveawayResult] = await Promise.all([
    supabase.from("affiliate_clicks").select("id", { count: "exact", head: true }).eq("affiliate_id", affiliate.id),
    supabase.from("referrals").select("referred_id,status,created_at").eq("affiliate_id", affiliate.id),
    supabase.from("affiliate_commissions")
      .select("id,referred_user_id,commission_amount_cents,status,available_at,created_at")
      .eq("affiliate_id", affiliate.id)
      .order("created_at", { ascending: false }),
    supabase.from("affiliate_payouts")
      .select("id,amount_cents,status,created_at,paid_at")
      .eq("affiliate_id", affiliate.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("affiliate_giveaway_campaigns")
      .select("id,label,plan_key,duration_months,claim_expires_at,status,created_at")
      .eq("affiliate_id", affiliate.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const commissions = commissionResult.data ?? [];
  const giveawayCampaignRows = giveawayResult.data ?? [];
  const giveawayCampaignIds = giveawayCampaignRows.map((row) => row.id);
  const giveawayCodeResult = giveawayCampaignIds.length
    ? await supabase.from("affiliate_giveaway_codes")
        .select("campaign_id,code,status,redeemed_at")
        .in("campaign_id", giveawayCampaignIds)
        .order("created_at", { ascending: true })
    : { data: [] as Array<{ campaign_id: string; code: string; status: string; redeemed_at: string | null }> };
  const giveawayCodesByCampaign = new Map<string, Array<{ code: string; status: string; redeemedAt: string | null }>>();
  for (const row of giveawayCodeResult.data ?? []) {
    const current = giveawayCodesByCampaign.get(row.campaign_id) ?? [];
    current.push({ code: row.code, status: row.status, redeemedAt: row.redeemed_at });
    giveawayCodesByCampaign.set(row.campaign_id, current);
  }
  const customerIds = [...new Set(commissions.map((row) => row.referred_user_id).filter((value): value is string => Boolean(value)))];
  const customerEmailById = new Map<string, string | null>();
  if (customerIds.length) {
    const { data: customers } = await supabase.from("profiles").select("id,email").in("id", customerIds);
    for (const customer of customers ?? []) customerEmailById.set(customer.id, customer.email);
  }

  const metricCommissions: AffiliateCommissionMetric[] = commissions.map((row) => ({
    status: row.status as AffiliateCommissionMetric["status"],
    amountCents: row.commission_amount_cents,
    availableAt: row.available_at,
  }));
  const payingCustomers = new Set(
    commissions
      .filter((row) => row.status !== "reversed" && row.referred_user_id)
      .map((row) => row.referred_user_id as string)
  ).size;
  const metrics = aggregateAffiliateMetrics({
    clicks: clickResult.count ?? 0,
    referrals: referralResult.data?.length ?? 0,
    payingCustomers,
    commissions: metricCommissions,
  });

  return {
    userId,
    displayName: affiliate.display_name || profile?.email?.split("@")[0] || "Affiliate",
    email: profile?.email ?? null,
    code: affiliate.code,
    status: affiliate.status,
    commissionPercent: affiliate.commission_basis_points / 100,
    monthlyAnalysisLimit: affiliate.monthly_analysis_limit,
    payoutEnabled: affiliate.payout_enabled,
    connectAccountId: affiliate.stripe_connect_account_id,
    link: affiliateLink(getServerEnv().NEXT_PUBLIC_APP_URL, affiliate.code),    metrics,
    recentCommissions: commissions.slice(0, 20).map((row) => ({
      id: row.id,
      customer: maskEmail(row.referred_user_id ? customerEmailById.get(row.referred_user_id) : null),
      amountCents: row.commission_amount_cents,
      status: row.status,
      createdAt: row.created_at,
    })),
    payouts: (payoutResult.data ?? []).map((row) => ({
      id: row.id,
      amountCents: row.amount_cents,
      status: row.status,
      createdAt: row.created_at,
      paidAt: row.paid_at,
    })),
    giveawayCampaigns: giveawayCampaignRows.map((row) => ({
      id: row.id,
      label: row.label,
      planKey: row.plan_key,
      durationMonths: row.duration_months,
      claimExpiresAt: row.claim_expires_at,
      status: row.status,
      createdAt: row.created_at,
      codes: giveawayCodesByCampaign.get(row.id) ?? [],
    })),
  };
}
