import { cn } from "@/lib/utils/cn";

export function Meter({
  value,
  label,
  className
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <div className="flex items-center justify-between text-xs text-[#9aa7b8]">
          <span>{label}</span>
          <span className="number">{Math.round(value)}/100</span>
        </div>
      ) : null}
      <div
        className="h-2 rounded-full bg-white/10"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-[#b99b5f] transition-[width] duration-500"
          style={{ width }}
        />
      </div>
    </div>
  );
}
