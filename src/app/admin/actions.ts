"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminEmails } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

const integerField = (max: number) => z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(max));

const ambassadorAccessSchema = z.object({
  userId: z.string().uuid(),
  enabled: z.enum(["true", "false"]),
  monthlyAnalyses: integerField(100000),
  deepAnalyses: integerField(100000),
  batchRows: integerField(50),
  watchlistItems: integerField(100000),
  portfolios: integerField(10000),
  commissionPercent: z.string().regex(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/),
}).superRefine((value, ctx) => {
  if (value.deepAnalyses > value.monthlyAnalyses) {
    ctx.addIssue({ code: "custom", path: ["deepAnalyses"], message: "Deep limit exceeds total limit." });
  }
});

function commissionPercentToBasisPoints(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export async function setAffiliateAmbassadorAccessAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = ambassadorAccessSchema.safeParse({
    userId: formData.get("userId"),
    enabled: formData.get("enabled"),
    monthlyAnalyses: formData.get("monthlyAnalyses"),
    deepAnalyses: formData.get("deepAnalyses"),
    batchRows: formData.get("batchRows"),
    watchlistItems: formData.get("watchlistItems"),
    portfolios: formData.get("portfolios"),
    commissionPercent: formData.get("commissionPercent"),
  });
  if (!parsed.success) throw new Error("Invalid ambassador settings.");
  if (parsed.data.userId === admin.id) throw new Error("You cannot change your own admin role.");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin database access is not configured.");

  const { data: target, error: readError } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", parsed.data.userId)
    .single();
  if (readError || !target) throw new Error("The selected user could not be loaded.");

  const protectedAdminEmail = target.email
    ? adminEmails().includes(target.email.toLowerCase())
    : false;
  if (target.role === "admin" || protectedAdminEmail) {
    throw new Error("Admin accounts cannot be converted to ambassador accounts.");
  }

  const { error: mutationError } = await supabase.rpc("set_affiliate_ambassador_access", {
    p_actor_id: admin.id,
    p_target_id: target.id,
    p_enabled: parsed.data.enabled === "true",
    p_monthly_analyses: parsed.data.monthlyAnalyses,
    p_deep_analyses: parsed.data.deepAnalyses,
    p_batch_rows: parsed.data.batchRows,
    p_watchlist_items: parsed.data.watchlistItems,
    p_portfolios: parsed.data.portfolios,
    p_commission_basis_points: commissionPercentToBasisPoints(parsed.data.commissionPercent),
  });
  if (mutationError) throw new Error("The ambassador settings could not be updated.");

  revalidatePath("/admin");
  revalidatePath("/affiliate");
}

export async function setAffiliateAmbassadorAction(formData: FormData) {
  const expanded = new FormData();
  for (const [key, value] of formData.entries()) expanded.append(key, value);
  if (!expanded.has("monthlyAnalyses")) expanded.set("monthlyAnalyses", "100");
  if (!expanded.has("deepAnalyses")) expanded.set("deepAnalyses", "100");
  if (!expanded.has("batchRows")) expanded.set("batchRows", "50");
  if (!expanded.has("watchlistItems")) expanded.set("watchlistItems", "75");
  if (!expanded.has("portfolios")) expanded.set("portfolios", "5");
  if (!expanded.has("commissionPercent")) expanded.set("commissionPercent", "0");
  return setAffiliateAmbassadorAccessAction(expanded);
}
