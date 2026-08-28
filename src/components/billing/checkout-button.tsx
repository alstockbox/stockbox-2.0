"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { PlanKey } from "@/lib/billing/plans";
import type { Locale } from "@/lib/i18n/types";
import { Button } from "@/components/ui/button";

export function CheckoutButton({
  plan,
  enabled,
  label,
  pendingLabel = "Opening checkout...",
  fallbackError = "Checkout could not start.",
  locale = "en"
}: {
  plan: PlanKey;
  enabled: boolean;
  label: string;
  pendingLabel?: string;
  fallbackError?: string;
  locale?: Locale;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, locale }),
      });
      const payload = (await response.json()) as {
        url?: string;
        redirectUrl?: string;
        error?: string;
      };
      if (payload.redirectUrl) {
        window.location.assign(payload.redirectUrl);
        return;
      }
      if (!response.ok || !payload.url) throw new Error(payload.error ?? fallbackError);
      window.location.assign(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallbackError);
      setPending(false);
    }
  }

  return (
    <div>
      <Button className="w-full" type="button" disabled={!enabled || pending} onClick={checkout}>
        {pending ? pendingLabel : label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
