"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const giveawayCodeSchema = z.string()
  .trim()
  .toUpperCase()
  .regex(/^SBG-[A-Z0-9-]{6,64}$/);

export async function redeemGiveawayCodeAction(formData: FormData) {
  const user = await requireUser();
  const parsed = giveawayCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) redirect("/settings?giveaway=invalid");

  const supabase = createAdminClient();
  if (!supabase) redirect("/settings?giveaway=unavailable");

  const { data, error } = await supabase.rpc("redeem_affiliate_giveaway_code", {
    p_code: parsed.data,
    p_user_id: user.id,
  });
  if (error) redirect("/settings?giveaway=invalid");

  const payload = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const plan = typeof payload.plan === "string" ? payload.plan : "plan";
  redirect(`/settings?giveaway=success&plan=${encodeURIComponent(plan)}`);
}
