import { requireUser } from "@/lib/auth/session";
import { getStripe } from "@/lib/billing/stripe";
import { getUserSubscription } from "@/lib/billing/subscriptions";
import { getServerEnv } from "@/lib/env/server";

export async function POST() {
  const user = await requireUser();
  const stripe = getStripe();
  const subscriptionLookup = await getUserSubscription(user.id);

  if (!stripe || !subscriptionLookup.ok) {
    return Response.json(
      { error: "Billing management is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }

  const stripeCustomerId = subscriptionLookup.subscription?.stripeCustomerId;
  if (!stripeCustomerId) {
    return Response.json(
      { error: "No subscription billing profile is available for this account." },
      { status: 404 }
    );
  }

  const env = getServerEnv();
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/settings/billing`
    });

    return Response.json({ url: portal.url });
  } catch (error) {
    console.error("[billing] Stripe Customer Portal Session creation failed.", {
      errorType: error instanceof Error ? error.name : "unknown"
    });
    return Response.json(
      { error: "Billing management is temporarily unavailable. Please try again shortly." },
      { status: 503 }
    );
  }
}
