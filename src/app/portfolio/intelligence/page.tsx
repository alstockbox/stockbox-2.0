import type { Metadata } from "next";
import { PortfolioIntelligencePanel } from "@/components/portfolio/portfolio-intelligence";
import { ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getPortfolioIntelligenceMap } from "@/lib/investor-intelligence/portfolio-service";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Portfolio Intelligence" };
export const dynamic = "force-dynamic";

export default async function PortfolioIntelligencePage(){
  await requireUser();
  const [map,supabase]=await Promise.all([getPortfolioIntelligenceMap(),createClient()]);
  const {data:portfolios}=supabase?await supabase.from("portfolios").select("id,name,base_currency").order("created_at"):{data:[]};
  return <Section><Container className="max-w-6xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#e1cb95]">PORTFOLIO INTELLIGENCE V2</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Portfolio research operating view</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Position-weighted StockBox characteristics, concentration and exposures. FX-incompatible holdings remain explicitly outside weighted calculations until a trustworthy conversion layer exists.</p></div><ButtonLink href="/portfolio" variant="secondary">Manage holdings</ButtonLink></div>
    <div className="mt-8 space-y-6">{portfolios?.length?portfolios.map((portfolio)=><div key={portfolio.id}><Card><h2 className="text-xl font-semibold text-[#f4efe5]">{portfolio.name}</h2><p className="mt-1 text-xs text-[#9aa7b8]">Base currency {portfolio.base_currency}</p></Card><PortfolioIntelligencePanel data={map.get(portfolio.id)}/></div>):<Card><p className="text-sm text-[#9aa7b8]">Create a portfolio and add holdings before portfolio intelligence can be calculated.</p></Card>}</div>
  </Container></Section>;
}
