import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resetPasswordAction } from "@/lib/auth/actions";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "Reset password" };

type ForgotPasswordPageProps = { searchParams: Promise<{ retry?: string }> };

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const copy = getP0Copy(locale).auth;
  const intro = params.retry === "1" ? copy.recoveryRetry : copy.forgotCopy;
  return (
    <AuthShell title={copy.forgotTitle} copy={intro} alternate={<Link href="/auth/login" className="text-[#e1cb95]">{copy.returnLogin}</Link>}>
      <AuthForm action={resetPasswordAction} submitLabel={copy.sendRecovery} password={false} emailLabel={copy.email} workingLabel={copy.working} locale={locale} />
    </AuthShell>
  );
}
