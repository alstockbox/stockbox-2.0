"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminEmails } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  enabled: z.enum(["true", "false"]),
});

export async function setAffiliateAmbassadorAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = roleChangeSchema.safeParse({
    userId: formData.get("userId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) throw new Error("Invalid ambassador role request.");
  if (parsed.data.userId === admin.id) throw new Error("You cannot change your own admin role.");

  const supabase = createAdminClient();
  if (!supabase) throw new Error("Admin database access is not configured.");

  const { data: target, error: readError } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", parsed.data.userId)
    .single();
  if (readError || !target) throw new Error("The selected user could not be loaded.");

  const protectedAdminEmail = target.email
    ? adminEmails().includes(target.email.toLowerCase())
    : false;
  if (target.role === "admin" || protectedAdminEmail) {
    throw new Error("Admin accounts cannot be converted to ambassador accounts.");
  }

  const { error: mutationError } = await supabase.rpc("set_affiliate_ambassador_role", {
    p_actor_id: admin.id,
    p_target_id: target.id,
    p_enabled: parsed.data.enabled === "true",
  });
  if (mutationError) throw new Error("The ambassador role could not be updated.");

  revalidatePath("/admin");
}
