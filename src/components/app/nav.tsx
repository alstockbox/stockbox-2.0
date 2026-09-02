import Link from "next/link";
import { BarChart3, ClipboardCheck, Home, LineChart, WalletCards } from "lucide-react";

const nav = [
  { href: "/app", label: "Översikt", icon: Home },
  { href: "/app/stockbox", label: "V2", icon: LineChart, primary: true },
  { href: "/app/analysis", label: "Analys", icon: BarChart3 },
  { href: "/app/stockbox/portfolio", label: "Paper", icon: WalletCards },
  { href: "/app/stockbox/thesis", label: "Tes", icon: ClipboardCheck }
];

export function AppNav() {
  return (
    <nav className="bottom-nav">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 md:flex md:h-full md:flex-col md:items-center md:justify-center md:gap-4">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-[8px] text-[0.72rem] font-black ${
                item.primary ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)]"
              }`}
              title={item.label}
            >
              <Icon size={item.primary ? 22 : 20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
