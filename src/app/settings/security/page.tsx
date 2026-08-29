import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, Container, Section } from "@/components/ui/card";
import { updatePasswordAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";

export const metadata: Metadata = { title: "Security" };

export default async function SecuritySettingsPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const copy = getP0Copy(locale).auth;

  return (
    <Section><Container className="max-w-2xl">
      <p className="text-sm font-semibold text-[#e1cb95]">Account security</p>
      <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Security</h1>
      <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">Change the password for {user.email ?? "your StockBox account"}.</p>
      <Card className="mt-7">
        <LockKeyhole className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
        <div className="mt-4">
          <AuthForm action={updatePasswordAction} submitLabel={copy.updatePassword} email={false} passwordLabel={copy.password} workingLabel={copy.working} locale={locale} />
        </div>
      </Card>
    </Container></Section>
  );
}
