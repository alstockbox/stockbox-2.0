"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createAmbassadorAction,
  type AdminAmbassadorState,
} from "@/app/admin/actions";

const initialState: AdminAmbassadorState = { ok: false, message: "" };
const inputClass = "mt-2 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]";

export function AmbassadorCreateForm() {
  const [state, action, pending] = useActionState(createAmbassadorAction, initialState);

  return (
    <form action={action} className="mt-5 grid gap-4 rounded-lg border border-white/10 bg-[#0d1c2e]/70 p-5 sm:grid-cols-2">
      <label className="text-sm text-[#c9d2df]">
        Name
        <input className={inputClass} name="name" autoComplete="off" required maxLength={80} />
      </label>
      <label className="text-sm text-[#c9d2df]">
        Email
        <input className={inputClass} name="email" type="email" autoComplete="off" required />
      </label>
      <label className="text-sm text-[#c9d2df]">
        Temporary password
        <input className={inputClass} name="password" type="password" minLength={8} autoComplete="new-password" required />
      </label>      <label className="text-sm text-[#c9d2df]">
        Affiliate code <span className="text-[#7f8b9b]">(optional)</span>
        <input className={inputClass} name="code" placeholder="Auto-generated" maxLength={48} />
      </label>
      <label className="text-sm text-[#c9d2df]">
        Commission %
        <input className={inputClass} name="commissionPercent" type="number" min="0" max="100" step="0.1" placeholder="Set per affiliate" required />
      </label>
      <label className="text-sm text-[#c9d2df]">
        Analyses / month
        <input className={inputClass} name="monthlyAnalysisLimit" type="number" min="0" max="100000" step="1" defaultValue="100" required />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <Button disabled={pending}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Creating..." : "Create ambassador"}
        </Button>
        <p className="text-xs text-[#7f8b9b]">The password is handled by Supabase Auth and is never stored in StockBox.</p>
      </div>
      {state.message ? (
        <p className={`sm:col-span-2 text-sm ${state.ok ? "text-emerald-200" : "text-red-200"}`} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
