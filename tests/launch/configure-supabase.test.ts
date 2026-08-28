import { describe, expect, it } from "vitest";
import {
  buildAuthLaunchConfig,
  buildOptionalSecurityPatch,
  summarizeAuthLaunchConfig,
} from "../../scripts/launch/configure-supabase.mjs";

describe("Supabase launch auth configuration", () => {
  it("builds production SMTP and token-hash email templates without exposing credentials", () => {
    const config = buildAuthLaunchConfig({
      resendApiKey: "re_secret_value",
      fromEmail: "auth@getstockbox.app",
      senderName: "StockBox",
    });

    expect(config).toMatchObject({
      external_email_enabled: true,
      mailer_autoconfirm: false,
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_pass: "re_secret_value",
      password_min_length: 12,
    });
    expect(config.mailer_templates_confirmation_content).toContain("token_hash={{ .TokenHash }}");
    expect(config.mailer_templates_confirmation_content).toContain("type=email");
    expect(config.mailer_templates_confirmation_content).toContain("next=/onboarding");    expect(config.mailer_templates_recovery_content).toContain("token_hash={{ .TokenHash }}");
    expect(config.mailer_templates_recovery_content).toContain("type=recovery");
    expect(config.mailer_templates_recovery_content).toContain("next=/auth/reset");

    const summary = JSON.stringify(summarizeAuthLaunchConfig(config));
    expect(summary).not.toContain("re_secret_value");
    expect(summary).not.toContain("smtp_pass");
  });

  it("keeps leaked-password protection in a separate optional hardening patch", () => {
    expect(buildOptionalSecurityPatch()).toEqual({ password_hibp_enabled: true });
  });
});