import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { submitWithdrawalAction } from "./actions";

export const metadata: Metadata = { title: "Withdraw contract" };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function WithdrawalPage({ searchParams }: Props) {
  const [user, locale, params] = await Promise.all([getCurrentUser(), getLocale(), searchParams]);
  const sv = locale === "sv";
  const error = params.error;

  return (
    <Section>
      <Container className="max-w-3xl">
        <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Konsumenträtt" : "Consumer rights"}</p>
        <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">
          {sv ? "Ångra ett avtal" : "Withdraw from a contract"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#c9d2df]">
          {sv
            ? "Använd den här funktionen för att lämna ett formellt ångermeddelande för ett StockBox-abonnemang. Du behöver inte ange någon anledning."
            : "Use this function to submit a formal withdrawal notice for a StockBox subscription. You do not need to give a reason."}
        </p>

        <Card className="mt-8">
          {!user ? (
            <div className="space-y-4 text-sm text-[#c9d2df]">
              <p>{sv ? "Logga in så att vi säkert kan identifiera avtalet." : "Log in so we can securely identify the contract."}</p>
              <Link href="/auth/login" className="font-semibold text-[#e1cb95] hover:text-white">
                {sv ? "Logga in" : "Log in"}
              </Link>
            </div>
          ) : (            <form action={submitWithdrawalAction} className="space-y-5">
              <p className="text-sm text-[#c9d2df]">
                {sv
                  ? "När du skickar formuläret tidsstämplas ditt meddelande och du får ett mottagningsbevis som kan laddas ner och sparas."
                  : "When you submit the form, your notice is timestamped and you receive a receipt that can be downloaded and saved."}
              </p>
              <label className="flex items-start gap-3 text-sm leading-6 text-[#f4efe5]">
                <input name="confirm" value="yes" type="checkbox" required className="mt-1 h-4 w-4" />
                <span>
                  {sv
                    ? "Jag bekräftar att jag vill lämna ett ångermeddelande för mitt StockBox-abonnemang."
                    : "I confirm that I want to submit a withdrawal notice for my StockBox subscription."}
                </span>
              </label>
              <Button type="submit" variant="danger">
                {sv ? "Skicka ångermeddelande" : "Submit withdrawal notice"}
              </Button>
            </form>
          )}
        </Card>

        {error ? (
          <p className="mt-5 text-sm text-amber-200" role="alert">
            {error === "no-subscription"
              ? (sv ? "Vi hittade inget StockBox Basic-abonnemang på kontot. Kontakta support om du anser att det är fel." : "We could not find a StockBox Basic subscription on the account. Contact support if this is incorrect.")
              : (sv ? "Begäran kunde inte registreras. Försök igen eller kontakta support." : "The request could not be recorded. Try again or contact support.")}
          </p>
        ) : null}

        <p className="mt-8 text-xs leading-6 text-[#9aa7b8]">
          {sv
            ? "Funktionen registrerar när StockBox tog emot ditt ångermeddelande. Eventuell återbetalning, åtkomst och slutlig hantering bedöms enligt tillämplig lag och de villkor som gällde vid köpet."
            : "This function records when StockBox received your withdrawal notice. Any refund, access change and final handling are assessed under applicable law and the terms in force when you purchased."}
        </p>
      </Container>
    </Section>
  );
}
