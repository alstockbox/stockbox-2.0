import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { saveOnboardingAction } from "@/lib/profile/actions";
import { requireUser } from "@/lib/auth/session";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Set up your research profile" };

export default async function OnboardingPage() {
  const [, locale] = await Promise.all([requireUser(), getLocale()]);
  const allCopy = getP0Copy(locale);
  const copy = allCopy.onboarding;
  const profileCopy = allCopy.profile;
  const analysisCopy = allCopy.analyze;
  return (
    <Section className="min-h-[72vh]">
      <Container className="max-w-3xl">
        <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
        <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">{copy.copy}</p>
        <form action={saveOnboardingAction} className="mt-8 space-y-5">
          <Card>
            <fieldset>
              <legend className="text-lg font-semibold text-[#f4efe5]">{copy.experience}</legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {["beginner", "intermediate", "advanced"].map((value) => (
                  <label key={value} className="flex cursor-pointer items-center gap-3 rounded-md border border-white/10 bg-white/5 p-4 capitalize text-[#d6deea]">
                    <input type="radio" name="experience" value={value} defaultChecked={value === "intermediate"} />{value === "beginner" ? profileCopy.beginner : value === "advanced" ? profileCopy.advanced : profileCopy.intermediate}
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
          <Card>
            <label className="block text-lg font-semibold text-[#f4efe5]" htmlFor="investmentProfile">{copy.investmentProfile}</label>
            <select id="investmentProfile" name="investmentProfile" defaultValue="balanced" className="mt-4 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]">
              <option value="balanced">{analysisCopy.balanced}</option><option value="long_term">{analysisCopy.longTerm}</option><option value="short_term">{analysisCopy.shortTerm}</option><option value="growth">{analysisCopy.growth}</option><option value="value">{analysisCopy.value}</option><option value="quality">{analysisCopy.quality}</option><option value="dividend">{analysisCopy.dividend}</option><option value="defensive">{analysisCopy.defensive}</option>
            </select>
          </Card>
          <Button>{copy.saveProfile} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
        </form>
      </Container>
    </Section>
  );
}
