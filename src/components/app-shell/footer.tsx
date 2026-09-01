import Link from "next/link";
import { StockBoxMark } from "@/components/brand/stockbox-mark";
import { getLocale } from "@/lib/i18n/server";
import { getLegalSeller } from "@/lib/legal/commerce";

export async function AppFooter() {
  const locale = await getLocale();
  const seller = getLegalSeller();
  const sv = locale === "sv";
  const groups = [
    [sv ? "Produkt" : "Product", [["/product", sv ? "Produkt" : "Product"], ["/sample-analysis", sv ? "Exempelanalys" : "Sample analysis"], ["/pricing", sv ? "Priser" : "Pricing"], ["/docs/methodology", sv ? "Metodik" : "Methodology"]]],
    [sv ? "Aktieanalys" : "Stock analysis", [["/aktier", sv ? "Publika analyser" : "Public analyses"], ["/aktieanalys", "Aktieanalys"], ["/aktieanalys-verktyg", sv ? "Aktieanalysverktyg" : "Stock analysis tools"], ["/ai-aktieanalys", "AI aktieanalys"], ["/fundamental-analys", "Fundamental analys"], ["/nyckeltal", sv ? "Nyckeltal" : "Key metrics"]]],
    [sv ? "Guider" : "Guides", [["/guider", sv ? "Alla guider" : "All guides"], ["/guider/hur-analyserar-man-en-aktie", sv ? "Analysera en aktie" : "How to analyze a stock"], ["/guider/hur-varderar-man-en-aktie", sv ? "Värdera en aktie" : "How to value a stock"], ["/guider/analysera-investmentbolag", sv ? "Investmentbolag" : "Investment companies"], ["/nyckeltal/pe-tal", "P/E-tal"]]],
    [sv ? "Företag" : "Company", [["/about", sv ? "Om StockBox" : "About"], ["/contact", sv ? "Kontakt" : "Contact"]]],
    [sv ? "Resurser" : "Resources", [["/research-standard", "Research Standard"], ["/data-sources", sv ? "Datakällor" : "Data sources"], ["/faq", "FAQ"], ["/changelog", "Changelog"], ["/legal/terms", sv ? "Villkor" : "Terms"], ["/legal/privacy", sv ? "Integritet" : "Privacy"], ["/withdraw", sv ? "Ångra avtal" : "Exercise withdrawal right"]]],
  ] as const;
  return <footer className="border-t border-white/10 bg-[#050b13] px-4 py-10 text-sm text-[#9aa7b8] sm:px-6 lg:px-8">
    <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_2.4fr]">
      <div><div className="flex items-center gap-2"><StockBoxMark className="h-8 w-8" /><span className="serif text-xl font-semibold text-[#f4efe5]">StockBox</span></div><p className="mt-4 max-w-sm leading-6">{sv ? "Databaserad, modellstyrd aktieresearch med synliga källor för din egen analys — inte individanpassad finansiell rådgivning." : "Data-driven, model-based equity research with visible sources for your own analysis — not individualized financial advice."}</p></div>
      <nav className="grid grid-cols-2 gap-6 sm:grid-cols-3 xl:grid-cols-5" aria-label="Footer">
        {groups.map(([heading, links]) => <div key={heading}><p className="font-semibold text-[#f4efe5]">{heading}</p><div className="mt-3 space-y-2">{links.map(([href, label]) => <Link key={href} href={href} className="block hover:text-white">{label}</Link>)}</div></div>)}
      </nav>
    </div>
    <div className="mx-auto mt-8 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs">
      <p>© {new Date().getFullYear()} StockBox{seller.businessName ? ` · ${seller.businessName}` : ""}{seller.organizationNumber ? ` · ${seller.organizationNumber}` : ""}</p>
      <p>{seller.postalAddress || "Sweden"}{seller.supportEmail ? ` · ${seller.supportEmail}` : ""}</p>
    </div>
  </footer>;
}
