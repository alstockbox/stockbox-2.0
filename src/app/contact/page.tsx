import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { ContactForm } from "@/components/support/contact-form";
import { Card, Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";
import { getLegalSeller } from "@/lib/legal/commerce";

export const metadata: Metadata = {
  title: "Contact StockBox",
  description: "Contact StockBox about accounts, billing, research reports, privacy or support.",
};

export default async function ContactPage() {
  const locale = await getLocale();
  const seller = getLegalSeller();
  const sv = locale === "sv";

  return <Section><Container className="max-w-4xl">
    <div className="flex items-center gap-3"><Mail className="h-6 w-6 text-[#e1cb95]" /><p className="text-sm font-semibold text-[#e1cb95]">Support</p></div>
    <h1 className="serif mt-3 text-4xl font-semibold text-[#f4efe5]">{sv ? "Kontakta StockBox" : "Contact StockBox"}</h1>
    <p className="mt-3 max-w-2xl text-sm leading-7 text-[#9aa7b8]">{sv ? "Frågor om konto, betalning, analyser, integritet eller StockBox? Använd formuläret eller våra verifierade kontaktvägar nedan." : "Questions about your account, billing, analyses, privacy or StockBox? Use the form or the verified contact channels below."}</p>
    <div className="mt-8 grid gap-5 md:grid-cols-[0.9fr_1.4fr]">
      <Card className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9aa7b8]">{sv ? "Operatör" : "Operator"}</p>
          <p className="mt-1 font-semibold text-[#f4efe5]">{seller.businessName || "StockBox"}</p>
        </div>
        {seller.supportEmail ? <a href={`mailto:${seller.supportEmail}`} className="flex items-center gap-2 text-sm text-[#e1cb95] hover:text-white"><Mail className="h-4 w-4" />{seller.supportEmail}</a> : <p className="text-sm text-[#9aa7b8]">{sv ? "Support-e-post visas här när den verifierade adressen är konfigurerad." : "Support email appears here when the verified address is configured."}</p>}
        {seller.supportPhone ? <a href={`tel:${seller.supportPhone.replace(/\s+/g, "")}`} className="flex items-center gap-2 text-sm text-[#e1cb95] hover:text-white"><Phone className="h-4 w-4" />{seller.supportPhone}</a> : null}
        {seller.postalAddress ? <p className="text-sm leading-6 text-[#c9d2df]">{seller.postalAddress}</p> : null}
        {seller.organizationNumber ? <p className="text-xs text-[#9aa7b8]">{sv ? "Org.nr" : "Organization no."}: {seller.organizationNumber}</p> : null}
      </Card>
      <Card><ContactForm /></Card>
    </div>
  </Container></Section>;
}
