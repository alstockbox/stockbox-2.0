import { describe, expect, it } from "vitest";
import { getP0Copy } from "../../src/lib/i18n/p0-copy";

describe("pricing consumer-rights copy", () => {
  it("localizes the withdrawal link label without component object-identity logic", () => {
    expect(getP0Copy("sv").pricing.withdrawalFunction).toBe("\u00c5ngra avtal");
    expect(getP0Copy("en").pricing.withdrawalFunction).toBe("Withdrawal function");
  });

  it("states recurring paid-plan subscription behavior in both locales", () => {
    expect(getP0Copy("sv").pricing.renewalNotice).toContain("f\u00f6rnyas m\u00e5nadsvis");
    expect(getP0Copy("en").pricing.renewalNotice).toContain("renew monthly");
  });

  it("localizes the billing-page withdrawal link", () => {
    expect(getP0Copy("sv").billing.withdrawContract).toBe("\u00c5ngra avtal");
    expect(getP0Copy("en").billing.withdrawContract).toBe("Withdraw from a contract");
  });
});