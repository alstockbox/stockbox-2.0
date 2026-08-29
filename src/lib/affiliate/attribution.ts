const REFERRAL_CODE = /^[A-Z0-9_-]{3,48}$/;

export function normalizeReferralCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return REFERRAL_CODE.test(normalized) ? normalized : null;
}

export function maskEmail(email: string | null | undefined) {
  if (!email || !email.includes("@")) return "Customer";
  const [local, domain] = email.split("@", 2);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function affiliateLink(appUrl: string, code: string) {
  const url = new URL(appUrl);
  url.searchParams.set("ref", normalizeReferralCode(code) ?? code);
  return url.toString();
}