import Image from "next/image";
import { clsx } from "clsx";

type StockBoxLogoProps = {
  size?: number;
  alt?: string;
  className?: string;
  priority?: boolean;
};

export function StockBoxLogo({
  size = 48,
  alt = "StockBox",
  className,
  priority = false,
}: StockBoxLogoProps) {
  return (
    <Image
      src="/images/stockbox-logo.png"
      width={size}
      height={size}
      alt={alt}
      priority={priority}
      className={clsx("shrink-0 object-contain", className)}
    />
  );
}
