"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { upsertProfile } from "@/lib/db/repositories";

const schema = z.object({
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  investmentProfile: z.enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "balanced"]),
});

export async function saveOnboardingAction(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse({
    experience: formData.get("experience"),
    investmentProfile: formData.get("investmentProfile"),
  });
  if (!parsed.success) redirect("/onboarding?error=invalid");

  const result = await upsertProfile({
    userId: user.id,
    email: user.email,
    experience: parsed.data.experience,
    mode: parsed.data.experience === "advanced" ? "pro" : "simple",
    investmentProfile: parsed.data.investmentProfile,
  });
  if (!result.ok) redirect("/onboarding?error=save");
  redirect("/dashboard?onboarding=complete");
}
