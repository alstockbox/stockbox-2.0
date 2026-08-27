"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PortalButton({
  enabled = true,
  label = "Manage subscription",
  pendingLabel = "Opening billing...",
  fallbackError = "Billing management could not open."
}: {
  enabled?: boolean;
  label?: string;
  pendingLabel?: string;
  fallbackError?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? fallbackError);
      }
      window.location.assign(payload.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallbackError);
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        className="w-full"
        type="button"
        disabled={!enabled || pending}
        onClick={openPortal}
      >
        {pending ? pendingLabel : label}
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </Button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  );
}
