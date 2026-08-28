import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Affiliate dashboard" };
export const dynamic = "force-dynamic";

type AffiliateRow = {
  id: string;
  code: string;
  status: string;
  commission_basis_points: number;
};

export default async function AffiliatePage() {
  const user = await requireUser();
  if (user.role !== "affiliate_ambassador" && user.role !== "admin") notFound();

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data } = await admin
    .from("affiliates")
    .select("id,code,status,commission_basis_points")
    .eq("user_id", user.id)
    .maybeSingle();
  const affiliate = data as AffiliateRow | null;

  if (!affiliate) {
    return (
      <Section>
        <Container>
          <Card>
            <h1 className="serif text-3xl font-semibold">Affiliate dashboard</h1>
            <p className="mt-3 text-sm text-[#9aa7b8]">
              Your affiliate identity is not provisioned yet. Ask an administrator to re-apply ambassador access.
            </p>
          </Card>
        </Container>
      </Section>
    );
  }

  const [clickResult, attributionResult] = await Promise.all([
    admin.from("affiliate_clicks").select("id", { count: "exact", head: true }).eq("affiliate_id", affiliate.id),
    admin.from("affiliate_attributions").select("referred_user_id").eq("affiliate_id", affiliate.id),
  ]);
  const referredIds = (attributionResult.data ?? [])
    .map((row) => row.referred_user_id as string | null)
    .filter((id): id is string => Boolean(id));

  let activeBasicConversions = 0;
  if (referredIds.length) {
    const conversionResult = await admin
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("user_id", referredIds)
      .eq("plan_key", "basic")
      .in("status", ["active", "trialing"]);
    activeBasicConversions = conversionResult.count ?? 0;
  }

  const env = getServerEnv();
  const referralUrl = `${env.NEXT_PUBLIC_APP_URL}/r/${affiliate.code}`;
  const commissionRate = affiliate.commission_basis_points / 100;
  const stats = [
    { label: "Clicks", value: clickResult.count ?? 0 },
    { label: "Signups", value: referredIds.length },
    { label: "Active Basic conversions", value: activeBasicConversions },
    { label: "Commission rate", value: `${commissionRate}%` },
  ];

  return (
    <Section>
      <Container>
        <div>
          <p className="text-sm font-semibold text-[#e1cb95]">Partner workspace</p>
          <h1 className="serif mt-2 text-3xl font-semibold">Affiliate dashboard</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">
            Aggregate referral performance only. Referred customer identities are not shown here.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <p className="text-xs uppercase tracking-wide text-[#9aa7b8]">{stat.label}</p>
              <p className="number mt-2 text-3xl font-semibold text-[#f4efe5]">{stat.value}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#9aa7b8]">Status</p>
              <p className="mt-1 text-lg font-semibold capitalize text-[#f4efe5]">{affiliate.status}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#c9d2df]">
              30-day first-touch attribution
            </span>
          </div>
          <div className="mt-5">
            <p className="text-sm font-semibold text-[#f4efe5]">Your referral link</p>
            <code className="mt-2 block overflow-x-auto rounded-md border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-[#e1cb95]">
              {referralUrl}
            </code>
          </div>
          <p className="mt-4 text-xs leading-5 text-[#7f8b9b]">
            Commission is shown from the configured affiliate rate. No estimated payout amount is fabricated before paid-invoice attribution is available.
          </p>
        </Card>
      </Container>
    </Section>
  );
}
