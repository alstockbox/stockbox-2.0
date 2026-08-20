import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, isSupabaseConfigured } from "@/lib/env/server";

export function createAdminClient() {
  const env = getServerEnv();
  if (!isSupabaseConfigured() || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
