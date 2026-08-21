import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CheckCircle2, CreditCard } from "lucide-react";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PortalButton } from "@/components/billing/portal-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getPlan } from "@/lib/billing/plans";
import {
  getBillingReadiness,
  reportBillingReadiness,
  SUBSCRIPTIONS_UNAVAILABLE_MESSAGE
} from "@/lib/billing/readiness";
import {
  effectivePlanKey,
  getUserSubscription,
  subscriptionStatusLabel
} from "@/lib/billing/subscriptions";
import { getServerEnv } from "@/lib/env/server";

export const metadata: Metadata = { title: "Billing" };

function formatBillingDate(value: string) {
  return new Intl.DateTimeFormat("en-SE", { dateStyle: "medium" }).format(new Date(value));
}

export default async function BillingPage() {
  const user = await requireUser();
  const readiness = getBillingReadiness();
  const subscriptionLookup = await getUserSubscription(user.id);
  if (!readiness.checkoutReady) reportBillingReadiness(readiness);

  if (!subscriptionLookup.ok) {
    return (
      <Section>
        <Container className="max-w-4xl">
          <h1 className="serif text-3xl font-semibold text-[#f4efe5]">Billing & subscription</h1>
          <p className="mt-5 text-sm text-[#e1cb95]">
            Billing details are temporarily unavailable. Please try again shortly.
          </p>
        </Container>
      </Section>
    );
  }

  const planKey = effectivePlanKey(subscriptionLookup.subscription);
  const plan = getPlan(planKey);
  const status = planKey === "basic"
    ? subscriptionStatusLabel(subscriptionLookup.subscription?.status ?? "active")
    : "Active";
  const nextBillingDate = planKey === "basic"
    ? subscriptionLookup.subscription?.currentPeriodEnd
    : null;
  const portalEnabled = Boolean(getServerEnv().STRIPE_RESTRICTED_KEY);

  return (
    <Section>
      <Container className="max-w-4xl">
        <p className="text-sm font-semibold text-[#e1cb95]">Account</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Billing & subscription</h1>

        <section className="mt-10 border-y border-white/10 py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                <h2 className="text-xl font-semibold text-[#f4efe5]">{plan.name}</h2>
                <Badge>Current plan</Badge>
              </div>
              <p className="mt-4 text-xs text-[#9aa7b8]">Subscription status</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-emerald-200">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {status}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="number text-2xl font-semibold text-[#f4efe5]">
                {planKey === "basic" ? "79 SEK / month" : "0 SEK / month"}
              </p>
              {planKey === "basic" ? (
                <p className="mt-1 text-sm text-[#9aa7b8]">
                  Launch offer: 49 SEK / month for the first 3 months
                </p>
              ) : null}
            </div>
          </div>

          {nextBillingDate ? (
            <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-[#c9d2df]">
              <CalendarDays className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
              Next billing date: {formatBillingDate(nextBillingDate)}
            </div>
          ) : null}
        </section>

        <div className="mt-7 flex max-w-sm flex-col gap-3">
          {planKey === "basic" ? (
            <PortalButton enabled={portalEnabled} />
          ) : (
            <CheckoutButton
              plan="basic"
              enabled={readiness.checkoutReady}
              label="Upgrade to Basic"
            />
          )}
          <ButtonLink href="/pricing" variant="secondary" className="w-full">
            View plans
          </ButtonLink>
        </div>

        {planKey === "free" && !readiness.checkoutReady ? (
          <p className="mt-5 text-sm text-[#e1cb95]">
            {SUBSCRIPTIONS_UNAVAILABLE_MESSAGE}
          </p>
        ) : null}

        <p className="mt-8 text-sm text-[#9aa7b8]">
          Questions about billing? <Link href="/legal/terms" className="text-[#e1cb95] hover:text-white">Review subscription terms</Link>.
        </p>
      </Container>
    </Section>
  );
}
