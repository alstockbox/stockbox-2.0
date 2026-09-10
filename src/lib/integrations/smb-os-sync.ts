import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  reportStockBoxEvent,
  stockBoxAnalysisCompletedEvent,
  stockBoxPaidInvoiceEvent,
  stockBoxSignupEvent,
  type StockBoxModuleEvent,
} from "@/lib/integrations/smb-os";

type SyncResult = {
  configured: boolean;
  candidates: number;
  delivered: number;
  duplicates: number;
  failed: number;
  skipped: number;
  sources: {
    signups: number;
    analyses: number;
    paidInvoices: number;
  };
};

const MAX_SOURCE_ROWS = 500;
const DEFAULT_LOOKBACK_HOURS = 48;
const DELIVERY_CONCURRENCY = 12;

function isConfigured() {
  return Boolean(process.env.SMB_OS_CORE_URL?.trim() && process.env.SMB_OS_INGEST_KEY?.trim());
}

async function paidInvoiceEventsSince(sinceSeconds: number) {
  const stripe = getStripe();
  if (!stripe) return [] as Stripe.Event[];

  const events: Stripe.Event[] = [];
  let startingAfter: string | undefined;
  while (events.length < MAX_SOURCE_ROWS) {
    const page = await stripe.events.list({
      type: "invoice.paid",
      created: { gte: sinceSeconds },
      limit: Math.min(100, MAX_SOURCE_ROWS - events.length),
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    events.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return events;
}

async function deliver(events: StockBoxModuleEvent[]) {
  let delivered = 0;
  let duplicates = 0;
  let failed = 0;

  for (let index = 0; index < events.length; index += DELIVERY_CONCURRENCY) {
    const chunk = events.slice(index, index + DELIVERY_CONCURRENCY);
    const results = await Promise.all(chunk.map((event) => reportStockBoxEvent(event)));
    for (const result of results) {
      if (result.status === "delivered") {
        delivered += 1;
        if (result.duplicate) duplicates += 1;
      } else if (result.status === "failed") {
        failed += 1;
      }
    }
  }

  return { delivered, duplicates, failed };
}

export async function runSmbOsSync(options?: { lookbackHours?: number }): Promise<SyncResult> {
  if (!isConfigured()) {
    return {
      configured: false,
      candidates: 0,
      delivered: 0,
      duplicates: 0,
      failed: 0,
      skipped: 0,
      sources: { signups: 0, analyses: 0, paidInvoices: 0 },
    };
  }

  const lookbackHours = Math.min(168, Math.max(1, Math.floor(options?.lookbackHours ?? DEFAULT_LOOKBACK_HOURS)));
  const sinceMs = Date.now() - lookbackHours * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();
  const sinceSeconds = Math.floor(sinceMs / 1000);
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Supabase admin client is unavailable for SMB OS sync.");

  const [signupQuery, analysisQuery, stripeEvents] = await Promise.all([
    supabase
      .from("acq_events")
      .select("idempotency_key")
      .eq("event_name", "signup_completed")
      .eq("is_bot", false)
      .eq("is_internal", false)
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: true })
      .limit(MAX_SOURCE_ROWS),
    supabase
      .from("analyses")
      .select("id,ticker,analysis_type,score")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(MAX_SOURCE_ROWS),
    paidInvoiceEventsSince(sinceSeconds),
  ]);

  if (signupQuery.error) throw new Error("Signup source query failed for SMB OS sync.");
  if (analysisQuery.error) throw new Error("Analysis source query failed for SMB OS sync.");

  const events: StockBoxModuleEvent[] = [];
  for (const row of signupQuery.data ?? []) {
    if (typeof row.idempotency_key === "string" && row.idempotency_key) {
      events.push(stockBoxSignupEvent(row.idempotency_key));
    }
  }
  for (const row of analysisQuery.data ?? []) {
    if (typeof row.id === "string" && typeof row.ticker === "string" && typeof row.analysis_type === "string") {
      events.push(stockBoxAnalysisCompletedEvent({
        analysisId: row.id,
        ticker: row.ticker,
        analysisType: row.analysis_type,
        score: Number(row.score ?? 0),
      }));
    }
  }

  const env = getServerEnv();
  let skipped = 0;
  for (const stripeEvent of stripeEvents) {
    const invoice = stripeEvent.data.object as Stripe.Invoice;
    const mapped = stockBoxPaidInvoiceEvent({
      stripeEventId: stripeEvent.id,
      invoiceId: invoice.id,
      amountPaidCents: invoice.amount_paid,
      currency: invoice.currency,
      vatMode: env.LEGAL_VAT_MODE,
      billingReason: invoice.billing_reason,
    });
    if (mapped) events.push(mapped);
    else skipped += 1;
  }

  const delivery = await deliver(events);
  return {
    configured: true,
    candidates: events.length,
    ...delivery,
    skipped,
    sources: {
      signups: signupQuery.data?.length ?? 0,
      analyses: analysisQuery.data?.length ?? 0,
      paidInvoices: stripeEvents.length,
    },
  };
}
