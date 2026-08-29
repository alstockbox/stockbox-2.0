"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { submitFeedbackAction, type SupportActionState } from "@/lib/support/actions";

const initialState: SupportActionState = { ok: false, message: "" };

export function FeedbackForm() {
  const [state, action, pending] = useActionState(submitFeedbackAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold text-[#f4efe5]">How useful is StockBox?</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((rating) => (
            <label key={rating} className="cursor-pointer rounded-md border border-white/12 bg-white/5 px-4 py-2 text-sm hover:border-[#e1cb95]/40">
              <input className="mr-2" type="radio" name="rating" value={rating} required />{rating} ★
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold text-[#f4efe5]">What should we improve?
        <textarea name="comment" required maxLength={4000} rows={7} className="mt-2 w-full rounded-lg border border-white/12 bg-[#07111f] px-3 py-3 font-normal text-[#f4efe5]" placeholder="Tell us what worked, what did not, or what you want next." />
      </label>
      {state.message ? <p role="status" className={`rounded-md border p-3 text-sm ${state.ok ? "border-emerald-400/25 bg-emerald-950/35 text-emerald-100" : "border-red-400/25 bg-red-950/35 text-red-100"}`}>{state.message}</p> : null}
      <Button disabled={pending}>{pending ? "Sending..." : "Send feedback"}</Button>
    </form>
  );
}
