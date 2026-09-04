import { describe, expect, it } from "vitest";
import { getSecUserAgent, parseServerEnv } from "../../src/lib/env/server";

describe("getSecUserAgent", () => {
  it("uses the public legal support email before private admin fallback fields", () => {
    const env = parseServerEnv({
      LEGAL_SUPPORT_EMAIL: "support@getstockbox.example",
      ADMIN_ALERT_EMAIL: "private-admin@example.com",
      ADMIN_EMAILS: "private-owner@example.com",
    });

    expect(getSecUserAgent(env)).toBe("StockBox/1.0 support@getstockbox.example");
  });

  it("keeps an explicit SEC user agent as the highest-priority identity", () => {
    const env = parseServerEnv({
      SEC_USER_AGENT: "StockBox custom-contact@example.com",
      LEGAL_SUPPORT_EMAIL: "support@getstockbox.example",
    });

    expect(getSecUserAgent(env)).toBe("StockBox custom-contact@example.com");
  });
});
