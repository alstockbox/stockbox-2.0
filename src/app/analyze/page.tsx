import type { Metadata } from "next";
import { AnalysisWorkbench } from "@/components/analysis/analysis-workbench";
import { analysisWorkbenchDefaults } from "@/components/analysis/analysis-workbench-state";
import { Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { isFinancialProviderConfigured } from "@/lib/env/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { getLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analyze" };
export const dynamic = "force-dynamic";

export default async function AnalyzePage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  const copy = getP0Copy(locale).analyze;
  const supabase = user ? await createClient() : null;
  const profileResult = supabase
    ? await supabase.from("profiles").select("ui_mode,investment_profile,experience").eq("id", user!.id).maybeSingle()
    : { data: null };
  const defaults = analysisWorkbenchDefaults(profileResult.data ? {
    uiMode: profileResult.data.ui_mode, investmentProfile: profileResult.data.investment_profile,
    experience: profileResult.data.experience,
  } : null);
  return (
    <Section><Container>
      <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
      <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">{copy.copy}</p>
      <div className="mt-8">
        <AnalysisWorkbench
          financialConfigured={isFinancialProviderConfigured()}
          initialMode={defaults.mode}
          initialInvestmentProfile={defaults.investmentProfile}
          locale={locale}
        />
      </div>
    </Container></Section>
  );
}
