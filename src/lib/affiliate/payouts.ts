import { getSafeStripeErrorDiagnostic, getStripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export type AffiliatePayoutRunResult = {
  affiliateId: string;
  status: "paid" | "failed" | "reconciliation_required" | "below_minimum" | "not_enabled" | "duplicate" | "unavailable";
  payoutId?: string;
  amountCents?: number;
  transferId?: string;
  reason?: string;
};

type QueuedPayout = {
  ok: true;
  payoutId: string;
  amountCents: number;
  connectAccountId: string;
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function affiliatePayoutKey(affiliateId: string, date = new Date()) {
  return `affiliate-payout:${affiliateId}:${dateKey(date)}`;
}

export function isPayoutCronAuthorized(authorization: string | null, secret: string | null | undefined) {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}

function parseQueuedPayout(value: unknown): QueuedPayout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    data.ok !== true ||
    typeof data.payoutId !== "string" ||
    typeof data.amountCents !== "number" ||
    !Number.isInteger(data.amountCents) ||
    data.amountCents <= 0 ||
    typeof data.connectAccountId !== "string" ||
    !data.connectAccountId.startsWith("acct_")
  ) return null;

  return {
    ok: true,
    payoutId: data.payoutId,
    amountCents: data.amountCents,
    connectAccountId: data.connectAccountId,
  };
}

function queueFailure(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unavailable" as const;
  const reason = (value as Record<string, unknown>).reason;
  if (reason === "below_minimum" || reason === "not_enabled" || reason === "duplicate") return reason;
  return "unavailable" as const;
}

export async function runAffiliatePayout(
  affiliateId: string,
  now = new Date()
): Promise<AffiliatePayoutRunResult> {
  const supabase = createAdminClient();
  if (!supabase) return { affiliateId, status: "unavailable", reason: "Database admin access unavailable." };
  const idempotencyKey = affiliatePayoutKey(affiliateId, now);
  const { data, error } = await supabase.rpc("queue_affiliate_payout", {
    p_affiliate_id: affiliateId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    return { affiliateId, status: "unavailable", reason: "Payout queue failed." };
  }

  const queued = parseQueuedPayout(data);
  if (!queued) {
    const status = queueFailure(data);
    return {
      affiliateId,
      status,
      amountCents: data && typeof data === "object" && !Array.isArray(data)
        && typeof (data as Record<string, unknown>).amountCents === "number"
        ? (data as Record<string, number>).amountCents
        : undefined,
    };
  }

  const stripe = getStripe();
  if (!stripe) {
    await supabase.rpc("fail_affiliate_payout", {
      p_payout_id: queued.payoutId,
      p_reason: "Stripe is unavailable.",
    });
    return { affiliateId, status: "failed", payoutId: queued.payoutId, amountCents: queued.amountCents, reason: "Stripe is unavailable." };
  }
  let transferId: string;
  try {
    const transfer = await stripe.transfers.create({
      amount: queued.amountCents,
      currency: "sek",
      destination: queued.connectAccountId,
      metadata: {
        stockboxAffiliateId: affiliateId,
        stockboxPayoutId: queued.payoutId,
      },
    }, { idempotencyKey });
    transferId = transfer.id;
  } catch (cause) {
    const diagnostic = getSafeStripeErrorDiagnostic(cause);
    await supabase.rpc("fail_affiliate_payout", {
      p_payout_id: queued.payoutId,
      p_reason: diagnostic.message,
    });
    return {
      affiliateId,
      status: "failed",
      payoutId: queued.payoutId,
      amountCents: queued.amountCents,
      reason: diagnostic.message,
    };
  }

  const completion = await supabase.rpc("complete_affiliate_payout", {
    p_payout_id: queued.payoutId,
    p_stripe_transfer_id: transferId,
  });

  if (completion.error) {
    return {
      affiliateId,
      status: "reconciliation_required",
      payoutId: queued.payoutId,
      amountCents: queued.amountCents,
      transferId,
      reason: "Stripe transfer succeeded but payout completion must be reconciled.",
    };
  }

  return {
    affiliateId,
    status: "paid",
    payoutId: queued.payoutId,
    amountCents: queued.amountCents,
    transferId,
  };
}

export async function runScheduledAffiliatePayouts(now = new Date()) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, results: [] as AffiliatePayoutRunResult[] };

  const { data, error } = await supabase.from("affiliates")
    .select("id")
    .eq("status", "active")
    .eq("payout_enabled", true)
    .not("stripe_connect_account_id", "is", null)
    .limit(200);

  if (error) return { ok: false as const, results: [] as AffiliatePayoutRunResult[] };

  const results: AffiliatePayoutRunResult[] = [];
  for (const affiliate of data ?? []) {
    results.push(await runAffiliatePayout(affiliate.id, now));
  }
  return { ok: true as const, results };
}
