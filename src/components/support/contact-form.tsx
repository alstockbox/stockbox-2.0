"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/types";
import { getSupportCopy } from "@/lib/support/copy";
import { submitContactAction, type SupportActionState } from "@/lib/support/actions";

const initialState: SupportActionState = { ok: false, message: "" };

export function ContactForm({ locale }: { locale: Locale }) {
  const [state, action, pending] = useActionState(submitContactAction, initialState);
  const copy = getSupportCopy(locale).contact;
  const input = "mt-2 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-[#f4efe5]">{copy.name}<input className={input} name="name" required maxLength={120} autoComplete="name" /></label>
        <label className="text-sm font-semibold text-[#f4efe5]">{copy.email}<input className={input} name="email" type="email" required maxLength={320} autoComplete="email" /></label>
      </div>
      <label className="block text-sm font-semibold text-[#f4efe5]">{copy.subject}<input className={input} name="subject" required maxLength={160} /></label>
      <label className="block text-sm font-semibold text-[#f4efe5]">{copy.message}<textarea name="message" required maxLength={6000} rows={8} className="mt-2 w-full rounded-lg border border-white/12 bg-[#07111f] px-3 py-3 font-normal text-[#f4efe5]" placeholder={copy.placeholder} /></label>
      {state.message ? <p role="status" className={`rounded-md border p-3 text-sm ${state.ok ? "border-emerald-400/25 bg-emerald-950/35 text-emerald-100" : "border-red-400/25 bg-red-950/35 text-red-100"}`}>{state.message}</p> : null}
      <Button disabled={pending}>{pending ? copy.sending : copy.send}</Button>
    </form>
  );
}
