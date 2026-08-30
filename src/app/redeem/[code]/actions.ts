"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const codeSchema = z.string().trim().toUpperCase().regex(/^SBG-[A-Z0-9-]{6,64}$/);

export async function redeemGiveawayRouteAction(formData: FormData) {
  const user = await requireUser();
  const parsed = codeSchema.safeParse(formData.get("code"));
  if (!parsed.success) redirect("/redeem/invalid?status=invalid");

  const supabase = createAdminClient();
  if (!supabase) redirect(`/redeem/${parsed.data}?status=unavailable`);

  const { error } = await supabase.rpc("redeem_affiliate_giveaway_code", {
    p_code: parsed.data,
    p_user_id: user.id,
  });
  if (error) redirect(`/redeem/${parsed.data}?status=invalid`);

  redirect(`/redeem/${parsed.data}?status=success`);
}
