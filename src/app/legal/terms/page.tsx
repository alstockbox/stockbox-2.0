import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/card";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return <Section><Container className="max-w-3xl"><h1 className="serif text-4xl font-semibold">Terms of service</h1><p className="mt-3 text-sm text-[#e1cb95]">Draft dated August 20, 2026. Owner/legal approval is required before public launch.</p><div className="mt-8 space-y-7 text-sm leading-7 text-[#c9d2df]"><section><h2 className="text-lg font-semibold text-[#f4efe5]">Research tool, not advice</h2><p className="mt-2">StockBox provides model assessments from available data and assumptions. It does not provide individualized financial advice, execute trades, guarantee accuracy or guarantee outcomes. Users remain responsible for investment decisions and independent verification.</p></section><section><h2 className="text-lg font-semibold text-[#f4efe5]">Accounts and acceptable use</h2><p className="mt-2">Users must protect account credentials and may not abuse providers, bypass usage limits, scrape restricted data, reverse engineer access controls or use the service unlawfully.</p></section><section><h2 className="text-lg font-semibold text-[#f4efe5]">Subscriptions</h2><p className="mt-2">Paid plans renew until cancelled through the billing portal. Final pricing, VAT treatment, refund policy, trial terms, governing law, company identity and support contact require owner approval.</p></section></div></Container></Section>;
}
