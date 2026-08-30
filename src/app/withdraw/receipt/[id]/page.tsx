import { createHash } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Withdrawal receipt",
  robots: { index: false, follow: false, noarchive: true },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; delivery?: string }>;
};

function receiptTokenHash(token: string) {
  return createHash("sha256").update(token.trim().toLowerCase()).digest("hex");
}

export default async function WithdrawalReceiptPage({ params, searchParams }: Props) {
  const [{ id }, query, locale] = await Promise.all([params, searchParams, getLocale()]);
  const token = query.token?.trim();
  if (!token) redirect("/withdraw?error=receipt");
  const admin = createAdminClient();
  if (!admin) redirect("/withdraw?error=unavailable");

  const { data } = await admin.from("withdrawal_requests")
    .select("id,stripe_subscription_id,plan_key,status,submitted_at,consumer_name,contract_reference,confirmation_email,receipt_delivery_status,receipt_token_hash")
    .eq("id", id)
    .eq("receipt_token_hash", receiptTokenHash(token))
    .maybeSingle();
  if (!data) redirect("/withdraw?error=receipt");

  const sv = locale === "sv";
  const submitted = new Intl.DateTimeFormat(sv ? "sv-SE" : "en-SE", {
    dateStyle: "long", timeStyle: "medium", timeZone: "Europe/Stockholm",
  }).format(new Date(data.submitted_at));
  const deliveryFailed = data.receipt_delivery_status === "failed" || query.delivery === "failed";

  return <Section><Container className="max-w-3xl">
    <p className="text-sm font-semibold text-emerald-300">{sv ? "Mottaget" : "Received"}</p>
    <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">{sv ? "Ditt ångermeddelande är registrerat" : "Your withdrawal notice is recorded"}</h1>
    <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{sv ? "Spara den här sidan eller ladda ner mottagningsbeviset. Länken innehåller ett privat kvittotoken och bör inte delas." : "Save this page or download the receipt. The link contains a private receipt token and should not be shared."}</p>
    <Card className="mt-8 space-y-3 text-sm text-[#c9d2df]">
      <p><span className="text-[#9aa7b8]">{sv ? "Kvitto-ID" : "Receipt ID"}:</span> <span className="number">{data.id}</span></p>
      <p><span className="text-[#9aa7b8]">{sv ? "Mottaget" : "Received"}:</span> {submitted}</p>
      {data.consumer_name ? <p><span className="text-[#9aa7b8]">{sv ? "Namn" : "Name"}:</span> {data.consumer_name}</p> : null}
      <p><span className="text-[#9aa7b8]">{sv ? "Avtalsreferens" : "Contract reference"}:</span> {data.contract_reference || data.stripe_subscription_id || "—"}</p>
      <p><span className="text-[#9aa7b8]">{sv ? "Plan" : "Plan"}:</span> {data.plan_key}</p>
      <p><span className="text-[#9aa7b8]">Status:</span> {data.status}</p>
      <p><span className="text-[#9aa7b8]">{sv ? "Mottagningsbevis via e-post" : "Email receipt"}:</span> {data.receipt_delivery_status === "sent" ? (sv ? "Skickat" : "Sent") : (sv ? "Inte bekräftat som skickat" : "Not confirmed sent")}</p>
    </Card>

    {deliveryFailed ? <p className="mt-5 rounded-md border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">{sv ? "E-postleveransen kunde inte bekräftas. Ditt ångermeddelande är ändå registrerat med tidsstämpeln ovan. Ladda ner mottagningsbeviset här och spara det." : "Email delivery could not be confirmed. Your withdrawal notice is still recorded with the timestamp above. Download and keep the receipt here."}</p> : null}

    <div className="mt-7 flex flex-wrap gap-3">
      <a href={`/withdraw/receipt/${data.id}/download?token=${encodeURIComponent(token)}`} className="inline-flex h-10 items-center justify-center rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]">{sv ? "Ladda ner mottagningsbevis" : "Download receipt"}</a>
      <Link href="/contact" className="inline-flex h-10 items-center rounded-md border border-white/15 px-4 text-sm font-semibold text-[#f4efe5] hover:bg-white/10">{sv ? "Kontakta support" : "Contact support"}</Link>
    </div>
    <p className="mt-5 text-xs leading-6 text-[#9aa7b8]">{sv ? "Mottagningsbeviset dokumenterar när meddelandet togs emot. Det är inte i sig ett slutligt beslut om återbetalning eller annan avtalsverkan." : "The receipt documents when the notice was received. It is not, by itself, a final decision about a refund or other contractual consequence."}</p>
  </Container></Section>;
}
