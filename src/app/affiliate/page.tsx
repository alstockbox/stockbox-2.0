import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Banknote, MousePointerClick, UsersRound } from "lucide-react";
import { ConnectPayoutButton } from "@/components/affiliate/connect-payout-button";
import { GiveawayCopyControls } from "@/components/affiliate/giveaway-copy-controls";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getAffiliateDashboardData } from "@/lib/affiliate/service";

export const metadata: Metadata = { title: "Affiliate dashboard" };

type PageProps = { searchParams: Promise<{ preview?: string; connect?: string }> };

function money(cents: number) {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}

export default async function AffiliatePage({ searchParams }: PageProps) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);
  const previewTargetId = user.role === "admin" && params.preview ? params.preview : null;
  if (!previewTargetId && user.role !== "affiliate_ambassador" && user.role !== "admin") {
    return null;
  }
  const data = await getAffiliateDashboardData(previewTargetId ?? user.id);
  if (!data) {
    return (
      <Section>
        <Container className="max-w-4xl">
          {previewTargetId ? (
            <div className="mb-6 flex items-center justify-between rounded-lg border border-[#e1cb95]/25 bg-[#e1cb95]/10 px-4 py-3">
              <p className="text-sm text-[#f4e5b8]">Admin preview · affiliate profile not configured</p>
              <Link href="/admin" className="text-sm font-semibold text-[#f4e5b8]">Exit preview</Link>
            </div>
          ) : null}
          <h1 className="serif text-3xl font-semibold">Affiliate dashboard unavailable</h1>
          <p className="mt-3 text-sm text-[#9aa7b8]">This account does not have an active affiliate profile yet.</p>
        </Container>
      </Section>
    );
  }

  const metrics = data.metrics;
  const cards = [
    { label: "Clicks", value: metrics.clicks.toLocaleString("sv-SE"), icon: MousePointerClick },
    { label: "Paying customers", value: metrics.payingCustomers.toLocaleString("sv-SE"), icon: UsersRound },
    { label: "Available", value: money(metrics.availableCents), icon: Banknote },
    { label: "Pending", value: money(metrics.pendingCents), icon: BadgeCheck },
  ];

  return (
    <Section>
      <Container>
        {previewTargetId ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e1cb95]/25 bg-[#e1cb95]/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#f4e5b8]">Admin preview</p>
              <p className="text-xs text-[#c9b984]">Read-only view as {data.displayName} · your admin session is unchanged.</p>
            </div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-[#f4e5b8]">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />Exit preview
            </Link>
          </div>
        ) : null}        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-[#e1cb95]">StockBox partner program</p>
            <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">Affiliate dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">
              Track referrals, customers, commissions and payouts from one place.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8b9b]">Lifetime earnings</p>
            <p className="number mt-1 text-3xl font-semibold text-[#f4efe5]">{money(metrics.lifetimeEarningsCents)}</p>
            <p className="mt-1 text-xs text-[#9aa7b8]">{data.commissionPercent}% commission on sales excluding VAT/tax | {data.status}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.label}>
              <card.icon className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
              <p className="mt-3 text-xs text-[#9aa7b8]">{card.label}</p>
              <p className="number mt-1 text-2xl font-semibold text-[#f4efe5]">{card.value}</p>
            </Card>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <Card>
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8b9b]">Your affiliate link</p>
            <div className="mt-3 overflow-x-auto rounded-md border border-white/10 bg-[#07111f] px-4 py-3">
              <code className="whitespace-nowrap text-sm text-[#f4e5b8]">{data.link}</code>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-[#7f8b9b]">Signups</p><p className="number mt-1 text-xl font-semibold">{metrics.referrals}</p></div>
              <div><p className="text-xs text-[#7f8b9b]">Conversion rate</p><p className="number mt-1 text-xl font-semibold">{metrics.conversionRate.toFixed(1)}%</p></div>
              <div><p className="text-xs text-[#7f8b9b]">Analysis allowance</p><p className="number mt-1 text-xl font-semibold">{data.monthlyAnalysisLimit}/mo</p></div>
            </div>
          </Card>          <Card>
            <p className="text-xs uppercase tracking-[0.14em] text-[#7f8b9b]">Payout status</p>
            <p className="mt-3 text-lg font-semibold text-[#f4efe5]">{data.payoutEnabled ? "Automatic payouts enabled" : "Payout setup required"}</p>
            <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">
              {data.payoutEnabled
                ? "Eligible commissions are queued after the hold period and paid through the connected payout account."
                : "Connect a payout account before automatic transfers can be enabled."}
            </p>
            <p className="mt-4 text-xs text-[#7f8b9b]">Paid to date</p>
            <p className="number mt-1 text-2xl font-semibold text-[#f4efe5]">{money(metrics.paidCents)}</p>
            {!previewTargetId ? (
              <ConnectPayoutButton connected={Boolean(data.connectAccountId)} />
            ) : null}
          </Card>
        </div>

        <section className="mt-9">
          <h2 className="text-xl font-semibold text-[#f4efe5]">Giveaway campaigns</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">StockBox admin creates these prizes. Your codes are read-only: share each available code with one competition winner.</p>
          <div className="mt-4 space-y-4">
            {data.giveawayCampaigns.map((campaign) => {
              const planName = campaign.planKey === "premium" ? "Pro" : campaign.planKey.charAt(0).toUpperCase() + campaign.planKey.slice(1);
              return (
                <Card key={campaign.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-semibold text-[#f4efe5]">{campaign.label}</p><p className="mt-1 text-xs text-[#9aa7b8]">{planName} · {campaign.durationMonths} months free access · {campaign.claimExpiresAt ? `claim by ${date(campaign.claimExpiresAt)}` : "no redemption deadline"}</p></div>
                    <span className="text-xs uppercase tracking-wide text-[#e1cb95]">{campaign.status}</span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {campaign.codes.map((item) => (
                      <div key={item.code} className="rounded-md border border-white/10 bg-[#07111f] px-3 py-2">
                        <code className="select-all text-sm text-[#f4e5b8]">{item.code}</code>
                        <p className="mt-1 text-[11px] capitalize text-[#7f8b9b]">{item.status}</p>
                        <GiveawayCopyControls code={item.code} href={`/redeem/${encodeURIComponent(item.code)}`} />
                        <a href={`/redeem/${encodeURIComponent(item.code)}`} className="mt-2 inline-block text-xs text-[#e1cb95] hover:underline">Open giveaway link</a>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
            {!data.giveawayCampaigns.length ? <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-4 text-sm text-[#9aa7b8]">No giveaway campaigns assigned yet.</p> : null}
          </div>
        </section>

        <section className="mt-9">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#f4efe5]">Recent commissions</h2>
              <p className="mt-1 text-sm text-[#9aa7b8]">Customer identities are masked for privacy.</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-white/5 text-xs text-[#9aa7b8]"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th></tr></thead>
              <tbody>
                {data.recentCommissions.map((commission) => (
                  <tr key={commission.id} className="border-t border-white/10 bg-[#0d1c2e]/55">
                    <td className="px-4 py-3">{commission.customer}</td>
                    <td className="number px-4 py-3">{money(commission.amountCents)}</td>
                    <td className="px-4 py-3 capitalize">{commission.status}</td>
                    <td className="px-4 py-3 text-[#9aa7b8]">{date(commission.createdAt)}</td>
                  </tr>
                ))}
                {!data.recentCommissions.length ? <tr><td colSpan={4} className="px-4 py-5 text-[#9aa7b8]">No commissions yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="mt-9">
          <h2 className="text-xl font-semibold text-[#f4efe5]">Payout history</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-white/5 text-xs text-[#9aa7b8]"><tr><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Paid</th></tr></thead>
              <tbody>
                {data.payouts.map((payout) => (
                  <tr key={payout.id} className="border-t border-white/10 bg-[#0d1c2e]/55">
                    <td className="number px-4 py-3">{money(payout.amountCents)}</td>
                    <td className="px-4 py-3 capitalize">{payout.status}</td>
                    <td className="px-4 py-3 text-[#9aa7b8]">{date(payout.createdAt)}</td>
                    <td className="px-4 py-3 text-[#9aa7b8]">{date(payout.paidAt)}</td>
                  </tr>
                ))}
                {!data.payouts.length ? <tr><td colSpan={4} className="px-4 py-5 text-[#9aa7b8]">No payouts yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </Container>
    </Section>
  );
}
