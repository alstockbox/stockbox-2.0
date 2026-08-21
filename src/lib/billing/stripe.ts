import Stripe from "stripe";
import { getServerEnv } from "@/lib/env/server";

let stripe: Stripe | null = null;

export function getStripe() {
  const env = getServerEnv();
  if (!env.STRIPE_RESTRICTED_KEY) return null;

  stripe ??= new Stripe(env.STRIPE_RESTRICTED_KEY, {
    apiVersion: "2026-07-29.dahlia",
    appInfo: {
      name: "StockBox",
      version: "0.1.0"
    }
  });

  return stripe;
}

export type SafeStripeErrorDiagnostic = {
  type: string;
  code: string | null;
  param: string | null;
  requestId: string | null;
  message: string;
  restrictedKeyPermissionError: boolean;
};

function sanitizeStripeErrorMessage(message: string) {
  return message
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b/g, "[redacted]")
    .replace(/\bwhsec_[A-Za-z0-9_]+\b/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\b\d{12,19}\b/g, "[redacted]")
    .slice(0, 500);
}

export function getSafeStripeErrorDiagnostic(error: unknown): SafeStripeErrorDiagnostic {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return {
      type: error instanceof Error ? error.name : "unknown",
      code: null,
      param: null,
      requestId: null,
      message: "Stripe request failed.",
      restrictedKeyPermissionError: false
    };
  }

  const message = sanitizeStripeErrorMessage(error.message || "Stripe request failed.");
  const restrictedKeyPermissionError =
    error instanceof Stripe.errors.StripePermissionError ||
    error.code === "permission_denied" ||
    error.statusCode === 403;

  return {
    type: error.type,
    code: error.code ?? null,
    param: error.param ?? null,
    requestId: error.requestId ?? null,
    message,
    restrictedKeyPermissionError
  };
}
