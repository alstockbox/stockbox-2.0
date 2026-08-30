import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("public contact and legal trust", () => {
  it("shows verified support channels on the contact page when configured", () => {
    const contact = read("src/app/contact/page.tsx");
    expect(contact).toContain("getLegalSeller");
    expect(contact).toContain("seller.supportEmail");
    expect(contact).toContain("seller.supportPhone");
    expect(contact).toContain("seller.businessName");
    expect(contact).toContain("getLocale");
  });

  it("does not expose internal checkout-block guardrail wording on public legal pages", () => {
    const terms = read("src/app/legal/terms/page.tsx");
    const privacy = read("src/app/legal/privacy/page.tsx");
    expect(terms).not.toMatch(/paid checkout is blocked|betald checkout är spärrad/i);
    expect(privacy).not.toMatch(/paid checkout is blocked|betald checkout är spärrad/i);
  });
});
