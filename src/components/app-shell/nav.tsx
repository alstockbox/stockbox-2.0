import Link from "next/link";
import { BarChart3, Bell, BriefcaseBusiness, CreditCard, Gauge, Handshake, LayoutDashboard, ShieldCheck, UserRoundCog } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { LanguageSwitcher } from "./language-switcher";
import { SignOutButton } from "./sign-out-button";

const navItems = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, enabled: true },
  { href: "/analyze", labelKey: "analyze", icon: Gauge, enabled: true },
  { href: "/watchlist", labelKey: "watchlist", icon: Bell, enabled: true },
  { href: "/portfolio", labelKey: "portfolio", icon: BriefcaseBusiness, enabled: isFeatureEnabled("portfolio") },
  { href: "/batch", labelKey: "batch", icon: BarChart3, enabled: isFeatureEnabled("batchAnalysis") }
] as const;

export async function AppNav() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).nav;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111f]/90 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="serif shrink-0 text-xl font-semibold text-[#f4efe5]">
          StockBox
        </Link>
        <nav className="order-4 flex w-full flex-wrap items-center justify-between gap-1 sm:order-none sm:w-auto sm:flex-1 sm:justify-start">
          {navItems.filter((item) => item.enabled).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[#c9d2df] hover:bg-white/8 sm:px-3"
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {copy[item.labelKey]}
            </Link>
          ))}
          {user ? (
            <Link href="/settings/profile" className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[#c9d2df] hover:bg-white/8 sm:px-3">
              <UserRoundCog className="h-4 w-4" aria-hidden="true" />{copy.profile}
            </Link>
          ) : null}
          {user ? (
            <Link
              href="/settings/billing"
              className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[#c9d2df] hover:bg-white/8 sm:px-3"
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              {copy.billing}
            </Link>
          ) : null}
          {user?.role === "affiliate_ambassador" ? (
            <Link
              href="/affiliate"
              className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-[#e1cb95] hover:bg-white/8"
            >
              <Handshake className="h-4 w-4" aria-hidden="true" />
              {copy.affiliate}
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link
              href="/admin"
              className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-[#e1cb95] hover:bg-white/8"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {copy.admin}
            </Link>
          ) : null}
        </nav>
        <LanguageSwitcher locale={locale} />
        {user ? (
          <SignOutButton label={copy.signOut} />
        ) : (
          <div className="flex items-center gap-2">
            <Link className="text-sm text-[#c9d2df] hover:text-white" href="/auth/login">
              {copy.login}
            </Link>
            <Link
              className="rounded-md bg-[#b99b5f] px-3 py-2 text-sm font-semibold text-[#07111f]"
              href="/auth/signup"
            >
              {copy.signup}
            </Link>
          </div>
        )}
      </div>
      {!isSupabaseConfigured() ? (
        <div className="border-t border-[#b99b5f]/20 bg-[#b99b5f]/10 px-4 py-2 text-center text-xs text-[#e1cb95]">
          {copy.accountUnavailable}
        </div>
      ) : null}
    </header>
  );
}
