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
function stripeId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function invoicePaymentIntentId(invoice: Stripe.Invoice) {
  const paidPayment = invoice.payments?.data.find((payment) =>
    payment.status === "paid" && payment.payment.type === "payment_intent"
  );
  return stripeId(paidPayment?.payment.payment_intent ?? null);
}

function invoiceSubscriptionDetails(invoice: Stripe.Invoice) {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const userId = details.metadata?.userId;
  return {
    userId: typeof userId === "string" && userId.length > 0 ? userId : null,
    subscriptionId: stripeId(details.subscription),
  };
}

async function requireAdminClient(context: string, metadata?: Record<string, unknown>) {
  const supabase = createAdminClient();
  if (!supabase) {
    if (metadata) console.error(`[billing] Supabase admin client is unavailable for ${context}.`, metadata);
    else console.error(`[billing] Supabase admin client is unavailable for ${context}.`);
    throw new Error("Supabase admin client is unavailable.");
  }
  return supabase;
}
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
  const supabase = await requireAdminClient("subscription sync", {
    subscriptionId: subscription.id,
    userId,
  });
  const stripeCustomerId = stripeId(subscription.customer);
  if (!stripeCustomerId) throw new Error("Stripe subscription customer is missing.");

  const status = eventType === "customer.subscription.deleted"
    ? "canceled"
    : subscription.status;
  const currentPeriodEnd = firstItem?.current_period_end
    ? new Date(firstItem.current_period_end * 1000).toISOString()
    : null;

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
    p_current_period_end: currentPeriodEnd
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

async function recordAffiliateCommission(invoice: Stripe.Invoice, eventId: string) {
  const details = invoiceSubscriptionDetails(invoice);
  if (!details?.userId || invoice.amount_paid <= 0) return;

  const supabase = await requireAdminClient("affiliate commission creation");
  const { error } = await supabase.rpc("record_affiliate_commission", {
    p_referred_user_id: details.userId,
    p_source_event_id: eventId,
    p_stripe_invoice_id: invoice.id,
    p_stripe_subscription_id: details.subscriptionId,
    p_stripe_payment_intent_id: invoicePaymentIntentId(invoice),
    p_gross_amount_cents: invoice.amount_paid,
    p_currency: invoice.currency.toLowerCase(),
  });
  if (error) {
    console.error("[affiliate] Commission creation failed.", {
      invoiceId: invoice.id,
      userId: details.userId,
      supabaseErrorCode: error.code,
      supabaseErrorMessage: sanitizeSupabaseErrorMessage(error.message),
    });
    throw new Error("Affiliate commission creation failed.");
  }
}

async function reverseAffiliateCommission(paymentIntentId: string | null, reason: "refund" | "chargeback") {
  if (!paymentIntentId) return;
  const supabase = await requireAdminClient("affiliate commission reversal");
  const { error } = await supabase.rpc("reverse_affiliate_commission", {
    p_payment_intent_id: paymentIntentId,
    p_reason: reason,
  });
  if (error) {
    console.error("[affiliate] Commission reversal failed.", {
      paymentIntentId,
      reason,
      supabaseErrorCode: error.code,
      supabaseErrorMessage: sanitizeSupabaseErrorMessage(error.message),
    });
    throw new Error("Affiliate commission reversal failed.");
  }
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
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const syncResult = await syncSubscription(subscription, event.id, event.created, event.type);
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
      case "invoice.paid": {
        await recordAffiliateCommission(event.data.object as Stripe.Invoice, event.id);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        await reverseAffiliateCommission(stripeId(charge.payment_intent), "refund");
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        await reverseAffiliateCommission(stripeId(dispute.payment_intent), "chargeback");
        break;
      }
      default:
        break;
    }
  } catch {
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return Response.json({ received: true });
}
