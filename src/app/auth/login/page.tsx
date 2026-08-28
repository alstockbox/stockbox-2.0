import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { signInAction } from "@/lib/auth/actions";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata = { title: "Log in" };

type LoginPageProps = { searchParams: Promise<{ confirmed?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const copy = getP0Copy(locale).auth;
  const intro = params.confirmed === "1" ? copy.emailConfirmed : copy.loginCopy;
  return (
    <AuthShell title={copy.loginTitle} copy={intro} alternate={<><Link href="/auth/signup" className="text-[#e1cb95]">{copy.createAccount}</Link><span> {copy.or} </span><Link href="/auth/forgot" className="text-[#e1cb95]">{copy.resetPassword}</Link>.</>}>
      <AuthForm action={signInAction} submitLabel={copy.login} emailLabel={copy.email} passwordLabel={copy.password} workingLabel={copy.working} locale={locale} />
    </AuthShell>
  );
}