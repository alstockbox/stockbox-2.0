import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { saveOnboardingAction } from "@/lib/profile/actions";

export const metadata: Metadata = { title: "Set up your research profile" };

export default async function OnboardingPage() {
  const [, locale] = await Promise.all([requireUser(), getLocale()]);
  const allCopy = getP0Copy(locale);
  const copy = allCopy.onboarding;
  const profileCopy = allCopy.profile;
  const analysisCopy = allCopy.analyze;
  const sv = locale === "sv";
  return (
    <Section className="min-h-[68vh] py-8 sm:py-12">
      <Container className="max-w-3xl">
        <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">{sv ? "Två snabba val, sedan är du inne i analysen" : "Two quick choices, then you are in the analysis"}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Det här anpassar hur StockBox presenterar researchen. Själva analysmotorn och underliggande fakta ändras inte efter dina preferenser." : "This adapts how StockBox presents research. The analysis engine and underlying facts do not change based on your preferences."}</p>
        <form action={saveOnboardingAction} className="mt-6">
          <Card className="space-y-6 p-4 sm:p-6">
            <fieldset>
              <legend className="text-base font-semibold text-[#f4efe5]">{copy.experience}</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {["beginner", "intermediate", "advanced"].map((value) => (
                  <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-white/10 bg-white/5 p-3 capitalize text-[#d6deea] hover:bg-white/8">
                    <input type="radio" name="experience" value={value} defaultChecked={value === "intermediate"} />{value === "beginner" ? profileCopy.beginner : value === "advanced" ? profileCopy.advanced : profileCopy.intermediate}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="block text-base font-semibold text-[#f4efe5]" htmlFor="investmentProfile">{copy.investmentProfile}</label>
              <select id="investmentProfile" name="investmentProfile" defaultValue="balanced" className="mt-3 h-12 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]">
                <option value="balanced">{analysisCopy.balanced}</option><option value="long_term">{analysisCopy.longTerm}</option><option value="short_term">{analysisCopy.shortTerm}</option><option value="growth">{analysisCopy.growth}</option><option value="value">{analysisCopy.value}</option><option value="quality">{analysisCopy.quality}</option><option value="dividend">{analysisCopy.dividend}</option><option value="defensive">{analysisCopy.defensive}</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button className="min-h-12">{sv ? "Spara och analysera en aktie" : "Save and analyze a stock"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
              <Link href="/analyze" className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-[#9aa7b8] hover:text-white">{sv ? "Hoppa över just nu" : "Skip for now"}</Link>
            </div>
          </Card>
        </form>
      </Container>
    </Section>
  );
}
