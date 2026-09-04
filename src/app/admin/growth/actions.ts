"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const RUN_MODES = new Set(["full", "discover", "score_select", "content", "repurpose", "seo", "creators", "metrics", "optimize", "brief", "status"]);
const QUEUE_STATUSES = new Set(["pending_approval", "approved", "deferred", "posted"]);
const OUTREACH_STATUSES = new Set(["queued", "approved", "sent", "rejected"]);

export async function runGrowthEngineAction(formData: FormData) {
  await requireAdmin();
  const mode = String(formData.get("mode") || "full");
  if (!RUN_MODES.has(mode)) return;
  const supabase = createAdminClient();
  if (!supabase) return;
  await supabase.rpc("invoke_stockbox_growth_engine", { run_mode: mode });
  revalidatePath("/admin/growth");
}

export async function setDistributionStatusAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !QUEUE_STATUSES.has(status)) return;
  const supabase = createAdminClient();
  if (!supabase) return;
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "posted") patch.published_at = new Date().toISOString();
  await supabase.from("acq_distribution_queue").update(patch).eq("id", id);
  revalidatePath("/admin/growth");
}

export async function setOutreachStatusAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !OUTREACH_STATUSES.has(status)) return;
  const supabase = createAdminClient();
  if (!supabase) return;
  await supabase.from("acq_creator_outreach").update({ status }).eq("id", id);
  revalidatePath("/admin/growth");
}
