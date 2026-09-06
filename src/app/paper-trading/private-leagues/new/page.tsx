import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole, PauseCircle } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import { PrivateLeagueCreateForm } from "../access-forms";

export const metadata: Metadata = { title: "Create Private Paper Trading League" };

export default async function CreatePrivatePaperLeaguePage() {
  if (!isFeatureEnabled("paperTrading") || !isFeatureEnabled("privateLeagues")) notFound();

  await requireUser();
  const locale = await getLocale();
  const sv = locale === "sv";
  const killed = isKilled("paperTrading");

  return (
    <Section>
      <Container>
        <Link href="/paper-trading/private-leagues" className="inline-flex items-center gap-2 text-sm text-[#9aa7b8] transition hover:text-[#f4efe5]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {sv ? "Tillbaka till privata ligor" : "Back to private leagues"}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Private Paper Trading League</p>
          </div>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">
            {sv ? "Skapa en privat simulerad liga" : "Create a private simulated league"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "Ligan är inte publikt sökbar. Endast personer med en giltig hemlig inbjudningskod kan ansluta, och all handel är simulerad."
              : "The league is not publicly discoverable. Only people with a valid secret invite token can join, and all trading is simulated."}
          </p>
        </div>

        {killed ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20">
            <div className="flex gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-100">{sv ? "Skapande är tillfälligt pausat" : "Creation is temporarily paused"}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {sv ? "Paper Trading-kill-switchen gör privata ligor read-only." : "The Paper Trading kill switch makes private leagues read-only."}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="mt-6">
          {!killed ? <PrivateLeagueCreateForm /> : null}
        </Card>

        <Card className="mt-6">
          <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Inbjudningssäkerhet" : "Invite security"}</p>
          <p className="mt-2 text-xs leading-5 text-[#8391a4]">
            {sv
              ? "Efter skapandet får du en rå inbjudningskod en gång i svaret. StockBox lagrar endast en hash för verifiering och kan därför inte läsa tillbaka råkoden från databasen."
              : "After creation you receive the raw invite token once in the response. StockBox stores only a hash for verification and therefore cannot read the raw token back from the database."}
          </p>
        </Card>
      </Container>
    </Section>
  );
}
