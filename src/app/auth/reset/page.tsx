import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { updatePasswordAction } from "@/lib/auth/actions";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "Choose new password" };

export default async function ResetPasswordPage() {
  const locale = await getLocale();
  const copy = getP0Copy(locale).auth;
  return (
    <AuthShell title={copy.resetTitle} copy={copy.resetCopy} alternate={<Link href="/dashboard" className="text-[#e1cb95]">{copy.continueDashboard}</Link>}>
      <AuthForm action={updatePasswordAction} submitLabel={copy.updatePassword} email={false} passwordLabel={copy.password} workingLabel={copy.working} locale={locale} />
    </AuthShell>
  );
}
