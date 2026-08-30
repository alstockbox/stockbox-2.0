"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectPayoutButton({ connected = false }: { connected?: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function openSetup() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/affiliate/connect", { method: "POST" });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Payout setup could not be opened.");
      }
      window.location.assign(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payout setup could not be opened.");
      setPending(false);
    }
  }

  return (
    <div className="mt-5">
      <Button type="button" variant="secondary" onClick={openSetup} disabled={pending}>
        {pending ? "Opening Stripe..." : connected ? "Continue payout setup" : "Set up payouts"}
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </Button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
