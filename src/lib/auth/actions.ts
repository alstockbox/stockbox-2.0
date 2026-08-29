"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeReferralCode } from "@/lib/affiliate/attribution";
import { getServerEnv, isSupabaseConfigured } from "@/lib/env/server";
import { checkDistributedRateLimit, rateLimitKeyFromHeaders, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

export type AuthActionState = {
  ok: boolean;
  message: string;
};

type AuthCopy = ReturnType<typeof getP0Copy>["auth"];

function authActionCopy(formData: FormData): AuthCopy {
  return getP0Copy(formData.get("locale") === "sv" ? "sv" : "en").auth;
}

function disabledState(copy: AuthCopy): AuthActionState {
  return { ok: false, message: copy.authUnavailable };
}

function tooManyRequestsState(copy: AuthCopy): AuthActionState {
  return { ok: false, message: copy.rateLimited };
}

function digestIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

async function checkAuthActionRateLimit(scope: string, copy: AuthCopy, email?: string): Promise<AuthActionState | null> {
  const requestHeaders = await headers();
  const ipLimit = await checkDistributedRateLimit(
    rateLimitKeyFromHeaders(requestHeaders, `${scope}:ip`),
    RATE_LIMITS.authAction
  );
  if (!ipLimit.allowed) return tooManyRequestsState(copy);

  if (!email) return null;

  const emailLimit = await checkDistributedRateLimit(
    rateLimitKeyFromHeaders(requestHeaders, `${scope}:email`, digestIdentifier(email)),
    RATE_LIMITS.authAction
  );
  return emailLimit.allowed ? null : tooManyRequestsState(copy);
}

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const copy = authActionCopy(formData);
  if (!isSupabaseConfigured()) return disabledState(copy);

  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));

  if (!email.success || !password.success) {
    return { ok: false, message: copy.invalidCredentialsInput };
  }

  const rateLimit = await checkAuthActionRateLimit("auth-sign-in", copy, email.data);
  if (rateLimit) return rateLimit;

  const supabase = await createClient();
  if (!supabase) return disabledState(copy);

  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data
  });

  if (error) return { ok: false, message: copy.signInError };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const copy = authActionCopy(formData);
  if (!isSupabaseConfigured()) return disabledState(copy);

  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));

  if (!email.success || !password.success) {
    return { ok: false, message: copy.invalidCredentialsInput };
  }

  const rateLimit = await checkAuthActionRateLimit("auth-sign-up", copy, email.data);
  if (rateLimit) return rateLimit;

  const supabase = await createClient();
  if (!supabase) return disabledState(copy);

  const env = getServerEnv();
  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`
    }
  });

  if (error) return { ok: false, message: copy.signUpError };

  const referralCode = normalizeReferralCode(formData.get("referralCode"));
  if (data.user?.id && referralCode) {
    const admin = createAdminClient();
    if (admin) {
      await admin.rpc("record_affiliate_referral", {
        p_referred_id: data.user.id,
        p_code: referralCode,
      });
    }
  }

  return {
    ok: true,
    message: copy.signUpSuccess
  };
}

export async function resetPasswordAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const copy = authActionCopy(formData);
  if (!isSupabaseConfigured()) return disabledState(copy);

  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: copy.invalidEmail };

  const rateLimit = await checkAuthActionRateLimit("auth-password-reset", copy, email.data);
  if (rateLimit) return rateLimit;

  const supabase = await createClient();
  if (!supabase) return disabledState(copy);

  const env = getServerEnv();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/reset`
  });

  if (error) return { ok: false, message: copy.resetError };

  return { ok: true, message: copy.resetSuccess };
}

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const copy = authActionCopy(formData);
  if (!isSupabaseConfigured()) return disabledState(copy);

  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, message: copy.invalidPassword };

  const rateLimit = await checkAuthActionRateLimit("auth-password-update", copy);
  if (rateLimit) return rateLimit;

  const supabase = await createClient();
  if (!supabase) return disabledState(copy);
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { ok: false, message: copy.updateError };

  return { ok: true, message: copy.updateSuccess };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
