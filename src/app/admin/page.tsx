import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { getServerEnv, isFinancialProviderConfigured, isStripeConfigured, isSupabaseConfigured } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requireAdmin();
  const supabase = createAdminClient();
  const counts = supabase ? await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("analyses").select("id", { count: "exact", head: true }),
    supabase.from("error_logs").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
  ]) : [];
  const env = getServerEnv();
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
    { label: "Logged errors", value: counts[2]?.count ?? 0, note: "sanitized" },
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
      </Container>
    </Section>
  );
}
