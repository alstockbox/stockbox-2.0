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
  reportBillingReadiness
} from "@/lib/billing/readiness";
import {
  getUserSubscription,
  scheduledSubscriptionEnd,
  subscriptionBillingState
} from "@/lib/billing/subscriptions";
import { getServerEnv } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import type { Locale } from "@/lib/i18n/types";

export const metadata: Metadata = { title: "Billing" };

function formatBillingDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-SE", { dateStyle: "medium" }).format(new Date(value));
}

function localizedSubscriptionStatus(status: string, copy: ReturnType<typeof getP0Copy>["billing"]) {
  return ({
    active: copy.active, trialing: copy.statusTrialing, past_due: copy.statusPastDue, unpaid: copy.statusUnpaid,
    incomplete: copy.statusIncomplete, paused: copy.statusPaused, canceled: copy.statusCanceled, incomplete_expired: copy.statusExpired,
  } as Record<string, string>)[status] ?? copy.statusUnknown;
}

export default async function BillingPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const copy = getP0Copy(locale).billing;
  const readiness = getBillingReadiness();
  const subscriptionLookup = await getUserSubscription(user.id);
  if (!readiness.checkoutReady) reportBillingReadiness(readiness);

  if (!subscriptionLookup.ok) {
    return (
      <Section>
        <Container className="max-w-4xl">
          <h1 className="serif text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1>
          <p className="mt-5 text-sm text-[#e1cb95]">
            {copy.unavailable}
          </p>
        </Container>
      </Section>
    );
  }

  const billingState = subscriptionBillingState(subscriptionLookup.subscription);
  const hasStripeBasic = billingState !== "free";
  const plan = getPlan(hasStripeBasic ? "basic" : "free");
  const status = hasStripeBasic
    ? localizedSubscriptionStatus(subscriptionLookup.subscription?.status ?? "active", copy)
    : copy.active;
  const scheduledEnd = hasStripeBasic
    ? scheduledSubscriptionEnd(subscriptionLookup.subscription)
    : null;
  const nextBillingDate = hasStripeBasic && !scheduledEnd
    ? subscriptionLookup.subscription?.currentPeriodEnd
    : null;
  const portalEnabled = Boolean(getServerEnv().STRIPE_RESTRICTED_KEY);

  return (
    <Section>
      <Container className="max-w-4xl">
        <p className="text-sm font-semibold text-[#e1cb95]">{copy.account}</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1>

        <section className="mt-10 border-y border-white/10 py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                <h2 className="text-xl font-semibold text-[#f4efe5]">{plan.name}</h2>
                <Badge>{billingState === "basic_manage" ? copy.actionRequired : copy.currentPlan}</Badge>
              </div>
              <p className="mt-4 text-xs text-[#9aa7b8]">{copy.subscriptionStatus}</p>
              <div className={`mt-1 flex items-center gap-2 text-sm ${billingState === "basic_manage" ? "text-amber-200" : "text-emerald-200"}`}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {status}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="number text-2xl font-semibold text-[#f4efe5]">
                {hasStripeBasic ? `79 SEK / ${copy.perMonth.replace("per ", "")}` : `0 SEK / ${copy.perMonth.replace("per ", "")}`}
              </p>
              {hasStripeBasic ? (
                <p className="mt-1 text-sm text-[#9aa7b8]">
                  {copy.launchOffer}
                </p>
              ) : null}
            </div>
          </div>

          {scheduledEnd ? (
            <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-amber-200">
              <CalendarDays className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
              {copy.subscriptionEnds}: {formatBillingDate(scheduledEnd, locale)}
            </div>
          ) : nextBillingDate ? (
            <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-[#c9d2df]">
              <CalendarDays className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
              {copy.nextBillingDate}: {formatBillingDate(nextBillingDate, locale)}
            </div>
          ) : null}
        </section>

        <div className="mt-7 flex max-w-sm flex-col gap-3">
          {hasStripeBasic ? (
            <PortalButton enabled={portalEnabled} label={billingState === "basic_manage" ? copy.resolveBilling : copy.manageSubscription} pendingLabel={copy.openingBilling} fallbackError={copy.billingError} />
          ) : (
            <CheckoutButton
              plan="basic"
              enabled={readiness.checkoutReady}
              label={copy.upgradeBasic}
              pendingLabel={copy.openingCheckout}
              fallbackError={copy.checkoutError}
            />
          )}
          <ButtonLink href="/pricing" variant="secondary" className="w-full">
            {copy.viewPlans}
          </ButtonLink>
        </div>

        {billingState === "free" && !readiness.checkoutReady ? (
          <p className="mt-5 text-sm text-[#e1cb95]">
            {copy.unavailableSubscriptions}
          </p>
        ) : null}

        <p className="mt-8 text-sm text-[#9aa7b8]">
          {copy.questions} <Link href="/legal/terms" className="text-[#e1cb95] hover:text-white">{copy.reviewTerms}</Link>.
        </p>
      </Container>
    </Section>
  );
}
