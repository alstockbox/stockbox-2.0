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

export function randomIntegrationIdentifier() {
  const suffix = Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26))
  ).join("");
  return `stockbox_checkout_${suffix}`;
}
