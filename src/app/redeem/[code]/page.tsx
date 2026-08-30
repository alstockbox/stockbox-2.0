import Link from "next/link";
import { Gift, ShieldCheck } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redeemGiveawayRouteAction } from "./actions";

export const metadata = { title: "Redeem giveaway" };

type RedeemPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ status?: string }>;
};

const codePattern = /^SBG-[A-Z0-9-]{6,64}$/;
const planName = (key: string) => key === "premium"
  ? "Pro"
  : key.charAt(0).toUpperCase() + key.slice(1);

export default async function RedeemPage({ params, searchParams }: RedeemPageProps) {
  const [{ code: rawCode }, query, user] = await Promise.all([
    params,
    searchParams,
    getCurrentUser(),
  ]);
  const code = decodeURIComponent(rawCode).trim().toUpperCase();
  const supabase = createAdminClient();
  let campaign: { plan_key: string; duration_months: number; claim_expires_at: string | null; status: string } | null = null;
  let codeStatus: string | null = null;

  if (supabase && codePattern.test(code)) {
    const { data: codeRow } = await supabase
      .from("affiliate_giveaway_codes")
      .select("campaign_id,status")
      .eq("code", code)
      .maybeSingle();
    codeStatus = codeRow?.status ?? null;
    if (codeRow?.campaign_id) {
      const { data } = await supabase
        .from("affiliate_giveaway_campaigns")
        .select("plan_key,duration_months,claim_expires_at,status")
        .eq("id", codeRow.campaign_id)
        .maybeSingle();
      campaign = data ?? null;
    }
  }

  const redeemable = Boolean(
    campaign && campaign.status === "active" && codeStatus === "available"
  );
  const returnPath = `/redeem/${encodeURIComponent(code)}`;
  const statusCopy = query.status === "success"
    ? "Your StockBox giveaway access is active."
    : query.status === "unavailable"
      ? "Giveaway redemption is temporarily unavailable."
      : query.status === "invalid"
        ? "This code could not be redeemed. It may already be used, expired or revoked."
        : null;

  return (
    <Section>
      <Container className="max-w-2xl">
        <Card className="border-[#e1cb95]/25 bg-[#0d1c2e]/90 p-7 sm:p-9">
          <Gift className="h-8 w-8 text-[#e1cb95]" aria-hidden="true" />
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">StockBox Giveaway</p>
          {campaign ? (
            <>
              <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">
                You won {campaign.duration_months} months of StockBox {planName(campaign.plan_key)}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">
                Redeeming this code activates temporary plan access without creating a subscription or charging a payment method.
              </p>
            </>
          ) : (
            <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Giveaway code</h1>
          )}

          {statusCopy ? <p role="status" className="mt-5 rounded-md border border-white/10 bg-[#07111f] p-3 text-sm text-[#d6deea]">{statusCopy}</p> : null}

          {query.status !== "success" && redeemable ? user ? (
            <form action={redeemGiveawayRouteAction} className="mt-6">
              <input type="hidden" name="code" value={code} />
              <button type="submit" className="w-full rounded-md bg-[#e1cb95] px-4 py-3 text-sm font-semibold text-[#08111d] hover:brightness-105">
                Redeem {planName(campaign!.plan_key)} access
              </button>
            </form>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link href={`/auth/login?next=${encodeURIComponent(returnPath)}`} className="rounded-md bg-[#e1cb95] px-4 py-3 text-center text-sm font-semibold text-[#08111d]">Log in to redeem</Link>
              <Link href={`/auth/signup?next=${encodeURIComponent(returnPath)}`} className="rounded-md border border-[#e1cb95]/35 px-4 py-3 text-center text-sm font-semibold text-[#f4e5b8]">Create account</Link>
            </div>
          ) : null}

          {query.status !== "success" && !redeemable ? (
            <p className="mt-6 rounded-md border border-red-300/15 bg-red-950/20 p-3 text-sm text-red-100">
              This giveaway code is unavailable, expired, revoked or already redeemed.
            </p>
          ) : null}
          <div className="mt-6 flex items-center gap-2 text-xs text-[#7f8b9b]"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Codes are single-use and redeemed securely.</div>
        </Card>
      </Container>
    </Section>
  );
}
