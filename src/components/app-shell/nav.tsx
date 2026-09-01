import Link from "next/link";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Gauge,
  History,
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
import { TransientMenu } from "./transient-menu";

const marketingNavItems = [
  { href: "/product", en: "Product", sv: "Produkt" },
  { href: "/sample-analysis", en: "Sample analysis", sv: "Exempelanalys" },
  { href: "/docs/methodology", en: "Methodology", sv: "Metodik" },
  { href: "/pricing", en: "Pricing", sv: "Priser" },
  { href: "/about", en: "About", sv: "Om StockBox" },
] as const;

const appNavItems = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, enabled: true },
  { href: "/analyze", labelKey: "analyze", icon: Gauge, enabled: true },
  { href: "/history", labelKey: "history", icon: History, enabled: true },
  { href: "/compare", labelKey: "compare", icon: BarChart3, enabled: true },
  { href: "/batch", labelKey: "batch", icon: BarChart3, enabled: isFeatureEnabled("batchAnalysis") },
  { href: "/portfolio", labelKey: "portfolio", icon: BriefcaseBusiness, enabled: isFeatureEnabled("portfolio") },
  { href: "/watchlist", labelKey: "watchlist", icon: Bell, enabled: true },
] as const;

function Brand() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2 pr-1 sm:gap-3 sm:pr-2" aria-label="StockBox home">
      <StockBoxLogo size={44} alt="" priority className="h-9 w-9 sm:h-11 sm:w-11" />
      <span className="serif text-xl font-semibold tracking-tight text-[#f4efe5] group-hover:text-white sm:text-2xl">StockBox</span>
    </Link>
  );
}

export async function AppNav() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).nav;
  const initial = user?.email?.trim().charAt(0).toUpperCase() || "S";
  const accountLabels = locale === "sv"
    ? { settings: "Inställningar", profile: "Profil", billing: "Betalning", security: "Säkerhet", feedback: "Ge feedback", contact: "Kontakt", menu: "Meny" }
    : { settings: "Settings", profile: "Profile", billing: "Billing", security: "Security", feedback: "Give feedback", contact: "Contact", menu: "Menu" };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111f]/94 backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-2 px-3 py-2.5 sm:min-h-16 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
        <Brand />

        {!user ? (
          <nav className="ml-6 hidden flex-1 items-center gap-1 lg:flex" aria-label="Marketing">
            {marketingNavItems.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8 hover:text-white">
                {locale === "sv" ? item.sv : item.en}
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="ml-4 hidden flex-1 items-center gap-0.5 xl:flex" aria-label="Workspace">
            {appNavItems.filter((item) => item.enabled).map((item) => (
              <Link key={item.href} href={item.href} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-[#c9d2df] hover:bg-white/8 hover:text-white">
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {copy[item.labelKey]}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <TransientMenu
            ariaLabel={accountLabels.menu}
            className={user ? "xl:hidden" : "lg:hidden"}
            panelClassName="absolute right-0 top-full mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-white/10 bg-[#0a1626] p-2 shadow-2xl"
            trigger={(
              <span className="inline-flex min-h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-[#f4efe5] hover:bg-white/8">
                {accountLabels.menu}
              </span>
            )}
          >
            {(user
              ? appNavItems.filter((item) => item.enabled).map((item) => ({ href: item.href, label: copy[item.labelKey] }))
              : marketingNavItems.map((item) => ({ href: item.href, label: locale === "sv" ? item.sv : item.en })))
              .map((item) => (
                <Link role="menuitem" key={item.href} href={item.href} className="block rounded-md px-3 py-2.5 text-sm text-[#c9d2df] hover:bg-white/8 hover:text-white">
                  {item.label}
                </Link>
              ))}
            <div className="my-2 border-t border-white/10" />
            <div className="px-3 py-2"><LanguageSwitcher locale={locale} /></div>
          </TransientMenu>

          {user ? (
            <TransientMenu
              ariaLabel={locale === "sv" ? "Kontomeny" : "Account menu"}
              panelClassName="absolute right-0 top-full mt-2 w-[min(16rem,calc(100vw-1.5rem))] rounded-xl border border-white/10 bg-[#0a1626] p-2 shadow-2xl"
              trigger={(
                <span className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-sm text-[#f4efe5] hover:bg-white/8 sm:px-2 sm:py-1.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e1cb95]/15 font-semibold text-[#f4e5b8]">{initial}</span>
                  <span className="hidden max-w-36 truncate lg:inline">{user.email ?? "Account"}</span>
                </span>
              )}
            >
              <Link role="menuitem" href="/settings" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-white/8"><Settings className="h-4 w-4" />{accountLabels.settings}</Link>
              <Link role="menuitem" href="/settings/profile" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">{accountLabels.profile}</Link>
              <Link role="menuitem" href="/settings/billing" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">{accountLabels.billing}</Link>
              <Link role="menuitem" href="/settings/security" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">{accountLabels.security}</Link>
              <Link role="menuitem" href="/feedback" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">{accountLabels.feedback}</Link>
              <Link role="menuitem" href="/contact" className="block rounded-md px-3 py-2 text-sm text-[#c9d2df] hover:bg-white/8">{accountLabels.contact}</Link>
              {user.role === "affiliate_ambassador" ? <Link role="menuitem" href="/affiliate" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#e1cb95] hover:bg-white/8"><UsersRound className="h-4 w-4" />Affiliate</Link> : null}
              {user.role === "admin" ? <Link role="menuitem" href="/admin" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#e1cb95] hover:bg-white/8"><ShieldCheck className="h-4 w-4" />{copy.admin}</Link> : null}
              <div className="my-2 border-t border-white/10" />
              <div className="px-3 py-2"><LanguageSwitcher locale={locale} /></div>
              <SignOutButton label={copy.signOut} />
            </TransientMenu>
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Link className="text-sm text-[#c9d2df] hover:text-white" href="/auth/login">{copy.login}</Link>
              <Link className="rounded-md bg-[#b99b5f] px-3 py-2 text-sm font-semibold text-[#07111f]" href="/auth/signup">{locale === "sv" ? "Analysera gratis" : "Analyze free"}</Link>
            </div>
          )}
        </div>
      </div>
      {!isSupabaseConfigured() ? <div className="border-t border-[#b99b5f]/20 bg-[#b99b5f]/10 px-4 py-2 text-center text-xs text-[#e1cb95]">{copy.accountUnavailable}</div> : null}
    </header>
  );
}
