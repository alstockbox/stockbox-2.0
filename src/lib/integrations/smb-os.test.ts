import { afterEach, describe, expect, it, vi } from "vitest";
import {
  reportStockBoxEvent,
  stockBoxAnalysisCompletedEvent,
  stockBoxPaidInvoiceEvent,
  stockBoxSignupEvent,
} from "./smb-os";

afterEach(() => {
  delete process.env.SMB_OS_CORE_URL;
  delete process.env.SMB_OS_INGEST_KEY;
  vi.restoreAllMocks();
});

describe("StockBox SMB OS adapter", () => {
  it("maps signup to an idempotent non-financial measurement", () => {
    expect(stockBoxSignupEvent("evt:signup-1")).toEqual({
      projectId: "stockbox",
      module: "stockbox",
      eventId: "acquisition:evt:signup-1",
      type: "measurement",
      metricName: "signup_completed",
      metricValue: 1,
      unit: "count",
      metadata: {},
    });
  });

  it("uses persisted analysis id as the activation idempotency key", () => {
    const event = stockBoxAnalysisCompletedEvent({
      analysisId: "analysis-123",
      ticker: "VOLV-B",
      analysisType: "deep",
      researchView: "balanced",
      score: 81,
    });
    expect(event.eventId).toBe("analysis:analysis-123:completed");
    expect(event.type).toBe("measurement");
    expect(event.metadata).not.toHaveProperty("userId");
  });

  it("maps only positive SEK paid invoices to revenue", () => {
    expect(stockBoxPaidInvoiceEvent({
      stripeEventId: "evt_paid_1",
      invoiceId: "in_1",
      amountPaidCents: 4900,
      currency: "sek",
      billingReason: "subscription_create",
    })).toMatchObject({
      eventId: "stripe:evt_paid_1:revenue",
      type: "economic",
      kind: "revenue",
      amountSek: 49,
    });
    expect(stockBoxPaidInvoiceEvent({ stripeEventId: "evt_2", invoiceId: "in_2", amountPaidCents: 4900, currency: "eur" })).toBeNull();
    expect(stockBoxPaidInvoiceEvent({ stripeEventId: "evt_3", invoiceId: "in_3", amountPaidCents: 0, currency: "sek" })).toBeNull();
  });

  it("is disabled without server configuration", async () => {
    await expect(reportStockBoxEvent(stockBoxSignupEvent("x"))).resolves.toEqual({ status: "disabled" });
  });

  it("fails open when Core rejects delivery", async () => {
    process.env.SMB_OS_CORE_URL = "https://core.example.com";
    process.env.SMB_OS_INGEST_KEY = "secret";
    const fetchImpl = vi.fn(async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    await expect(reportStockBoxEvent(stockBoxSignupEvent("x"), { fetchImpl })).resolves.toEqual({ status: "failed" });
  });

  it("sends the secret only as an authorization header", async () => {
    process.env.SMB_OS_CORE_URL = "https://core.example.com/";
    process.env.SMB_OS_INGEST_KEY = "secret";
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
      expect(String(init?.body)).not.toContain("secret");
      return Response.json({ ok: true, duplicate: true });
    }) as unknown as typeof fetch;
    await expect(reportStockBoxEvent(stockBoxSignupEvent("x"), { fetchImpl })).resolves.toEqual({ status: "delivered", duplicate: true });
  });
});
