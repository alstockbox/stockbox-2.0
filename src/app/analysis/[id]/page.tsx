import { notFound } from "next/navigation";
import { ReportView } from "@/components/analysis/report-view";
import { Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getAnalysis } from "@/lib/db/repositories";
import type { AnalysisReport } from "@/lib/analysis/types";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const analysis = await getAnalysis(id, user.id);
  if (!analysis) notFound();
  return <Section><Container><ReportView report={analysis.report as AnalysisReport} /></Container></Section>;
}
