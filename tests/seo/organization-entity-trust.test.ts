import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("organization entity trust", () => {
  it("enriches the root Organization from configured public legal seller data", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('getLegalSeller');
    expect(layout).toContain('const seller = getLegalSeller(env)');
    expect(layout).toContain('legalName: seller.businessName || undefined');
    expect(layout).toContain('identifier: seller.organizationNumber || undefined');
    expect(layout).toContain('email: seller.supportEmail || undefined');
    expect(layout).toContain('telephone: seller.supportPhone || undefined');
    expect(layout).toContain('"@type": "ContactPoint"');
    expect(layout).toContain('contactType: "customer support"');
  });

  it("does not hard-code private or invented legal identity values", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).not.toContain('organizationNumber: "');
    expect(layout).not.toContain('supportEmail: "');
    expect(layout).not.toContain('supportPhone: "');
  });
});
