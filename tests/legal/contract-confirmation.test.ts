import { describe, expect, it } from "vitest";
import { contractConfirmationText } from "../../src/lib/legal/contract-confirmation";

const seller = {
  businessName: "Example Seller",
  organizationNumber: "000000-0000",
  postalAddress: "Example Street 1, Sweden",
  supportEmail: "support@example.test",
  supportPhone: "+46 00 000 00 00",
  vatMode: "small_business_exempt" as const,
  vatNumber: null,
};

describe("contract confirmation", () => {
  it("includes durable-contract information and the model withdrawal form in Swedish", () => {
    const text = contractConfirmationText({
      seller,
      locale: "sv",
      planKey: "basic",
      offer: "basic_launch_3_months",
      invoiceId: "in_1",
      subscriptionId: "sub_1",
      contractDate: "2026-08-31T00:00:00.000Z",
      amountPaidCents: 4900,
      currency: "sek",
      appUrl: "https://www.getstockbox.app",
    });
    expect(text).toContain("StockBox – avtalsbekräftelse");
    expect(text).toContain("49 kr/mån i 3 månader, därefter 69 kr/mån");
    expect(text).toContain("https://www.getstockbox.app/withdraw");
    expect(text).toContain("https://www.getstockbox.app/legal/withdrawal-form");
    expect(text).toContain("STANDARDblankett FÖR UTÖVANDE AV ÅNGERRÄTT");
    expect(text).toContain("Example Seller");
    expect(text).toContain("support@example.test");
    expect(text).not.toMatch(/entitlement/i);
  });

  it("renders the affiliate recurring price without claiming a launch offer", () => {
    const text = contractConfirmationText({
      seller,
      locale: "en",
      planKey: "elite",
      offer: "affiliate_10",
      invoiceId: "in_2",
      subscriptionId: "sub_2",
      contractDate: "2026-08-31T00:00:00.000Z",
      amountPaidCents: 35910,
      currency: "sek",
      appUrl: "https://www.getstockbox.app",
    });
    expect(text).toContain("SEK 359.10/month (10% off regular SEK 399/month)");
    expect(text).not.toContain("SEK 159/month");
    expect(text).toContain("MODEL WITHDRAWAL FORM");
    expect(text).not.toMatch(/entitlement/i);
  });
});
