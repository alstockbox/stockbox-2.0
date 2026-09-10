import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportStockBoxEvent,
  stockBoxAnalysisCompletedEvent,
  stockBoxInvoicePaidOccurredAt,
  stockBoxPaidInvoiceEvent,
  stockBoxSignupEvent,
} from "@/lib/integrations/smb-os";

const occurredAt = "2026-09-10T10:15:30.000Z";

afterEach(() => {
  delete process.env.SMB_OS_CORE_URL;
  delete process.env.SMB_OS_INGEST_KEY;
  vi.restoreAllMocks();
});

describe("StockBox SMB OS adapter", () => {
  it("maps signup to an idempotent non-financial measurement with source time", () => {
    expect(stockBoxSignupEvent({ idempotencyKey: "evt:signup-1", occurredAt })).toEqual({
      projectId: "stockbox",
      module: "stockbox",
      eventId: "acquisition:evt:signup-1",
      occurredAt,
      type: "measurement",
      metricName: "signup_completed",
      metricValue: 1,
      unit: "count",
      metadata: {},
    });
  });

  it("uses persisted analysis id as the activation idempotency key and preserves source time", () => {
    const event = stockBoxAnalysisCompletedEvent({
      analysisId: "analysis-123",
      ticker: "VOLV-B",
      analysisType: "deep",
      score: 81,
      occurredAt,
    });
    expect(event.eventId).toBe("analysis:analysis-123:completed");
    expect(event.occurredAt).toBe(occurredAt);
    expect(event.type).toBe("measurement");
    expect(event.metadata).not.toHaveProperty("userId");
  });

  it("uses invoice paid_at as source time and falls back to Stripe event creation time", () => {
    expect(stockBoxInvoicePaidOccurredAt({
      paidAtSeconds: 1789035330,
      eventCreatedSeconds: 1789035600,
    })).toBe("2026-09-10T10:15:30.000Z");
    expect(stockBoxInvoicePaidOccurredAt({
      paidAtSeconds: null,
      eventCreatedSeconds: 1789035600,
    })).toBe("2026-09-10T10:20:00.000Z");
  });

  it("books positive SEK cash as revenue only when VAT exempt", () => {
    expect(stockBoxPaidInvoiceEvent({
      stripeEventId: "evt_paid_1",
      invoiceId: "in_1",
      amountPaidCents: 4900,
      currency: "sek",
      occurredAt,
      vatMode: "small_business_exempt",
      billingReason: "subscription_create",
    })).toMatchObject({
      eventId: "stripe:invoice:in_1:revenue",
      occurredAt,
      type: "economic",
      kind: "revenue",
      amountSek: 49,
    });
  });

  it("keeps gross paid cash out of revenue when VAT treatment is not exempt", () => {
    expect(stockBoxPaidInvoiceEvent({
      stripeEventId: "evt_paid_2",
      invoiceId: "in_2",
      amountPaidCents: 4900,
      currency: "sek",
      occurredAt,
      vatMode: "vat_registered",
    })).toMatchObject({
      eventId: "stripe:invoice:in_2:gross-cash",
      occurredAt,
      type: "measurement",
      metricName: "gross_cash_received_sek",
      metricValue: 49,
      unit: "SEK",
    });
    expect(stockBoxPaidInvoiceEvent({ stripeEventId: "evt_3", invoiceId: "in_3", amountPaidCents: 4900, currency: "eur", occurredAt })).toBeNull();
    expect(stockBoxPaidInvoiceEvent({ stripeEventId: "evt_4", invoiceId: "in_4", amountPaidCents: 0, currency: "sek", occurredAt })).toBeNull();
  });

  it("deduplicates separate Stripe Event objects that represent the same paid invoice", () => {
    const first = stockBoxPaidInvoiceEvent({
      stripeEventId: "evt_paid_first",
      invoiceId: "in_same_invoice",
      amountPaidCents: 4900,
      currency: "sek",
      occurredAt,
      vatMode: "small_business_exempt",
      billingReason: "subscription_cycle",
    });
    const second = stockBoxPaidInvoiceEvent({
      stripeEventId: "evt_paid_second",
      invoiceId: "in_same_invoice",
      amountPaidCents: 4900,
      currency: "sek",
      occurredAt,
      vatMode: "small_business_exempt",
      billingReason: "subscription_cycle",
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.eventId).toBe("stripe:invoice:in_same_invoice:revenue");
    expect(second?.eventId).toBe(first?.eventId);
    expect(second).toEqual(first);
  });

  it("is disabled without server configuration", async () => {
    await expect(reportStockBoxEvent(stockBoxSignupEvent({ idempotencyKey: "x", occurredAt }))).resolves.toEqual({ status: "disabled" });
  });

  it("fails open when Core rejects delivery", async () => {
    process.env.SMB_OS_CORE_URL = "https://core.example.com";
    process.env.SMB_OS_INGEST_KEY = "secret";
    const fetchImpl = vi.fn(async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(reportStockBoxEvent(stockBoxSignupEvent({ idempotencyKey: "x", occurredAt }), { fetchImpl })).resolves.toEqual({ status: "failed" });
  });

  it("sends the secret only as an authorization header", async () => {
    process.env.SMB_OS_CORE_URL = "https://core.example.com/";
    process.env.SMB_OS_INGEST_KEY = "secret";
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
      expect(String(init?.body)).not.toContain("secret");
      return Response.json({ ok: true, duplicate: true });
    }) as unknown as typeof fetch;
    await expect(reportStockBoxEvent(stockBoxSignupEvent({ idempotencyKey: "x", occurredAt }), { fetchImpl })).resolves.toEqual({ status: "delivered", duplicate: true });
  });
});
