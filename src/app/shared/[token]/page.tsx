import { notFound } from "next/navigation";
import { ReportView } from "@/components/analysis/report-view";
import { Container, Section } from "@/components/ui/card";
import { getSharedAnalysis } from "@/lib/db/repositories";

export default async function SharedAnalysisPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await getSharedAnalysis(token);
  if (!report) notFound();
  return <Section><Container><p className="mb-5 text-sm text-[#e1cb95]">Shared, read-only StockBox report</p><ReportView report={report} /></Container></Section>;
}
