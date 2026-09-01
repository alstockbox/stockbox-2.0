import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";

export type SeoBreadcrumb = { label: string; href: string };

export function SeoJsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function breadcrumbJsonLd(baseUrl: string, items: SeoBreadcrumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: new URL(item.href, baseUrl).toString(),
    })),
  };
}

export function SeoBreadcrumbs({ items }: { items: SeoBreadcrumb[] }) {
  return (
    <nav aria-label="Brödsmulor" className="mb-6 flex flex-wrap gap-2 text-xs text-[#9aa7b8]">
      {items.map((item, index) => (
        <span key={item.href} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          <Link href={item.href} className="hover:text-[#f4efe5]">{item.label}</Link>
        </span>
      ))}
    </nav>
  );
}

export function SeoHero({
  eyebrow,
  title,
  lead,
  breadcrumbs,
  primaryHref = "/#research",
  primaryLabel = "Analysera en aktie gratis",
  secondaryHref = "/aktier",
  secondaryLabel = "Se publika aktieanalyser",
}: {
  eyebrow: string;
  title: string;
  lead: string;
  breadcrumbs: SeoBreadcrumb[];
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <Section className="subtle-grid border-b border-white/10 pb-10 pt-14 sm:pt-18">
      <Container className="max-w-5xl">
        <SeoBreadcrumbs items={breadcrumbs} />
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{eyebrow}</p>
        <h1 className="serif mt-4 text-4xl font-semibold leading-tight text-[#f4efe5] sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-[#c9d2df] sm:text-lg">{lead}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
          <ButtonLink href={secondaryHref} variant="secondary">{secondaryLabel}</ButtonLink>
        </div>
      </Container>
    </Section>
  );
}

export function SeoArticle({ children }: { children: ReactNode }) {
  return (
    <Section className="py-10">
      <Container className="max-w-5xl">
        <div className="grid gap-6">{children}</div>
      </Container>
    </Section>
  );
}

export function SeoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="serif text-2xl font-semibold text-[#f4efe5] sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-[#c9d2df] sm:text-base">{children}</div>
    </Card>
  );
}
