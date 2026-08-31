import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Database, Eye, ShieldCheck } from "lucide-react";
import { AmbassadorCreateForm } from "@/components/admin/ambassador-create-form";
import { Card, Container, Section } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { adminEmails, getServerEnv, isFinancialProviderConfigured, isStripeConfigured, isSupabaseConfigured } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAffiliateGiveawayCampaignAction, revokeAffiliateGiveawayCampaignAction, setAffiliateAmbassadorAccessAction, updateAffiliateProfileAction, updateContactMessageAction, updateFeedbackAction } from "./actions";

export const metadata: Metadata = { title: "Admin" };

type ProviderHealthRow = { provider: string; operation: string; ok: boolean; latency_ms: number | null; status_code: number | null; error_class: string | null; created_at: string };
type ErrorLogRow = { id: number; service: string; sanitized_error: string; created_at: string };
type RuntimeHealth = { provider: string; operation: string; calls: number; successes: number; latencyTotal: number; latencySamples: number; lastIssue: string | null };
type AmbassadorEntitlementRow = { user_id: string; monthly_analyses: number; deep_analyses: number; batch_rows: number; watchlist_items: number; portfolios: number };
type AmbassadorProfileRow = { id: string };
type AffiliateRow = { id: string; user_id: string | null; display_name: string | null; code: string; status: string; commission_basis_points: number };
type GiveawayCampaignRow = { id: string; affiliate_id: string; label: string; plan_key: string; quantity: number; duration_months: number; claim_expires_at: string | null; status: string; created_at: string };
type GiveawayCodeRow = { campaign_id: string; status: string };
type WithdrawalRow = { id: string; user_id: string; stripe_subscription_id: string; plan_key: string; status: string; submitted_at: string };

export default async function AdminPage() {
  const user = await requireAdmin();
  const supabase = createAdminClient();
  const counts = supabase ? await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("analyses").select("id", { count: "exact", head: true }),
    supabase.from("error_logs").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "affiliate_ambassador"),
    supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).in("status", ["received", "processing"]),
  ]) : [];
  const profileResult = supabase
    ? await supabase.from("profiles").select("id,email,role,created_at").order("created_at", { ascending: false }).limit(50)
    : { data: [] };
  const profiles = profileResult.data ?? [];
  const ambassadorProfileResult = supabase
    ? await supabase.from("profiles").select("id").eq("role", "affiliate_ambassador")
    : { data: [] };
  const ambassadorUserIds = new Set(
    ((ambassadorProfileResult.data ?? []) as AmbassadorProfileRow[]).map((profile) => profile.id),
  );
  const [ambassadorEntitlementResult, affiliateResult] = supabase ? await Promise.all([
    supabase.from("ambassador_entitlements")
      .select("user_id,monthly_analyses,deep_analyses,batch_rows,watchlist_items,portfolios"),
    supabase.from("affiliates")
      .select("id,user_id,display_name,code,status,commission_basis_points"),
  ]) : [{ data: [] }, { data: [] }];
  const ambassadorEntitlements = new Map(
    ((ambassadorEntitlementResult.data ?? []) as AmbassadorEntitlementRow[])
      .map((row) => [row.user_id, row] as const),
  );
  const affiliatesByUser = new Map(
    ((affiliateResult.data ?? []) as AffiliateRow[])
      .filter((row) => Boolean(row.user_id))
      .map((row) => [row.user_id as string, row] as const),
  );
  const [feedbackResult, contactResult] = supabase ? await Promise.all([
    supabase.from("feedback_submissions").select("id,rating,comment,status,testimonial_approved,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("contact_messages").select("id,name,email,subject,message,status,created_at").order("created_at", { ascending: false }).limit(50),
  ]) : [{ data: [] }, { data: [] }];
  const feedback = feedbackResult.data ?? [];
  const contactMessages = contactResult.data ?? [];
  const [giveawayCampaignResult, giveawayCodeResult] = supabase ? await Promise.all([
    supabase.from("affiliate_giveaway_campaigns")
      .select("id,affiliate_id,label,plan_key,quantity,duration_months,claim_expires_at,status,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("affiliate_giveaway_codes").select("campaign_id,status"),
  ]) : [{ data: [] }, { data: [] }];
  const giveawayCampaigns = (giveawayCampaignResult.data ?? []) as GiveawayCampaignRow[];
  const giveawayCodeRows = (giveawayCodeResult.data ?? []) as GiveawayCodeRow[];
  const giveawayCounts = new Map<string, { available: number; redeemed: number; revoked: number }>();
  for (const row of giveawayCodeRows) {
    const current = giveawayCounts.get(row.campaign_id) ?? { available: 0, redeemed: 0, revoked: 0 };
    if (row.status === "available") current.available += 1;
    if (row.status === "redeemed") current.redeemed += 1;
    if (row.status === "revoked") current.revoked += 1;
    giveawayCounts.set(row.campaign_id, current);
  }
  const [providerHealthResult, errorLogResult, withdrawalResult] = supabase ? await Promise.all([
    supabase.from("provider_health")
      .select("provider,operation,ok,latency_ms,status_code,error_class,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("error_logs")
      .select("id,service,sanitized_error,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("withdrawal_requests")
      .select("id,user_id,stripe_subscription_id,plan_key,status,submitted_at")
      .order("submitted_at", { ascending: false })
      .limit(20),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const providerHealthRows = (providerHealthResult.data ?? []) as ProviderHealthRow[];
  const recentErrors = (errorLogResult.data ?? []) as ErrorLogRow[];
  const recentWithdrawals = (withdrawalResult.data ?? []) as WithdrawalRow[];
  const runtimeHealth = Array.from(providerHealthRows.reduce((map, row) => {
    const key = `${row.provider}:${row.operation}`;
    const current = map.get(key) ?? {
      provider: row.provider, operation: row.operation, calls: 0, successes: 0,
      latencyTotal: 0, latencySamples: 0, lastIssue: null,
    };    current.calls += 1;
    if (row.ok) current.successes += 1;
    if (typeof row.latency_ms === "number") {
      current.latencyTotal += row.latency_ms;
      current.latencySamples += 1;
    }
    if (!row.ok && !current.lastIssue) {
      current.lastIssue = row.error_class ?? (row.status_code ? `HTTP ${row.status_code}` : "Failure");
    }
    map.set(key, current);
    return map;
  }, new Map<string, RuntimeHealth>()).values()).sort((a, b) =>
    a.provider.localeCompare(b.provider) || a.operation.localeCompare(b.operation),
  );

  const env = getServerEnv();
  const protectedAdminEmails = new Set(adminEmails());
  const services = [
    ["Supabase", isSupabaseConfigured() && Boolean(env.SUPABASE_SERVICE_ROLE_KEY)],
    ["Stripe", isStripeConfigured()],
    ["Financial data", isFinancialProviderConfigured()],
    ["PostHog", Boolean(env.NEXT_PUBLIC_POSTHOG_KEY)],
    ["Email", env.EMAIL_PROVIDER !== "disabled" && Boolean(env.RESEND_API_KEY)],
  ] as const;
  const stats: Array<{ label: string; value: number; note: string }> = [
    { label: "Users", value: counts[0]?.count ?? 0, note: "profiles" },
    { label: "Analyses", value: counts[1]?.count ?? 0, note: "reports" },
    { label: "Active subscriptions", value: counts[3]?.count ?? 0, note: "billing" },
    { label: "Ambassadors", value: counts[4]?.count ?? 0, note: "custom access" },
    { label: "Withdrawal notices", value: counts[5]?.count ?? 0, note: "needs review" },
  ];

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-[#e1cb95]" aria-hidden="true" />
          <div>
            <p className="text-sm text-[#9aa7b8]">Signed in as {user.email}</p>
            <h1 className="serif text-3xl font-semibold">Admin operations</h1>
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <Database className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
              <p className="mt-3 text-xs text-[#9aa7b8]">{stat.label}</p>
              <p className="number mt-1 text-3xl font-semibold">{stat.value}</p>
              <p className="mt-1 text-xs text-[#7f8b9b]">{stat.note}</p>
            </Card>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Provider readiness</h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
            {services.map(([name, ready]) => (
              <div key={name} className="flex items-center justify-between border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-3 last:border-0">
                <span className="text-sm">{name}</span>
                <span className={`flex items-center gap-2 text-sm ${ready ? "text-emerald-200" : "text-amber-200"}`}>
                  {ready ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                  {ready ? "Ready" : "Setup required"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="add-ambassador" className="mt-10 scroll-mt-24">
          <p className="text-sm font-semibold text-[#e1cb95]">Affiliate operations</p>
          <h2 className="serif mt-2 text-2xl font-semibold">Add ambassador</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Create the login, choose commission and monthly analysis allowance, then send the temporary credentials to the ambassador.</p>
          <AmbassadorCreateForm />
        </section>

        <section className="mt-10">
          <p className="text-sm font-semibold text-[#e1cb95]">Affiliate promotions</p>
          <h2 className="serif mt-2 text-2xl font-semibold">Giveaway campaigns</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Create one-time codes that ambassadors can use for competitions. Winners receive temporary StockBox access without a Stripe subscription or affiliate commission.</p>
          <form action={createAffiliateGiveawayCampaignAction} className="mt-5 grid gap-3 rounded-lg border border-white/10 bg-[#0d1c2e]/70 p-4 md:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs text-[#9aa7b8] lg:col-span-2">Ambassador
              <select name="affiliateId" required className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white">
                <option value="">Select ambassador</option>
                {((affiliateResult.data ?? []) as AffiliateRow[]).filter((item) => item.status === "active" && item.user_id !== null && ambassadorUserIds.has(item.user_id)).map((item) => (
                  <option key={item.id} value={item.id}>{item.display_name ?? item.code} ({item.code})</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#9aa7b8]">Plan
              <select name="planKey" defaultValue="standard" className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white">
                <option value="basic">Basic</option><option value="standard">Standard</option><option value="premium">Pro</option><option value="elite">Elite</option>
              </select>
            </label>
            <label className="text-xs text-[#9aa7b8]">Winners
              <input name="quantity" type="number" min="1" max="100" defaultValue="5" required className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-[#9aa7b8]">Free access months
              <input name="durationMonths" type="number" min="1" max="24" defaultValue="12" required className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-[#9aa7b8]">Redemption deadline (days, optional)
              <input name="claimDays" type="number" min="1" max="3650" placeholder="No deadline" className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-[#9aa7b8] md:col-span-2 lg:col-span-5">Campaign label
              <input name="label" maxLength={120} placeholder="September competition" required className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
            </label>
            <button type="submit" className="self-end rounded-md border border-[#e1cb95]/35 bg-[#e1cb95]/10 px-4 py-2 text-sm font-semibold text-[#f4e5b8] hover:bg-[#e1cb95]/15">Create giveaway</button>
          </form>
          <div className="mt-4 space-y-3">
            {giveawayCampaigns.map((campaign) => {
              const counts = giveawayCounts.get(campaign.id) ?? { available: 0, redeemed: 0, revoked: 0 };
              const planName = campaign.plan_key === "premium" ? "Pro" : campaign.plan_key.charAt(0).toUpperCase() + campaign.plan_key.slice(1);
              return <Card key={campaign.id} className="flex flex-wrap items-center justify-between gap-4">
                <div><p className="font-semibold text-[#f4efe5]">{campaign.label}</p><p className="mt-1 text-xs text-[#9aa7b8]">{planName} · {campaign.duration_months} months · {counts.redeemed}/{campaign.quantity} redeemed · {counts.available} available · {campaign.claim_expires_at ? `claim by ${new Date(campaign.claim_expires_at).toLocaleDateString("sv-SE")}` : "no redemption deadline"}</p></div>
                <div className="flex items-center gap-3"><span className="text-xs uppercase text-[#9aa7b8]">{campaign.status}</span>{campaign.status === "active" ? <form action={revokeAffiliateGiveawayCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><button className="rounded-md border border-red-300/20 px-3 py-2 text-xs text-red-200 hover:bg-red-400/10">Revoke unused codes</button></form> : null}</div>
              </Card>;
            })}
            {!giveawayCampaigns.length ? <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-4 text-sm text-[#9aa7b8]">No giveaway campaigns yet.</p> : null}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Runtime health</h2>
              <p className="mt-1 text-sm text-[#9aa7b8]">Latest provider attempts recorded by the application.</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Operation</th><th className="px-4 py-3 text-right">Calls</th><th className="px-4 py-3 text-right">Success rate</th><th className="px-4 py-3 text-right">Avg latency</th><th className="px-4 py-3">Latest issue</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#0d1c2e]/70">
                {runtimeHealth.length ? runtimeHealth.map((item) => {
                  const successRate = item.calls ? Math.round((item.successes / item.calls) * 100) : 0;
                  const averageLatency = item.latencySamples ? Math.round(item.latencyTotal / item.latencySamples) : null;
                  return (
                    <tr key={`${item.provider}:${item.operation}`}>
                      <td className="px-4 py-3 font-semibold">{item.provider}</td>
                      <td className="px-4 py-3 text-[#c9d2df]">{item.operation}</td>
                      <td className="number px-4 py-3 text-right">{item.calls}</td>
                      <td className={`number px-4 py-3 text-right ${successRate >= 95 ? "text-emerald-200" : successRate >= 80 ? "text-amber-200" : "text-red-200"}`}>{successRate}%</td>
                      <td className="number px-4 py-3 text-right">{averageLatency === null ? "—" : `${averageLatency} ms`}</td>
                      <td className="px-4 py-3 text-xs text-[#c9d2df]">{item.lastIssue ?? "—"}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={6} className="px-4 py-5 text-sm text-[#9aa7b8]">No provider attempts have been recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Recent application errors</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">Only sanitized error messages are shown here. Raw request context is never rendered.</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
            {recentErrors.length ? recentErrors.map((item) => (
              <div key={item.id} className="border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#f4efe5]">{item.service}</p>
                  <time className="text-xs text-[#7f8b9b]" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("en-SE")}</time>
                </div>
                <p className="mt-2 break-words text-sm leading-6 text-[#c9d2df]">{item.sanitized_error}</p>
              </div>
            )) : (
              <p className="bg-[#0d1c2e]/70 px-4 py-4 text-sm text-[#9aa7b8]">No application errors are currently recorded.</p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Withdrawal notices</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">Consumer withdrawal notices are timestamped here for operational follow-up.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr><th className="px-4 py-3">Received</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">User</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#0d1c2e]/70">
                {recentWithdrawals.length ? recentWithdrawals.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{new Date(item.submitted_at).toLocaleString("en-SE")}</td>
                    <td className="px-4 py-3 font-semibold text-amber-200">{item.status}</td>
                    <td className="px-4 py-3">{item.plan_key}</td>
                    <td className="number px-4 py-3 text-xs">{item.stripe_subscription_id}</td>
                    <td className="number px-4 py-3 text-xs">{item.user_id}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-4 py-5 text-sm text-[#9aa7b8]">No withdrawal notices recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Affiliate ambassadors</h2>
              <p className="mt-1 text-sm text-[#9aa7b8]">Configure individual access, referral status and commission for each ambassador.</p>
            </div>
            <Link href="#add-ambassador" className="inline-flex h-10 items-center justify-center rounded-md border border-[#e1cb95]/35 bg-[#e1cb95]/10 px-4 text-sm font-semibold text-[#f4e5b8] hover:bg-[#e1cb95]/15">+ Add ambassador</Link>
          </div>
          <div className="mt-4 space-y-4">
            {profiles.length ? profiles.map((profile) => {
              const ambassador = profile.role === "affiliate_ambassador";
              const limits = ambassadorEntitlements.get(profile.id) ?? {
                user_id: profile.id, monthly_analyses: 100, deep_analyses: 100,
                batch_rows: 50, watchlist_items: 75, portfolios: 5,
              };
              const affiliate = affiliatesByUser.get(profile.id);
              const commissionPercent = ((affiliate?.commission_basis_points ?? 0) / 100).toFixed(2).replace(/\.00$/, "");
              const protectedAccount = profile.id === user.id || profile.role === "admin" || Boolean(profile.email && protectedAdminEmails.has(profile.email.toLowerCase()));
              return (
                <div key={profile.id} className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{profile.email ?? profile.id}</p>
                      <p className="mt-1 text-xs text-[#7f8b9b]">Role: {profile.role}</p>
                    </div>
                    <div className="text-right text-xs text-[#9aa7b8]">
                      <p>Referral code: <span className="font-mono text-[#f4efe5]">{affiliate?.code ?? "—"}</span></p>
                      <p className="mt-1">Affiliate status: <span className="text-[#f4efe5]">{affiliate?.status ?? "not provisioned"}</span></p>
                    </div>
                  </div>

                  {affiliate ? (
                    <form action={updateAffiliateProfileAction} className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-[1.2fr_1fr_0.8fr_auto] md:items-end">
                      <input type="hidden" name="affiliateId" value={affiliate.id} />
                      <label className="text-xs text-[#9aa7b8]">Affiliate name
                        <input name="displayName" minLength={2} maxLength={80} defaultValue={affiliate.display_name ?? profile.email ?? "Affiliate"} required className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Referral code
                        <input name="referralCode" minLength={3} maxLength={48} defaultValue={affiliate.code} required className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 font-mono text-sm text-white" />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Status
                        <select name="affiliateStatus" defaultValue={affiliate.status} className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white">
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                          <option value="pending">Pending</option>
                        </select>
                      </label>
                      <button type="submit" disabled={protectedAccount} className="rounded-md border border-[#e1cb95]/30 px-3 py-2 text-xs font-medium text-[#f4e5b8] hover:bg-[#e1cb95]/10 disabled:opacity-40">Save affiliate</button>
                    </form>
                  ) : null}

                  <form action={setAffiliateAmbassadorAccessAction} className="mt-4">
                    <input type="hidden" name="userId" value={profile.id} />
                    <input type="hidden" name="enabled" value="true" />
                    <fieldset disabled={protectedAccount} className="grid gap-3 md:grid-cols-3 lg:grid-cols-6 disabled:opacity-50">
                      <label className="text-xs text-[#9aa7b8]">Analyses / month
                        <input name="monthlyAnalyses" type="number" min="0" max="100000" step="1" defaultValue={limits.monthly_analyses} className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Deep / Research
                        <input name="deepAnalyses" type="number" min="0" max="100000" step="1" defaultValue={limits.deep_analyses} className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Batch rows
                        <input name="batchRows" type="number" min="0" max="50" step="1" defaultValue={limits.batch_rows} className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Watchlist
                        <input name="watchlistItems" type="number" min="0" max="100000" step="1" defaultValue={limits.watchlist_items} className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Portfolios
                        <input name="portfolios" type="number" min="0" max="10000" step="1" defaultValue={limits.portfolios} className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Commission %
                        <input name="commissionPercent" type="number" min="0" max="100" step="0.01" defaultValue={commissionPercent} className="mt-1 w-full rounded-md border border-white/10 bg-[#081523] px-3 py-2 text-sm text-white" />
                      </label>
                    </fieldset>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="submit" disabled={protectedAccount} className="rounded-md border border-[#e1cb95]/30 px-3 py-2 text-xs font-medium text-[#f4e5b8] transition hover:bg-[#e1cb95]/10 disabled:cursor-not-allowed disabled:opacity-40">
                        {protectedAccount ? "Protected" : ambassador ? "Save settings" : "Make ambassador"}
                      </button>
                      {ambassador ? (
                        <Link href={`/affiliate?preview=${profile.id}`} className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#f4efe5] hover:bg-white/8">
                          <Eye className="h-4 w-4" aria-hidden="true" />View dashboard
                        </Link>
                      ) : null}
                    </div>
                  </form>

                  {ambassador && !protectedAccount ? (
                    <form action={setAffiliateAmbassadorAccessAction} className="mt-2">
                      <input type="hidden" name="userId" value={profile.id} />
                      <input type="hidden" name="enabled" value="false" />
                      <input type="hidden" name="monthlyAnalyses" value={limits.monthly_analyses} />
                      <input type="hidden" name="deepAnalyses" value={limits.deep_analyses} />
                      <input type="hidden" name="batchRows" value={limits.batch_rows} />
                      <input type="hidden" name="watchlistItems" value={limits.watchlist_items} />
                      <input type="hidden" name="portfolios" value={limits.portfolios} />
                      <input type="hidden" name="commissionPercent" value={commissionPercent} />
                      <button type="submit" className="rounded-md border border-red-300/20 px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-400/10">Remove ambassador</button>
                    </form>
                  ) : null}
                </div>
              );
            }) : (
              <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-4 text-sm text-[#9aa7b8]">No profiles are available yet.</p>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Feedback queue</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">Review feedback and explicitly approve testimonials.</p>
          <div className="mt-4 space-y-3">
            {feedback.map((item) => (
              <Card key={item.id} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="text-sm font-semibold text-[#f4efe5]">{item.rating}/5 ★</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#c9d2df]">{item.comment}</p>
                </div>
                <form action={updateFeedbackAction} className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
                  <input type="hidden" name="feedbackId" value={item.id} />
                  <select name="status" defaultValue={item.status} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm">
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="resolved">Resolved</option>
                  </select>
                  <select name="testimonialApproved" defaultValue={item.testimonial_approved ? "true" : "false"} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm">
                    <option value="false">Not testimonial</option>
                    <option value="true">Approve testimonial</option>
                  </select>
                  <button className="sm:col-span-2 rounded-md border border-[#e1cb95]/30 px-3 py-2 text-xs font-medium text-[#f4e5b8]">Save feedback</button>
                </form>
              </Card>
            ))}            {!feedback.length ? <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-5 text-sm text-[#9aa7b8]">No feedback yet.</p> : null}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Contact inbox</h2>
          <div className="mt-4 space-y-3">
            {contactMessages.map((message) => (
              <Card key={message.id} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="font-semibold text-[#f4efe5]">{message.subject}</p>
                  <p className="mt-1 text-xs text-[#9aa7b8]">{message.name} · {message.email}</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-[#c9d2df]">{message.message}</p>
                </div>
                <form action={updateContactMessageAction} className="flex gap-2">
                  <input type="hidden" name="contactId" value={message.id} />
                  <select name="status" defaultValue={message.status} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm">
                    <option value="new">New</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="spam">Spam</option>
                  </select>
                  <button className="rounded-md border border-[#e1cb95]/30 px-3 text-xs font-medium text-[#f4e5b8]">Save</button>
                </form>
              </Card>
            ))}            {!contactMessages.length ? <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-5 text-sm text-[#9aa7b8]">No contact messages yet.</p> : null}
          </div>
        </section>
      </Container>
    </Section>
  );
}
