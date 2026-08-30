import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, Section } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import type { AnalysisReport } from "@/lib/analysis/types";
import { getCurrentUser } from "@/lib/auth/session";
import { getAnalysis, getUserAnalysisHistory } from "@/lib/db/repositories";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Compare analyses" };
export const dynamic = "force-dynamic";

type ComparePageProps = {
  searchParams: Promise<{ id?: string | string[] }>;
};

function selectedIds(value: string | string[] | undefined) {
  const ids = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(ids)].slice(0, 3);
}

function reportFromRow(row: Awaited<ReturnType<typeof getAnalysis>>) {
  return row?.report as AnalysisReport | undefined;
}
export default async function ComparePage({ searchParams }: ComparePageProps) {
  const [user, locale, params] = await Promise.all([getCurrentUser(), getLocale(), searchParams]);
  const sv = locale === "sv";
  if (!user) {
    return <Section><Container className="max-w-3xl"><Card>
      <h1 className="serif text-3xl font-semibold text-[#f4efe5]">{sv ? "Jämför analyser" : "Compare analyses"}</h1>
      <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Logga in för att jämföra sparade StockBox-rapporter." : "Sign in to compare saved StockBox reports."}</p>
      <ButtonLink href="/auth/login" className="mt-5">{sv ? "Logga in" : "Log in"}</ButtonLink>
    </Card></Container></Section>;
  }

  const ids = selectedIds(params.id);
  const history = await getUserAnalysisHistory({ userId: user.id, page: 1, pageSize: 50 });
  const available = history.ok ? history.data : [];
  const loaded = await Promise.all(ids.map((id) => getAnalysis(id, user.id)));
  const reports = loaded.map(reportFromRow).filter((report): report is AnalysisReport => Boolean(report));

  const dimensionKeys = [...new Set(reports.flatMap((report) => report.score.dimensions.map((dimension) => dimension.key)))];
  return <Section><Container>
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Research comparison" : "Research comparison"}</p>
    <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{sv ? "Jämför 2–3 sparade analyser" : "Compare 2–3 saved analyses"}</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Jämförelsen läser befintliga rapporter sida vid sida. Den räknar inte om poäng och ändrar inte underliggande fakta." : "Comparison reads existing reports side by side. It does not recalculate scores or alter underlying facts."}</p>
    <form action="/compare" method="get" className="mt-8 rounded-lg border border-white/10 bg-[#0d1c2e]/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[#f4efe5]">{sv ? "Välj rapporter" : "Select reports"}</h2>
          <p className="mt-1 text-xs text-[#9aa7b8]">{sv ? "Välj högst tre. De senaste 50 analyserna visas." : "Choose up to three. Your latest 50 analyses are shown."}</p>
        </div>
        <button type="submit" className="inline-flex h-10 items-center justify-center rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]">
          {sv ? "Jämför" : "Compare"}
        </button>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {available.map((analysis) => <label key={analysis.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm hover:bg-white/[0.06]">
          <input type="checkbox" name="id" value={analysis.id} defaultChecked={ids.includes(analysis.id)} className="mt-1" />
          <span><strong className="text-[#f4efe5]">{analysis.ticker}</strong><span className="ml-2 text-[#9aa7b8]">{analysis.company_name}</span><span className="mt-1 block text-xs text-[#c9d2df]">{analysis.recommendation} · {analysis.score ?? "—"}/100</span></span>
        </label>)}
      </div>
    </form>

    {ids.length > 3 ? <p className="mt-3 text-sm text-amber-200">{sv ? "Endast de tre första rapporterna jämförs." : "Only the first three reports are compared."}</p> : null}
    {ids.length > 0 && reports.length !== ids.length ? <p className="mt-3 text-sm text-red-200">{sv ? "Minst en vald rapport kunde inte läsas från ditt konto." : "At least one selected report could not be loaded from your account."}</p> : null}
    {reports.length >= 2 ? <div className="mt-8 overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-white/[0.03]">
          <tr>
            <th className="px-4 py-3 text-[#9aa7b8]">{sv ? "Mått" : "Metric"}</th>
            {reports.map((report) => <th key={report.id} className="px-4 py-3 text-[#f4efe5]">{report.ticker}<span className="block text-xs font-normal text-[#9aa7b8]">{report.companyName}</span></th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/8">
          <tr><td className="px-4 py-3 text-[#9aa7b8]">{sv ? "Rekommendation" : "Recommendation"}</td>{reports.map((report) => <td key={report.id} className="px-4 py-3 font-semibold text-[#e1cb95]">{report.recommendation}</td>)}</tr>
          <tr><td className="px-4 py-3 text-[#9aa7b8]">StockBox Score</td>{reports.map((report) => <td key={report.id} className="number px-4 py-3 text-[#f4efe5]">{report.score.score ?? "—"}/100</td>)}</tr>
          <tr><td className="px-4 py-3 text-[#9aa7b8]">{sv ? "Konfidens" : "Confidence"}</td>{reports.map((report) => <td key={report.id} className="number px-4 py-3">{Math.round(report.score.confidence)}%</td>)}</tr>
          <tr><td className="px-4 py-3 text-[#9aa7b8]">{sv ? "Datatäckning" : "Data coverage"}</td>{reports.map((report) => <td key={report.id} className="number px-4 py-3">{report.dataCoverage === undefined ? "—" : `${Math.round(report.dataCoverage * 100)}%`}</td>)}</tr>
          {dimensionKeys.map((key) => <tr key={key}>
            <td className="px-4 py-3 text-[#9aa7b8]">{reports.flatMap((report) => report.score.dimensions).find((dimension) => dimension.key === key)?.label ?? key}</td>
            {reports.map((report) => {
              const dimension = report.score.dimensions.find((candidate) => candidate.key === key);
              return <td key={report.id} className="number px-4 py-3">{dimension?.score === null || dimension?.score === undefined ? "—" : Math.round(dimension.score)}</td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div> : null}
    {reports.length === 1 ? <Card className="mt-8"><p className="text-sm text-[#9aa7b8]">{sv ? "Välj minst två rapporter för en jämförelse." : "Select at least two reports to compare."}</p></Card> : null}
    {reports.length ? <div className="mt-5 flex flex-wrap gap-3 text-sm">
      {reports.map((report) => <Link key={report.id} href={`/analysis/${report.id}`} className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Öppna" : "Open"} {report.ticker}</Link>)}
    </div> : null}
  </Container></Section>;
}
