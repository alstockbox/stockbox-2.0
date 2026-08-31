import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { AnalysisReport, Metrics } from "@/lib/analysis/types";
import { analysisDateSlug, formatAnalysisTimestamp } from "@/lib/analysis/timestamp";
import { researchViewCopy, researchViewForReport } from "@/lib/analysis/research-view";

function pdfSafe(text: string) {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2192\u21d2]/g, "->")
    .replace(/[\u2190\u21d0]/g, "<-")
    .replace(/[\u2194\u21d4]/g, "<->")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, "?");
}

function wrap(text: string, max = 92) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= max) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

type Writer = { doc: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont; y: number };
function ensurePage(writer: Writer, height = 20) {
  if (writer.y >= 55 + height) return;
  writer.page = writer.doc.addPage([595, 842]);
  writer.y = 800;
}
function line(writer: Writer, text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}) {
  const size = opts.size ?? 10;
  for (const part of wrap(text, Math.max(45, Math.floor(92 * 10 / size)))) {
    ensurePage(writer, size + 8);
    writer.page.drawText(part, { x: 48, y: writer.y, size, font: opts.bold ? writer.bold : writer.font, color: rgb(.12, .16, .22) });
    writer.y -= size + 5;
  }
  writer.y -= opts.gap ?? 2;
}
function heading(writer: Writer, text: string) { writer.y -= 4; line(writer, text, { size: 14, bold: true, gap: 5 }); }
function metricLabel(key: keyof Metrics) { return key.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase()); }
function value(value: unknown) { return value === null || value === undefined ? "Not available" : typeof value === "number" ? String(Math.round(value * 10000) / 10000) : String(value); }

export function safeAnalysisFilename(report: AnalysisReport) {
  const clean = `${report.ticker}_${report.companyName}_${analysisDateSlug(report.generatedAt)}`
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\\/:*?"<>|]/g, "_").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return `${clean || "StockBox_Analysis"}.pdf`;
}

export async function renderAnalysisPdf(report: AnalysisReport) {
  const neutralCopy = researchViewCopy(report, "en");
  const doc = await PDFDocument.create();
  const writer: Writer = { doc, page: doc.addPage([595, 842]), font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), y: 800 };
  line(writer, "StockBox", { size: 22, bold: true, gap: 3 });
  line(writer, `${report.companyName} (${report.ticker})`, { size: 17, bold: true });
  line(writer, `Analyzed: ${formatAnalysisTimestamp(report.generatedAt, "en")}`);
  line(writer, `Analysis type: ${report.analysisType} | Profile: ${report.investmentProfile} | Engine: ${report.modelVersion ?? "Not available"}`);
  line(writer, `Model rating: ${report.recommendation} | Research view: ${researchViewForReport(report)} | Score: ${report.score.score === null ? "Not available" : Math.round(report.score.score)}/100 | Confidence: ${Math.round(report.score.confidence)}% | Coverage: ${report.dataCoverage === undefined ? "Not available" : `${Math.round(report.dataCoverage * 100)}%`}`);
  heading(writer, "Summary"); line(writer, neutralCopy.oneSentence); line(writer, neutralCopy.summary);
  heading(writer, "Research dimensions");
  for (const d of report.score.dimensions) line(writer, `${d.label}: ${value(d.score)}/100${d.coverage === undefined ? "" : ` | coverage ${Math.round(d.coverage * 100)}%`} - ${d.rationale}`);
  heading(writer, "Important financial metrics");
  for (const [key, metric] of Object.entries(report.metrics)) line(writer, `${metricLabel(key as keyof Metrics)}: ${value(metric)}`);
  if (report.engine?.metrics.valuation) {
    heading(writer, "Valuation metrics");
    for (const [key, metric] of Object.entries(report.engine.metrics.valuation)) if (typeof metric === "number" || metric === null) line(writer, `${key}: ${value(metric)}`);
  }
  heading(writer, "Strengths");
  if (report.greenFlags.length) report.greenFlags.forEach((f) => line(writer, `${f.title}: ${f.detail}`)); else line(writer, "No explicit green flags in this report.");
  heading(writer, "Risks / weaknesses");
  if (report.redFlags.length) report.redFlags.forEach((f) => line(writer, `${f.title}: ${f.detail}`)); else if (report.research?.negatives.length) report.research.negatives.slice(0, 10).forEach((x) => line(writer, x.statement)); else line(writer, "No explicit red flags in this report.");
  if (report.deepReport?.sections.length) {
    heading(writer, "Deep analysis");
    for (const section of report.deepReport.sections) {
      line(writer, `${section.title} [${section.status}]`, { bold: true });
      section.findings.forEach((f) => line(writer, f.statement));
      section.unknowns.forEach((u) => line(writer, `Unknown: ${u}`));
    }
  }
  if (report.score.missingData.length || report.engine?.missingData.length) {
    heading(writer, "Missing data / limitations");
    report.score.missingData.slice(0, 20).forEach((x) => line(writer, x));
    report.engine?.missingData.slice(0, 30).forEach((x) => line(writer, `${x.field}: ${x.reason}`));
  }
  heading(writer, "Sources");
  report.sources.forEach((s) => line(writer, `${s.name} | ${s.freshness} | ${s.url}`));
  heading(writer, "Disclaimer"); line(writer, report.disclaimer);
  return doc.save();
}

function csvCell(v: unknown) { return `"${String(v ?? "").replaceAll('"', '""')}"`; }
export async function buildBatchZip(reports: AnalysisReport[]) {
  const zip = new JSZip();
  const folder = zip.folder("Analyses");
  if (!folder) throw new Error("ZIP folder creation failed");
  for (const report of reports) folder.file(safeAnalysisFilename(report), await renderAnalysisPdf(report));
  const header = ["Ticker", "Company", "Analyzed", "Type", "Score", "Confidence", "Model Rating", "Research View", "Coverage", "Analysis ID"];
  const rows = reports.map((r) => [r.ticker, r.companyName, r.generatedAt, r.analysisType, r.score.score === null ? null : Math.round(r.score.score), Math.round(r.score.confidence), r.recommendation, researchViewForReport(r), r.dataCoverage, r.id]);
  zip.file("Batch_Data.csv", [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"));
  zip.file("metadata.json", JSON.stringify({ exportedAt: new Date().toISOString(), reportCount: reports.length, reports: reports.map((r) => ({ analysisId: r.id, ticker: r.ticker, company: r.companyName, generatedAt: r.generatedAt, engineVersion: r.modelVersion, analysisType: r.analysisType })) }, null, 2));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
