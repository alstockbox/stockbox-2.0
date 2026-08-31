import type { LegalSeller } from "@/lib/legal/commerce";

export function withdrawalFormText(seller: LegalSeller, locale: "en" | "sv") {
  const trader = [
    seller.businessName,
    seller.postalAddress,
    seller.supportEmail,
    seller.supportPhone,
  ].filter(Boolean).join(", ");

  if (locale === "sv") {
    return [
      "STANDARDblankett FÖR UTÖVANDE AV ÅNGERRÄTT",
      "(Fyll i och returnera denna blankett endast om du vill frånträda avtalet.)",
      "",
      `Till: ${trader || "StockBox – säljaruppgifter visas innan betald checkout öppnas"}`,
      "",
      "Härmed meddelar jag/vi att jag/vi frånträder mitt/vårt avtal om tillhandahållande av följande tjänst:",
      "StockBox-abonnemang / plan: ______________________________",
      "",
      "Avtalet ingicks den: ______________________________________",
      "Konsumentens/konsumenternas namn: ________________________",
      "Konsumentens/konsumenternas adress: ______________________",
      "",
      "Konsumentens/konsumenternas underskrift (endast om blanketten lämnas på papper):",
      "___________________________________________________________",
      "Datum: ____________________________________________________",
    ].join("\n");
  }

  return [
    "MODEL WITHDRAWAL FORM",
    "(Complete and return this form only if you wish to withdraw from the contract.)",
    "",
    `To: ${trader || "StockBox – seller details are shown before paid checkout is enabled"}`,
    "",
    "I/We hereby give notice that I/We withdraw from my/our contract for the provision of the following service:",
    "StockBox subscription / plan: ______________________________",
    "",
    "Contract concluded on: _____________________________________",
    "Name of consumer(s): _______________________________________",
    "Address of consumer(s): ____________________________________",
    "",
    "Signature of consumer(s) (only if this form is notified on paper):",
    "___________________________________________________________",
    "Date: ______________________________________________________",
  ].join("\n");
}
