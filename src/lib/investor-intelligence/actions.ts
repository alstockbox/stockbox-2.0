"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getInvestorMetric, metricInputToCanonical } from "./metric-catalog";

const tickerSchema = z.string().trim().min(1).max(16).transform((value) => value.toUpperCase());
const optionalNumber = z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().finite().optional());

export async function createInvestmentThesisAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    ticker: tickerSchema,
    title: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(5000).optional(),
    fairValueTarget: optionalNumber,
    preferredBuyPrice: optionalNumber,
    requiredMarginOfSafety: optionalNumber,
    riskNotes: z.string().trim().max(3000).optional(),
    positiveCatalysts: z.string().trim().max(3000).optional(),
    invalidationConditions: z.string().trim().max(3000).optional(),
  }).safeParse({
    ticker: formData.get("ticker"),
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    fairValueTarget: formData.get("fairValueTarget"),
    preferredBuyPrice: formData.get("preferredBuyPrice"),
    requiredMarginOfSafety: formData.get("requiredMarginOfSafety"),
    riskNotes: formData.get("riskNotes") || undefined,
    positiveCatalysts: formData.get("positiveCatalysts") || undefined,
    invalidationConditions: formData.get("invalidationConditions") || undefined,
  });
  if (!parsed.success) redirect("/thesis?error=validation");
  if (parsed.data.requiredMarginOfSafety !== undefined && (parsed.data.requiredMarginOfSafety < 0 || parsed.data.requiredMarginOfSafety > 100)) {
    redirect("/thesis?error=margin");
  }

  const supabase = await createClient();
  if (!supabase) redirect("/thesis?error=configuration");
  const catalysts = parsed.data.positiveCatalysts
    ? parsed.data.positiveCatalysts.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 30)
    : [];
  const { error } = await supabase.from("investment_theses").insert({
    user_id: user.id,
    ticker: parsed.data.ticker,
    title: parsed.data.title,
    status: "INTACT",
    notes: parsed.data.notes ?? null,
    fair_value_target: parsed.data.fairValueTarget ?? null,
    preferred_buy_price: parsed.data.preferredBuyPrice ?? null,
    required_margin_of_safety: parsed.data.requiredMarginOfSafety === undefined ? null : parsed.data.requiredMarginOfSafety / 100,
    risk_notes: parsed.data.riskNotes ?? null,
    positive_catalysts: catalysts,
    invalidation_conditions: parsed.data.invalidationConditions ?? null,
  });
  if (error) {
    if (error.code === "23505") redirect(`/thesis/${encodeURIComponent(parsed.data.ticker)}?exists=1`);
    redirect("/thesis?error=save");
  }
  revalidatePath("/thesis");
  revalidatePath(`/thesis/${parsed.data.ticker}`);
  redirect(`/thesis/${encodeURIComponent(parsed.data.ticker)}`);
}

export async function addThesisRuleAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    thesisId: z.string().uuid(),
    ticker: tickerSchema,
    metricKey: z.string().min(1).max(100),
    operator: z.enum(["gt", "gte", "lt", "lte", "eq", "between"]),
    threshold: z.coerce.number().finite(),
    thresholdHigh: optionalNumber,
    failureStatus: z.enum(["WATCH", "WEAKENING", "BROKEN"]).default("WATCH"),
    label: z.string().trim().max(160).optional(),
  }).safeParse({
    thesisId: formData.get("thesisId"),
    ticker: formData.get("ticker"),
    metricKey: formData.get("metricKey"),
    operator: formData.get("operator"),
    threshold: formData.get("threshold"),
    thresholdHigh: formData.get("thresholdHigh"),
    failureStatus: formData.get("failureStatus") || "WATCH",
    label: formData.get("label") || undefined,
  });
  if (!parsed.success) return;
  const metric = getInvestorMetric(parsed.data.metricKey);
  if (!metric) return;
  const low = metricInputToCanonical(metric, parsed.data.threshold);
  const high = parsed.data.thresholdHigh === undefined ? undefined : metricInputToCanonical(metric, parsed.data.thresholdHigh);
  if (parsed.data.operator === "between" && high === undefined) return;
  const threshold = parsed.data.operator === "between" ? [Math.min(low, high!), Math.max(low, high!)] : low;
  const supabase = await createClient();
  await supabase?.from("investment_thesis_rules").insert({
    user_id: user.id,
    thesis_id: parsed.data.thesisId,
    label: parsed.data.label || metric.label,
    metric_key: metric.key,
    operator: parsed.data.operator,
    threshold,
    critical: formData.get("critical") === "on",
    failure_status: parsed.data.failureStatus,
  });
  revalidatePath(`/thesis/${parsed.data.ticker}`);
  revalidatePath("/dashboard");
}

export async function removeThesisRuleAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), ticker: tickerSchema }).safeParse({ id: formData.get("id"), ticker: formData.get("ticker") });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase?.from("investment_thesis_rules").delete().eq("id", parsed.data.id).eq("user_id", user.id);
  revalidatePath(`/thesis/${parsed.data.ticker}`);
}

export async function archiveInvestmentThesisAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), ticker: tickerSchema }).safeParse({ id: formData.get("id"), ticker: formData.get("ticker") });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase?.from("investment_theses").update({ status: "ARCHIVED", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id).eq("user_id", user.id);
  revalidatePath("/thesis");
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
  redirect("/thesis");
}

export async function createInvestmentAlertAction(formData: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    ticker: tickerSchema,
    metricKey: z.string().min(1).max(100),
    operator: z.enum(["below", "above", "crosses_below", "crosses_above", "change_abs_gte"]),
    threshold: z.coerce.number().finite(),
  }).safeParse({
    ticker: formData.get("ticker"),
    metricKey: formData.get("metricKey"),
    operator: formData.get("operator"),
    threshold: formData.get("threshold"),
  });
  if (!parsed.success) return;
  const metric = getInvestorMetric(parsed.data.metricKey);
  if (!metric) return;
  const supabase = await createClient();
  await supabase?.from("user_alerts").insert({
    user_id: user.id,
    ticker: parsed.data.ticker,
    kind: metric.group,
    metric_key: metric.key,
    operator: parsed.data.operator,
    threshold: metricInputToCanonical(metric, parsed.data.threshold),
    enabled: true,
    delivery_channels: ["in_app"],
  });
  revalidatePath("/alerts");
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}

export async function removeInvestmentAlertAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("user_alerts").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/alerts");
  revalidatePath("/watchlist");
  revalidatePath("/dashboard");
}

export async function acknowledgeAlertEventAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("alert_events").update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
    .eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
}
