import { redirect } from "next/navigation";
import { adminEmails } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  email: string | null;
  role: "customer" | "admin";
};

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const role = adminEmails().includes(user.email?.toLowerCase() ?? "")
    ? "admin"
    : "customer";

  return {
    id: user.id,
    email: user.email ?? null,
    role
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
