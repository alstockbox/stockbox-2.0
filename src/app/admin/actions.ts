"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminEmails } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildAffiliateCode,
  commissionPercentToBasisPoints,
  normalizeMonthlyAnalysisLimit,
} from "@/lib/affiliate/admin";
import { normalizeReferralCode } from "@/lib/affiliate/attribution";

export type AdminAmbassadorState = {
  ok: boolean;
  message: string;
};

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  enabled: z.enum(["true", "false"]),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),  commissionPercent: z.coerce.number().min(0).max(100),
  monthlyAnalysisLimit: z.coerce.number().int().min(0).max(100000),
  code: z.string().trim().max(48).optional(),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  commissionPercent: z.coerce.number().min(0).max(100),
  monthlyAnalysisLimit: z.coerce.number().int().min(0).max(100000),
  status: z.enum(["active", "paused"]),
});

const feedbackUpdateSchema = z.object({
  feedbackId: z.string().uuid(),
  status: z.enum(["new", "reviewed", "resolved"]),
  testimonialApproved: z.enum(["true", "false"]),
});

const contactUpdateSchema = z.object({
  contactId: z.string().uuid(),
  status: z.enum(["new", "in_progress", "resolved", "spam"]),
});

function state(ok: boolean, message: string): AdminAmbassadorState {
  return { ok, message };
}

function generatedCode(name: string) {
  return buildAffiliateCode(name, randomBytes(3).toString("hex"));
}

export async function createAmbassadorAction(
  _previous: AdminAmbassadorState,
  formData: FormData
): Promise<AdminAmbassadorState> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),    commissionPercent: formData.get("commissionPercent"),
    monthlyAnalysisLimit: formData.get("monthlyAnalysisLimit"),
    code: formData.get("code") || undefined,
  });
  if (!parsed.success) return state(false, "Check the ambassador details and try again.");

  const supabase = createAdminClient();
  if (!supabase) return state(false, "Admin database access is not configured.");

  const requestedCode = parsed.data.code
    ? normalizeReferralCode(parsed.data.code)
    : generatedCode(parsed.data.name);
  if (!requestedCode) return state(false, "Affiliate code must contain only letters, numbers, - or _.");

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { display_name: parsed.data.name, created_by_admin: true },
  });
  if (authError || !authData.user) {
    return state(false, authError?.message?.includes("already") ? "An account with that email already exists." : "The ambassador account could not be created.");
  }

  const userId = authData.user.id;
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    email: parsed.data.email.toLowerCase(),
    role: "affiliate_ambassador",
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  const { error: affiliateError } = profileError ? { error: profileError } : await supabase
    .from("affiliates")
    .insert({
      user_id: userId,
      code: requestedCode,
      status: "active",
      display_name: parsed.data.name,
      commission_basis_points: commissionPercentToBasisPoints(parsed.data.commissionPercent),
      monthly_analysis_limit: normalizeMonthlyAnalysisLimit(parsed.data.monthlyAnalysisLimit),
    });

  if (profileError || affiliateError) {
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return state(false, affiliateError?.message?.includes("duplicate") ? "That affiliate code is already in use." : "The ambassador profile could not be created.");
  }

  await supabase.from("audit_logs").insert({
    actor_id: admin.id,
    action: "affiliate_ambassador_created",
    target_type: "profile",
    target_id: userId,
    metadata: {
      code: requestedCode,
      commissionBasisPoints: commissionPercentToBasisPoints(parsed.data.commissionPercent),
      monthlyAnalysisLimit: normalizeMonthlyAnalysisLimit(parsed.data.monthlyAnalysisLimit),
    },
  });

  revalidatePath("/admin");
  return state(true, `Ambassador created. Affiliate code: ${requestedCode}`);
}
export async function updateAmbassadorAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = updateSchema.safeParse({
    userId: formData.get("userId"),
    commissionPercent: formData.get("commissionPercent"),
    monthlyAnalysisLimit: formData.get("monthlyAnalysisLimit"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid ambassador settings.");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin database access is not configured.");
  const { error } = await supabase.from("affiliates").update({
    status: parsed.data.status,
    commission_basis_points: commissionPercentToBasisPoints(parsed.data.commissionPercent),
    monthly_analysis_limit: normalizeMonthlyAnalysisLimit(parsed.data.monthlyAnalysisLimit),
    updated_at: new Date().toISOString(),
  }).eq("user_id", parsed.data.userId);
  if (error) throw new Error("The ambassador settings could not be updated.");

  await supabase.from("audit_logs").insert({
    actor_id: admin.id,
    action: "affiliate_ambassador_updated",
    target_type: "profile",
    target_id: parsed.data.userId,
    metadata: parsed.data,
  });
  revalidatePath("/admin");
  revalidatePath("/affiliate");
}
export async function setAffiliateAmbassadorAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = roleChangeSchema.safeParse({
    userId: formData.get("userId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) throw new Error("Invalid ambassador role request.");
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

  const enabled = parsed.data.enabled === "true";
  const { error: mutationError } = await supabase.rpc("set_affiliate_ambassador_role", {
    p_actor_id: admin.id,
    p_target_id: target.id,
    p_enabled: enabled,
  });
  if (mutationError) throw new Error("The ambassador role could not be updated.");

  revalidatePath("/admin");
  revalidatePath("/affiliate");
}

export async function updateFeedbackAction(formData: FormData) {
  const admin = await requireAdmin();
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

  await supabase.from("audit_logs").insert({
    actor_id: admin.id,
    action: "feedback_updated",
    target_type: "feedback_submission",
    target_id: parsed.data.feedbackId,
    metadata: parsed.data,
  });
  revalidatePath("/admin");
}

export async function updateContactMessageAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = contactUpdateSchema.safeParse({
    contactId: formData.get("contactId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Invalid contact update.");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin database access is not configured.");
  const { error } = await supabase.from("contact_messages").update({ status: parsed.data.status }).eq("id", parsed.data.contactId);
  if (error) throw new Error("Contact message could not be updated.");

  await supabase.from("audit_logs").insert({
    actor_id: admin.id,
    action: "contact_message_updated",
    target_type: "contact_message",
    target_id: parsed.data.contactId,
    metadata: parsed.data,
  });
  revalidatePath("/admin");
}
