import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { signUpAction } from "@/lib/auth/actions";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  const locale = await getLocale();
  const copy = getP0Copy(locale).auth;
  return (
    <AuthShell title={copy.signupTitle} copy={copy.signupCopy} alternate={<>{copy.alreadyAccount} <Link href="/auth/login" className="text-[#e1cb95]">{copy.login}</Link>.</>}>
      <AuthForm action={signUpAction} submitLabel={copy.signup} emailLabel={copy.email} passwordLabel={copy.password} workingLabel={copy.working} locale={locale} />
    </AuthShell>
  );
}
