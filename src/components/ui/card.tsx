import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils/cn";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("surface rounded-lg p-5", className)} {...props} />;
}

export function Section({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn("w-full px-4 py-12 sm:px-6 lg:px-8", className)} {...props} />;
}

export function Container({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl", className)} {...props} />;
}
