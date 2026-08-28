import { describe, expect, it } from "vitest";
import { p0Copy } from "@/lib/i18n/p0-copy";

describe("cross-device confirmation copy", () => {
  it("tells confirmed users to sign in in both launch locales", () => {
    expect(p0Copy.en.auth.emailConfirmed).toContain("verified");
    expect(p0Copy.sv.auth.emailConfirmed).toContain("verifierad");
  });
});