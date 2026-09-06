import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, PauseCircle } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import { PrivateLeagueJoinForm } from "../access-forms";

export const metadata: Metadata = { title: "Join Private Paper Trading League" };

export default async function JoinPrivatePaperLeaguePage() {
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
            <KeyRound className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Private Paper Trading League</p>
          </div>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">
            {sv ? "Gå med via privat inbjudan" : "Join with a private invite"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "En privat liga är inte publikt sökbar. StockBox visar ingen ligainformation förrän din hemliga inbjudningskod har verifierats, och all handel är simulerad."
              : "A private league is not publicly discoverable. StockBox reveals no league information until your secret invite token is verified, and all trading is simulated."}
          </p>
        </div>

        {killed ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20">
            <div className="flex gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-100">{sv ? "Anslutning är tillfälligt pausad" : "Joining is temporarily paused"}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {sv ? "Paper Trading-kill-switchen gör privata ligor read-only." : "The Paper Trading kill switch makes private leagues read-only."}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="mt-6">
          {!killed ? <PrivateLeagueJoinForm /> : null}
        </Card>

        <Card className="mt-6">
          <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Ingen publik upptäckt" : "No public discovery"}</p>
          <p className="mt-2 text-xs leading-5 text-[#8391a4]">
            {sv
              ? "Den här sidan söker inte efter ligor via namn eller ID. Den skickar endast den råa inbjudningskoden till serverns verifierade invite-gräns."
              : "This page does not search for leagues by name or ID. It sends only the raw invite token to the server's verified invite boundary."}
          </p>
        </Card>
      </Container>
    </Section>
  );
}
