import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#050b13] px-4 py-8 text-sm text-[#9aa7b8] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <p>StockBox provides model-based research, not individualized financial advice.</p>
        <nav className="flex flex-wrap gap-5" aria-label="Footer">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/legal/terms" className="hover:text-white">Terms</Link>
          <Link href="/docs/methodology" className="hover:text-white">Methodology</Link>
        </nav>
      </div>
    </footer>
  );
}
