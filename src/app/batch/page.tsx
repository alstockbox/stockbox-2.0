import type { Metadata } from "next";
import { Container, Section } from "@/components/ui/card";
import { SetupNotice } from "@/components/ui/setup-notice";

export const metadata: Metadata = { title: "Batch analysis" };

export default function BatchPage() {
  return <Section><Container><h1 className="serif text-3xl font-semibold">Batch analysis</h1><div className="mt-7"><SetupNotice title="Feature flag disabled" detail="The entitlement and job schema are ready, but batch execution stays hidden for launch until queue processing and credit rollback are verified." /></div></Container></Section>;
}
