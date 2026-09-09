import { describe, expect, it } from "vitest";
import { getEstimatesProvider, parseServerEnv } from "../../src/lib/env/server";

describe("licensed estimates provider configuration", () => {
  it("keeps analyst estimates disabled unless explicitly enabled", () => {
    expect(getEstimatesProvider(parseServerEnv({ TWELVE_DATA_API_KEY: "key" }))).toBe("disabled");
  });

  it("enables Twelve Data analyst estimates only when explicitly configured", () => {
    expect(getEstimatesProvider(parseServerEnv({
      ESTIMATES_PROVIDER: "twelve_data",
      TWELVE_DATA_API_KEY: "key",
    }))).toBe("twelve_data");
  });

  it("normalizes whitespace and casing for the estimates provider", () => {
    expect(getEstimatesProvider(parseServerEnv({ ESTIMATES_PROVIDER: " TWELVE_DATA " }))).toBe("twelve_data");
  });
});
