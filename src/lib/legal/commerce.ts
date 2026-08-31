import { getServerEnv, type ServerEnv } from "@/lib/env/server";

export type LegalVatMode = "small_business_exempt" | "vat_registered";

export type LegalCommerceVariable =
  | "LEGAL_BUSINESS_NAME"
  | "LEGAL_ORGANIZATION_NUMBER"
  | "LEGAL_POSTAL_ADDRESS"
  | "LEGAL_SUPPORT_EMAIL"
  | "LEGAL_SUPPORT_PHONE"
  | "LEGAL_VAT_MODE"
  | "LEGAL_VAT_NUMBER";

export type LegalSeller = {
  businessName: string;
  organizationNumber: string;
  postalAddress: string;
  supportEmail: string;
  supportPhone: string;
  vatMode: LegalVatMode | null;
  vatNumber: string | null;
};

export function getLegalSeller(env: ServerEnv = getServerEnv()): LegalSeller {
  return {
    businessName: env.LEGAL_BUSINESS_NAME ?? "",
    organizationNumber: env.LEGAL_ORGANIZATION_NUMBER ?? "",
    postalAddress: env.LEGAL_POSTAL_ADDRESS ?? "",
    supportEmail: env.LEGAL_SUPPORT_EMAIL ?? "",
    supportPhone: env.LEGAL_SUPPORT_PHONE ?? "",
    vatMode: env.LEGAL_VAT_MODE || null,
    vatNumber: env.LEGAL_VAT_NUMBER || null,
  };
}

export function getLegalCommerceReadiness(env: ServerEnv = getServerEnv()) {
  const seller = getLegalSeller(env);
  const missingVariables: LegalCommerceVariable[] = [];

  if (!seller.businessName) missingVariables.push("LEGAL_BUSINESS_NAME");
  if (!seller.organizationNumber) missingVariables.push("LEGAL_ORGANIZATION_NUMBER");
  if (!seller.postalAddress) missingVariables.push("LEGAL_POSTAL_ADDRESS");
  if (!seller.supportEmail) missingVariables.push("LEGAL_SUPPORT_EMAIL");
  if (!seller.supportPhone) missingVariables.push("LEGAL_SUPPORT_PHONE");
  if (!seller.vatMode) missingVariables.push("LEGAL_VAT_MODE");
  if (seller.vatMode === "vat_registered" && !seller.vatNumber) {
    missingVariables.push("LEGAL_VAT_NUMBER");
  }

  return {
    ready: missingVariables.length === 0,
    seller,
    missingVariables,
  };
}

export function legalVatDescription(seller: LegalSeller, locale: "en" | "sv") {
  if (seller.vatMode === "small_business_exempt") {
    return locale === "sv"
      ? "Verksamheten tillämpar undantag från momsplikt för små företag. Ingen moms läggs därför till priset."
      : "The business applies the Swedish small-business VAT exemption. VAT is therefore not added to the price.";
  }
  if (seller.vatMode === "vat_registered") {
    return locale === "sv"
      ? `Verksamheten är momsregistrerad${seller.vatNumber ? ` (${seller.vatNumber})` : ""}. Tillämplig moms ingår i eller framgår av totalpriset före betalning.`
      : `The business is VAT registered${seller.vatNumber ? ` (${seller.vatNumber})` : ""}. Applicable VAT is included in or shown as part of the total price before payment.`;
  }
  return locale === "sv"
    ? "Tillämpliga skatter och det bindande totalpriset framgår före betalning."
    : "Applicable taxes and the binding total price are shown before payment.";
}
