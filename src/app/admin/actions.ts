"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminEmails } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAffiliateCode, commissionPercentToBasisPoints as numericCommissionToBasisPoints, normalizeMonthlyAnalysisLimit } from "@/lib/affiliate/admin";
import { normalizeReferralCode } from "@/lib/affiliate/attribution";


export type AdminAmbassadorState = { ok: boolean; message: string };

const createAmbassadorSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
  commissionPercent: z.coerce.number().min(0).max(100),
  monthlyAnalysisLimit: z.coerce.number().int().min(0).max(100000),
  code: z.string().trim().max(48).optional(),
});
const feedbackUpdateSchema = z.object({
  feedbackId: z.string().uuid(), status: z.enum(["new", "reviewed", "resolved"]),
  testimonialApproved: z.enum(["true", "false"]),
});
const contactUpdateSchema = z.object({
  contactId: z.string().uuid(), status: z.enum(["new", "in_progress", "resolved", "spam"]),
});

function ambassadorState(ok: boolean, message: string): AdminAmbassadorState { return { ok, message }; }
function generatedCode(name: string) { return buildAffiliateCode(name, randomBytes(3).toString("hex")); }

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

function commissionPercentStringToBasisPoints(value: string): number {
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
    p_commission_basis_points: commissionPercentStringToBasisPoints(parsed.data.commissionPercent),
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

export async function createAmbassadorAction(
  _previous: AdminAmbassadorState,
  formData: FormData
): Promise<AdminAmbassadorState> {
  const admin = await requireAdmin();
  const parsed = createAmbassadorSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    commissionPercent: formData.get("commissionPercent"),
    monthlyAnalysisLimit: formData.get("monthlyAnalysisLimit"),
    code: formData.get("code") || undefined,
  });
  if (!parsed.success) return ambassadorState(false, "Check the ambassador details and try again.");

  const supabase = createAdminClient();
  if (!supabase) return ambassadorState(false, "Admin database access is not configured.");
  const monthlyLimit = normalizeMonthlyAnalysisLimit(parsed.data.monthlyAnalysisLimit);
  const commissionBps = numericCommissionToBasisPoints(parsed.data.commissionPercent);
  const requestedCode = parsed.data.code
    ? normalizeReferralCode(parsed.data.code)
    : generatedCode(parsed.data.name);
  if (!requestedCode) return ambassadorState(false, "Affiliate code must contain only letters, numbers, - or _.");
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.name, created_by_admin: true },
  });
  if (authError || !authData.user) {
    return ambassadorState(false, authError?.message?.includes("already")
      ? "An account with that email already exists."
      : "The ambassador account could not be created.");
  }

  const userId = authData.user.id;
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email: parsed.data.email.toLowerCase(),
    role: "customer",
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  const accessResult = profileError ? { error: profileError } : await supabase.rpc("set_affiliate_ambassador_access", {
    p_actor_id: admin.id,
    p_target_id: userId,
    p_enabled: true,
    p_monthly_analyses: monthlyLimit,    p_deep_analyses: monthlyLimit,
    p_batch_rows: 50,
    p_watchlist_items: 75,
    p_portfolios: 5,
    p_commission_basis_points: commissionBps,
  });
  const affiliateResult = accessResult.error ? { error: accessResult.error } : await supabase.from("affiliates").update({
    code: requestedCode,
    display_name: parsed.data.name,
    monthly_analysis_limit: monthlyLimit,
    commission_basis_points: commissionBps,
    status: "active",
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  if (profileError || accessResult.error || affiliateResult.error) {
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return ambassadorState(false, affiliateResult.error?.message?.includes("duplicate")
      ? "That affiliate code is already in use."
      : "The ambassador profile could not be created.");
  }

  revalidatePath("/admin");
  revalidatePath("/affiliate");
  return ambassadorState(true, `Ambassador created. Affiliate code: ${requestedCode}`);
}
export async function updateFeedbackAction(formData: FormData) {
  await requireAdmin();
  const parsed = feedbackUpdateSchema.safeParse({
    feedbackId: formData.get("feedbackId"),
    status: formData.get("status"),
    testimonialApproved: formData.get("testimonialApproved"),
  });
  if (!parsed.success) throw new Error("Invalid feedback update.");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin database access is not configured.");
  const { error } = await supabase.from("feedback_submissions").update({
    status: parsed.data.status,
    testimonial_approved: parsed.data.testimonialApproved === "true",
  }).eq("id", parsed.data.feedbackId);
  if (error) throw new Error("Feedback could not be updated.");
  revalidatePath("/admin");
}

export async function updateContactMessageAction(formData: FormData) {
  await requireAdmin();
  const parsed = contactUpdateSchema.safeParse({
    contactId: formData.get("contactId"),
    status: formData.get("status"),
  });  if (!parsed.success) throw new Error("Invalid contact update.");
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin database access is not configured.");
  const { error } = await supabase.from("contact_messages")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.contactId);
  if (error) throw new Error("Contact message could not be updated.");
  revalidatePath("/admin");
}
