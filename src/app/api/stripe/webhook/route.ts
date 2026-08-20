import Stripe from "stripe";
import { captureServerEvent } from "@/lib/analytics/events";
import { getPlanByStripePrice } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function syncSubscription(subscription: Stripe.Subscription) {
  const supabase = createAdminClient();
  if (!supabase) return;

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id;
  const plan = getPlanByStripePrice(priceId);
  const userId = subscription.metadata.userId;

  if (!userId || !plan) return;

  await supabase.from("subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripe_price_id: priceId,
    plan_key: plan.key,
    status: subscription.status,
    current_period_end: firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString()
  });
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const env = getServerEnv();

  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      captureServerEvent(
        event.type === "customer.subscription.deleted"
          ? "subscription_cancelled"
          : "subscription_started",
        { subscriptionId: (event.data.object as Stripe.Subscription).id }
      );
      break;
    default:
      break;
  }

  return Response.json({ received: true });
}
