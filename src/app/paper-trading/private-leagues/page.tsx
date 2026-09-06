import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole, PauseCircle, ShieldCheck } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import { listJoinedPrivatePaperLeaguesV3 } from "@/lib/paper-trading/private-league-read-repository-v3";

export const metadata: Metadata = { title: "Private Paper Trading Leagues" };

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

function roleLabel(role: "owner" | "admin" | "member", sv: boolean): string {
  if (role === "owner") return sv ? "Ägare" : "Owner";
  if (role === "admin") return sv ? "Admin" : "Admin";
  return sv ? "Medlem" : "Member";
}

export default async function PrivatePaperLeaguesPage() {
  if (!isFeatureEnabled("paperTrading") || !isFeatureEnabled("privateLeagues")) notFound();

  const user = await requireUser();
  const [locale, leaguesResult] = await Promise.all([
    getLocale(),
    listJoinedPrivatePaperLeaguesV3(user.id),
  ]);
  const sv = locale === "sv";
  const killed = isKilled("paperTrading");

  return (
    <Section>
      <Container>
        <div className="max-w-3xl">
          <Link href="/paper-trading" className="inline-flex items-center gap-2 text-sm text-[#9aa7b8] transition hover:text-[#f4efe5]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {sv ? "Tillbaka till Paper Trading" : "Back to Paper Trading"}
          </Link>

          <div className="mt-6 flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Private Paper Trading Leagues</p>
          </div>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">
            {sv ? "Dina privata simulerade ligor" : "Your private simulated leagues"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "Här visas endast privata ligor där ditt verifierade StockBox-konto är medlem. Privata ligor är inte publikt sökbara och all handel använder simulerade pengar."
              : "Only private leagues where your verified StockBox account is a member are shown here. Private leagues are not publicly discoverable and all trading uses simulated money."}
          </p>
        </div>

        {killed ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20">
            <div className="flex gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-100">{sv ? "Privata ligor är tillfälligt read-only" : "Private leagues are temporarily read-only"}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {sv
                    ? "Verifierad medlems- och ligainformation kan fortfarande visas, men inga nya simulerade order ska kunna genomföras medan Paper Trading är pausat."
                    : "Verified membership and league information remains visible, but no new simulated orders can execute while Paper Trading is paused."}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {!leaguesResult.ok ? (
          <Card className="mt-7 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">
            {sv
              ? "Medlemskapen kunde inte verifieras. StockBox visar därför inga privata ligor eller påhittad ligadata just nu."
              : "Memberships could not be verified. No private league data or invented league information is shown right now."}
          </Card>
        ) : leaguesResult.leagues.length === 0 ? (
          <Card className="mt-7">
            <p className="font-semibold text-[#f4efe5]">{sv ? "Du har inga privata ligor ännu" : "You do not have any private leagues yet"}</p>
            <p className="mt-2 text-sm leading-6 text-[#8391a4]">
              {sv
                ? "En privat liga visas här först när servern kan verifiera att du är medlem."
                : "A private league appears here only after the server can verify your membership."}
            </p>
          </Card>
        ) : (
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {leaguesResult.leagues.map((league) => (
              <Card key={league.competition.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="serif text-xl font-semibold text-[#f4efe5]">{league.competition.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-wide">
                      <span className="rounded-full border border-[#b99b5f]/30 bg-[#b99b5f]/10 px-2 py-1 text-[#e1cb95]">{league.competition.status}</span>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[#9aa7b8]">{roleLabel(league.role, sv)}</span>
                    </div>
                  </div>
                  <ShieldCheck className="h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                  <div>
                    <dt className="text-xs text-[#8391a4]">{sv ? "Startkapital" : "Starting capital"}</dt>
                    <dd className="mt-1 number font-semibold text-[#f4efe5]">{numberLabel(league.competition.startingCash, sv)} {league.competition.baseCurrency}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#8391a4]">{sv ? "Max deltagare" : "Max participants"}</dt>
                    <dd className="mt-1 number font-semibold text-[#f4efe5]">{numberLabel(league.competition.maxParticipants, sv)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#8391a4]">{sv ? "Start" : "Starts"}</dt>
                    <dd className="mt-1 text-[#f4efe5]">{dateLabel(league.competition.startsAt, sv)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#8391a4]">{sv ? "Slut" : "Ends"}</dt>
                    <dd className="mt-1 text-[#f4efe5]">{dateLabel(league.competition.endsAt, sv)}</dd>
                  </div>
                </dl>

                <Link
                  href={`/paper-trading/private-leagues/${encodeURIComponent(league.competition.id)}`}
                  className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md border border-[#b99b5f]/40 bg-[#b99b5f]/10 px-4 text-sm font-semibold text-[#f4efe5] transition hover:bg-[#b99b5f]/15"
                >
                  {sv ? "Öppna privat liga" : "Open private league"}
                </Link>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6">
          <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Sekretess och simulering" : "Privacy and simulation"}</p>
          <p className="mt-2 text-xs leading-5 text-[#8391a4]">
            {sv
              ? "Den här listan byggs endast från verifierade medlemskap. StockBox visar ingen publik katalog över privata ligor och skickar aldrig riktiga värdepappersorder från Paper Trading."
              : "This list is built only from verified memberships. StockBox exposes no public private-league directory and never sends real securities orders from Paper Trading."}
          </p>
        </Card>
      </Container>
    </Section>
  );
}
