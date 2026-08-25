import type { Metadata } from "next";
import { BatchWorkbench } from "@/components/batch/batch-workbench";
import { Container, Section } from "@/components/ui/card";
import { isFinancialProviderConfigured } from "@/lib/env/server";

export const metadata: Metadata = { title: "Batch analysis" };
export const dynamic = "force-dynamic";

export default function BatchPage() {
  return (
    <Section>
      <Container>
        <p className="text-sm font-semibold text-[#e1cb95]">Research desk</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Batch analysis</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">
          Validate and analyze up to 50 companies in one controlled queue. Every report uses the same canonical engine and data-quality rules as a single analysis.
        </p>
        <div className="mt-8">
          <BatchWorkbench financialConfigured={isFinancialProviderConfigured()} />
        </div>
      </Container>
    </Section>
  );
}
