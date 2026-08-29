"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { upsertProfile } from "@/lib/db/repositories";

const experienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
const investmentProfileSchema = z.enum(["long_term", "short_term", "growth", "value", "quality", "dividend", "balanced"]);
const uiModeSchema = z.enum(["simple", "pro"]);

const onboardingSchema = z.object({
  experience: experienceSchema,
  investmentProfile: investmentProfileSchema,
});

const settingsSchema = onboardingSchema.extend({ uiMode: uiModeSchema });

async function persistPreferences(input: {
  experience: z.infer<typeof experienceSchema>;
  investmentProfile: z.infer<typeof investmentProfileSchema>;
  mode: z.infer<typeof uiModeSchema>;
}) {
  const user = await requireUser();
  return upsertProfile({ userId: user.id, email: user.email, ...input });
}

export async function saveOnboardingAction(formData: FormData) {
  const parsed = onboardingSchema.safeParse({
    experience: formData.get("experience"),
    investmentProfile: formData.get("investmentProfile"),
  });
  if (!parsed.success) redirect("/onboarding?error=invalid");
  const result = await persistPreferences({
    ...parsed.data,
    mode: parsed.data.experience === "advanced" ? "pro" : "simple",
  });
  if (!result.ok) redirect("/onboarding?error=save");
  redirect("/dashboard?onboarding=complete");
}

export async function saveProfilePreferencesAction(formData: FormData) {
  const parsed = settingsSchema.safeParse({
    experience: formData.get("experience"),
    investmentProfile: formData.get("investmentProfile"),
    uiMode: formData.get("uiMode"),
  });
  if (!parsed.success) return;
  const result = await persistPreferences({
    experience: parsed.data.experience,
    investmentProfile: parsed.data.investmentProfile,
    mode: parsed.data.uiMode,
  });
  if (!result.ok) return;
  revalidatePath("/settings/profile");
  revalidatePath("/analyze");
}