import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { AnalysisReport } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildStockMetaDescription,
  evaluatePublicSnapshot,
  normalizePercent,
  sanitizePublicReport,
  slugifyStockPage,
} from "./public-stock";

export const PUBLIC_STOCK_SITEMAP_PAGE_SIZE = 1000;
export const PUBLIC_STOCK_CACHE_SECONDS = 900;
const PUBLIC_STOCK_LIST_TAG = "public-stock-list";

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

function tickerSlug(ticker: string) {
  return slugifyStockPage(ticker.replace(/\./g, " dot "));
}

export function resolvePublicSnapshotSlug(input: {
  companyName: string;
  ticker: string;
  requestedSlug?: string;
  existingTickerSlug: string | null;
  slugOwnerTicker: string | null;
}) {
  if (input.existingTickerSlug) return slugifyStockPage(input.existingTickerSlug);

  const baseSlug = slugifyStockPage(input.requestedSlug?.trim() || input.companyName);
  if (!baseSlug) throw new Error("Public snapshot rejected: valid_slug_required");

  if (input.slugOwnerTicker && input.slugOwnerTicker.trim().toUpperCase() !== input.ticker.trim().toUpperCase()) {
    const securitySuffix = tickerSlug(input.ticker);
    if (!securitySuffix) throw new Error("Public snapshot rejected: valid_ticker_slug_required");
    return `${baseSlug}-${securitySuffix}`;
  }

  return baseSlug;
}

export function buildPublicSnapshotRecord(input: {
  analysisId: string;
  report: AnalysisReport;
  slug?: string;
  metaDescription?: string;
  now?: string;
  publishedAt?: string;
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
    published_at: input.publishedAt ?? now,
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

export async function getPersistedPublicStockSnapshotBySlug(slug: string): Promise<PublicStockSnapshot | null> {
  const normalizedSlug = slugifyStockPage(slug);
  if (!normalizedSlug) return null;

  const getPersistedSnapshot = unstable_cache(
    () => getPublicStockSnapshotBySlug(normalizedSlug),
    ["public-stock-snapshot", normalizedSlug],
    {
      revalidate: PUBLIC_STOCK_CACHE_SECONDS,
      tags: [`public-stock-snapshot:${normalizedSlug}`],
    },
  );

  return getPersistedSnapshot();
}

export const getCachedPublicStockSnapshotBySlug = cache(getPersistedPublicStockSnapshotBySlug);

async function listPublicStockSnapshotsUncached(limit: number): Promise<PublicStockSnapshot[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("public_stock_snapshots")
    .select(publicSnapshotFields)
    .eq("is_indexable", true)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as PublicStockSnapshotRow[]).map(fromRow);
}

export async function listPublicStockSnapshots(limit = 500): Promise<PublicStockSnapshot[]> {
  const safeLimit = Math.max(1, Math.min(5000, Math.trunc(limit)));
  const getPersistedList = unstable_cache(
    () => listPublicStockSnapshotsUncached(safeLimit),
    [PUBLIC_STOCK_LIST_TAG, String(safeLimit)],
    { revalidate: PUBLIC_STOCK_CACHE_SECONDS, tags: [PUBLIC_STOCK_LIST_TAG] },
  );
  return getPersistedList();
}

async function countPublicStockSnapshotsUncached(): Promise<number> {
  const supabase = createAdminClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("public_stock_snapshots")
    .select("slug", { count: "exact", head: true })
    .eq("is_indexable", true);

  if (error || typeof count !== "number") return 0;
  return count;
}

export async function countPublicStockSnapshots(): Promise<number> {
  const getPersistedCount = unstable_cache(
    countPublicStockSnapshotsUncached,
    ["public-stock-count"],
    { revalidate: PUBLIC_STOCK_CACHE_SECONDS, tags: [PUBLIC_STOCK_LIST_TAG] },
  );
  return getPersistedCount();
}

export async function getPublicStockSnapshotSitemapIds(): Promise<number[]> {
  const count = await countPublicStockSnapshots();
  const pageCount = Math.ceil(count / PUBLIC_STOCK_SITEMAP_PAGE_SIZE);
  return Array.from({ length: pageCount }, (_, id) => id);
}

async function listPublicStockSnapshotsPageUncached(page: number, pageSize: number): Promise<PublicStockSnapshot[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await supabase
    .from("public_stock_snapshots")
    .select(publicSnapshotFields)
    .eq("is_indexable", true)
    .order("slug", { ascending: true })
    .range(from, to);

  if (error || !data) return [];
  return (data as unknown as PublicStockSnapshotRow[]).map(fromRow);
}

export async function listPublicStockSnapshotsPage(
  page: number,
  pageSize = PUBLIC_STOCK_SITEMAP_PAGE_SIZE,
): Promise<PublicStockSnapshot[]> {
  const safePage = Math.max(0, Math.trunc(page));
  const safePageSize = Math.max(1, Math.min(PUBLIC_STOCK_SITEMAP_PAGE_SIZE, Math.trunc(pageSize)));
  const getPersistedPage = unstable_cache(
    () => listPublicStockSnapshotsPageUncached(safePage, safePageSize),
    ["public-stock-sitemap-page", String(safePage), String(safePageSize)],
    { revalidate: PUBLIC_STOCK_CACHE_SECONDS, tags: [PUBLIC_STOCK_LIST_TAG] },
  );
  return getPersistedPage();
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

  const report = source.report as AnalysisReport;
  const ticker = report.ticker.trim().toUpperCase();
  const requestedBaseSlug = slugifyStockPage(input.slug?.trim() || report.companyName);
  if (!requestedBaseSlug) return { ok: false, status: 422, error: "Public snapshot rejected: valid_slug_required" };

  const { data: existingTickerSnapshot, error: existingTickerError } = await supabase
    .from("public_stock_snapshots")
    .select("slug,ticker,published_at")
    .eq("ticker", ticker)
    .maybeSingle();

  if (existingTickerError) return { ok: false, status: 500, error: "Could not resolve the canonical stock snapshot." };

  const { data: slugOwner, error: slugOwnerError } = existingTickerSnapshot
    ? { data: null, error: null }
    : await supabase
        .from("public_stock_snapshots")
        .select("ticker")
        .eq("slug", requestedBaseSlug)
        .maybeSingle();

  if (slugOwnerError) return { ok: false, status: 500, error: "Could not resolve the public stock URL." };

  let record: ReturnType<typeof buildPublicSnapshotRecord>;
  try {
    const resolvedSlug = resolvePublicSnapshotSlug({
      companyName: report.companyName,
      ticker,
      requestedSlug: input.slug,
      existingTickerSlug: existingTickerSnapshot?.slug ?? null,
      slugOwnerTicker: slugOwner?.ticker ?? null,
    });
    record = buildPublicSnapshotRecord({
      analysisId: source.id as string,
      report,
      slug: resolvedSlug,
      metaDescription: input.metaDescription,
      publishedAt: existingTickerSnapshot?.published_at ?? undefined,
    });
  } catch (error) {
    return { ok: false, status: 422, error: error instanceof Error ? error.message : "Public snapshot failed quality validation." };
  }

  const { data, error } = await supabase
    .from("public_stock_snapshots")
    .upsert(record, { onConflict: "ticker" })
    .select(publicSnapshotFields)
    .single();

  if (error || !data) return { ok: false, status: 500, error: "Could not publish the stock snapshot." };
  return { ok: true, snapshot: fromRow(data as unknown as PublicStockSnapshotRow) };
}
