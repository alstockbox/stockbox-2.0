"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportExportActions({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  return (
    <div className="print:hidden flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <p className="max-w-56 text-right text-[11px] leading-4 text-[#7f8b9b]">{hint}</p>
    </div>
  );
}