import { requireUser } from "@/lib/auth/session";
import { getStripe } from "@/lib/billing/stripe";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const user = await requireUser();
  const stripe = getStripe();
  const supabase = createAdminClient();

  if (!stripe || !supabase) {
    return Response.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data?.stripe_customer_id) {
    return Response.json({ error: "No Stripe customer is attached to this account." }, { status: 404 });
  }

  const env = getServerEnv();
  const portal = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard`
  });

  return Response.json({ url: portal.url });
}
