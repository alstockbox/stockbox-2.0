import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Withdrawal receipt" };

type Props = { params: Promise<{ id: string }> };

export default async function WithdrawalReceiptPage({ params }: Props) {
  const [{ id }, user, locale, supabase] = await Promise.all([
    params,
    requireUser(),
    getLocale(),
    createClient(),
  ]);
  if (!supabase) redirect("/withdraw?error=unavailable");

  const { data } = await supabase
    .from("withdrawal_requests")
    .select("id,stripe_subscription_id,plan_key,status,submitted_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) redirect("/withdraw?error=unavailable");

  const sv = locale === "sv";
  const submitted = new Intl.DateTimeFormat(sv ? "sv-SE" : "en-SE", {
    dateStyle: "long", timeStyle: "medium", timeZone: "Europe/Stockholm",
  }).format(new Date(data.submitted_at));

  return (
    <Section>
      <Container className="max-w-3xl">
        <p className="text-sm font-semibold text-emerald-300">{sv ? "Mottaget" : "Received"}</p>
        <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">
          {sv ? "Ditt ångermeddelande är registrerat" : "Your withdrawal notice is recorded"}
        </h1>        <Card className="mt-8 space-y-3 text-sm text-[#c9d2df]">
          <p><span className="text-[#9aa7b8]">{sv ? "Kvitto-ID" : "Receipt ID"}:</span> <span className="number">{data.id}</span></p>
          <p><span className="text-[#9aa7b8]">{sv ? "Mottaget" : "Received"}:</span> {submitted}</p>
          <p><span className="text-[#9aa7b8]">{sv ? "Abonnemang" : "Subscription"}:</span> <span className="number">{data.stripe_subscription_id}</span></p>
          <p><span className="text-[#9aa7b8]">{sv ? "Plan" : "Plan"}:</span> {data.plan_key}</p>
          <p><span className="text-[#9aa7b8]">Status:</span> {data.status}</p>
        </Card>

        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href={`/withdraw/receipt/${data.id}/download`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]"
          >
            {sv ? "Ladda ner mottagningsbevis" : "Download receipt"}
          </a>
          <Link href="/settings/billing" className="inline-flex h-10 items-center rounded-md border border-white/15 px-4 text-sm font-semibold text-[#f4efe5] hover:bg-white/10">
            {sv ? "Till fakturering" : "Back to billing"}
          </Link>
        </div>
        <p className="mt-5 text-xs leading-6 text-[#9aa7b8]">
          {sv ? "Spara mottagningsbeviset för dina handlingar." : "Save the receipt for your records."}
        </p>
      </Container>
    </Section>
  );
}
