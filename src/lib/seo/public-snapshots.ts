import type { AnalysisReport } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildStockMetaDescription,
  evaluatePublicSnapshot,
  normalizePercent,
  sanitizePublicReport,
  slugifyStockPage,
} from "./public-stock";

export type PublicStockSnapshot = {
  slug: string;
  ticker: string;
  companyName: string;
  sourceAnalysisId: string | null;
  report: AnalysisReport;
  score: number | null;
  confidence: number | null;
  dataCoverage: number | null;
  dataAsOf: string | null;
  metaDescription: string;
  publishedAt: string;
  updatedAt: string;
  isIndexable: boolean;
};

type PublicStockSnapshotRow = {
  slug: string;
  ticker: string;
  company_name: string;
  source_analysis_id: string | null;
  report: unknown;
  score: number | null;
  confidence: number | null;
  data_coverage: number | null;
  data_as_of: string | null;
  meta_description: string | null;
  published_at: string;
  updated_at: string;
  is_indexable: boolean;
};

const publicSnapshotFields = "slug,ticker,company_name,source_analysis_id,report,score,confidence,data_coverage,data_as_of,meta_description,published_at,updated_at,is_indexable";

function fromRow(row: PublicStockSnapshotRow): PublicStockSnapshot {
  const report = row.report as AnalysisReport;
  return {
    slug: row.slug,
    ticker: row.ticker,
    companyName: row.company_name,
    sourceAnalysisId: row.source_analysis_id,
    report,
    score: row.score,
    confidence: row.confidence,
    dataCoverage: row.data_coverage,
    dataAsOf: row.data_as_of,
    metaDescription: row.meta_description?.trim() || buildStockMetaDescription(report),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    isIndexable: row.is_indexable,
  };
}

export function buildPublicSnapshotRecord(input: {
  analysisId: string;
  report: AnalysisReport;
  slug?: string;
  metaDescription?: string;
  now?: string;
}) {
  const eligibility = evaluatePublicSnapshot(input.report);
  if (!eligibility.eligible) {
    throw new Error(`Public snapshot rejected: ${eligibility.reasons.join(",")}`);
  }

  const slug = slugifyStockPage(input.slug?.trim() || input.report.companyName);
  if (!slug) throw new Error("Public snapshot rejected: valid_slug_required");

  const now = input.now ?? new Date().toISOString();
  return {
    slug,
    ticker: input.report.ticker.trim().toUpperCase(),
    company_name: input.report.companyName.trim(),
    source_analysis_id: input.analysisId,
    report: sanitizePublicReport(input.report),
    score: input.report.score.score,
    confidence: normalizePercent(input.report.score.confidence),
    data_coverage: normalizePercent(input.report.dataCoverage),
    data_as_of: input.report.dataAsOf ?? input.report.generatedAt ?? null,
    meta_description: input.metaDescription?.trim() || buildStockMetaDescription(input.report),
    is_indexable: true,
    published_at: now,
    updated_at: now,
  };
}

export async function getPublicStockSnapshotBySlug(slug: string): Promise<PublicStockSnapshot | null> {
  const normalizedSlug = slugifyStockPage(slug);
  if (!normalizedSlug) return null;
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("public_stock_snapshots")
    .select(publicSnapshotFields)
    .eq("slug", normalizedSlug)
    .eq("is_indexable", true)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data as unknown as PublicStockSnapshotRow);
}

export async function listPublicStockSnapshots(limit = 500): Promise<PublicStockSnapshot[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];
  const safeLimit = Math.max(1, Math.min(5000, Math.trunc(limit)));

  const { data, error } = await supabase
    .from("public_stock_snapshots")
    .select(publicSnapshotFields)
    .eq("is_indexable", true)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (error || !data) return [];
  return (data as unknown as PublicStockSnapshotRow[]).map(fromRow);
}

export type PublishAnalysisSnapshotResult =
  | { ok: true; snapshot: PublicStockSnapshot }
  | { ok: false; status: 404 | 422 | 500 | 503; error: string };

export async function publishAnalysisSnapshot(input: {
  analysisId: string;
  slug?: string;
  metaDescription?: string;
}): Promise<PublishAnalysisSnapshotResult> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, status: 503, error: "Public snapshot storage is not configured." };

  const { data: source, error: sourceError } = await supabase
    .from("analyses")
    .select("id,report")
    .eq("id", input.analysisId)
    .maybeSingle();

  if (sourceError) return { ok: false, status: 500, error: "Could not read the source analysis." };
  if (!source) return { ok: false, status: 404, error: "Source analysis was not found." };

  let record: ReturnType<typeof buildPublicSnapshotRecord>;
  try {
    record = buildPublicSnapshotRecord({
      analysisId: source.id as string,
      report: source.report as AnalysisReport,
      slug: input.slug,
      metaDescription: input.metaDescription,
    });
  } catch (error) {
    return { ok: false, status: 422, error: error instanceof Error ? error.message : "Public snapshot failed quality validation." };
  }

  const { data, error } = await supabase
    .from("public_stock_snapshots")
    .upsert(record, { onConflict: "slug" })
    .select(publicSnapshotFields)
    .single();

  if (error || !data) return { ok: false, status: 500, error: "Could not publish the stock snapshot." };
  return { ok: true, snapshot: fromRow(data as unknown as PublicStockSnapshotRow) };
}
