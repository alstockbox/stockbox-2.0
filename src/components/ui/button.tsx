import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const variants = {
  primary: "bg-[#b99b5f] text-[#07111f] hover:bg-[#d0b579]",
  secondary: "border border-white/15 bg-white/7 text-[#f4efe5] hover:bg-white/12",
  ghost: "text-[#f4efe5] hover:bg-white/8",
  danger: "bg-red-950/70 text-red-100 border border-red-400/30 hover:bg-red-900/80"
};

const base = "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1cb95]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f] sm:h-10";

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(base, "disabled:cursor-not-allowed disabled:opacity-50", variants[variant], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  className,
  variant = "primary",
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Link> & { variant?: ButtonProps["variant"]; children: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
