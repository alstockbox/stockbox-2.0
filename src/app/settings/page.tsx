import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Languages, LockKeyhole, MessageSquareText, UserRound } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/app-shell/language-switcher";
import { requireUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const items = [
    { href: "/settings/profile", title: "Profile", copy: "Research preferences and account defaults.", icon: UserRound },
    { href: "/settings/billing", title: "Billing", copy: "Plan, subscription and payment management.", icon: CreditCard },
    { href: "/settings/security", title: "Security", copy: "Change your password and protect account access.", icon: LockKeyhole },
    { href: "/feedback", title: "Feedback", copy: "Send product feedback directly to StockBox.", icon: MessageSquareText },
  ] as const;

  return (
    <Section><Container className="max-w-4xl">
      <p className="text-sm font-semibold text-[#e1cb95]">Account</p>
      <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Settings</h1>
      <p className="mt-3 text-sm text-[#9aa7b8]">Manage your StockBox account from one place.</p>
      <Card className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-semibold text-[#f4efe5]">{user.email ?? "StockBox account"}</p><p className="mt-1 text-xs text-[#9aa7b8]">Role: {user.role.replaceAll("_", " ")}</p></div>
        <div className="flex items-center gap-3"><Languages className="h-4 w-4 text-[#e1cb95]" /><LanguageSwitcher locale={locale} /></div>
      </Card>      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="group rounded-xl border border-white/10 bg-[#0d1c2e]/70 p-5 hover:border-[#e1cb95]/30 hover:bg-[#0d1c2e]">
            <item.icon className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-[#f4efe5] group-hover:text-white">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{item.copy}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 text-sm text-[#9aa7b8]">
        Need help? <Link href="/contact" className="text-[#e1cb95] hover:text-white">Contact StockBox</Link>.
      </div>
    </Container></Section>
  );
}
