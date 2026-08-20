import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[#b99b5f]/30 bg-[#b99b5f]/10 px-2.5 py-1 text-xs font-semibold text-[#e1cb95]",
        className
      )}
      {...props}
    />
  );
}
