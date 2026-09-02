import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sampleStockAnalysis } from "./sample-analysis";

const OWNER_ID = "owner";

const thesisSchema = z.object({
  ticker: z.string().trim().min(1, "Ticker saknas.").max(24),
  companyName: z.string().trim().min(1).max(120).optional(),
  confidence: z.coerce.number().int().min(0).max(100).optional(),
  summary: z.string().trim().min(8, "Tes i en mening behöver vara lite tydligare.").max(800),
  whyNow: z.string().trim().max(2000).optional(),
  keyDrivers: z.string().trim().max(2000).optional(),
  valuationView: z.string().trim().max(2000).optional(),
  risks: z.string().trim().max(2000).optional(),
  disconfirmingEvidence: z.string().trim().max(2000).optional(),
  timeHorizon: z.string().trim().max(40).default("12m"),
  reviewDueOn: z.string().trim().optional()
});

type SupabaseAdmin = NonNullable<ReturnType<typeof createAdminClient>>;

function supabaseOrThrow() {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Supabase är inte konfigurerat ännu.");
  return supabase;
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function parseThesisForm(formData: FormData) {
  return thesisSchema.parse({
    ticker: formData.get("ticker"),
    companyName: optionalText(formData.get("companyName")),
    confidence: optionalText(formData.get("confidence")),
    summary: formData.get("summary"),
    whyNow: optionalText(formData.get("whyNow")),
    keyDrivers: optionalText(formData.get("keyDrivers")),
    valuationView: optionalText(formData.get("valuationView")),
    risks: optionalText(formData.get("risks")),
    disconfirmingEvidence: optionalText(formData.get("disconfirmingEvidence")),
    timeHorizon: optionalText(formData.get("timeHorizon")),
    reviewDueOn: optionalText(formData.get("reviewDueOn"))
  });
}

export function stableJson(value: unknown) {
  return JSON.stringify(sortForStableJson(value));
}

export function contentHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortForStableJson(entry)])
  );
}

async function ensureStockBoxProfile(supabase: SupabaseAdmin) {
  const { error } = await supabase
    .from("stockbox_profiles")
    .upsert({ owner_id: OWNER_ID, plan_id: "free", base_currency: "SEK" }, { onConflict: "owner_id" });
  if (error) throw error;
}

async function upsertCompany(
  supabase: SupabaseAdmin,
  input: { symbol: string; companyName: string; exchange?: string; currency?: string }
) {
  const { data, error } = await supabase
    .from("stockbox_companies")
    .upsert(
      {
        symbol: input.symbol.toUpperCase(),
        exchange: input.exchange ?? "XSTO",
        company_name: input.companyName,
        currency: input.currency ?? "SEK"
      },
      { onConflict: "symbol,exchange" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

async function createReportSnapshot(supabase: SupabaseAdmin, companyId: string, ticker: string) {
  const snapshot =
    ticker.toUpperCase() === sampleStockAnalysis.company.ticker.toUpperCase()
      ? sampleStockAnalysis
      : {
          company: { ticker: ticker.toUpperCase() },
          note: "Manual thesis snapshot placeholder. Replace with a generated StockBox report snapshot when analysis data is available.",
          capturedAt: new Date().toISOString()
        };
  const hash = contentHash(snapshot);
  const { data, error } = await supabase
    .from("stockbox_report_snapshots")
    .upsert(
      {
        owner_id: OWNER_ID,
        company_id: companyId,
        snapshot_json: snapshot,
        content_hash: hash
      },
      { onConflict: "owner_id,content_hash" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function createThesis(formData: FormData) {
  "use server";
  await requireOwner();
  const input = parseThesisForm(formData);
  const ticker = input.ticker.toUpperCase();
  const companyName = input.companyName ?? (ticker === sampleStockAnalysis.company.ticker ? sampleStockAnalysis.company.name : ticker);
  const supabase = supabaseOrThrow();

  await ensureStockBoxProfile(supabase);
  const companyId = await upsertCompany(supabase, { symbol: ticker, companyName });
  const reportSnapshotId = await createReportSnapshot(supabase, companyId, ticker);

  const { data: thesis, error: thesisError } = await supabase
    .from("stockbox_theses")
    .insert({
      owner_id: OWNER_ID,
      company_id: companyId,
      report_snapshot_id: reportSnapshotId,
      status: "active",
      thesis_type: "quick",
      current_version: 1,
      review_due_on: input.reviewDueOn || null
    })
    .select("id")
    .single();
  if (thesisError) throw thesisError;

  const { error: versionError } = await supabase.from("stockbox_thesis_versions").insert({
    owner_id: OWNER_ID,
    thesis_id: thesis.id,
    version: 1,
    summary: input.summary,
    why_now: input.whyNow ?? null,
    key_drivers: input.keyDrivers ?? null,
    valuation_view: input.valuationView ?? null,
    risks: input.risks ?? null,
    disconfirming_evidence: input.disconfirmingEvidence ?? null,
    time_horizon: input.timeHorizon,
    confidence: input.confidence ?? null
  });
  if (versionError) throw versionError;

  revalidatePath("/app/stockbox");
  redirect("/app/stockbox?thesis=saved");
}
