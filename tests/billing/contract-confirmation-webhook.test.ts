import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  rpc: vi.fn(),
  reserve: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/analytics/events", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/affiliate/commission", () => ({ commissionableInvoiceAmountCents: vi.fn(() => 100) }));
vi.mock("@/lib/billing/plans", () => ({ getPlanByStripePrice: vi.fn() }));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: vi.fn(() => ({ webhooks: { constructEvent: mocks.constructEvent } })),
}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: vi.fn(() => ({ STRIPE_WEBHOOK_SECRET: "whsec_test" })) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));
vi.mock("@/lib/billing/contract-confirmation-delivery", () => ({
  reserveContractConfirmation: mocks.reserve,
  markContractConfirmationSent: mocks.markSent,
  markContractConfirmationFailed: mocks.markFailed,
}));
vi.mock("@/lib/notifications/contract-confirmation", () => ({
  sendContractConfirmationEmail: mocks.sendEmail,
}));
import { POST } from "../../src/app/api/stripe/webhook/route";

function request() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body: "raw",
  });
}

function invoice(billingReason: Stripe.Invoice.BillingReason = "subscription_create") {
  return {
    id: "in_contract_1",
    amount_paid: 4900,
    total_excluding_tax: 4900,
    currency: "sek",
    billing_reason: billingReason,
    customer_email: "buyer@example.com",
    status_transitions: { paid_at: 1_788_000_000 },
    parent: {
      subscription_details: {
        metadata: { userId: "11111111-1111-4111-8111-111111111111", plan: "basic", offer: "basic_launch_3_months", locale: "sv" },
        subscription: "sub_contract_1",
      },
    },
    payments: { data: [] },
  } as unknown as Stripe.Invoice;
}
async function deliver(object: Stripe.Invoice) {
  mocks.constructEvent.mockReturnValue({
    id: "evt_contract_1",
    created: 1_788_000_000,
    type: "invoice.paid",
    data: { object },
  } as Stripe.Event);
  return POST(request());
}

describe("contract confirmation webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    mocks.reserve.mockResolvedValue({ ok: true, reserved: true });
    mocks.markSent.mockResolvedValue(true);
    mocks.markFailed.mockResolvedValue(true);
    mocks.sendEmail.mockResolvedValue({ ok: true, providerMessageId: "email_1" });
  });

  it("sends one durable confirmation for the initial subscription invoice", async () => {
    const response = await deliver(invoice());
    expect(response.status).toBe(200);
    expect(mocks.reserve).toHaveBeenCalledWith({
      invoiceId: "in_contract_1",
      userId: "11111111-1111-4111-8111-111111111111",
      subscriptionId: "sub_contract_1",
    });
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "buyer@example.com",
      locale: "sv",
      planKey: "basic",
      offer: "basic_launch_3_months",
      invoiceId: "in_contract_1",
      subscriptionId: "sub_contract_1",
      amountPaidCents: 4900,
      currency: "sek",
    }));
    expect(mocks.markSent).toHaveBeenCalledWith("in_contract_1", "email_1");
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it("does not send a new contract confirmation for recurring invoices", async () => {
    const response = await deliver(invoice("subscription_cycle"));
    expect(response.status).toBe(200);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does not send twice when the invoice is already reserved or sent", async () => {
    mocks.reserve.mockResolvedValue({ ok: true, reserved: false });
    const response = await deliver(invoice());
    expect(response.status).toBe(200);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.markSent).not.toHaveBeenCalled();
  });

  it("marks a failed delivery and returns 500 so Stripe can retry", async () => {
    mocks.sendEmail.mockResolvedValue({ ok: false, providerMessageId: null });
    const response = await deliver(invoice());
    expect(response.status).toBe(500);
    expect(mocks.markFailed).toHaveBeenCalledWith("in_contract_1");
    expect(mocks.markSent).not.toHaveBeenCalled();
  });

  it("marks a failed delivery when the email provider throws", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("network unavailable"));
    const response = await deliver(invoice());
    expect(response.status).toBe(500);
    expect(mocks.markFailed).toHaveBeenCalledWith("in_contract_1");
    expect(mocks.markSent).not.toHaveBeenCalled();
  });

  it("fails the webhook when the sent marker cannot be persisted", async () => {
    mocks.markSent.mockResolvedValue(false);
    const response = await deliver(invoice());
    expect(response.status).toBe(500);
    expect(mocks.markSent).toHaveBeenCalledWith("in_contract_1", "email_1");
    expect(mocks.markFailed).toHaveBeenCalledWith("in_contract_1");
  });
});
