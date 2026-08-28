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

type SyncResult = { applied: boolean; reason: string | null };

async function syncSubscription(
  subscription: Stripe.Subscription,
  eventId: string,
  eventCreated: number,
  eventType: SubscriptionEventType
): Promise<SyncResult> {
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

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const status =
    eventType === "customer.subscription.deleted"
      ? "canceled"
      : subscription.status;
  const currentPeriodEnd = firstItem?.current_period_end
    ? new Date(firstItem.current_period_end * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
  const cancelAt = subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000).toISOString()
    : null;
  const launchOfferRedeemed = subscription.metadata.offer === "basic_launch_3_months";

  const { data, error } = await supabase.rpc("sync_subscription_from_stripe", {
    p_user_id: userId,
    p_event_id: eventId,
    p_event_created: eventCreated,
    p_event_type: eventType,
    p_stripe_subscription_id: subscription.id,
    p_subscription_created: subscription.created,
    p_stripe_customer_id: stripeCustomerId,
    p_stripe_price_id: priceId ?? null,
    p_plan_key: plan.key,
    p_status: status,
    p_current_period_end: currentPeriodEnd,
    p_cancel_at_period_end: cancelAtPeriodEnd,
    p_cancel_at: cancelAt,
    p_launch_offer_redeemed: launchOfferRedeemed
  });

  if (error) {
    console.error("[billing] Supabase subscription sync failed.", {
      subscriptionId: subscription.id,
      userId,
      supabaseErrorCode: error.code,
      supabaseErrorMessage: sanitizeSupabaseErrorMessage(error.message)
    });
    throw new Error("Supabase subscription sync failed.");
  }

  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return {
    applied: payload.applied !== false,
    reason: typeof payload.reason === "string" ? payload.reason : null
  };
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const env = getServerEnv();

  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      let syncResult: SyncResult;
      try {
        syncResult = await syncSubscription(
          subscription,
          event.id,
          event.created,
          event.type
        );
      } catch {
        return Response.json(
          { error: "Webhook processing failed." },
          { status: 500 }
        );
      }

      if (syncResult.applied) {
        captureServerEvent(
          event.type === "customer.subscription.deleted"
            ? "subscription_cancelled"
            : "subscription_started",
          { subscriptionId: subscription.id }
        );
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
