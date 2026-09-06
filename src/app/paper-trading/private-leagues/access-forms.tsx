"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  INITIAL_CREATE_PRIVATE_LEAGUE_ACCESS_STATE,
  INITIAL_JOIN_PRIVATE_LEAGUE_ACCESS_STATE,
  createPrivateLeagueAccessAction,
  joinPrivateLeagueAccessAction,
} from "./access-actions";

const inputClass = "mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white placeholder:text-[#5f6d80]";

export function PrivateLeagueCreateForm() {
  const [createState, createAction, createPending] = useActionState(
    createPrivateLeagueAccessAction,
    INITIAL_CREATE_PRIVATE_LEAGUE_ACCESS_STATE,
  );

  return (
    <div>
      <form action={createAction} className="grid gap-4">
        <label className="text-xs text-[#9aa7b8]">
          Liganamn / League name
          <input name="name" required minLength={1} maxLength={120} autoComplete="off" className={inputClass} />
        </label>

        <label className="text-xs text-[#9aa7b8]">
          Basvaluta / Base currency
          <input name="baseCurrency" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue="SEK" autoCapitalize="characters" autoComplete="off" className={`${inputClass} uppercase`} />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs text-[#9aa7b8]">
            Starttid / Starts at
            <input name="startsAt" required autoComplete="off" placeholder="2026-09-10T18:00:00+02:00" className={inputClass} />
          </label>
          <label className="text-xs text-[#9aa7b8]">
            Sista anslutning / Join deadline
            <input name="joinDeadline" required autoComplete="off" placeholder="2026-09-10T17:30:00+02:00" className={inputClass} />
          </label>
          <label className="text-xs text-[#9aa7b8]">
            Sluttid / Ends at
            <input name="endsAt" required autoComplete="off" placeholder="2026-09-17T18:00:00+02:00" className={inputClass} />
          </label>
        </div>

        <p className="-mt-1 text-xs leading-5 text-[#8391a4]">
          Tider anges som ISO 8601 med tidszons-offset, till exempel 2026-09-10T18:00:00+02:00. / Times use ISO 8601 with an explicit timezone offset.
        </p>

        <label className="text-xs text-[#9aa7b8]">
          Max deltagare / Max participants
          <input type="number" name="maxParticipants" required min={2} max={10000} step={1} defaultValue={20} className={inputClass} />
        </label>

        <Button type="submit" disabled={createPending}>
          {createPending ? "Skapar / Creating…" : "Skapa privat liga / Create private league"}
        </Button>
      </form>

      {createState.status === "invalid" ? (
        <p className="mt-4 text-sm text-amber-200" role="status">
          Ligavillkoren kunde inte verifieras. Kontrollera tider, valuta och deltagargräns. / League terms could not be verified.
        </p>
      ) : null}

      {createState.status === "error" ? (
        <p className="mt-4 text-sm text-amber-200" role="status">
          Ligan kunde inte skapas just nu. Ingen liga visas som skapad. / The league could not be created right now. No league is shown as created.
        </p>
      ) : null}

      {createState.status === "created" ? (
        <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-950/15 p-4" role="status">
          <p className="font-semibold text-emerald-100">Privat liga skapad / Private league created</p>
          <p className="mt-2 text-xs leading-5 text-emerald-100/80">
            Inbjudningskoden är en hemlighet och visas bara i detta svar. Kopiera den nu; StockBox sparar inte råkoden så att den kan läsas tillbaka senare. / The invite token is a secret and is shown only in this response. Copy it now; StockBox does not persist the raw token for later retrieval.
          </p>
          <code className="mt-3 block break-all rounded-md border border-white/10 bg-black/20 p-3 text-sm text-[#f4efe5] select-all">
            {createState.inviteToken}
          </code>
          <Link
            href={`/paper-trading/private-leagues/${encodeURIComponent(createState.competitionId)}`}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-emerald-300/25 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/10"
          >
            Öppna ligan / Open league
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function PrivateLeagueJoinForm() {
  const [joinState, joinAction, joinPending] = useActionState(
    joinPrivateLeagueAccessAction,
    INITIAL_JOIN_PRIVATE_LEAGUE_ACCESS_STATE,
  );

  const joinFailed = joinState.status === "invalid" || joinState.status === "error";

  return (
    <div>
      <form action={joinAction} className="grid gap-4">
        <label className="text-xs text-[#9aa7b8]">
          Inbjudningskod / Invite token
          <input
            name="inviteToken"
            required
            minLength={43}
            maxLength={43}
            pattern="[A-Za-z0-9_-]{43}"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </label>
        <p className="-mt-1 text-xs leading-5 text-[#8391a4]">
          Behandla koden som en hemlighet. StockBox visar ingen privat liga innan koden har verifierats. / Treat the token as a secret. StockBox reveals no private league before the token is verified.
        </p>
        <Button type="submit" disabled={joinPending}>
          {joinPending ? "Verifierar / Verifying…" : "Gå med via inbjudan / Join with invite"}
        </Button>
      </form>

      {joinFailed ? (
        <p className="mt-4 text-sm text-amber-200" role="status">
          Inbjudan kunde inte verifieras eller användas. Ingen ligainformation lämnas ut. / The invite could not be verified or used. No league information is disclosed.
        </p>
      ) : null}

      {joinState.status === "joined" ? (
        <div className="mt-5 rounded-lg border border-emerald-300/20 bg-emerald-950/15 p-4" role="status">
          <p className="font-semibold text-emerald-100">Medlemskap verifierat / Membership verified</p>
          <p className="mt-2 text-xs leading-5 text-emerald-100/80">
            Ligan kan nu visas i din privata medlemslista. / The league can now appear in your private member list.
          </p>
          <Link
            href="/paper-trading/private-leagues"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-emerald-300/25 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-300/10"
          >
            Mina privata ligor / My private leagues
          </Link>
        </div>
      ) : null}
    </div>
  );
}
