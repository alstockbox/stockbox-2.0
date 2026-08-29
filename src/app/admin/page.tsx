import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Database, Eye, ShieldCheck } from "lucide-react";
import { AmbassadorCreateForm } from "@/components/admin/ambassador-create-form";
import { Card, Container, Section } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import {
  adminEmails,
  getServerEnv,
  isFinancialProviderConfigured,
  isStripeConfigured,
  isSupabaseConfigured,
} from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setAffiliateAmbassadorAction, updateAmbassadorAction, updateContactMessageAction, updateFeedbackAction } from "./actions";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const user = await requireAdmin();
  const supabase = createAdminClient();
  const [counts, profileResult, affiliateResult] = supabase ? await Promise.all([
    Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("analyses").select("id", { count: "exact", head: true }),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing"]),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "affiliate_ambassador"),
    ]),    supabase.from("profiles").select("id,email,role,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("affiliates").select("id,user_id,code,status,display_name,commission_basis_points,monthly_analysis_limit,payout_enabled,stripe_connect_account_id").order("created_at", { ascending: false }),
  ]) : [[], { data: [] }, { data: [] }];

  const profiles = profileResult.data ?? [];
  const affiliates = affiliateResult.data ?? [];
  const affiliateByUser = new Map(affiliates.map((affiliate) => [affiliate.user_id, affiliate]));
  const [feedbackResult, contactResult] = supabase ? await Promise.all([
    supabase.from("feedback_submissions").select("id,rating,comment,status,testimonial_approved,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("contact_messages").select("id,name,email,subject,message,status,created_at").order("created_at", { ascending: false }).limit(50),
  ]) : [{ data: [] }, { data: [] }];
  const feedback = feedbackResult.data ?? [];
  const contactMessages = contactResult.data ?? [];
  const env = getServerEnv();
  const protectedAdminEmails = new Set(adminEmails());
  const services = [
    ["Supabase", isSupabaseConfigured() && Boolean(env.SUPABASE_SERVICE_ROLE_KEY)],
    ["Stripe", isStripeConfigured()],
    ["Financial data", isFinancialProviderConfigured()],
    ["PostHog", Boolean(env.NEXT_PUBLIC_POSTHOG_KEY)],
    ["Email", env.EMAIL_PROVIDER !== "disabled" && Boolean(env.RESEND_API_KEY)],
  ] as const;
  const stats = [
    { label: "Users", value: counts[0]?.count ?? 0, note: "profiles" },
    { label: "Analyses", value: counts[1]?.count ?? 0, note: "reports" },
    { label: "Active subscriptions", value: counts[2]?.count ?? 0, note: "billing" },
    { label: "Ambassadors", value: counts[3]?.count ?? 0, note: "managed here" },
  ];

  return (
    <Section>
      <Container>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-[#e1cb95]" aria-hidden="true" />          <div>
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
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {services.map(([name, ready]) => (
              <div key={name} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-3">
                <span className="text-sm">{name}</span>
                {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-200" aria-label="Ready" /> : <AlertTriangle className="h-4 w-4 text-amber-200" aria-label="Setup required" />}
              </div>
            ))}
          </div>
        </section>
        <section className="mt-10">
          <div>
            <p className="text-sm font-semibold text-[#e1cb95]">Affiliate operations</p>
            <h2 className="serif mt-2 text-2xl font-semibold">Add ambassador</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">
              Create the login yourself, choose the commission and analysis allowance, then send the credentials to the ambassador.
            </p>
          </div>
          <AmbassadorCreateForm />
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Affiliate ambassadors</h2>
              <p className="mt-1 text-sm text-[#9aa7b8]">Change quota, commission or pause access. Preview opens a read-only admin view.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {profiles.filter((profile) => profile.role === "affiliate_ambassador").map((profile) => {
              const affiliate = affiliateByUser.get(profile.id);
              const commissionPercent = ((affiliate?.commission_basis_points ?? 0) / 100).toFixed(1);
              const protectedAccount = profile.id === user.id || Boolean(profile.email && protectedAdminEmails.has(profile.email.toLowerCase()));
              return (
                <Card key={profile.id} className="grid gap-4 lg:grid-cols-[1.2fr_2fr_auto] lg:items-end">
                  <div>
                    <p className="font-medium text-[#f4efe5]">{affiliate?.display_name || profile.email || profile.id}</p>                    <p className="mt-1 text-xs text-[#9aa7b8]">{profile.email}</p>
                    <p className="mt-2 text-xs text-[#7f8b9b]">Code: {affiliate?.code ?? "Not configured"}</p>
                    <p className="mt-1 text-xs text-[#7f8b9b]">Payouts: {affiliate?.payout_enabled ? "Enabled" : "Not connected"}</p>
                  </div>
                  {affiliate ? (
                    <form action={updateAmbassadorAction} className="grid gap-3 sm:grid-cols-3">
                      <input type="hidden" name="userId" value={profile.id} />
                      <label className="text-xs text-[#9aa7b8]">Commission %
                        <input className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]" name="commissionPercent" type="number" min="0" max="100" step="0.1" defaultValue={commissionPercent} />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Analyses / month
                        <input className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]" name="monthlyAnalysisLimit" type="number" min="0" max="100000" defaultValue={affiliate.monthly_analysis_limit ?? 100} />
                      </label>
                      <label className="text-xs text-[#9aa7b8]">Status
                        <select className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]" name="status" defaultValue={affiliate.status === "paused" ? "paused" : "active"}>
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                        </select>
                      </label>
                      <button className="sm:col-span-3 rounded-md border border-[#e1cb95]/30 px-3 py-2 text-xs font-medium text-[#f4e5b8] hover:bg-[#e1cb95]/10">Save ambassador settings</button>
                    </form>
                  ) : <p className="text-sm text-amber-200">Affiliate profile missing. Toggle the role off/on to repair it.</p>}
                  <div className="flex flex-col gap-2">
                    <Link href={`/affiliate?preview=${profile.id}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 px-3 text-xs font-semibold text-[#f4efe5] hover:bg-white/8">
                      <Eye className="h-4 w-4" aria-hidden="true" />View dashboard
                    </Link>                    <form action={setAffiliateAmbassadorAction}>
                      <input type="hidden" name="userId" value={profile.id} />
                      <input type="hidden" name="enabled" value="false" />
                      <button disabled={protectedAccount} className="h-10 w-full rounded-md border border-red-400/25 px-3 text-xs font-semibold text-red-100 hover:bg-red-950/40 disabled:opacity-40">
                        {protectedAccount ? "Protected" : "Remove role"}
                      </button>
                    </form>
                  </div>
                </Card>
              );
            })}
            {!profiles.some((profile) => profile.role === "affiliate_ambassador") ? (
              <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-5 text-sm text-[#9aa7b8]">No ambassadors yet. Create the first one above.</p>
            ) : null}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Feedback queue</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">Review product feedback and approve strong comments for testimonial use.</p>
          <div className="mt-4 space-y-3">
            {feedback.map((item) => (
              <Card key={item.id} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div><p className="text-sm font-semibold text-[#f4efe5]">{item.rating}/5 ★</p><p className="mt-2 whitespace-pre-wrap text-sm text-[#c9d2df]">{item.comment}</p><p className="mt-2 text-xs text-[#7f8b9b]">{new Date(item.created_at).toLocaleDateString("sv-SE")}</p></div>
                <form action={updateFeedbackAction} className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
                  <input type="hidden" name="feedbackId" value={item.id} />
                  <select name="status" defaultValue={item.status} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm"><option value="new">New</option><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option></select>
                  <select name="testimonialApproved" defaultValue={item.testimonial_approved ? "true" : "false"} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm"><option value="false">Not testimonial</option><option value="true">Approve testimonial</option></select>
                  <button className="sm:col-span-2 rounded-md border border-[#e1cb95]/30 px-3 py-2 text-xs font-medium text-[#f4e5b8] hover:bg-[#e1cb95]/10">Save feedback</button>
                </form>
              </Card>
            ))}
            {!feedback.length ? <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-5 text-sm text-[#9aa7b8]">No feedback yet.</p> : null}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Contact inbox</h2>
          <div className="mt-4 space-y-3">
            {contactMessages.map((message) => (
              <Card key={message.id} className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div><p className="font-semibold text-[#f4efe5]">{message.subject}</p><p className="mt-1 text-xs text-[#9aa7b8]">{message.name} · {message.email}</p><p className="mt-3 whitespace-pre-wrap text-sm text-[#c9d2df]">{message.message}</p></div>
                <form action={updateContactMessageAction} className="flex gap-2"><input type="hidden" name="contactId" value={message.id} /><select name="status" defaultValue={message.status} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm"><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="spam">Spam</option></select><button className="rounded-md border border-[#e1cb95]/30 px-3 text-xs font-medium text-[#f4e5b8]">Save</button></form>
              </Card>
            ))}
            {!contactMessages.length ? <p className="rounded-lg border border-white/10 bg-[#0d1c2e]/70 px-4 py-5 text-sm text-[#9aa7b8]">No contact messages yet.</p> : null}
          </div>
        </section>
      </Container>
    </Section>
  );
}
