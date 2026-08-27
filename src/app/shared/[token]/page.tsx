import { notFound } from "next/navigation";
import { ReportView } from "@/components/analysis/report-view";
import { Container, Section } from "@/components/ui/card";
import { getSharedAnalysis } from "@/lib/db/repositories";
import { getLocale } from "@/lib/i18n/server";

export default async function SharedAnalysisPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, locale] = await Promise.all([params, getLocale()]);
  const report = await getSharedAnalysis(token);
  if (!report) notFound();
  return <Section><Container><p className="mb-5 text-sm text-[#e1cb95]">{locale === "sv" ? "Delad, skrivskyddad StockBox-rapport" : "Shared, read-only StockBox report"}</p><ReportView report={report} locale={locale} /></Container></Section>;
}
