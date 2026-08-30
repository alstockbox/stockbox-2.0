import type Stripe from "stripe";
import { z } from "zod";
import { captureServerEvent } from "@/lib/analytics/events";
import { getAffiliateCheckoutDiscount } from "@/lib/affiliate/discount";
import { requireUser } from "@/lib/auth/session";
import { findPlan, isPlanPurchasable } from "@/lib/billing/plans";
import {
  getBillingReadiness,
  reportBillingReadiness,
  SUBSCRIPTIONS_UNAVAILABLE_MESSAGE
} from "@/lib/billing/readiness";
import { getSafeStripeErrorDiagnostic, getStripe } from "@/lib/billing/stripe";
import {
  getUserSubscription,
  isCurrentPaidSubscription,
  reusableStripeCustomerId
} from "@/lib/billing/subscriptions";
import { getServerEnv } from "@/lib/env/server";

const schema = z.object({
  plan: z.enum(["basic", "standard", "premium", "elite"]),
  locale: z.enum(["en", "sv"]).default("en")
});

export async function POST(request: Request) {
  const user = await requireUser();
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid plan." }, { status: 422 });

  const plan = findPlan(body.data.plan);
  if (!plan || !isPlanPurchasable(plan)) {
    return Response.json(
      { error: "This plan is not commercially available." },
      { status: 409 }
    );
  }

  const readiness = getBillingReadiness();
  if (!readiness.supabaseConfigured) {
    reportBillingReadiness(readiness);
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }

  const subscriptionLookup = await getUserSubscription(user.id);
  if (!subscriptionLookup.ok) {
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }

  if (isCurrentPaidSubscription(subscriptionLookup.subscription)) {
    return Response.json(
      {
        error: "A paid subscription is already active for this account.",
        redirectUrl: "/settings/billing"
      },
      { status: 409 }
    );
  }

  if (!readiness.checkoutReady) {
    reportBillingReadiness(readiness);
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  const env = getServerEnv();
  const priceId = plan.stripeEnv ? env[plan.stripeEnv] : null;
  const launchOfferAlreadyRedeemed = Boolean(
    subscriptionLookup.subscription?.launchOfferRedeemedAt ||
    subscriptionLookup.subscription?.launchOfferRedeemedPlans?.length
  );
  const launchOfferAvailable = Boolean(plan.launchOffer && !launchOfferAlreadyRedeemed);
  const affiliateDiscount = await getAffiliateCheckoutDiscount(user.id);
  const launchCouponId = launchOfferAvailable && plan.launchOffer
    ? env[plan.launchOffer.stripeCouponEnv]
    : null;
  const affiliateCouponId = !launchOfferAvailable && affiliateDiscount.eligible
    ? env.STRIPE_COUPON_AFFILIATE_10
    : null;
  const couponId = launchCouponId ?? affiliateCouponId ?? null;

  if (
    !stripe ||
    !priceId ||
    (launchOfferAvailable && !launchCouponId) ||
    (!launchOfferAvailable && affiliateDiscount.eligible && !affiliateCouponId)
  ) {
    reportBillingReadiness(getBillingReadiness(env));
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }

  const stripeCustomerId = reusableStripeCustomerId(subscriptionLookup.subscription);
  const offer = launchOfferAvailable && plan.launchOffer
    ? `${plan.key}_launch_${plan.launchOffer.durationMonths}_months`
    : affiliateCouponId
      ? "affiliate_10"
      : "none";
  const regularMonthlyPriceSek = plan.monthlyPriceSek ?? 0;
  const affiliateMonthlyPriceSek = (regularMonthlyPriceSek * 0.9).toFixed(2);
  const affiliateMonthlyPriceSv = affiliateMonthlyPriceSek.replace(".", ",");
  const checkoutDisclosure = launchOfferAvailable && plan.launchOffer
    ? body.data.locale === "sv"
      ? `Du startar ett m\u00e5nadsabonnemang. Introduktionspris ${plan.launchOffer.monthlyPriceSek} kr/m\u00e5n i ${plan.launchOffer.durationMonths} m\u00e5nader, d\u00e4refter ${plan.launchOffer.thenMonthlyPriceSek} kr/m\u00e5n tills du avslutar. Genom att klicka Prenumerera blir du betalningsskyldig.`
      : `You are starting a monthly subscription. Introductory price SEK ${plan.launchOffer.monthlyPriceSek}/month for ${plan.launchOffer.durationMonths} months, then SEK ${plan.launchOffer.thenMonthlyPriceSek}/month until cancelled. By clicking Subscribe you incur a payment obligation.`
    : affiliateCouponId
      ? body.data.locale === "sv"
        ? `Du startar ett m\u00e5nadsabonnemang. Affiliatepris ${affiliateMonthlyPriceSv} kr/m\u00e5n (10 % rabatt p\u00e5 ordinarie ${regularMonthlyPriceSek} kr/m\u00e5n) tills du avslutar. Genom att klicka Prenumerera blir du betalningsskyldig.`
        : `You are starting a monthly subscription. Affiliate price SEK ${affiliateMonthlyPriceSek}/month (10% off the regular SEK ${regularMonthlyPriceSek}/month) until cancelled. By clicking Subscribe you incur a payment obligation.`
      : body.data.locale === "sv"
        ? `Du startar ett m\u00e5nadsabonnemang f\u00f6r ${regularMonthlyPriceSek} kr/m\u00e5n tills du avslutar. Genom att klicka Prenumerera blir du betalningsskyldig.`
        : `You are starting a monthly subscription at SEK ${regularMonthlyPriceSek}/month until cancelled. By clicking Subscribe you incur a payment obligation.`;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    locale: body.data.locale,
    submit_type: "subscribe",
    custom_text: { submit: { message: checkoutDisclosure } },
    ...(env.LEGAL_VAT_MODE === "vat_registered"
      ? { automatic_tax: { enabled: true } }
      : {}),
    success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing?checkout=cancelled`,
    ...(stripeCustomerId
      ? { customer: stripeCustomerId }
      : { customer_email: user.email ?? undefined }),
    client_reference_id: user.id,
    discounts: couponId ? [{ coupon: couponId }] : undefined,
    metadata: {
      userId: user.id,
      plan: plan.key,
      offer
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        plan: plan.key,
        offer
      }
    }
  };

  try {
    const session = await stripe.checkout.sessions.create(params);
    captureServerEvent("checkout_started", { userId: user.id, plan: plan.key });

    return Response.json({ url: session.url });
  } catch (error) {
    const diagnostic = getSafeStripeErrorDiagnostic(error);
    const logMessage = diagnostic.restrictedKeyPermissionError
      ? "[billing] Stripe Checkout restricted-key permission denied. Grant the permission identified by the Stripe error code or parameter."
      : "[billing] Stripe Checkout Session creation failed.";

    console.error(logMessage, diagnostic);
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }
}
