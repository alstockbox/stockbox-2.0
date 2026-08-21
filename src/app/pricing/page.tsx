import type { Metadata } from "next";
import { Check } from "lucide-react";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { Badge } from "@/components/ui/badge";
import { Container, Section } from "@/components/ui/card";
import { commerciallyActivePlans } from "@/lib/billing/plans";
import { isBasicLaunchCheckoutConfigured, isSupabaseConfigured } from "@/lib/env/server";

export const metadata: Metadata = { title: "Pricing", description: "StockBox subscription plans and research limits." };

export default function PricingPage() {
  const checkoutEnabled = isBasicLaunchCheckoutConfigured() && isSupabaseConfigured();
  return (
    <Section>
      <Container>
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-[#e1cb95]">Simple monthly pricing</p>
          <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">Start free. Pay for depth and scale.</h1>
          <p className="mt-4 text-base leading-7 text-[#9aa7b8]">All plans use the same factual engine. Higher tiers add analysis volume, monitoring and workflow capacity.</p>
        </div>
        <div className="mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
          {commerciallyActivePlans.map((plan) => (
            <article key={plan.key} className={`rounded-lg border p-5 ${plan.highlight ? "border-[#b99b5f]/70 bg-[#b99b5f]/10" : "border-white/10 bg-[#0d1c2e]/75"}`}>
              <div className="flex min-h-8 items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-[#f4efe5]">{plan.name}</h2>
                {plan.highlight ? <Badge>Popular</Badge> : null}
              </div>
              <p className="number mt-5 text-3xl font-semibold text-[#f4efe5]">
                {plan.launchOffer?.monthlyPriceSek ?? plan.monthlyPriceSek} kr
              </p>
              {plan.launchOffer ? (
                <p className="text-xs text-[#9aa7b8]">
                  per month for the first {plan.launchOffer.durationMonths} months, then {plan.launchOffer.thenMonthlyPriceSek} kr/month
                </p>
              ) : (
                <p className="text-xs text-[#9aa7b8]">per month</p>
              )}
              <ul className="mt-5 min-h-44 space-y-3 text-sm text-[#c9d2df]">
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.monthlyAnalyses} analyses / month</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.deepAnalyses} deep reports</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.watchlistItems} watchlist companies</li>
                {plan.entitlements.batchRows ? <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.batchRows} batch rows</li> : null}
                {plan.entitlements.aiAssistant ? <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />AI research assistant entitlement</li> : null}
              </ul>
              <CheckoutButton plan={plan.key} enabled={checkoutEnabled} />
            </article>
          ))}
        </div>
        {!checkoutEnabled ? <p className="mt-5 text-sm text-[#e1cb95]">Paid checkout is held in setup-required mode until Supabase and Stripe production values are present.</p> : null}
      </Container>
    </Section>
  );
}
