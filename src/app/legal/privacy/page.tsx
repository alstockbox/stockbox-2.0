import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/card";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <Section><Container className="max-w-3xl"><h1 className="serif text-4xl font-semibold">Privacy notice</h1><p className="mt-3 text-sm text-[#e1cb95]">Draft dated August 20, 2026. Owner/legal approval is required before public launch.</p><div className="mt-8 space-y-7 text-sm leading-7 text-[#c9d2df]"><section><h2 className="text-lg font-semibold text-[#f4efe5]">Data we process</h2><p className="mt-2">Account identifiers, profile preferences, saved research, watchlists, portfolios, subscription state, product events and sanitized operational logs. Payment card data is handled by Stripe and is not stored by StockBox.</p></section><section><h2 className="text-lg font-semibold text-[#f4efe5]">Why and how long</h2><p className="mt-2">Data is used to provide the service, protect accounts, enforce entitlements, improve reliability and meet legal obligations. Retention periods must be finalized by the owner before launch.</p></section><section><h2 className="text-lg font-semibold text-[#f4efe5]">Processors and rights</h2><p className="mt-2">Expected processors include Vercel, Supabase, Stripe, PostHog and configured email/data providers. Contact details, controller identity, lawful bases, international transfer terms and data-subject request procedures remain owner/legal inputs.</p></section></div></Container></Section>;
}
