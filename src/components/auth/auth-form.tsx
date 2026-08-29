"use client";

import { useActionState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import type { AuthActionState } from "@/lib/auth/actions";
import type { Locale } from "@/lib/i18n/types";
import { Button } from "@/components/ui/button";

type AuthFormProps = {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  submitLabel: string;
  password?: boolean;
  email?: boolean;
  emailLabel?: string;
  passwordLabel?: string;
  workingLabel?: string;
  locale?: Locale;
  referralCode?: string | null;
};

const initialState: AuthActionState = { ok: false, message: "" };

export function AuthForm({ action, submitLabel, password = true, email = true, emailLabel = "Email", passwordLabel = "Password", workingLabel = "Working...", locale = "en", referralCode = null }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {referralCode ? <input type="hidden" name="referralCode" value={referralCode} /> : null}
      {email ? (
        <label className="block text-sm font-medium text-[#d6deea]">
          {emailLabel}
          <span className="relative mt-2 block">
            <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#7f8b9b]" aria-hidden="true" />
            <input name="email" type="email" autoComplete="email" required className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] pl-10 pr-3 text-[#f4efe5]" />
          </span>
        </label>
      ) : null}
      {password ? (
        <label className="block text-sm font-medium text-[#d6deea]">
          {passwordLabel}
          <span className="relative mt-2 block">
            <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#7f8b9b]" aria-hidden="true" />
            <input name="password" type="password" minLength={8} autoComplete={email ? "current-password" : "new-password"} required className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] pl-10 pr-3 text-[#f4efe5]" />
          </span>
        </label>
      ) : null}
      {state.message ? (
        <p role="status" className={`rounded-md border p-3 text-sm ${state.ok ? "border-emerald-400/25 bg-emerald-950/35 text-emerald-100" : "border-red-400/25 bg-red-950/35 text-red-100"}`}>
          {state.message}
        </p>
      ) : null}
      <Button className="w-full" disabled={pending}>
        {pending ? workingLabel : submitLabel}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
