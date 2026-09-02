"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="grid gap-4">
      <div className="field">
        <label htmlFor="email">E-post</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Lösenord</label>
        <div className="flex rounded-[8px] border border-[var(--border)] bg-white">
          <input
            className="min-h-[46px] min-w-0 flex-1 rounded-[8px] border-0 bg-transparent px-3"
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <button
            className="grid min-h-[46px] w-12 place-items-center text-[var(--muted)]"
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {state.error ? <p className="rounded-[8px] bg-red-50 p-3 text-sm font-bold text-[var(--danger)]">{state.error}</p> : null}
      <button className="button w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" size={18} /> : null}
        Logga in
      </button>
    </form>
  );
}
