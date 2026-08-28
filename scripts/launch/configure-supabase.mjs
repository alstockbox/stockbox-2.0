import { pathToFileURL } from "node:url";

const DEFAULT_PROJECT_REF = "joelaecxlksyvnmypihv";
const DEFAULT_SITE_URL = "https://www.getstockbox.app";
const MANAGEMENT_API = "https://api.supabase.com/v1/projects";

function required(value, name) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required.`);
  return trimmed;
}

export function buildAuthLaunchConfig({ resendApiKey, fromEmail, senderName = "StockBox" }) {
  const smtpPass = required(resendApiKey, "RESEND_API_KEY");
  const adminEmail = required(fromEmail, "AUTH_FROM_EMAIL");
  return {
    site_url: DEFAULT_SITE_URL,
    external_email_enabled: true,
    mailer_autoconfirm: false,
    mailer_secure_email_change_enabled: true,
    smtp_admin_email: adminEmail,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: smtpPass,
    smtp_sender_name: senderName,
    password_min_length: 12,
    mailer_subjects_confirmation: "Confirm your StockBox account",
    mailer_templates_confirmation_content:
      '<h2>Confirm your StockBox account</h2><p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/onboarding">Confirm email address</a></p>',
    mailer_subjects_recovery: "Reset your StockBox password",
    mailer_templates_recovery_content:
      '<h2>Reset your StockBox password</h2><p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset">Reset password</a></p>'
  };
}

export function buildOptionalSecurityPatch() {
  return { password_hibp_enabled: true };
}

export function summarizeAuthLaunchConfig(config) {
  return {
    siteUrl: config.site_url,
    smtpConfigured: Boolean(config.smtp_host && config.smtp_user && config.smtp_pass && config.smtp_admin_email),
    senderEmail: config.smtp_admin_email,
    confirmationUsesTokenHash: config.mailer_templates_confirmation_content?.includes("token_hash={{ .TokenHash }}") ?? false,
    recoveryUsesTokenHash: config.mailer_templates_recovery_content?.includes("token_hash={{ .TokenHash }}") ?? false,
    minimumPasswordLength: config.password_min_length
  };
}

async function managementRequest({ accessToken, projectRef, method = "GET", body }) {
  const response = await fetch(`${MANAGEMENT_API}/${projectRef}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) {
    throw new Error(`Supabase Management API ${method} failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function main() {
  const accessToken = required(process.env.SUPABASE_ACCESS_TOKEN, "SUPABASE_ACCESS_TOKEN");
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || DEFAULT_PROJECT_REF;
  const config = buildAuthLaunchConfig({
    resendApiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.AUTH_FROM_EMAIL,
    senderName: process.env.AUTH_SENDER_NAME?.trim() || "StockBox"
  });

  await managementRequest({ accessToken, projectRef, method: "PATCH", body: config });
  const verified = await managementRequest({ accessToken, projectRef });
  const summary = summarizeAuthLaunchConfig(verified);
  if (!summary.smtpConfigured || !summary.confirmationUsesTokenHash || !summary.recoveryUsesTokenHash) {
    throw new Error("Supabase auth launch configuration did not verify after update.");
  }
  console.log("Supabase auth mail configuration verified:", summary);

  try {
    await managementRequest({
      accessToken,
      projectRef,
      method: "PATCH",
      body: buildOptionalSecurityPatch()
    });
    const hardened = await managementRequest({ accessToken, projectRef });
    if (hardened.password_hibp_enabled !== true) {
      throw new Error("Leaked-password protection did not verify after update.");
    }
    console.log("Leaked-password protection verified: enabled");
  } catch (error) {
    console.warn("Leaked-password protection could not be enabled automatically. Supabase Pro or higher may be required.");
    console.warn(error instanceof Error ? error.message : "Unknown Supabase hardening error.");
    process.exitCode = 2;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Supabase launch configuration failed.");
    process.exitCode = 1;
  });
}