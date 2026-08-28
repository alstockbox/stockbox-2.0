import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { adminEmails, getServerEnv, isFinancialProviderConfigured, isStripeConfigured, isSupabaseConfigured } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setAffiliateAmbassadorAccessAction } from "./actions";

export const metadata: Metadata = { title: "Admin" };

type ProviderHealthRow = { provider: string; operation: string; ok: boolean; latency_ms: number | null; status_code: number | null; error_class: string | null; created_at: string };
type ErrorLogRow = { id: number; service: string; sanitized_error: string; created_at: string };
type RuntimeHealth = { provider: string; operation: string; calls: number; successes: number; latencyTotal: number; latencySamples: number; lastIssue: string | null };
type AmbassadorEntitlementRow = { user_id: string; monthly_analyses: number; deep_analyses: number; batch_rows: number; watchlist_items: number; portfolios: number };
type AffiliateRow = { user_id: string | null; code: string; status: string; commission_basis_points: number };

export default async function AdminPage() {
  const user = await requireAdmin();
  const supabase = createAdminClient();
  const counts = supabase ? await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("analyses").select("id", { count: "exact", head: true }),
    supabase.from("error_logs").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "affiliate_ambassador"),
  ]) : [];
  const profileResult = supabase
    ? await supabase.from("profiles").select("id,email,role,created_at").order("created_at", { ascending: false }).limit(50)
    : { data: [] };
  const profiles = profileResult.data ?? [];
  const [ambassadorEntitlementResult, affiliateResult] = supabase ? await Promise.all([
    supabase.from("ambassador_entitlements")
      .select("user_id,monthly_analyses,deep_analyses,batch_rows,watchlist_items,portfolios"),
    supabase.from("affiliates")
      .select("user_id,code,status,commission_basis_points"),
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
  const [providerHealthResult, errorLogResult] = supabase ? await Promise.all([
    supabase.from("provider_health")
      .select("provider,operation,ok,latency_ms,status_code,error_class,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("error_logs")
      .select("id,service,sanitized_error,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]) : [{ data: [] }, { data: [] }];
  const providerHealthRows = (providerHealthResult.data ?? []) as ProviderHealthRow[];
  const recentErrors = (errorLogResult.data ?? []) as ErrorLogRow[];
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Affiliate ambassadors</h2>
              <p className="mt-1 text-sm text-[#9aa7b8]">Configure individual access, referral status and commission for each ambassador.</p>
            </div>
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
      </Container>
    </Section>
  );
}
