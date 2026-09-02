import Link from "next/link";
import type { ComponentProps } from "react";

export function ButtonLink(props: ComponentProps<typeof Link> & { secondary?: boolean }) {
  const { className = "", secondary, ...rest } = props;
  return <Link className={`button ${secondary ? "secondary" : ""} ${className}`} {...rest} />;
}
