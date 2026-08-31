import { findPlan } from "@/lib/billing/plans";
import { legalVatDescription, type LegalSeller } from "@/lib/legal/commerce";
import { withdrawalFormText } from "@/lib/legal/withdrawal-form";

export type ContractConfirmationInput = {
  seller: LegalSeller;
  locale: "en" | "sv";
  planKey: string;
  offer: string;
  invoiceId: string;
  subscriptionId: string | null;
  contractDate: string;
  amountPaidCents: number;
  currency: string;
  appUrl: string;
};

function money(cents: number, currency: string, locale: "en" | "sv") {
  const amount = Math.max(0, cents) / 100;
  if (currency.toLowerCase() === "sek") {
    const value = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
    return locale === "sv" ? `${value.replace(".", ",")} kr` : `SEK ${value}`;
  }
  return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
}

export function contractConfirmationText(input: ContractConfirmationInput) {
  const sv = input.locale === "sv";
  const plan = findPlan(input.planKey);
  if (!plan || plan.key === "free" || plan.monthlyPriceSek === null) {
    throw new Error("Paid StockBox plan is required for contract confirmation.");
  }

  const launch = input.offer.includes("_launch_") ? plan.launchOffer : null;
  const affiliate = input.offer === "affiliate_10";
  const recurringPrice = affiliate
    ? Math.round(plan.monthlyPriceSek * 90) / 100
    : plan.monthlyPriceSek;
  const priceTerms = launch
    ? sv
      ? `${launch.monthlyPriceSek} kr/mån i ${launch.durationMonths} månader, därefter ${launch.thenMonthlyPriceSek} kr/mån.`
      : `SEK ${launch.monthlyPriceSek}/month for ${launch.durationMonths} months, then SEK ${launch.thenMonthlyPriceSek}/month.`
    : affiliate
      ? sv
        ? `${recurringPrice.toFixed(2).replace(".", ",")} kr/mån (10 % rabatt på ordinarie ${plan.monthlyPriceSek} kr/mån).`
        : `SEK ${recurringPrice.toFixed(2)}/month (10% off regular SEK ${plan.monthlyPriceSek}/month).`
      : sv ? `${plan.monthlyPriceSek} kr/mån.` : `SEK ${plan.monthlyPriceSek}/month.`;

  const withdrawalUrl = `${input.appUrl}/withdraw`;
  const formUrl = `${input.appUrl}/legal/withdrawal-form`;
  const termsUrl = `${input.appUrl}/legal/terms`;
  const privacyUrl = `${input.appUrl}/legal/privacy`;
  const sellerLine = `${input.seller.businessName}, ${input.seller.organizationNumber}, ${input.seller.postalAddress}`;
  const contactLine = `${input.seller.supportEmail}, ${input.seller.supportPhone}`;
  const vat = legalVatDescription(input.seller, input.locale);
  const modelForm = withdrawalFormText(input.seller, input.locale);

  if (sv) {
    return [
      "StockBox – avtalsbekräftelse",
      "",
      `Avtal ingånget: ${new Date(input.contractDate).toISOString()}`,
      `Faktura: ${input.invoiceId}`,
      input.subscriptionId ? `Abonnemang: ${input.subscriptionId}` : null,
      `Plan: ${plan.name}`,
      `Betalat nu: ${money(input.amountPaidCents, input.currency, "sv")}`,
      `Pris och förnyelse: ${priceTerms}`,
      "Abonnemanget löper månadsvis tills du säger upp det. Det finns ingen minsta bindningstid utöver redan betald period.",
      "Du kan stoppa framtida förnyelser från Billing i StockBox.",
      "",
      "SÄLJARE OCH KONTAKT",
      sellerLine,
      contactLine,
      vat,
      "",
      "TJÄNST OCH LEVERANS",
      "StockBox är en webbaserad digital analystjänst för aktier. Åtkomst aktiveras online efter godkänd betalning och entitlement-synk.",
      "Tjänsten kräver internetanslutning och en aktuell webbläsare. JavaScript och nödvändiga webbläsarcookies används för inloggade funktioner.",
      "StockBox tar inte ut någon separat leverans- eller kommunikationsavgift, deposition eller finansiell garanti.",
      "Priset är inte personanpassat genom automatiserat beslutsfattande om kunden.",
      "",
      "ÅNGERRÄTT OCH REKLAMATION",
      "Som konsument har du som huvudregel 14 dagars ångerrätt från den dag avtalet ingicks. StockBox ber dig inte att avstå från denna rätt vid lanseringen.",
      `Ångerfunktion online: ${withdrawalUrl}`,
      `Standardblankett för ångerrätt: ${formUrl}`,
      "Du kan även lämna ett annat tydligt meddelande om att du vill frånträda avtalet.",
      `För reklamation eller support: ${input.seller.supportEmail}, ${input.seller.postalAddress}. Tvingande konsumenträtt gäller oavsett dessa villkor.`,
      "Svenska konsumenter kan, när ARN:s krav är uppfyllda, få en tvist prövad av Allmänna reklamationsnämnden (ARN).",
      "",
      `Villkor: ${termsUrl}`,
      `Integritet: ${privacyUrl}`,
      "",
      "STANDARDblankett FÖR UTÖVANDE AV ÅNGERRÄTT",
      modelForm,
      "",
      "Spara detta e-postmeddelande som bekräftelse på avtalet och informationen ovan.",
    ].filter((line): line is string => line !== null).join("\n");
  }

  return [
    "StockBox – contract confirmation",
    "",
    `Contract concluded: ${new Date(input.contractDate).toISOString()}`,
    `Invoice: ${input.invoiceId}`,
    input.subscriptionId ? `Subscription: ${input.subscriptionId}` : null,
    `Plan: ${plan.name}`,
    `Paid now: ${money(input.amountPaidCents, input.currency, "en")}`,
    `Price and renewal: ${priceTerms}`,
    "The subscription renews monthly until cancelled. There is no minimum commitment beyond the period already paid for.",
    "You can stop future renewals from Billing in StockBox.",
    "",
    "SELLER AND CONTACT",
    sellerLine,
    contactLine,
    vat,
    "",
    "SERVICE AND PERFORMANCE",
    "StockBox is a web-based digital equity research service. Access is activated online after successful payment and entitlement synchronization.",
    "The service requires an internet connection and a current web browser. JavaScript and necessary browser cookies are used for authenticated functionality.",
    "StockBox does not charge a separate delivery or communication fee, deposit, or financial guarantee.",
    "The price is not personalized through automated decision-making about the customer.",
    "",
    "WITHDRAWAL AND COMPLAINTS",
    "Consumers generally have a 14-day statutory withdrawal right from the date the contract is concluded. StockBox does not ask you to waive this right at launch.",
    `Online withdrawal function: ${withdrawalUrl}`,
    `Model withdrawal form: ${formUrl}`,
    "You may also give another unequivocal notice that you wish to withdraw from the contract.",
    `For complaints or support: ${input.seller.supportEmail}, ${input.seller.postalAddress}. Mandatory consumer rights apply regardless of these terms.`,
    "Swedish consumers may, where ARN's requirements are met, refer a dispute to the National Board for Consumer Disputes (ARN).",
    "",
    `Terms: ${termsUrl}`,
    `Privacy: ${privacyUrl}`,
    "",
    "MODEL WITHDRAWAL FORM",
    modelForm,
    "",
    "Keep this email as confirmation of the contract and the information above.",
  ].filter((line): line is string => line !== null).join("\n");
}
