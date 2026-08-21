import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { getSafeStripeErrorDiagnostic } from "../../src/lib/billing/stripe";

describe("safe Stripe error diagnostics", () => {
  it("makes restricted-key permission failures explicit", () => {
    const error = new Stripe.errors.StripePermissionError({
      type: "invalid_request_error",
      message: "The restricted key lacks permission for checkout.sessions.",
      code: "permission_denied",
      param: "checkout.sessions",
      requestId: "req_123"
    });

    expect(getSafeStripeErrorDiagnostic(error)).toEqual({
      type: "StripePermissionError",
      code: "permission_denied",
      param: "checkout.sessions",
      requestId: "req_123",
      message: "The restricted key lacks permission for checkout.sessions.",
      restrictedKeyPermissionError: true
    });
  });

  it("redacts credentials and customer data from Stripe messages", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      message:
        "Key rk_live_secret, webhook whsec_secret, user@example.com, card 4242424242424242"
    });

    const diagnostic = getSafeStripeErrorDiagnostic(error);

    expect(diagnostic.message).toBe(
      "Key [redacted], webhook [redacted], [redacted], card [redacted]"
    );
    expect(diagnostic.restrictedKeyPermissionError).toBe(false);
  });

  it("does not expose messages from non-Stripe errors", () => {
    const diagnostic = getSafeStripeErrorDiagnostic(
      new Error("STRIPE_RESTRICTED_KEY=rk_live_do_not_log")
    );

    expect(diagnostic).toMatchObject({
      type: "Error",
      message: "Stripe request failed.",
      restrictedKeyPermissionError: false
    });
  });
});
