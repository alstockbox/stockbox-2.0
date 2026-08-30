import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { commerciallyActivePlans } from "@/lib/billing/plans";
import { getLocale } from "@/lib/i18n/server";
import { submitWithdrawalAction } from "./actions";

export const metadata: Metadata = {
  title: "Withdraw from a StockBox contract",
  description: "Submit a statutory withdrawal notice for a StockBox subscription and receive a timestamped receipt.",
};

type Props = { searchParams: Promise<{ error?: string }> };

export default async function WithdrawalPage({ searchParams }: Props) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const sv = locale === "sv";
  const paidPlans = commerciallyActivePlans.filter((plan) => plan.key !== "free");
  const field = "mt-2 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-[#f4efe5] placeholder:text-[#6f7b8c]";

  return <Section><Container className="max-w-3xl">
    <p className="text-sm font-semibold text-[#e1cb95]">{sv ? "Konsumenträtt" : "Consumer rights"}</p>
    <h1 className="serif mt-2 text-4xl font-semibold text-[#f4efe5]">{sv ? "Ångra avtalet här" : "Withdraw from the contract here"}</h1>
    <p className="mt-4 max-w-2xl text-sm leading-7 text-[#c9d2df]">{sv
      ? "Använd den här funktionen för att lämna ett formellt ångermeddelande för ett StockBox-abonnemang. Du behöver inte ange någon anledning och du behöver inte vara inloggad."
      : "Use this function to submit a formal withdrawal notice for a StockBox subscription. You do not need to give a reason and you do not need to be logged in."}</p>

    <Card className="mt-8">
      <form action={submitWithdrawalAction} className="space-y-5">
        <p className="text-sm leading-6 text-[#c9d2df]">{sv
          ? "Ange ditt namn, uppgifter som identifierar avtalet och vilken e-postadress mottagningsbeviset ska skickas till. Meddelandet tidsstämplas när StockBox tar emot det."
          : "Provide your name, details identifying the contract and the email address where the receipt should be sent. The notice is timestamped when StockBox receives it."}</p>
        <label className="block text-sm font-semibold text-[#f4efe5]">
          {sv ? "Namn" : "Name"}
          <input name="consumerName" autoComplete="name" required minLength={2} maxLength={120} className={field} />
        </label>
        <label className="block text-sm font-semibold text-[#f4efe5]">
          {sv ? "E-postadressen som användes för StockBox-kontot/köpet" : "Email used for the StockBox account or purchase"}
          <input name="accountEmail" type="email" autoComplete="email" required maxLength={254} className={field} />
        </label>
        <label className="block text-sm font-semibold text-[#f4efe5]">
          {sv ? "Plan" : "Plan"}
          <select name="planKey" required className={field} defaultValue="">
            <option value="" disabled>{sv ? "Välj plan" : "Select plan"}</option>
            {paidPlans.map((plan) => <option key={plan.key} value={plan.key}>{plan.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold text-[#f4efe5]">
          {sv ? "Uppgifter som identifierar avtalet" : "Details identifying the contract"}
          <input
            name="contractReference"
            required
            minLength={2}
            maxLength={200}
            placeholder={sv ? "T.ex. fakturanummer, abonnemangs-ID eller köpdatum" : "E.g. invoice number, subscription ID or purchase date"}
            className={field}
          />
          <span className="mt-2 block text-xs font-normal leading-5 text-[#9aa7b8]">{sv ? "Ange det du har tillgängligt. Du behöver inte känna till Stripes interna abonnemangs-ID." : "Provide what you have available. You do not need to know Stripe's internal subscription ID."}</span>
        </label>
        <label className="block text-sm font-semibold text-[#f4efe5]">
          {sv ? "E-post för mottagningsbevis" : "Email for the receipt"}
          <input name="confirmationEmail" type="email" autoComplete="email" required maxLength={254} className={field} />
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-[#f4efe5]">
          <input name="confirm" value="yes" type="checkbox" required className="mt-1 h-4 w-4" />
          <span>{sv ? "Jag bekräftar uttryckligen att jag vill frånträda det StockBox-avtal som anges ovan." : "I expressly confirm that I want to withdraw from the StockBox contract identified above."}</span>
        </label>
        <Button type="submit" variant="danger">{sv ? "Bekräfta ånger" : "Confirm withdrawal"}</Button>
      </form>
    </Card>

    {params.error ? <p className="mt-5 text-sm text-amber-200" role="alert">{params.error === "rate-limit"
      ? (sv ? "För många försök på kort tid. Försök igen senare eller kontakta support." : "Too many attempts in a short period. Try again later or contact support.")
      : (sv ? "Begäran kunde inte registreras. Kontrollera uppgifterna och försök igen eller kontakta support." : "The notice could not be recorded. Check the details and try again or contact support.")}</p> : null}

    <p className="mt-8 text-xs leading-6 text-[#9aa7b8]">{sv
      ? "Mottagningsbeviset bekräftar tidpunkten då StockBox tog emot ditt meddelande. Det är inte i sig ett beslut om återbetalning eller om ångerrätten är tillämplig i det enskilda fallet."
      : "The receipt confirms when StockBox received your notice. It is not, by itself, a decision about a refund or whether the statutory right applies in the individual case."}</p>
  </Container></Section>;
}
