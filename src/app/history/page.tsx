import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserAnalysisHistory } from "@/lib/db/repositories";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Analysis History" };

const PAGE_SIZE = 25;

type HistoryPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

function pageNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const [user, locale, params] = await Promise.all([getCurrentUser(), getLocale(), searchParams]);
  if (!user) {
    return (
      <Section><Container><Card>
        <h1 className="serif text-3xl font-semibold text-[#f4efe5]">{locale === "sv" ? "Analyshistorik" : "Analysis history"}</h1>
        <p className="mt-3 text-sm text-[#9aa7b8]">{locale === "sv" ? "Logga in för att se dina sparade analyser." : "Sign in to view your saved analyses."}</p>
        <ButtonLink href="/auth/login" className="mt-5">{locale === "sv" ? "Logga in" : "Log in"}</ButtonLink>
      </Card></Container></Section>
    );
  }

  const page = pageNumber(params.page);
  const history = await getUserAnalysisHistory({ userId: user.id, page, pageSize: PAGE_SIZE });
  const analyses = history.ok ? history.data : [];
  const total = history.ok ? history.count : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Section><Container>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#e1cb95]">{locale === "sv" ? "Sparad research" : "Saved research"}</p>
          <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{locale === "sv" ? "Analyshistorik" : "Analysis history"}</h1>
          <p className="mt-2 text-sm text-[#9aa7b8]">{total} {locale === "sv" ? "sparade analyser" : "saved analyses"}</p>
        </div>
        <ButtonLink href="/analyze">{locale === "sv" ? "Ny analys" : "New analysis"}</ButtonLink>
      </div>
      <div className="mt-8 overflow-hidden rounded-lg border border-white/10">
        {analyses.length ? analyses.map((analysis) => (
          <Link key={analysis.id} href={`/analysis/${analysis.id}`} className="grid gap-2 border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-4 last:border-0 hover:bg-white/8 sm:grid-cols-[100px_1fr_120px_80px] sm:items-center">
            <span className="font-semibold text-[#e1cb95]">{analysis.ticker}</span>
            <span className="text-sm text-[#f4efe5]">{analysis.company_name}</span>
            <span className="text-sm text-[#c9d2df]">{analysis.recommendation}</span>
            <span className="number text-sm text-[#9aa7b8]">{analysis.score === null ? "—" : `${analysis.score}/100`}</span>
          </Link>
        )) : <p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">{locale === "sv" ? "Inga sparade analyser ännu." : "No saved analyses yet."}</p>}
      </div>
      {totalPages > 1 ? (
        <nav className="mt-5 flex items-center justify-between gap-4 text-sm" aria-label={locale === "sv" ? "Sidnavigering" : "Pagination"}>
          {page > 1 ? (
            <Link href={{ pathname: "/history", query: { page: page - 1 } }} className="font-semibold text-[#e1cb95] hover:text-white">
              {locale === "sv" ? "Föregående" : "Previous"}
            </Link>
          ) : <span />}
          <span className="text-[#9aa7b8]">{locale === "sv" ? "Sida" : "Page"} {Math.min(page, totalPages)} / {totalPages}</span>
          {page < totalPages ? (
            <Link href={{ pathname: "/history", query: { page: page + 1 } }} className="font-semibold text-[#e1cb95] hover:text-white">
              {locale === "sv" ? "Nästa" : "Next"}
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </Container></Section>
  );
}
