"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDistributedRateLimit, rateLimitKeyFromHeaders, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getSupportCopy } from "@/lib/support/copy";
import { contactSchema, feedbackSchema } from "@/lib/support/validation";

export type SupportActionState = {
  ok: boolean;
  message: string;
};

function state(ok: boolean, message: string): SupportActionState {
  return { ok, message };
}

function supportCopy(formData: FormData) {
  return getSupportCopy(formData.get("locale") === "sv" ? "sv" : "en").messages;
}

async function allowSupportSubmission(scope: string, subject?: string | null) {
  const requestHeaders = await headers();
  const key = rateLimitKeyFromHeaders(requestHeaders, scope, subject);
  return checkDistributedRateLimit(key, RATE_LIMITS.support);
}

export async function submitFeedbackAction(
  _previous: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const copy = supportCopy(formData);
  const parsed = feedbackSchema.safeParse({
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) return state(false, copy.feedbackInvalid);

  const user = await getCurrentUser();
  const rateLimit = await allowSupportSubmission("feedback", user?.id ?? null);
  if (!rateLimit.allowed) return state(false, copy.rateLimited);

  const supabase = createAdminClient();
  if (!supabase) return state(false, copy.feedbackUnavailable);
  const { error } = await supabase.from("feedback_submissions").insert({
    user_id: user?.id ?? null,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  });
  if (error) return state(false, copy.feedbackError);

  return state(true, copy.feedbackSuccess);
}

export async function submitContactAction(
  _previous: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const copy = supportCopy(formData);
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });
  if (!parsed.success) return state(false, copy.contactInvalid);
  const user = await getCurrentUser();
  const rateLimit = await allowSupportSubmission("contact", user?.id ?? parsed.data.email.toLowerCase());
  if (!rateLimit.allowed) return state(false, copy.rateLimited);

  const supabase = createAdminClient();
  if (!supabase) return state(false, copy.contactUnavailable);
  const { error } = await supabase.from("contact_messages").insert({
    user_id: user?.id ?? null,
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    subject: parsed.data.subject,
    message: parsed.data.message,
  });
  if (error) return state(false, copy.contactError);

  return state(true, copy.contactSuccess);
}
