import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
  getLegalCommerceReadiness: vi.fn(),
  logApplicationError: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({ getServerEnv: mocks.getServerEnv }));
vi.mock("@/lib/legal/commerce", async () => {
  const actual = await vi.importActual<typeof import("@/lib/legal/commerce")>("@/lib/legal/commerce");
  return { ...actual, getLegalCommerceReadiness: mocks.getLegalCommerceReadiness };
});
vi.mock("@/lib/db/repositories", () => ({ logApplicationError: mocks.logApplicationError }));

import { sendContractConfirmationEmail } from "../../src/lib/notifications/contract-confirmation";

const seller = {
  businessName: "Example Seller",
  organizationNumber: "000000-0000",
  postalAddress: "Example Street 1, Sweden",
  supportEmail: "support@example.test",
  supportPhone: "+46 00 000 00 00",
  vatMode: "small_business_exempt" as const,
  vatNumber: null,
};
describe("contract confirmation email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerEnv.mockReturnValue({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      FROM_EMAIL: "StockBox <support@example.test>",
      NEXT_PUBLIC_APP_URL: "https://www.getstockbox.app",
    });
    mocks.getLegalCommerceReadiness.mockReturnValue({ ready: true, seller, missingVariables: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "email_123" }),
    }));
  });

  it("uses the Stripe invoice id as Resend idempotency key", async () => {
    const result = await sendContractConfirmationEmail({
      to: "buyer@example.com",
      locale: "sv",
      planKey: "basic",
      offer: "basic_launch_3_months",
      invoiceId: "in_123",
      subscriptionId: "sub_123",
      contractDate: "2026-08-31T00:00:00.000Z",
      amountPaidCents: 4900,
      currency: "sek",
    });
    expect(result).toEqual({ ok: true, providerMessageId: "email_123" });
    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": "stockbox-contract-in_123",
      }),
    }));
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.subject).toBe("StockBox – avtalsbekräftelse");
    expect(body.text).toContain("STANDARDblankett FÖR UTÖVANDE AV ÅNGERRÄTT");
  });
});
