import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";
import { getLegalCommerceReadiness } from "@/lib/legal/commerce";
import { withdrawalFormText } from "@/lib/legal/withdrawal-form";

export const metadata: Metadata = {
  title: "Standard withdrawal form",
  description: "The model form consumers may use to exercise the statutory right of withdrawal for a StockBox subscription.",
};

export default async function WithdrawalFormPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  const legal = getLegalCommerceReadiness();
  const form = withdrawalFormText(legal.seller, sv ? "sv" : "en");

  return (
    <Section>
      <Container className="max-w-3xl">
        <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Konsumenträtt" : "Consumer rights"}</p>
        <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">
          {sv ? "Standardblankett för ångerrätt" : "Model withdrawal form"}
        </h1>
        <p className="mt-4 text-sm leading-7 text-[#c9d2df]">
          {sv
            ? "Du kan använda blanketten nedan om du vill frånträda ett StockBox-avtal. Du måste inte använda blanketten: ett annat tydligt meddelande räcker, och du kan även använda StockBox ångerfunktion online."
            : "You may use the form below to withdraw from a StockBox contract. You do not have to use this form: another unequivocal notice is sufficient, and you may also use StockBox's online withdrawal function."}
        </p>

        {!legal.ready ? (
          <p className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
            {sv
              ? "Säljaruppgifterna är ännu inte konfigurerade. Betald checkout är därför spärrad tills blanketten kan visas med korrekta uppgifter."
              : "Seller details are not configured yet. Paid checkout is therefore blocked until the form can be shown with the correct details."}
          </p>
        ) : null}

        <pre className="mt-8 whitespace-pre-wrap rounded-lg border border-white/10 bg-[#07111f] p-5 text-sm leading-7 text-[#f4efe5]">
          {form}
        </pre>

        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/withdraw" className="font-semibold text-[#e1cb95] hover:text-white">
            {sv ? "Använd ångerfunktionen online" : "Use the online withdrawal function"}
          </Link>
          <Link href="/legal/terms" className="font-semibold text-[#e1cb95] hover:text-white">
            {sv ? "Läs användarvillkoren" : "Read the terms"}
          </Link>
        </div>
        <p className="mt-8 text-xs leading-6 text-[#9aa7b8]">
          {sv
            ? "Du kan skriva ut eller spara den här sidan. Vid elektronisk ånger är StockBox ångerfunktion det enklaste alternativet och skickar ett tidsstämplat mottagningsbevis."
            : "You can print or save this page. For electronic withdrawal, StockBox's withdrawal function is the simplest option and sends a timestamped acknowledgement of receipt."}
        </p>
      </Container>
    </Section>
  );
}
