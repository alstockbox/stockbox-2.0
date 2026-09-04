"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Kopiera" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      className="min-h-9 rounded-md border border-white/15 px-3 text-xs font-semibold text-[#f4efe5] hover:bg-white/5"
    >
      {copied ? "Kopierat ✓" : label}
    </button>
  );
}
