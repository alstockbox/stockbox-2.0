import type { Metadata } from "next";
import { Check, CheckCircle2 } from "lucide-react";
import { CheckoutButton } from "@/components/billing/checkout-button";
import { PortalButton } from "@/components/billing/portal-button";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { commerciallyActivePlans, type PlanKey } from "@/lib/billing/plans";
import {
  getPricingAction,
  type BillingViewerState,
  type PricingAction
} from "@/lib/billing/pricing-state";
import {
  getBillingReadiness,
  reportBillingReadiness
} from "@/lib/billing/readiness";
import { getUserSubscription, subscriptionBillingState } from "@/lib/billing/subscriptions";
import { getServerEnv } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";

export const metadata: Metadata = { title: "Pricing", description: "StockBox subscription plans and research limits." };

function pricingActionLabel(action: PricingAction, plan: PlanKey, copy: ReturnType<typeof getP0Copy>["pricing"]) {
  if (action.kind === "signup") return plan === "free" ? copy.startFree : copy.getBasic;
  if (action.kind === "checkout") return copy.upgradeBasic;
  if (action.kind === "portal") return action.current ? copy.manageSubscription : copy.resolveBilling;
  if (action.kind === "current") return copy.currentPlan;
  if (action.kind === "disabled") return copy.subscriptionsUnavailable;
  return "";
}

function PlanAction({
  action,
  plan,
  checkoutEnabled,
  signupEnabled,
  portalEnabled,
  copy,
  billingCopy
}: {
  action: PricingAction;
  plan: PlanKey;
  checkoutEnabled: boolean;
  signupEnabled: boolean;
  portalEnabled: boolean;
  copy: ReturnType<typeof getP0Copy>["pricing"];
  billingCopy: ReturnType<typeof getP0Copy>["billing"];
}) {
  const label = pricingActionLabel(action, plan, copy);
  if (action.kind === "signup") {
    const enabled = plan === "free" ? signupEnabled : checkoutEnabled;
    return enabled ? (
      <ButtonLink href="/auth/signup" className="w-full">
        {label}
      </ButtonLink>
    ) : (
      <Button className="w-full" type="button" disabled>{label}</Button>
    );
  }
  if (action.kind === "checkout") {
    return <CheckoutButton plan="basic" enabled={checkoutEnabled} label={label} pendingLabel={billingCopy.openingCheckout} fallbackError={billingCopy.checkoutError} />;
  }
  if (action.kind === "portal") {
    return <PortalButton enabled={portalEnabled} label={label} pendingLabel={billingCopy.openingBilling} fallbackError={billingCopy.billingError} />;
  }
  if (action.kind === "current") {
    return (
      <div className="flex h-10 items-center justify-center gap-2 text-sm font-semibold text-emerald-200">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
    );
  }
  if (action.kind === "disabled") {
    return <Button className="w-full" type="button" disabled>{label}</Button>;
  }
  return <div className="h-10" aria-hidden="true" />;
}

export default async function PricingPage() {
  const allCopy = getP0Copy(await getLocale());
  const copy = allCopy.pricing;
  const billingCopy = allCopy.billing;
  const readiness = getBillingReadiness();
  if (!readiness.checkoutReady) reportBillingReadiness(readiness);

  const user = await getCurrentUser();
  const subscriptionLookup = user ? await getUserSubscription(user.id) : null;
  const viewer: BillingViewerState = !user
    ? "signed_out"
    : !subscriptionLookup?.ok
      ? "unknown"
      : subscriptionBillingState(subscriptionLookup.subscription);
  const checkoutEnabled = readiness.checkoutReady && (subscriptionLookup?.ok ?? true);
  const portalEnabled = Boolean(
    getServerEnv().STRIPE_RESTRICTED_KEY && subscriptionLookup?.ok &&
      Boolean(subscriptionLookup.subscription?.stripeCustomerId)
  );

  return (
    <Section>
      <Container>
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
          <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">{copy.title}</h1>
          <p className="mt-4 text-base leading-7 text-[#9aa7b8]">{copy.copy}</p>
        </div>
        <div className="mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
          {commerciallyActivePlans.map((plan) => {
            const action = getPricingAction(plan.key, viewer);
            return (
              <article key={plan.key} className="rounded-lg border border-white/10 bg-[#0d1c2e]/75 p-5">
                <div className="flex min-h-8 items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold text-[#f4efe5]">{plan.name}</h2>
                  {action.current ? <Badge>{copy.currentPlan}</Badge> : null}
                </div>
                <p className="number mt-5 text-3xl font-semibold text-[#f4efe5]">
                  {plan.launchOffer?.monthlyPriceSek ?? plan.monthlyPriceSek} kr
                </p>
                {plan.launchOffer ? (
                  <p className="text-xs text-[#9aa7b8]">
                    {copy.firstMonths} {plan.launchOffer.durationMonths} {copy.monthsThen} {plan.launchOffer.thenMonthlyPriceSek} kr {copy.perMonth}
                  </p>
                ) : (
                  <p className="text-xs text-[#9aa7b8]">{copy.perMonth}</p>
                )}
                <ul className="mt-5 min-h-44 space-y-3 text-sm text-[#c9d2df]">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.monthlyAnalyses} {copy.analysesMonth}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.deepAnalyses} {copy.deepReports}</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.watchlistItems} {copy.watchlistCompanies}</li>
                  {plan.entitlements.batchRows ? <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{plan.entitlements.batchRows} {copy.batchRows}</li> : null}
                  {plan.entitlements.aiAssistant ? <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />{copy.aiAssistant}</li> : null}
                </ul>
                <PlanAction
                  action={action}
                  plan={plan.key}
                  checkoutEnabled={checkoutEnabled}
                  signupEnabled={readiness.supabaseConfigured}
                  portalEnabled={portalEnabled}
                  copy={copy}
                  billingCopy={billingCopy}
                />
              </article>
            );
          })}
        </div>
        {!checkoutEnabled && (viewer === "free" || viewer === "signed_out") ? (
          <p className="mt-5 text-sm text-[#e1cb95]">
            {copy.subscriptionsUnavailable}
          </p>
        ) : null}
      </Container>
    </Section>
  );
}
