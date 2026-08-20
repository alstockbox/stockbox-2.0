"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { PlanKey } from "@/lib/billing/plans";
import { Button, ButtonLink } from "@/components/ui/button";

export function CheckoutButton({ plan, enabled }: { plan: PlanKey; enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (plan === "free") {
    return <ButtonLink href="/auth/signup" className="w-full">Start free <ArrowRight className="h-4 w-4" aria-hidden="true" /></ButtonLink>;
  }

  async function checkout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Checkout could not start.");
      window.location.assign(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout could not start.");
      setPending(false);
    }
  }

  return (
    <div>
      <Button className="w-full" type="button" disabled={!enabled || pending} onClick={checkout} title={enabled ? undefined : "Stripe and authentication setup required"}>
        {pending ? "Opening checkout..." : `Choose ${plan}`}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
