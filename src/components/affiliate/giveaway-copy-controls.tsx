"use client";

import { useState } from "react";

type Props = { code: string; href: string };

export function GiveawayCopyControls({ code, href }: Props) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function copy(value: string, kind: "code" | "link") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  const buttonClass = "rounded border border-white/10 px-2 py-1 text-xs text-[#e1cb95] transition hover:bg-white/5";

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" className={buttonClass} onClick={() => void copy(code, "code")}>
        {copied === "code" ? "Copied" : "Copy code"}
      </button>
      <button type="button" className={buttonClass} onClick={() => void copy(`${window.location.origin}${href}`, "link")}>
        {copied === "link" ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
