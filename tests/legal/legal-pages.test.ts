import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(`${root}/${path}`, "utf8");

const forbiddenDraftLanguage = /Draft|owner\/legal approval|required before public launch|must be finalized|remain owner\/legal inputs/i;

describe("launch legal pages", () => {
  it("removes draft placeholders from Terms and Privacy", () => {
    const combined = [
      source("src/app/legal/terms/page.tsx"),
      source("src/app/legal/privacy/page.tsx")
    ].join("\n");
    expect(combined).not.toMatch(forbiddenDraftLanguage);
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
