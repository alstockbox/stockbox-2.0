import type { Metadata } from "next";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { analysisWorkbenchDefaults } from "@/components/analysis/analysis-workbench-state";
import { requireUser } from "@/lib/auth/session";
import { saveProfilePreferencesAction } from "@/lib/profile/actions";
import { createClient } from "@/lib/supabase/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Profile settings" };

type PageProps = { searchParams: Promise<{ saved?: string; error?: string }> };

export default async function ProfileSettingsPage({ searchParams }: PageProps) {
  const [params, user, locale] = await Promise.all([searchParams, requireUser(), getLocale()]);
  const allCopy = getP0Copy(locale);
  const copy = allCopy.profile;
  const analysisCopy = allCopy.analyze;
  const supabase = await createClient();
  const { data: profile } = supabase
    ? await supabase.from("profiles").select("experience,ui_mode,investment_profile").eq("id", user.id).maybeSingle()
    : { data: null };
  const defaults = analysisWorkbenchDefaults(profile ? {
    uiMode: profile.ui_mode,
    investmentProfile: profile.investment_profile,
    experience: profile.experience,
  } : null);
  const experience = profile?.experience === "beginner" || profile?.experience === "advanced" ? profile.experience : "intermediate";
  const feedback = params.saved ? copy.saved : params.error ? copy.error : null;

  return (
    <Section><Container className="max-w-3xl">
      <p className="text-sm font-semibold text-[#e1cb95]">{copy.account}</p>
      <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">{copy.copy}</p>
      {feedback ? <p className="mt-5 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}
      <form action={saveProfilePreferencesAction} className="mt-8 space-y-5">
        <Card>
          <fieldset><legend className="font-semibold text-[#f4efe5]">{copy.experience}</legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {["beginner", "intermediate", "advanced"].map((value) => (
                <label key={value} className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-4 capitalize">
                  <input type="radio" name="experience" value={value} defaultChecked={experience === value} />{value === "beginner" ? copy.beginner : value === "advanced" ? copy.advanced : copy.intermediate}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
        <Card className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm"><span className="font-semibold text-[#f4efe5]">{copy.investmentProfile}</span>
            <select name="investmentProfile" defaultValue={defaults.investmentProfile} className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3">
              <option value="balanced">{analysisCopy.balanced}</option>
              <option value="long_term">{analysisCopy.longTerm}</option>
              <option value="short_term">{analysisCopy.shortTerm}</option>
              <option value="growth">{analysisCopy.growth}</option>
              <option value="value">{analysisCopy.value}</option>
              <option value="quality">{analysisCopy.quality}</option>
              <option value="dividend">{analysisCopy.dividend}</option>
            </select>
          </label>
          <label className="space-y-2 text-sm"><span className="font-semibold text-[#f4efe5]">{copy.defaultMode}</span>
            <select name="uiMode" defaultValue={defaults.mode} className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3">
              <option value="simple">{analysisCopy.simple}</option>
              <option value="pro">{analysisCopy.pro}</option>
            </select>
          </label>
        </Card>
        <Button><Save className="h-4 w-4" aria-hidden="true" />{copy.savePreferences}</Button>
      </form>
    </Container></Section>
  );
}
