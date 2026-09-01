"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { createClient } from "@/lib/supabase/server";

const tickerSchema = z.string().trim().min(1).max(16).transform((value) => value.toUpperCase());
const textSchema = z.string().trim().min(1).max(5_000);
const optionalTextSchema = z.string().trim().max(10_000).optional();

function parseList(value: FormDataEntryValue | null, limit = 30): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => item.slice(0, 500));
}

async function resolveResearchCompany(ticker: string, companyName: string) {
  try {
    const candidates = await searchCompanies(ticker);
    const resolution = resolveCanonicalCompanySelection(
      { ticker, canonicalTicker: ticker, name: companyName },
      candidates,
    );
    return resolution.ok ? resolution.company : null;
  } catch {
    return null;
  }
}

export async function createInvestmentThesisAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    ticker: tickerSchema,
    companyName: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    thesis: textSchema,
    notes: optionalTextSchema,
  }).safeParse({
    ticker: formData.get("ticker"),
    companyName: formData.get("companyName"),
    title: formData.get("title"),
    thesis: formData.get("thesis"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) redirect("/research?error=validation");

  const company = await resolveResearchCompany(parsed.data.ticker, parsed.data.companyName);
  if (!company) redirect("/research?error=identity");
  const supabase = await createClient();
  if (!supabase) redirect("/research?error=configuration");
  const { error } = await supabase.from("investment_theses").insert({
    user_id: user.id,
    ticker: company.canonicalTicker ?? company.ticker,
    company_name: company.name,
    status: "draft",
    title: parsed.data.title,
    thesis: parsed.data.thesis,
    assumptions: parseList(formData.get("assumptions")),
    invalidation_triggers: parseList(formData.get("invalidationTriggers")),
    target_metrics: parseList(formData.get("targetMetrics")),
    notes: parsed.data.notes || null,
  });
  if (error) redirect(error.code === "23505" ? "/research?error=duplicate" : "/research?error=save");
  revalidatePath("/research");
}

export async function updateInvestmentThesisAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    thesis: textSchema,
    notes: optionalTextSchema,
  }).safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    thesis: formData.get("thesis"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase?.from("investment_theses").update({
    title: parsed.data.title,
    thesis: parsed.data.thesis,
    assumptions: parseList(formData.get("assumptions")),
    invalidation_triggers: parseList(formData.get("invalidationTriggers")),
    target_metrics: parseList(formData.get("targetMetrics")),
    notes: parsed.data.notes || null,
    last_reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidatePath("/research");
}

export async function setInvestmentThesisStatusAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(["draft", "active", "invalidated", "closed"]),
  }).safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase?.from("investment_theses").update({
    status: parsed.data.status,
    last_reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.id).eq("user_id", user.id);
  revalidatePath("/research");
}

export async function addManualThesisEvidenceAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    thesisId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5_000),
  }).safeParse({
    thesisId: formData.get("thesisId"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: thesis } = await supabase?.from("investment_theses")
    .select("id")
    .eq("id", parsed.data.thesisId)
    .eq("user_id", user.id)
    .maybeSingle() ?? { data: null };
  if (!thesis) return;
  await supabase?.from("thesis_evidence_events").insert({
    thesis_id: thesis.id,
    user_id: user.id,
    event_kind: "manual",
    title: parsed.data.title,
    body: parsed.data.body,
    evidence: {},
  });
  revalidatePath("/research");
}

export async function deleteInvestmentThesisAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("investment_theses").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/research");
}
