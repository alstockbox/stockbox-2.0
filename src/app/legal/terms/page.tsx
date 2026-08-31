import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/card";
import { commerciallyActivePlans } from "@/lib/billing/plans";
import { getLocale } from "@/lib/i18n/server";
import { getLegalCommerceReadiness, legalVatDescription } from "@/lib/legal/commerce";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for StockBox accounts, subscriptions, research outputs, consumer withdrawal rights, billing and acceptable use.",
  alternates: { canonical: "/legal/terms" },
};

export default async function TermsPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  const legal = getLegalCommerceReadiness();
  const seller = legal.seller;
  const paidPlans = commerciallyActivePlans.filter((plan) => plan.key !== "free");

  const heading = "text-lg font-semibold text-[#f4efe5]";
  const paragraph = "mt-2";

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="serif text-4xl font-semibold">{sv ? "Användarvillkor" : "Terms of service"}</h1>
        <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Gäller från 28 augusti 2026." : "Effective 28 August 2026."}</p>
        <div className="mt-8 space-y-8 text-sm leading-7 text-[#c9d2df]">
          <section>
            <h2 className={heading}>{sv ? "Säljare och kontaktuppgifter" : "Seller and contact details"}</h2>
            {legal.ready ? (
              <div className={paragraph}>
                <p>{seller.businessName} {sv ? "driver StockBox." : "operates StockBox."}</p>
                <p>{sv ? "Organisationsnummer" : "Organization number"}: {seller.organizationNumber}</p>
                <p>{sv ? "Adress" : "Address"}: {seller.postalAddress}</p>
                <p>{sv ? "E-post" : "Email"}: {seller.supportEmail}</p>
                <p>{sv ? "Telefon" : "Phone"}: {seller.supportPhone}</p>
              </div>
            ) : (
              <p className={paragraph}>
                {sv
                  ? "Säljarens juridiska namn, organisationsnummer, adress, e-post och telefon lämnas här och i köpinformationen innan ett betalt abonnemang erbjuds."
                  : "The seller's legal name, organization number, address, email and phone are provided here and in the purchase information before a paid subscription is offered."}
              </p>
            )}
          </section>

          <section>
            <h2 className={heading}>{sv ? "Tjänsten" : "The service"}</h2>
            <p className={paragraph}>{sv
              ? "StockBox är en webbaserad digital analystjänst för aktier. Tjänsten sammanställer marknads- och bolagsdata, beräknade nyckeltal och modellbaserade bedömningar. StockBox är inte en mäklare, kapitalförvaltare eller personlig investeringsrådgivare."
              : "StockBox is a web-based digital equity research service. It combines market and company data, calculated metrics and model-based assessments. StockBox is not a broker, asset manager or provider of individualized investment advice."}</p>
          </section>
          <section>
            <h2 className={heading}>{sv ? "Konto och användning" : "Account and acceptable use"}</h2>
            <p className={paragraph}>{sv
              ? "Du måste ha rättslig förmåga att ingå avtalet, lämna korrekta uppgifter och skydda dina inloggningsuppgifter. Du får inte kringgå användningsgränser, missbruka datakällor, försöka få obehörig åtkomst, störa tjänsten eller använda StockBox i strid med lag."
              : "You must have legal capacity to enter the agreement, provide accurate information and protect your credentials. You may not bypass usage limits, abuse data providers, seek unauthorized access, interfere with the service or use StockBox unlawfully."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Pris och abonnemang" : "Price and subscription"}</h2>
            <div className={`${paragraph} space-y-2`}>
              {paidPlans.map((plan) => (
                <p key={plan.key}>
                  <strong className="text-[#f4efe5]">{plan.name}:</strong>{" "}
                  {plan.launchOffer
                    ? (sv
                      ? `${plan.launchOffer.monthlyPriceSek} kr/mån under de första ${plan.launchOffer.durationMonths} månaderna när lanseringserbjudandet gäller, därefter ${plan.launchOffer.thenMonthlyPriceSek} kr/mån.`
                      : `SEK ${plan.launchOffer.monthlyPriceSek}/month for the first ${plan.launchOffer.durationMonths} months when the launch offer applies, then SEK ${plan.launchOffer.thenMonthlyPriceSek}/month.`)
                    : (sv ? `${plan.monthlyPriceSek} kr/mån.` : `SEK ${plan.monthlyPriceSek}/month.`)}
                </p>
              ))}
            </div>
            <p className={paragraph}>{sv
              ? "Abonnemang förnyas månadsvis tills de sägs upp. Det bindande totalpriset och eventuella skatter eller avgifter visas innan betalning."
              : "Subscriptions renew monthly until cancelled. The binding total price and any applicable taxes or fees are shown before payment."}</p>
            <p className={paragraph}>{legalVatDescription(seller, sv ? "sv" : "en")}</p>
            <p className={paragraph}>{sv
              ? "Betalningar behandlas av Stripe. Du kan stoppa framtida förnyelser via Betalning/Billing. En uppsägning påverkar normalt inte redan betald åtkomst fram till periodens slut, om inte tvingande lag eller en giltig ånger-/reklamationsbegäran kräver annat."
              : "Payments are processed by Stripe. You can stop future renewals through Billing. Cancellation normally does not remove already paid access before the end of the billing period unless mandatory law or a valid withdrawal/complaint requires otherwise."}</p>
          </section>
          <section>
            <h2 className={heading}>{sv ? "Ångerrätt" : "Right of withdrawal"}</h2>
            <p className={paragraph}>{sv
              ? "Konsumenter har som huvudregel 14 dagars ångerrätt vid distansavtal. Du behöver inte ange någon anledning. StockBox ber inte vid lanseringen konsumenter att avstå från denna lagstadgade rätt."
              : "Consumers generally have a 14-day statutory withdrawal right for distance contracts. You do not need to give a reason. At launch, StockBox does not ask consumers to waive this statutory right."}</p>
            <p className={paragraph}>{sv
              ? "Använd ångerfunktionen på samma webbplats där avtalet ingicks. Din begäran tidsstämplas och du får ett mottagningsbevis som kan sparas."
              : "Use the withdrawal function on the same website where the contract was concluded. Your notice is timestamped and you receive a receipt that can be saved."} {" "}
              <Link href="/withdraw" className="font-semibold text-[#e1cb95] hover:text-white">
                {sv ? "Öppna ångerfunktionen" : "Open the withdrawal function"}
              </Link>.
            </p>
            <p className={paragraph}>
              {sv
                ? "Du kan också använda standardblanketten för utövande av ångerrätten."
                : "You may also use the model withdrawal form."}{" "}
              <Link href="/legal/withdrawal-form" className="font-semibold text-[#e1cb95] hover:text-white">
                {sv ? "Öppna standardblanketten" : "Open the model form"}
              </Link>.
            </p>
            <p className={paragraph}>{sv
              ? "Vid giltigt utövande återbetalas belopp i den omfattning och inom den tid som tvingande lag kräver."
              : "When the statutory right is validly exercised, amounts are refunded to the extent and within the time required by mandatory law."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Reklamation och digital tjänst" : "Complaints and digital service"}</h2>
            <p className={paragraph}>{sv
              ? "StockBox är en digital tjänst. Om tjänsten är felaktig, inte levereras enligt avtalet eller inte fungerar som den ska kan konsumenter ha rätt till avhjälpande, prisavdrag, hävning eller andra påföljder enligt tvingande konsumentlagstiftning. Kontakta support så snart du upptäcker ett fel och beskriv problemet."
              : "StockBox is a digital service. If the service is defective, is not supplied as agreed or does not function as required, consumers may have rights to correction, price reduction, termination or other remedies under mandatory consumer law. Contact support when you discover a problem and describe it."}</p>
          </section>
          <section>
            <h2 className={heading}>{sv ? "Analysrisk och datakällor" : "Research risk and data sources"}</h2>
            <p className={paragraph}>{sv
              ? "Analyser kan innehålla fel, fördröjningar, saknade datapunkter och modellantaganden. Historiska resultat och modellbetyg garanterar inte framtida utveckling. Du ansvarar för egna investeringsbeslut och bör kontrollera väsentliga uppgifter mot primärkällor."
              : "Analyses can contain errors, delays, missing data and model assumptions. Historical results and model ratings do not guarantee future performance. You remain responsible for investment decisions and should verify material information against primary sources."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Tillgänglighet och ändringar" : "Availability and changes"}</h2>
            <p className={paragraph}>{sv
              ? "StockBox kan uppdatera modeller, datakällor och funktioner för säkerhet, kvalitet eller produktutveckling. För betalda konsumentavtal görs väsentliga ändringar endast i den utsträckning och på det sätt som tillåts enligt tvingande regler för digitala tjänster."
              : "StockBox may update models, data sources and features for security, quality or product development. For paid consumer contracts, material changes are made only to the extent and in the manner permitted by mandatory rules for digital services."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Immateriella rättigheter" : "Intellectual property"}</h2>
            <p className={paragraph}>{sv
              ? "StockBox, dess programvara, design och egen modellogik skyddas av tillämpliga immateriella rättigheter. Din prenumeration ger en personlig, begränsad och icke överlåtbar rätt att använda tjänsten enligt dessa villkor. Tredjepartsdata omfattas av respektive leverantörs rättigheter och villkor."
              : "StockBox, its software, design and proprietary model logic are protected by applicable intellectual-property rights. Your subscription grants a personal, limited and non-transferable right to use the service under these terms. Third-party data remains subject to the relevant provider's rights and terms."}</p>
          </section>
          <section>
            <h2 className={heading}>{sv ? "Ansvar" : "Liability"}</h2>
            <p className={paragraph}>{sv
              ? "Inget i dessa villkor begränsar rättigheter eller ansvar som inte får begränsas enligt tvingande lag. I övrigt ansvarar StockBox endast för skada i den utsträckning som följer av tillämplig lag och ansvarar inte för investeringsförluster som enbart beror på hur användaren väljer att agera på analysen."
              : "Nothing in these terms limits rights or liability that cannot be limited under mandatory law. Otherwise, StockBox is liable only to the extent required by applicable law and is not responsible for investment losses caused solely by how a user chooses to act on research output."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Tillämplig lag och tvist" : "Governing law"}</h2>
            <p className={paragraph}>{sv
              ? "Avtalet regleras av svensk lag. Om du är konsument i ett annat land påverkar detta inte tvingande konsumentskydd som du har rätt till enligt lag som annars skulle vara tillämplig i ditt hemvistland. Tvister kan prövas av behörig domstol och svenska konsumenter kan, när villkoren är uppfyllda, vända sig till Allmänna reklamationsnämnden (ARN)."
              : "The agreement is governed by Swedish law. If you are a consumer in another country, this choice does not deprive you of mandatory consumer protection that would otherwise apply in your country of habitual residence. Disputes may be brought before a competent court, and Swedish consumers may use the National Board for Consumer Disputes (ARN) when its requirements are met."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Ändringar av villkoren" : "Changes to these terms"}</h2>
            <p className={paragraph}>{sv
              ? "Vi kan uppdatera villkoren när det finns sakliga skäl. Väsentliga ändringar som påverkar ett pågående konsumentabonnemang kommuniceras i förväg när lag kräver det."
              : "We may update these terms for objective reasons. Material changes affecting an ongoing consumer subscription are communicated in advance where required by law."}</p>
          </section>
        </div>
      </Container>
    </Section>
  );
}
