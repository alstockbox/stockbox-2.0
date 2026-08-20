import Stripe from "stripe";
import { z } from "zod";
import { captureServerEvent } from "@/lib/analytics/events";
import { requireUser } from "@/lib/auth/session";
import { plans, type PlanKey } from "@/lib/billing/plans";
import { getStripe, randomIntegrationIdentifier } from "@/lib/billing/stripe";
import { getServerEnv } from "@/lib/env/server";

const schema = z.object({
  plan: z.enum(["basic", "standard", "premium", "elite"])
});

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid plan." }, { status: 422 });

  const user = await requireUser();
  const env = getServerEnv();
  const plan = plans.find((candidate) => candidate.key === (body.data.plan as PlanKey));
  const priceId = plan?.stripeEnv ? env[plan.stripeEnv] : null;

  if (!plan || !priceId) {
    return Response.json({ error: "Stripe price ID is missing for this plan." }, { status: 503 });
  }

  const params: Stripe.Checkout.SessionCreateParams & { integration_identifier: string } = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing?checkout=cancelled`,
    customer_email: user.email ?? undefined,
    client_reference_id: user.id,
    allow_promotion_codes: true,
    metadata: {
      userId: user.id,
      plan: plan.key
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        plan: plan.key
      }
    },
    integration_identifier: randomIntegrationIdentifier()
  };

  const session = await stripe.checkout.sessions.create(params);
  captureServerEvent("checkout_started", { userId: user.id, plan: plan.key });

  return Response.json({ url: session.url });
}
