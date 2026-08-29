"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerEnv, isSupabaseConfigured } from "@/lib/env/server";
import { checkDistributedRateLimit, rateLimitKeyFromHeaders, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getP0Copy } from "@/lib/i18n/p0-copy";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);
const newPasswordSchema = z.string()
  .min(12)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

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

function isEmailDeliveryRateLimit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  if (candidate.code === "over_email_send_rate_limit") return true;
  return candidate.status === 429
    && typeof candidate.message === "string"
    && candidate.message.toLowerCase().includes("email rate limit");
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
  const password = newPasswordSchema.safeParse(formData.get("password"));

  if (!email.success) {
    return { ok: false, message: copy.invalidEmail };
  }
  if (!password.success) {
    return { ok: false, message: copy.strongPasswordRequirement };
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

  if (error) {
    return { ok: false, message: isEmailDeliveryRateLimit(error) ? copy.emailDeliveryBusy : copy.signUpError };
  }

  if (data?.user?.id) {
    const cookieStore = await cookies();
    const referralCode = cookieStore.get("stockbox_ref")?.value;
    if (referralCode) {
      try {
        const admin = createAdminClient();
        if (admin) {
          await Promise.allSettled([
            admin.rpc("attribute_affiliate_signup", {
              p_code: referralCode,
              p_referred_user_id: data.user.id,
            }),
            admin.rpc("record_affiliate_referral", {
              p_code: referralCode,
              p_referred_id: data.user.id,
            }),
          ]);
        }
      } catch {
        // Attribution must never block account creation.
      } finally {
        cookieStore.delete("stockbox_ref");
      }
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

  if (error) {
    return { ok: false, message: isEmailDeliveryRateLimit(error) ? copy.emailDeliveryBusy : copy.resetError };
  }

  return { ok: true, message: copy.resetSuccess };
}

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const copy = authActionCopy(formData);
  if (!isSupabaseConfigured()) return disabledState(copy);

  const password = newPasswordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, message: copy.strongPasswordRequirement };

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
