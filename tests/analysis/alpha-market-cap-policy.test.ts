import { describe, expect, it } from "vitest";
import { resolveMarketCapBand, sizePotentialForBand } from "../../src/lib/alpha/market-cap";

describe("alpha market-cap policy", () => {
  it("does not compare raw market-cap numbers across currencies", () => {
    expect(resolveMarketCapBand(4_000_000_000, "SEK")).toBe("small");
    expect(resolveMarketCapBand(4_000_000_000, "USD")).toBe("mid");
    expect(sizePotentialForBand("small")).toBeGreaterThan(sizePotentialForBand("mid"));
  });

  it("fails closed to unknown when currency is not supported", () => {
    expect(resolveMarketCapBand(500_000_000, null)).toBe("unknown");
    expect(resolveMarketCapBand(500_000_000, "XYZ")).toBe("unknown");
  });
});
