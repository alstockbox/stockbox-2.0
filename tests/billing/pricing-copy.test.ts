import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getP0Copy } from "../../src/lib/i18n/p0-copy";

describe("pricing consumer-rights copy", () => {
  it("localizes the withdrawal link label without component object-identity logic", () => {
    expect(getP0Copy("sv").pricing.withdrawalFunction).toBe("Ångra avtal");
    expect(getP0Copy("en").pricing.withdrawalFunction).toBe("Withdrawal function");
  });

  it("localizes terms and privacy labels in both locales", () => {
    expect(getP0Copy("sv").pricing.terms).toBe("Villkor");
    expect(getP0Copy("sv").pricing.privacy).toBe("Integritet");
    expect(getP0Copy("en").pricing.terms).toBe("Terms");
    expect(getP0Copy("en").pricing.privacy).toBe("Privacy");
  });

  it("states the recurring Basic subscription behavior in both locales", () => {
    expect(getP0Copy("sv").pricing.renewalNotice).toContain("förnyas månadsvis");
    expect(getP0Copy("en").pricing.renewalNotice).toContain("renews monthly");
  });

  it("keeps terms and privacy links beside the pre-purchase subscription disclosure", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/pricing/page.tsx"), "utf8");
    expect(source).toContain('href="/legal/terms"');
    expect(source).toContain('href="/legal/privacy"');
  });

  it("localizes the billing-page withdrawal link", () => {
    expect(getP0Copy("sv").billing.withdrawContract).toBe("Ångra avtal");
    expect(getP0Copy("en").billing.withdrawContract).toBe("Withdraw from a contract");
  });
});
