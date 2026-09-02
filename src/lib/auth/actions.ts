"use server";

import { redirect } from "next/navigation";
import { clearSession, setSession } from "./session";
import { assertConfigured } from "@/lib/env/server";
import { verifyPassword } from "./password";

export type LoginState = { error?: string };

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const env = assertConfigured();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (email !== env.SINGLE_USER_EMAIL?.toLowerCase() || !verifyPassword(password, env.SINGLE_USER_PASSWORD_HASH ?? "")) {
    return { error: "Fel e-post eller lösenord." };
  }

  await setSession(email);
  redirect("/app");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
