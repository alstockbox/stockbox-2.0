import { describe, expect, it } from "vitest";
import {
  buildLegalEnvEntries,
  summarizeLegalEnvEntries,
} from "../../scripts/launch/configure-vercel-legal.mjs";

describe("Vercel launch legal environment configuration", () => {
  it("builds sensitive Preview + Production legal env entries", () => {
    const entries = buildLegalEnvEntries({
      businessName: "Example Business",
      organizationNumber: "ORG-SECRET",
      postalAddress: "Example Street 1",
      supportEmail: "support@example.test",
      supportPhone: "+46 70 000 00 00",
      vatMode: "small_business_exempt",
    });

    expect(entries).toHaveLength(6);
    expect(entries.every((entry) => entry.type === "sensitive")).toBe(true);
    expect(entries.every((entry) =>
      entry.target.includes("production") && entry.target.includes("preview")
    )).toBe(true);
    expect(entries.map((entry) => entry.key)).not.toContain("LEGAL_VAT_NUMBER");

    const summary = JSON.stringify(summarizeLegalEnvEntries(entries));    expect(summary).not.toContain("ORG-SECRET");
    expect(summary).not.toContain("Example Street 1");
  });

  it("requires a VAT number only for VAT-registered sellers", () => {
    expect(() => buildLegalEnvEntries({
      businessName: "Example Business",
      organizationNumber: "1",
      postalAddress: "Address",
      supportEmail: "support@example.test",
      supportPhone: "+46",
      vatMode: "vat_registered",
    })).toThrow(/LEGAL_VAT_NUMBER/);

    const entries = buildLegalEnvEntries({
      businessName: "Example Business",
      organizationNumber: "1",
      postalAddress: "Address",
      supportEmail: "support@example.test",
      supportPhone: "+46",
      vatMode: "vat_registered",
      vatNumber: "SE123",
    });
    expect(entries.map((entry) => entry.key)).toContain("LEGAL_VAT_NUMBER");
  });
});