import { createAdminClient } from "@/lib/supabase/admin";

export type AffiliateCheckoutDiscount = {
  eligible: boolean;
  percent: number;
};

const NONE: AffiliateCheckoutDiscount = { eligible: false, percent: 0 };

export async function getAffiliateCheckoutDiscount(userId: string): Promise<AffiliateCheckoutDiscount> {
  const supabase = createAdminClient();
  if (!supabase) return NONE;

  const { data: referral, error: referralError } = await supabase
    .from("referrals")
    .select("affiliate_id")
    .eq("referred_id", userId)
    .maybeSingle();
  if (referralError || !referral?.affiliate_id) return NONE;

  const { data: affiliate, error: affiliateError } = await supabase
    .from("affiliates")
    .select("status")
    .eq("id", referral.affiliate_id)
    .maybeSingle();
  if (affiliateError || affiliate?.status !== "active") return NONE;

  return { eligible: true, percent: 10 };
}