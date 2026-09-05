import Link from "next/link";
import { Gauge, History, Home, Settings, BriefcaseBusiness } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";

export async function MobileBottomNav() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) return null;
  const sv = locale === "sv";
  const items = [
    { href: "/dashboard", label: sv ? "Hem" : "Home", icon: Home },
    { href: "/analyze", label: sv ? "Analysera" : "Analyze", icon: Gauge },
    { href: "/portfolio", label: sv ? "Portfölj" : "Portfolio", icon: BriefcaseBusiness },
    { href: "/history", label: sv ? "Historik" : "History", icon: History },
    { href: "/settings", label: sv ? "Konto" : "Account", icon: Settings },
  ] as const;

  return (
    <>
      <div className="h-20 md:hidden" aria-hidden="true" />
      <nav aria-label={sv ? "Mobil huvudnavigation" : "Mobile primary navigation"} className="fixed inset-x-0 bottom-0 z-50 border-t border-white/12 bg-[#07111f]/96 px-2 pt-1.5 backdrop-blur md:hidden" style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium text-[#aab5c4] transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1cb95]/70">
              <item.icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
