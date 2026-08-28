import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { withdrawalReceiptText } from "@/lib/legal/withdrawal";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const [{ id }, user, supabase] = await Promise.all([params, getCurrentUser(), createClient()]);
  if (!user || !supabase) return new NextResponse("Unauthorized", { status: 401 });

  const { data } = await supabase
    .from("withdrawal_requests")
    .select("id,stripe_subscription_id,plan_key,status,submitted_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });

  const body = withdrawalReceiptText({
    id: data.id,
    submittedAt: data.submitted_at,
    stripeSubscriptionId: data.stripe_subscription_id,
    planKey: data.plan_key,
    status: data.status,
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="stockbox-withdrawal-${data.id}.txt"`,
      "Cache-Control": "private, no-store",
    },
  });
}
