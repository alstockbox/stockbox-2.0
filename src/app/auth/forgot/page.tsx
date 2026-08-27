import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resetPasswordAction } from "@/lib/auth/actions";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  const copy = getP0Copy(locale).auth;
  return (
    <AuthShell title={copy.forgotTitle} copy={copy.forgotCopy} alternate={<Link href="/auth/login" className="text-[#e1cb95]">{copy.returnLogin}</Link>}>
      <AuthForm action={resetPasswordAction} submitLabel={copy.sendRecovery} password={false} emailLabel={copy.email} workingLabel={copy.working} locale={locale} />
    </AuthShell>
  );
}
