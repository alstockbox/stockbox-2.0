import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/card";
import { getLocale } from "@/lib/i18n/server";
import { getLegalCommerceReadiness } from "@/lib/legal/commerce";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  const locale = await getLocale();
  const sv = locale === "sv";
  const legal = getLegalCommerceReadiness();
  const seller = legal.seller;
  const heading = "text-lg font-semibold text-[#f4efe5]";
  const paragraph = "mt-2";

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="serif text-4xl font-semibold">{sv ? "Integritetspolicy" : "Privacy notice"}</h1>
        <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Gäller från 28 augusti 2026." : "Effective 28 August 2026."}</p>
        <div className="mt-8 space-y-8 text-sm leading-7 text-[#c9d2df]">
          <section>
            <h2 className={heading}>{sv ? "Personuppgiftsansvarig och kontakt" : "Controller and contact"}</h2>
            {legal.ready ? (
              <div className={paragraph}>
                <p>{seller.businessName} {sv ? "är personuppgiftsansvarig för StockBox." : "is the controller for StockBox."}</p>
                <p>{sv ? "Organisationsnummer" : "Organization number"}: {seller.organizationNumber}</p>
                <p>{sv ? "Adress" : "Address"}: {seller.postalAddress}</p>
                <p>{sv ? "E-post" : "Email"}: {seller.supportEmail}</p>
                <p>{sv ? "Telefon" : "Phone"}: {seller.supportPhone}</p>
              </div>
            ) : (
              <p className={`${paragraph} text-amber-200`}>
                {sv
                  ? "Betald checkout är spärrad tills den personuppgiftsansvariges verifierade kontaktuppgifter har konfigurerats."
                  : "Paid checkout is blocked until the controller's verified contact details have been configured."}
              </p>
            )}
          </section>

          <section>
            <h2 className={heading}>{sv ? "Personuppgifter vi behandlar" : "Data we process"}</h2>
            <p className={paragraph}>{sv
              ? "Vi behandlar konto- och kontaktuppgifter, profilinställningar, analys- och workspace-data som du sparar, bevakningslistor och portföljer, abonnemangs- och betalningsstatus, support- och ångerärenden, begränsade produktanalytikhändelser samt säkerhets- och driftloggar."
              : "We process account and contact data, profile preferences, analysis and workspace data you save, watchlists and portfolios, subscription and payment status, support and withdrawal records, limited product-analytics events, and security and operational logs."}</p>
            <p className={paragraph}>{sv
              ? "Betalkortsuppgifter behandlas av Stripe och lagras inte av StockBox."
              : "Payment-card details are processed by Stripe and are not stored by StockBox."}</p>
          </section>
          <section>
            <h2 className={heading}>{sv ? "Ändamål och rättsliga grunder" : "Purposes and legal bases"}</h2>
            <div className={`${paragraph} space-y-2`}>
              <p>{sv
                ? "Avtal: konto, analyser, sparade arbetsytor, abonnemang och kundsupport behandlas när det är nödvändigt för att ingå eller fullgöra avtalet med dig."
                : "Contract: account data, analyses, saved workspaces, subscriptions and customer support are processed when necessary to enter into or perform our contract with you."}</p>
              <p>{sv
                ? "Rättslig förpliktelse: betalnings-, faktura- och bokföringsuppgifter behandlas när svensk eller annan tillämplig lag kräver det."
                : "Legal obligation: payment, invoice and bookkeeping data are processed where Swedish or other applicable law requires it."}</p>
              <p>{sv
                ? "Berättigat intresse: begränsade säkerhets-, missbruks-, fel- och produktanalysdata behandlas för att skydda tjänsten, förebygga missbruk och förbättra tillförlitlighet. Vi använder dataminimering och väger detta mot användarnas rättigheter."
                : "Legitimate interests: limited security, abuse-prevention, error and product-analytics data are processed to protect the service, prevent misuse and improve reliability. We apply data minimization and balance these interests against user rights."}</p>
            </div>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Produktanalys" : "Product analytics"}</h2>
            <p className={paragraph}>{sv
              ? "Serverbaserade produktanalytikhändelser kan skickas till PostHog. StockBox skickar inte rått användar-ID, analys-ID, Stripe-abonnemangs-ID, e-postadress eller fria söksträngar genom analytics-boundaryn. Användaridentifieraren pseudonymiseras envägs och eventegenskaper begränsas av en uttrycklig allowlist."
              : "Server-side product-analytics events may be sent to PostHog. The StockBox analytics boundary does not send raw user IDs, analysis IDs, Stripe subscription IDs, email addresses or free-form search strings. The user identifier is one-way pseudonymized and event properties are limited by an explicit allowlist."}</p>
          </section>
          <section>
            <h2 className={heading}>{sv ? "Personuppgiftsbiträden och mottagare" : "Processors and recipients"}</h2>
            <p className={paragraph}>{sv
              ? "Vi använder tjänsteleverantörer för att driva StockBox. De viktigaste är Supabase för autentisering och databas, Vercel för hosting och drift, Stripe för betalningar och abonnemang, PostHog för begränsad produktanalys och, när e-postfunktionen är aktiverad, den konfigurerade e-postleverantören. De får bara behandla personuppgifter för avtalade ändamål och enligt tillämpliga dataskyddskrav."
              : "We use service providers to operate StockBox. The principal providers are Supabase for authentication and database services, Vercel for hosting and operations, Stripe for payments and subscriptions, PostHog for limited product analytics and, when email delivery is enabled, the configured email provider. They may process personal data only for agreed purposes and subject to applicable data-protection requirements."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Internationella överföringar" : "International transfers"}</h2>
            <p className={paragraph}>{sv
              ? "Vissa leverantörer kan behandla personuppgifter utanför EU/EES. När GDPR kräver det använder vi en giltig överföringsmekanism, exempelvis EU-kommissionens adekvansbeslut eller standardavtalsklausuler, tillsammans med kompletterande skydd när det behövs."
              : "Some providers may process personal data outside the EU/EEA. Where GDPR requires it, we rely on a valid transfer mechanism such as an adequacy decision of the European Commission or Standard Contractual Clauses, with supplementary safeguards where appropriate."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Lagringstider" : "Retention"}</h2>
            <div className={`${paragraph} space-y-2`}>
              <p>{sv
                ? "Konto-, profil- och workspace-data sparas medan kontot är aktivt och därefter endast så länge det behövs för att genomföra stängning, hantera rättsliga anspråk eller uppfylla lagkrav."
                : "Account, profile and workspace data are kept while the account is active and afterwards only as long as needed to complete account closure, handle legal claims or meet legal obligations."}</p>
              <p>{sv
                ? "Räkenskapsinformation och fakturaunderlag som omfattas av svensk bokföringslag bevaras under den lagstadgade arkiveringstiden, normalt sju år efter utgången av det kalenderår då räkenskapsåret avslutades."
                : "Accounting records and invoice material covered by Swedish bookkeeping law are retained for the statutory archive period, normally seven years after the end of the calendar year in which the financial year closed."}</p>
              <p>{sv
                ? "Säkerhets-, drift- och analysdata sparas endast så länge de behövs för felsökning, skydd, missbruksförebyggande och produktförbättring. Lagringstider granskas regelbundet och uppgifter raderas eller aggregeras när de inte längre behövs."
                : "Security, operational and analytics data are kept only as long as needed for troubleshooting, protection, abuse prevention and product improvement. Retention is reviewed regularly and data is deleted or aggregated when no longer needed."}</p>
              <p>{sv
                ? "Ånger- och supportärenden sparas så länge det behövs för att hantera ärendet och dokumentera att rättsliga skyldigheter har uppfyllts."
                : "Withdrawal and support records are retained as long as needed to handle the matter and document compliance with legal obligations."}</p>
            </div>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Dina rättigheter" : "Your rights"}</h2>
            <p className={paragraph}>{sv
              ? "Beroende på situationen har du rätt till information, tillgång, rättelse, radering, begränsning, dataportabilitet och att invända mot behandling som grundas på berättigat intresse. Om en behandling grundas på samtycke kan du återkalla samtycket utan att det påverkar lagligheten före återkallelsen."
              : "Depending on the circumstances, you have rights to information, access, rectification, erasure, restriction, data portability and to object to processing based on legitimate interests. Where processing is based on consent, you may withdraw that consent without affecting prior lawful processing."}</p>
            <p className={paragraph}>{sv
              ? "Kontakta oss via e-postadressen ovan för att utöva dina rättigheter. Vi kan behöva verifiera din identitet innan vi lämnar ut eller ändrar uppgifter."
              : "Contact us at the email address above to exercise your rights. We may need to verify your identity before disclosing or changing data."}</p>
          </section>
          <section>
            <h2 className={heading}>{sv ? "Klagomål till IMY" : "Complaints to IMY"}</h2>
            <p className={paragraph}>{sv
              ? "Om du anser att vi behandlar dina personuppgifter i strid med dataskyddsreglerna kan du lämna klagomål till Integritetsskyddsmyndigheten (IMY). Om du bor i ett annat EU/EES-land kan du även kontakta tillsynsmyndigheten där du bor eller arbetar."
              : "If you believe our processing infringes data-protection law, you may lodge a complaint with the Swedish Authority for Privacy Protection (IMY). If you live in another EU/EEA country, you may also contact the supervisory authority where you live or work."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Automatiserade bedömningar" : "Automated assessments"}</h2>
            <p className={paragraph}>{sv
              ? "StockBox använder modeller för att skapa bedömningar av aktier. Dessa modeller fattar inte beslut om dig som person som har rättslig eller motsvarande betydande effekt enligt GDPR."
              : "StockBox uses models to produce assessments about securities. These models do not make decisions about you as an individual that produce legal or similarly significant effects under GDPR."}</p>
          </section>

          <section>
            <h2 className={heading}>{sv ? "Säkerhet och ändringar" : "Security and changes"}</h2>
            <p className={paragraph}>{sv
              ? "Vi använder tekniska och organisatoriska skyddsåtgärder som åtkomstkontroll, RLS, säkra sessionsflöden, dataminimering och sanerade driftloggar. Policyn kan uppdateras när behandlingar, leverantörer eller lagkrav ändras. Väsentliga ändringar kommuniceras på lämpligt sätt."
              : "We use technical and organizational safeguards including access controls, row-level security, secure session flows, data minimization and sanitized operational logs. This notice may be updated when processing activities, providers or legal requirements change. Material changes are communicated appropriately."}</p>
          </section>
        </div>
      </Container>
    </Section>
  );
}
