"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDistributedRateLimit, rateLimitKeyFromHeaders, RATE_LIMITS } from "@/lib/security/rate-limit";
import { contactSchema, feedbackSchema } from "@/lib/support/validation";

export type SupportActionState = {
  ok: boolean;
  message: string;
};

function state(ok: boolean, message: string): SupportActionState {
  return { ok, message };
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
  const parsed = feedbackSchema.safeParse({
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) return state(false, "Choose a rating and add a short comment.");

  const user = await getCurrentUser();
  const rateLimit = await allowSupportSubmission("feedback", user?.id ?? null);
  if (!rateLimit.allowed) return state(false, "Too many submissions. Please try again shortly.");

  const supabase = createAdminClient();
  if (!supabase) return state(false, "Feedback is temporarily unavailable.");
  const { error } = await supabase.from("feedback_submissions").insert({
    user_id: user?.id ?? null,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  });
  if (error) return state(false, "Feedback could not be sent. Please try again.");

  return state(true, "Thank you. Your feedback has been sent to StockBox.");
}

export async function submitContactAction(
  _previous: SupportActionState,
  formData: FormData
): Promise<SupportActionState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });
  if (!parsed.success) return state(false, "Check the contact details and message, then try again.");
  const user = await getCurrentUser();
  const rateLimit = await allowSupportSubmission("contact", user?.id ?? parsed.data.email.toLowerCase());
  if (!rateLimit.allowed) return state(false, "Too many submissions. Please try again shortly.");

  const supabase = createAdminClient();
  if (!supabase) return state(false, "Contact is temporarily unavailable.");
  const { error } = await supabase.from("contact_messages").insert({
    user_id: user?.id ?? null,
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    subject: parsed.data.subject,
    message: parsed.data.message,
  });
  if (error) return state(false, "Your message could not be sent. Please try again.");

  return state(true, "Message sent. StockBox has received your request.");
}
