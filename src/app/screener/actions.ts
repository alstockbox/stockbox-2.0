"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SCREENER_PRESETS, type ScreenerDefinition } from "@/lib/investor-intelligence/screener";
import { runSavedScreener } from "@/lib/investor-intelligence/screener-service";

const numeric = z.coerce.number().finite().optional();
const formSchema = z.object({
  name: z.string().trim().min(1).max(80),
  preset: z.string().trim().optional(),
  country: z.string().trim().max(4).optional(),
  exchange: z.string().trim().max(20).optional(),
  minScore: numeric,
  maxPe: numeric,
  minFcfYieldPct: numeric,
  minRevenueGrowthPct: numeric,
  minRoicPct: numeric,
  maxNetDebtEbitda: numeric,
  maxHistoricalPePercentile: numeric,
  minFairValueUpsidePct: numeric,
});

function definitionFromForm(data: z.infer<typeof formSchema>): ScreenerDefinition {
  const preset = SCREENER_PRESETS.find((item) => item.key === data.preset);
  if (preset) return preset.definition;
  const metricRanges: ScreenerDefinition["metricRanges"] = {};
  if (data.minScore !== undefined) metricRanges.score = { min: data.minScore };
  if (data.maxPe !== undefined) metricRanges["valuation.pe"] = { max: data.maxPe };
  if (data.minFcfYieldPct !== undefined) metricRanges["valuation.fcfYield"] = { min: data.minFcfYieldPct / 100 };
  if (data.minRevenueGrowthPct !== undefined) metricRanges["fundamentals.revenueGrowth"] = { min: data.minRevenueGrowthPct / 100 };
  if (data.minRoicPct !== undefined) metricRanges["fundamentals.roic"] = { min: data.minRoicPct / 100 };
  if (data.maxNetDebtEbitda !== undefined) metricRanges["fundamentals.netDebtToEbitda"] = { max: data.maxNetDebtEbitda };
  if (data.maxHistoricalPePercentile !== undefined) metricRanges["valuation.historicalPePercentile"] = { max: data.maxHistoricalPePercentile / 100 };
  if (data.minFairValueUpsidePct !== undefined) metricRanges.fairValueUpside = { min: data.minFairValueUpsidePct / 100 };
  return {
    countries: data.country ? [data.country.toUpperCase()] : undefined,
    exchanges: data.exchange ? [data.exchange.toUpperCase()] : undefined,
    metricRanges,
  };
}

export async function saveScreenerAction(formData: FormData) {
  const user = await requireUser();
  const parsed = formSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/screener?error=invalid");
  const supabase = await createClient();
  if (!supabase) redirect("/screener?error=configuration");
  const definition = definitionFromForm(parsed.data);
  const { data, error } = await supabase.from("saved_screeners").upsert({
    user_id: user.id,
    name: parsed.data.name,
    filters: definition,
    notification_preference: "in_app",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,name" }).select("id").single();
  if (error) redirect("/screener?error=save");
  await runSavedScreener({ userId: user.id, screenerId: data.id });
  revalidatePath("/screener");
}

export async function runSavedScreenerAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await runSavedScreener({ userId: user.id, screenerId: id.data });
  revalidatePath("/screener");
}

export async function deleteSavedScreenerAction(formData: FormData) {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase?.from("saved_screeners").delete().eq("id", id.data).eq("user_id", user.id);
  revalidatePath("/screener");
}
