import type { Metadata } from "next";
import { CopilotClient } from "@/components/investor/copilot-client";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata:Metadata={title:"StockBox Copilot"};
export default async function CopilotPage(){
  await requireUser();
  return <Section><Container className="max-w-4xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#e1cb95]">STOCKBOX COPILOT V2</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Ask your own StockBox research system</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Answers come from persisted StockBox watchlists, portfolios, theses, alerts, metric snapshots and estimate history. It does not invent unavailable values. Safe requests can create monitoring alerts; it never executes trades.</p></div><ButtonLink href="/dashboard" variant="secondary">Command Center</ButtonLink></div><Card className="mt-8"><CopilotClient/></Card></Container></Section>;
}
