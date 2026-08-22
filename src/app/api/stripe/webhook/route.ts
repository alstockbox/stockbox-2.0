import Stripe from "stripe";
import { captureServerEvent } from "@/lib/analytics/events";
import { getPlanByStripePrice } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

function sanitizeSupabaseErrorMessage(message: string) {
  return message
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b/g, "[redacted]")
    .replace(/\bwhsec_[A-Za-z0-9_]+\b/g, "[redacted]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\b\d{12,19}\b/g, "[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

type SubscriptionEventType =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

async function syncSubscription(
  subscription: Stripe.Subscription,
  eventType: SubscriptionEventType
) {
  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id;
  const plan = getPlanByStripePrice(priceId);
  const userId = subscription.metadata.userId;

  if (!userId) {
    console.error("[billing] Stripe subscription is missing metadata.userId.", {
      subscriptionId: subscription.id,
      userId: null
    });
    throw new Error("Stripe subscription is missing its StockBox user ID.");
  }

  if (!plan) {
    console.error("[billing] Stripe subscription price does not map to a StockBox plan.", {
      subscriptionId: subscription.id,
      userId,
      stripePriceId: priceId ?? null
    });
    throw new Error("Stripe subscription price is unknown.");
  }

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("[billing] Supabase admin client is unavailable for subscription sync.", {
      subscriptionId: subscription.id,
      userId
    });
    throw new Error("Supabase admin client is unavailable.");
  }

  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
        stripe_price_id: priceId,
        plan_key: plan.key,
        status:
          eventType === "customer.subscription.deleted"
            ? "canceled"
            : subscription.status,
        current_period_end: firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[billing] Supabase subscription sync failed.", {
      subscriptionId: subscription.id,
      userId,
      supabaseErrorCode: error.code,
      supabaseErrorMessage: sanitizeSupabaseErrorMessage(error.message)
    });
    throw new Error("Supabase subscription sync failed.");
  }
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
      try {
        await syncSubscription(event.data.object as Stripe.Subscription, event.type);
      } catch {
        return Response.json(
          { error: "Webhook processing failed." },
          { status: 500 }
        );
      }
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
