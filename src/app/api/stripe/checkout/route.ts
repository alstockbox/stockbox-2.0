import Stripe from "stripe";
import { z } from "zod";
import { captureServerEvent } from "@/lib/analytics/events";
import { requireUser } from "@/lib/auth/session";
import { findPlan, isPlanPurchasable } from "@/lib/billing/plans";
import {
  getBillingReadiness,
  reportBillingReadiness,
  SUBSCRIPTIONS_UNAVAILABLE_MESSAGE
} from "@/lib/billing/readiness";
import { getStripe, randomIntegrationIdentifier } from "@/lib/billing/stripe";
import {
  getUserSubscription,
  isCurrentBasicSubscription
} from "@/lib/billing/subscriptions";
import { getServerEnv } from "@/lib/env/server";

const schema = z.object({
  plan: z.enum(["basic", "standard", "premium", "elite"])
});

export async function POST(request: Request) {
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

  const user = await requireUser();
  const subscriptionLookup = await getUserSubscription(user.id);
  if (!subscriptionLookup.ok) {
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }

  if (isCurrentBasicSubscription(subscriptionLookup.subscription)) {
    return Response.json(
      {
        error: "Basic is already active for this account.",
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
  const couponId = plan.launchOffer ? env[plan.launchOffer.stripeCouponEnv] : null;

  if (!stripe || !priceId || (plan.launchOffer && !couponId)) {
    reportBillingReadiness(getBillingReadiness(env));
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }

  const stripeCustomerId = subscriptionLookup.subscription?.stripeCustomerId ?? null;

  const params: Stripe.Checkout.SessionCreateParams & { integration_identifier: string } = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing?checkout=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing?checkout=cancelled`,
    customer: stripeCustomerId ?? undefined,
    customer_email: stripeCustomerId ? undefined : user.email ?? undefined,
    client_reference_id: user.id,
    discounts: couponId ? [{ coupon: couponId }] : undefined,
    metadata: {
      userId: user.id,
      plan: plan.key,
      offer: plan.launchOffer ? "basic_launch_3_months" : "none"
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        plan: plan.key
      }
    },
    integration_identifier: randomIntegrationIdentifier()
  };

  try {
    const session = await stripe.checkout.sessions.create(params);
    captureServerEvent("checkout_started", { userId: user.id, plan: plan.key });

    return Response.json({ url: session.url });
  } catch (error) {
    console.error("[billing] Stripe Checkout Session creation failed.", {
      errorType: error instanceof Error ? error.name : "unknown"
    });
    return Response.json(
      { error: SUBSCRIPTIONS_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }
}
