import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLocale: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/i18n/server", () => ({ getLocale: mocks.getLocale }));
vi.mock("@/lib/env/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env/server")>("@/lib/env/server");
  return { ...actual, getServerEnv: mocks.getServerEnv };
});

import TermsPage from "../../src/app/legal/terms/page";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

const forbiddenDraftLanguage = /Draft|owner\/legal approval|required before public launch|must be finalized|remain owner\/legal inputs/i;

describe("launch legal pages", () => {
  it("renders Swedish Basic pricing disclosure from the billing plan without mojibake", async () => {
    mocks.getLocale.mockResolvedValue("sv");
    mocks.getServerEnv.mockReturnValue({
      LEGAL_BUSINESS_NAME: "Example Sole Trader",
      LEGAL_ORGANIZATION_NUMBER: "000000-0000",
      LEGAL_POSTAL_ADDRESS: "Example street 1, 111 11 Stockholm, Sweden",
      LEGAL_SUPPORT_EMAIL: "support@example.com",
      LEGAL_SUPPORT_PHONE: "+46123456789",
      LEGAL_VAT_MODE: "small_business_exempt",
    });

    const markup = renderToStaticMarkup(await TermsPage());

    expect(markup).toContain("Basic kostar 49 kr per månad");
    expect(markup).toContain("under de första 3 månaderna");
    expect(markup).toContain("därefter 69 kr per månad");
    expect(markup).toContain("Abonnemanget förnyas månadsvis");
  });

  it("removes draft placeholders from Terms and Privacy", () => {
    const combined = [
      source("src/app/legal/terms/page.tsx"),
      source("src/app/legal/privacy/page.tsx")
    ].join("\n");
    expect(combined).not.toMatch(forbiddenDraftLanguage);
  });

  it("keeps the Basic renewal price tied to the billing plan source of truth", () => {
    const terms = source("src/app/legal/terms/page.tsx");
    expect(terms).toContain('findPlan("basic")');
    expect(terms).not.toContain("79 kr per m?nad");
    expect(terms).not.toContain("SEK 79 per month thereafter");
  });

  it("covers the consumer SaaS contract essentials", () => {
    const terms = source("src/app/legal/terms/page.tsx");
    for (const phrase of [
      "Seller and contact details", "Price and subscription", "Right of withdrawal",
      "Complaints and digital service", "Governing law", "/withdraw"
    ]) expect(terms).toContain(phrase);
  });
  it("covers GDPR transparency essentials", () => {
    const privacy = source("src/app/legal/privacy/page.tsx");
    for (const phrase of [
      "Controller and contact", "Data we process", "Purposes and legal bases",
      "Processors and recipients", "International transfers", "Retention",
      "Your rights", "IMY"
    ]) expect(privacy).toContain(phrase);
  });
});
