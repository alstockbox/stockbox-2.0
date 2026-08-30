import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withdrawalReceiptText } from "@/lib/legal/withdrawal";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

function receiptTokenHash(token: string) {
  return createHash("sha256").update(token.trim().toLowerCase()).digest("hex");
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  if (!admin) return new NextResponse("Service unavailable", { status: 503 });

  const { data } = await admin.from("withdrawal_requests")
    .select("id,stripe_subscription_id,plan_key,status,submitted_at,consumer_name,contract_reference,confirmation_email,receipt_token_hash")
    .eq("id", id)
    .eq("receipt_token_hash", receiptTokenHash(token))
    .maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });
  const body = withdrawalReceiptText({
    id: data.id,
    submittedAt: data.submitted_at,
    consumerName: data.consumer_name,
    confirmationEmail: data.confirmation_email,
    contractReference: data.contract_reference,
    stripeSubscriptionId: data.stripe_subscription_id,
    planKey: data.plan_key,
    status: data.status,
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="stockbox-withdrawal-${data.id}.txt"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}
