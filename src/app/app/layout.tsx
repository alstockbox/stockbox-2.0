import { AppNav } from "@/components/app/nav";
import { requireOwner } from "@/lib/auth/session";
import type { ReactNode } from "react";

export default async function PrivateLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return (
    <>
      <div className="shell">{children}</div>
      <AppNav />
    </>
  );
}
