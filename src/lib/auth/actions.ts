"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getServerEnv, isSupabaseConfigured } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().email();
const passwordSchema = z.string().min(8);

export type AuthActionState = {
  ok: boolean;
  message: string;
};

function disabledState(): AuthActionState {
  return {
    ok: false,
    message: "Authentication is not configured. Add Supabase environment variables first."
  };
}

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return disabledState();

  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));

  if (!email.success || !password.success) {
    return { ok: false, message: "Use a valid email and a password of at least 8 characters." };
  }

  const supabase = await createClient();
  if (!supabase) return disabledState();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return disabledState();

  const email = emailSchema.safeParse(formData.get("email"));
  const password = passwordSchema.safeParse(formData.get("password"));

  if (!email.success || !password.success) {
    return { ok: false, message: "Use a valid email and a password of at least 8 characters." };
  }

  const supabase = await createClient();
  if (!supabase) return disabledState();

  const env = getServerEnv();
  const { error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/onboarding`
    }
  });

  if (error) return { ok: false, message: error.message };

  return {
    ok: true,
    message: "Check your email to verify the account, then log in."
  };
}

export async function resetPasswordAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return disabledState();

  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { ok: false, message: "Use a valid email address." };

  const supabase = await createClient();
  if (!supabase) return disabledState();

  const env = getServerEnv();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/reset`
  });

  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Password reset email sent." };
}

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return disabledState();

  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, message: "Use a password of at least 8 characters." };

  const supabase = await createClient();
  if (!supabase) return disabledState();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Password updated. You can now continue to your dashboard." };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
