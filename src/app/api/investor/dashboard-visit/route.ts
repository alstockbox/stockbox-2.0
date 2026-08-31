import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  if (!supabase) return Response.json({ error: "Unavailable" }, { status: 503 });
  const now = new Date().toISOString();
  const { error } = await supabase.from("investor_user_state").upsert({
    user_id: user.id,
    last_dashboard_visit_at: now,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (error) return Response.json({ error: "Could not record visit" }, { status: 500 });
  return Response.json({ ok: true });
}
