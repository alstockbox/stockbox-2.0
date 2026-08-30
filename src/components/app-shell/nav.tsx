import Link from "next/link";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Gauge,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { StockBoxLogo } from "@/components/brand/stockbox-logo";
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
  { href: "/batch", labelKey: "batch", icon: BarChart3, enabled: isFeatureEnabled("batchAnalysis") },
  { href: "/portfolio", labelKey: "portfolio", icon: BriefcaseBusiness, enabled: isFeatureEnabled("portfolio") },
  { href: "/watchlist", labelKey: "watchlist", icon: Bell, enabled: true },
] as const;
export async function AppNav() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).nav;
  const initial = user?.email?.trim().charAt(0).toUpperCase() || "S";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111f]/94 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="group flex shrink-0 items-center gap-3 pr-2" aria-label="StockBox home">
          <StockBoxLogo size={44} alt="" priority className="h-10 w-10 sm:h-11 sm:w-11" />
          <span className="serif text-2xl font-semibold tracking-tight text-[#f4efe5] group-hover:text-white">StockBox</span>
        </Link>

        <nav className="order-4 flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
          {navItems.filter((item) => item.enabled).map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[#c9d2df] hover:bg-white/8 sm:px-3">
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {copy[item.labelKey]}
            </Link>
          ))}
          {user?.role === "affiliate_ambassador" ? (
            <Link href="/affiliate" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-[#e1cb95] hover:bg-white/8">
              <UsersRound className="h-4 w-4" aria-hidden="true" />Affiliate
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link href="/admin" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-[#e1cb95] hover:bg-white/8">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {copy.admin}
            </Link>
          ) : null}
        </nav>

        {user ? (
          <details className="relative ml-auto">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-[#f4efe5] hover:bg-white/8">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e1cb95]/15 font-semibold text-[#f4e5b8]">{initial}</span>
              <span className="hidden max-w-36 truncate lg:inline">{user.email ?? "Account"}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-[#0a1626] p-2 shadow-2xl">
              <Link href="/settings" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/8"><Settings className="h-4 w-4" />Settings</Link>
              <Link href="/settings/profile" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">Profile</Link>
              <Link href="/settings/billing" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">Billing</Link>
              <Link href="/settings/security" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">Security</Link>
              <Link href="/feedback" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">Give feedback</Link>
              <Link href="/contact" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">Contact</Link>
              <div className="my-2 border-t border-white/10" />
              <div className="px-3 py-2"><LanguageSwitcher locale={locale} /></div>
              <SignOutButton label={copy.signOut} />
            </div>
          </details>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <Link className="text-sm text-[#c9d2df] hover:text-white" href="/auth/login">{copy.login}</Link>
            <Link className="rounded-md bg-[#b99b5f] px-3 py-2 text-sm font-semibold text-[#07111f]" href="/auth/signup">{copy.signup}</Link>
          </div>
        )}
      </div>
      {!isSupabaseConfigured() ? (
        <div className="border-t border-[#b99b5f]/20 bg-[#b99b5f]/10 px-4 py-2 text-center text-xs text-[#e1cb95]">{copy.accountUnavailable}</div>
      ) : null}
    </header>
  );
}
