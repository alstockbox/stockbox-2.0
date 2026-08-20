import type { Metadata } from "next";
import { AnalysisWorkbench } from "@/components/analysis/analysis-workbench";
import { Container, Section } from "@/components/ui/card";
import { isFinancialProviderConfigured } from "@/lib/env/server";

export const metadata: Metadata = { title: "Analyze" };

export default function AnalyzePage() {
  return (
    <Section>
      <Container>
        <p className="text-sm font-semibold text-[#e1cb95]">Research desk</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Analyze a company</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9aa7b8]">Choose the report depth and investment lens. Factual inputs remain unchanged; only score emphasis changes by profile.</p>
        <div className="mt-8"><AnalysisWorkbench financialConfigured={isFinancialProviderConfigured()} /></div>
      </Container>
    </Section>
  );
}
