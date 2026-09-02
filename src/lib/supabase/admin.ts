import { createClient } from "@supabase/supabase-js";
import { assertConfigured, getServerEnv, isSupabaseConfigured } from "@/lib/env/server";

export function createAdminClient() {
  if (!isSupabaseConfigured()) return null;
  const env = assertConfigured();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  });
}
