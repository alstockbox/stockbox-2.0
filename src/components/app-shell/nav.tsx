import Link from "next/link";
import { BarChart3, Bell, BriefcaseBusiness, CreditCard, Gauge, LayoutDashboard, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { LanguageSwitcher } from "./language-switcher";
import { SignOutButton } from "./sign-out-button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { href: "/analyze", label: "Analyze", icon: Gauge, enabled: true },
  { href: "/watchlist", label: "Watchlist", icon: Bell, enabled: true },
  { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness, enabled: isFeatureEnabled("portfolio") },
  { href: "/batch", label: "Batch", icon: BarChart3, enabled: isFeatureEnabled("batchAnalysis") }
] as const;

export async function AppNav() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);

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
              {item.label}
            </Link>
          ))}
          {user ? (
            <Link
              href="/settings/billing"
              className="inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[#c9d2df] hover:bg-white/8 sm:px-3"
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Billing
            </Link>
          ) : null}
          {user?.role === "admin" ? (
            <Link
              href="/admin"
              className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-[#e1cb95] hover:bg-white/8"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Admin
            </Link>
          ) : null}
        </nav>
        <LanguageSwitcher locale={locale} />
        {user ? (
          <SignOutButton />
        ) : (
          <div className="flex items-center gap-2">
            <Link className="text-sm text-[#c9d2df] hover:text-white" href="/auth/login">
              Log in
            </Link>
            <Link
              className="rounded-md bg-[#b99b5f] px-3 py-2 text-sm font-semibold text-[#07111f]"
              href="/auth/signup"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
      {!isSupabaseConfigured() ? (
        <div className="border-t border-[#b99b5f]/20 bg-[#b99b5f]/10 px-4 py-2 text-center text-xs text-[#e1cb95]">
          Account features are temporarily unavailable. Please try again shortly.
        </div>
      ) : null}
    </header>
  );
}
