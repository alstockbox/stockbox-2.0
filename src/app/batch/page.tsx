import type { Metadata } from "next";
import { BatchWorkbench } from "@/components/batch/batch-workbench";
import { Container, Section } from "@/components/ui/card";
import { isFinancialProviderConfigured } from "@/lib/env/server";
import { getLocale } from "@/lib/i18n/server";
import { getP0Copy } from "@/lib/i18n/p0-copy";

export const metadata: Metadata = { title: "Batch analysis" };
export const dynamic = "force-dynamic";

export default async function BatchPage() {
  const locale = await getLocale();
  const copy = getP0Copy(locale).batch;
  return (
    <Section>
      <Container>
        <p className="text-sm font-semibold text-[#e1cb95]">{copy.kicker}</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{copy.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{copy.copy}</p>
        <div className="mt-8">
          <BatchWorkbench financialConfigured={isFinancialProviderConfigured()} locale={locale} />
        </div>
      </Container>
    </Section>
  );
}
