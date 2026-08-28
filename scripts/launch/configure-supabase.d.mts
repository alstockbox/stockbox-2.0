export type AuthLaunchConfig = Record<string, unknown> & {
  site_url?: string;
  smtp_host?: string;
  smtp_user?: string;
  smtp_pass?: string;
  smtp_admin_email?: string;
  mailer_templates_confirmation_content?: string;
  mailer_templates_recovery_content?: string;
  password_min_length?: number;
};

export function buildAuthLaunchConfig(input: {
  resendApiKey?: string;
  fromEmail?: string;
  senderName?: string;
}): AuthLaunchConfig;

export function buildOptionalSecurityPatch(): { password_hibp_enabled: true };

export function summarizeAuthLaunchConfig(config: AuthLaunchConfig): {
  siteUrl: string | undefined;
  smtpConfigured: boolean;
  senderEmail: string | undefined;
  confirmationUsesTokenHash: boolean;
  recoveryUsesTokenHash: boolean;
  minimumPasswordLength: number | undefined;
};