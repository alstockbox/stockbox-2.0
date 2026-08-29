import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { buildAffiliateConnectAccountParams, isAffiliateConnectReady } from "@/lib/affiliate/connect";
import { requireUser } from "@/lib/auth/session";
import { getSafeStripeErrorDiagnostic, getStripe } from "@/lib/billing/stripe";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAmbassadorContext() {
  const user = await requireUser();
  if (user.role !== "affiliate_ambassador") return null;

  const supabase = createAdminClient();
  const stripe = getStripe();
  if (!supabase || !stripe) return null;

  const { data: affiliate } = await supabase.from("affiliates")
    .select("id,user_id,status,stripe_connect_account_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!affiliate) return null;

  return { user, affiliate, supabase, stripe };
}

async function persistAccountState(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  affiliateId: string,
  account: Stripe.Account
) {
  const payoutEnabled = isAffiliateConnectReady(account);
  const { error } = await supabase.from("affiliates").update({
    stripe_connect_account_id: account.id,
    payout_enabled: payoutEnabled,
    updated_at: new Date().toISOString(),
  }).eq("id", affiliateId);
  if (error) throw new Error("Affiliate payout account state could not be saved.");
  return payoutEnabled;
}

async function accountLink(accountId: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is unavailable.");
  const appUrl = getServerEnv().NEXT_PUBLIC_APP_URL;
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/api/affiliate/connect?mode=refresh`,
    return_url: `${appUrl}/api/affiliate/connect?mode=return`,
    type: "account_onboarding",
  });
}

export async function POST() {
  const context = await requireAmbassadorContext();
  if (!context) return Response.json({ error: "Affiliate payout setup is unavailable." }, { status: 403 });

  const { user, affiliate, supabase, stripe } = context;
  try {
    let account: Stripe.Account;
    if (affiliate.stripe_connect_account_id) {
      account = await stripe.accounts.retrieve(affiliate.stripe_connect_account_id);
    } else {
      account = await stripe.accounts.create(buildAffiliateConnectAccountParams({
        userId: user.id,
        affiliateId: affiliate.id,
        email: user.email,
      }));
    }

    await persistAccountState(supabase, affiliate.id, account);
    const link = await accountLink(account.id);
    return Response.json({ url: link.url });
  } catch (cause) {
    const diagnostic = getSafeStripeErrorDiagnostic(cause);
    console.error("[affiliate] Stripe Connect onboarding failed.", diagnostic);
    return Response.json({ error: "Payout setup could not be opened." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const context = await requireAmbassadorContext();
  const appUrl = getServerEnv().NEXT_PUBLIC_APP_URL;
  if (!context) return NextResponse.redirect(`${appUrl}/affiliate?connect=unavailable`);

  const mode = new URL(request.url).searchParams.get("mode");
  const { affiliate, supabase, stripe } = context;
  if (!affiliate.stripe_connect_account_id) {
    return NextResponse.redirect(`${appUrl}/affiliate?connect=missing`);
  }

  try {
    const account = await stripe.accounts.retrieve(affiliate.stripe_connect_account_id);
    const ready = await persistAccountState(supabase, affiliate.id, account);

    if (mode === "refresh" && !ready) {
      const link = await accountLink(account.id);
      return NextResponse.redirect(link.url);
    }

    return NextResponse.redirect(
      `${appUrl}/affiliate?connect=${ready ? "ready" : "pending"}`
    );
  } catch (cause) {
    const diagnostic = getSafeStripeErrorDiagnostic(cause);
    console.error("[affiliate] Stripe Connect status refresh failed.", diagnostic);
    return NextResponse.redirect(`${appUrl}/affiliate?connect=error`);
  }
}
