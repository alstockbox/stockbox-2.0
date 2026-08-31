import { requireUser } from "@/lib/auth/session";
import type { AnalysisReport } from "@/lib/analysis/types";
import { buildBatchZip } from "@/lib/batch/export";
import { getAnalysis } from "@/lib/db/repositories";

export const runtime = "nodejs";
const MAX_EXPORT_REPORTS = 50;

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null) as { analysisIds?: unknown } | null;
  const raw = Array.isArray(body?.analysisIds) ? body.analysisIds : [];
  const ids = [...new Set(raw.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, MAX_EXPORT_REPORTS);
  if (!ids.length) return Response.json({ error: "No completed reports selected." }, { status: 400 });

  const loaded = await Promise.all(ids.map((id) => getAnalysis(id, user.id)));
  const reports = loaded.map((row) => row?.report as AnalysisReport | undefined).filter((report): report is AnalysisReport => Boolean(report?.id));
  if (!reports.length) return Response.json({ error: "No accessible completed reports found." }, { status: 404 });

  const bytes = await buildBatchZip(reports);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(bytes as BodyInit, { headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="StockBox_Batch_${date}.zip"`,
    "Cache-Control": "private, no-store",
  }});
}
