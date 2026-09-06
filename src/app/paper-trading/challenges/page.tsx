import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PauseCircle, ShieldCheck, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import {
  listJoinedPaperChallengesV3,
  listOpenPaperChallengesV3,
  listPaperCompetitionEntriesV3,
} from "@/lib/paper-trading/competition-repository-v3";
import { joinPaperChallengeAction } from "../actions";

export const metadata: Metadata = { title: "Paper Trading Challenges" };

type PageProps = {
  searchParams: Promise<{
    challengeStatus?: string | string[];
    competition?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function dateLabel(value: string, sv: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sv ? "Okänd tid" : "Unknown time";
  return new Intl.DateTimeFormat(sv ? "sv-SE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function numberLabel(value: number, sv: boolean): string {
  return new Intl.NumberFormat(sv ? "sv-SE" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function feedbackLabel(status: string | null, sv: boolean): string | null {
  if (status === "joined") return sv ? "Du har gått med i utmaningen." : "You joined the challenge.";
  if (status === "invalid") return sv ? "Utmaningen kunde inte verifieras." : "The challenge could not be verified.";
  if (status === "error") return sv ? "Det gick inte att gå med i utmaningen just nu." : "The challenge could not be joined right now.";
  return null;
}

export default async function PaperTradingChallengesPage({ searchParams }: PageProps) {
  if (!isFeatureEnabled("paperTrading") || !isFeatureEnabled("challenges")) notFound();

  const user = await requireUser();
  const [params, locale, challengesResult, entriesResult, joinedChallengesResult] = await Promise.all([
    searchParams,
    getLocale(),
    listOpenPaperChallengesV3(),
    listPaperCompetitionEntriesV3(user.id),
    listJoinedPaperChallengesV3(user.id),
  ]);
  const sv = locale === "sv";
  const killed = isKilled("paperTrading");
  const joinEnabled = !killed && entriesResult.ok;
  const joinedCompetitionIds = new Set(
    entriesResult.ok ? entriesResult.entries.map((entry) => entry.competitionId) : [],
  );
  const openChallenges = challengesResult.ok
    ? challengesResult.competitions.filter((competition) => !joinedCompetitionIds.has(competition.id))
    : [];
  const feedback = feedbackLabel(first(params.challengeStatus), sv);

  return (
    <Section>
      <Container>
        <div className="max-w-3xl">
          <Link href="/paper-trading" className="inline-flex items-center gap-2 text-sm text-[#9aa7b8] transition hover:text-[#f4efe5]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {sv ? "Tillbaka till Paper Trading" : "Back to Paper Trading"}
          </Link>
          <div className="mt-6 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Paper Trading Challenges</p>
          </div>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">
            {sv ? "Tävla med samma simulerade startkapital" : "Compete with the same simulated starting capital"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "Alla utmaningar här använder simulerade pengar. Resultat i Paper Trading är inte en prognos, rekommendation eller garanti för framtida avkastning."
              : "Every challenge here uses simulated money. Paper Trading results are not a forecast, recommendation, guarantee, or evidence of future returns."}
          </p>
        </div>

        {killed ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20">
            <div className="flex gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-100">{sv ? "Utmaningar är tillfälligt read-only" : "Challenges are temporarily read-only"}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {sv ? "Du kan se verifierade villkor, men inga nya deltaganden skapas medan Paper Trading är pausat." : "You can view verified terms, but no new entries are created while Paper Trading is paused."}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {!entriesResult.ok ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">
            {sv
              ? "Dina befintliga tävlingsdeltaganden kunde inte verifieras. StockBox visar därför inga knappar för att gå med just nu."
              : "Your existing competition entries could not be verified. StockBox therefore shows no join buttons right now."}
          </Card>
        ) : null}

        {feedback ? <p className="mt-5 text-sm text-[#e1cb95]" role="status">{feedback}</p> : null}

        <div className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b99b5f]">{sv ? "Mina challenges" : "My challenges"}</p>
              <h2 className="serif mt-2 text-2xl font-semibold text-[#f4efe5]">{sv ? "Dina registrerade utmaningar" : "Your registered challenges"}</h2>
            </div>
          </div>

          {!joinedChallengesResult.ok ? (
            <Card className="mt-4 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">
              {sv
                ? "Dina challenges kunde inte verifieras just nu. Ingen påhittad historik visas."
                : "Your challenges could not be verified right now. No invented history is shown."}
            </Card>
          ) : joinedChallengesResult.competitions.length === 0 ? (
            <Card className="mt-4">
              <p className="text-sm text-[#8391a4]">{sv ? "Du har inte gått med i någon challenge ännu." : "You have not joined any challenge yet."}</p>
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {joinedChallengesResult.competitions.map((competition) => (
                <Card key={competition.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="serif text-xl font-semibold text-[#f4efe5]">{competition.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-[#b99b5f]">{competition.status}</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#8391a4]">
                    <p>{sv ? "Start" : "Starts"}: <span className="block mt-1 text-sm text-[#f4efe5]">{dateLabel(competition.startsAt, sv)}</span></p>
                    <p>{sv ? "Slut" : "Ends"}: <span className="block mt-1 text-sm text-[#f4efe5]">{dateLabel(competition.endsAt, sv)}</span></p>
                    <p>{sv ? "Startkapital" : "Starting capital"}: <span className="block mt-1 number text-sm text-[#f4efe5]">{numberLabel(competition.startingCash, sv)} {competition.baseCurrency}</span></p>
                    <p>{sv ? "Max deltagare" : "Max participants"}: <span className="block mt-1 number text-sm text-[#f4efe5]">{numberLabel(competition.maxParticipants, sv)}</span></p>
                  </div>
                  <Link
                    href={`/paper-trading/challenges/${encodeURIComponent(competition.id)}`}
                    className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md border border-[#b99b5f]/40 bg-[#b99b5f]/10 px-4 text-sm font-semibold text-[#f4efe5] transition hover:bg-[#b99b5f]/15"
                  >
                    {sv ? "Öppna challenge" : "Open challenge"}
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b99b5f]">{sv ? "Öppna challenges" : "Open challenges"}</p>
          <h2 className="serif mt-2 text-2xl font-semibold text-[#f4efe5]">{sv ? "Nya utmaningar du kan gå med i" : "New challenges you can join"}</h2>

          {!challengesResult.ok ? (
            <Card className="mt-4 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">
              {sv
                ? "Öppna utmaningar kunde inte verifieras just nu. Ingen påhittad challenge-data visas."
                : "Open challenges could not be verified right now. No invented challenge data is shown."}
            </Card>
          ) : openChallenges.length === 0 ? (
            <Card className="mt-4">
              <p className="font-semibold text-[#f4efe5]">{sv ? "Inga nya öppna utmaningar just nu" : "No new open challenges right now"}</p>
              <p className="mt-2 text-sm text-[#8391a4]">
                {sv ? "När en verifierad challenge öppnas visas den här." : "When a verified challenge opens, it will appear here."}
              </p>
            </Card>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {openChallenges.map((competition) => (
                <Card key={competition.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="serif text-xl font-semibold text-[#f4efe5]">{competition.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-[#b99b5f]">{competition.status}</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-[#8391a4]">{sv ? "Startkapital" : "Starting capital"}</dt>
                      <dd className="mt-1 number font-semibold text-[#f4efe5]">{numberLabel(competition.startingCash, sv)} {competition.baseCurrency}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#8391a4]">{sv ? "Max deltagare" : "Max participants"}</dt>
                      <dd className="mt-1 number font-semibold text-[#f4efe5]">{numberLabel(competition.maxParticipants, sv)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#8391a4]">{sv ? "Start" : "Starts"}</dt>
                      <dd className="mt-1 text-[#f4efe5]">{dateLabel(competition.startsAt, sv)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[#8391a4]">{sv ? "Sista anmälan" : "Join deadline"}</dt>
                      <dd className="mt-1 text-[#f4efe5]">{dateLabel(competition.joinDeadline, sv)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-[#8391a4]">{sv ? "Slut" : "Ends"}</dt>
                      <dd className="mt-1 text-[#f4efe5]">{dateLabel(competition.endsAt, sv)}</dd>
                    </div>
                  </dl>

                  {joinEnabled ? (
                    <form action={joinPaperChallengeAction} className="mt-5">
                      <input type="hidden" name="competitionId" value={competition.id} />
                      <Button type="submit" className="w-full">{sv ? "Gå med i utmaningen" : "Join challenge"}</Button>
                    </form>
                  ) : (
                    <p className="mt-5 text-xs leading-5 text-[#8391a4]">
                      {sv ? "Deltagande är inte tillgängligt från den här vyn just nu." : "Joining is not available from this view right now."}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="mt-6">
          <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Tävlingsintegritet" : "Competition integrity"}</p>
          <p className="mt-2 text-xs leading-5 text-[#8391a4]">
            {sv
              ? "Valuta, startkapital och tidsfönster kommer från StockBox serverdata och kan inte ändras av webbläsaren. Leaderboard-resultat visas inte här förrän ett separat gemensamt verifierat värderingstillfälle finns."
              : "Currency, starting capital, and timing come from StockBox server data and cannot be changed by the browser. Leaderboard results are not shown here until a separate common verified evaluation cutoff exists."}
          </p>
        </Card>
      </Container>
    </Section>
  );
}
