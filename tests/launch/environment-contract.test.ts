import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(`${process.cwd()}/.env.example`, "utf8");

describe("release environment contract", () => {
  it("documents every active Stripe plan and promotion", () => {
    for (const name of [
      "STRIPE_PRICE_BASIC_MONTHLY",
      "STRIPE_COUPON_BASIC_LAUNCH",
      "STRIPE_PRICE_STANDARD_MONTHLY",
      "STRIPE_COUPON_STANDARD_LAUNCH",
      "STRIPE_PRICE_PREMIUM_MONTHLY",
      "STRIPE_COUPON_PREMIUM_LAUNCH",
      "STRIPE_PRICE_ELITE_MONTHLY",
      "STRIPE_COUPON_AFFILIATE_10",
    ]) expect(envExample).toContain(`${name}=`);
    expect(envExample).not.toContain("Inactive future plans");
  });

  it("documents paid-launch legal and receipt-delivery requirements", () => {
    for (const name of [
      "EMAIL_PROVIDER=resend", "RESEND_API_KEY=", "FROM_EMAIL=",
      "LEGAL_BUSINESS_NAME=", "LEGAL_ORGANIZATION_NUMBER=", "LEGAL_POSTAL_ADDRESS=",
      "LEGAL_SUPPORT_EMAIL=", "LEGAL_SUPPORT_PHONE=", "LEGAL_VAT_MODE=", "LEGAL_VAT_NUMBER=",
    ]) expect(envExample).toContain(name);
  });
});