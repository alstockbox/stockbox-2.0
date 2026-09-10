import { describe, expect, it } from "vitest";
import { stockBoxPaidInvoiceEvent } from "./smb-os";

const occurredAt = "2026-09-10T10:15:30.000Z";

describe("StockBox SMB OS financial idempotency", () => {
  it("uses the invoice identity rather than the Stripe Event identity for paid invoice telemetry", () => {
    const first = stockBoxPaidInvoiceEvent({
      stripeEventId: "evt_paid_first",
      invoiceId: "in_same_invoice",
      amountPaidCents: 4900,
      currency: "sek",
      occurredAt,
      vatMode: "small_business_exempt",
      billingReason: "subscription_cycle",
    });
    const duplicateEventObject = stockBoxPaidInvoiceEvent({
      stripeEventId: "evt_paid_second",
      invoiceId: "in_same_invoice",
      amountPaidCents: 4900,
      currency: "sek",
      occurredAt,
      vatMode: "small_business_exempt",
      billingReason: "subscription_cycle",
    });

    expect(first).not.toBeNull();
    expect(duplicateEventObject).not.toBeNull();
    expect(first?.eventId).toBe("stripe:invoice:in_same_invoice:revenue");
    expect(duplicateEventObject?.eventId).toBe(first?.eventId);
    expect(duplicateEventObject).toEqual(first);
  });
});
