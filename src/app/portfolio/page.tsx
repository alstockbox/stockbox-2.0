import type { Metadata } from "next";
import { BriefcaseBusiness, Plus } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addHoldingAction, createPortfolioAction } from "@/lib/workspace/actions";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  const supabase = user ? await createClient() : null;
  const { data: portfolios } = supabase ? await supabase.from("portfolios").select("id,name,base_currency,created_at").order("created_at") : { data: [] };
  const ids = portfolios?.map((item) => item.id) ?? [];
  const { data: holdings } = supabase && ids.length ? await supabase.from("holdings").select("id,portfolio_id,ticker,quantity,average_cost,currency").in("portfolio_id", ids) : { data: [] };
  return (
    <Section><Container>
      <p className="text-sm font-semibold text-[#e1cb95]">Holdings workspace</p><h1 className="serif mt-2 text-3xl font-semibold">Portfolio</h1>
      {!user ? <Card className="mt-8"><p className="text-sm text-[#c9d2df]">Log in to keep holdings private and persistent.</p><ButtonLink href="/auth/login" className="mt-4">Log in</ButtonLink></Card> : <>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Card><h2 className="font-semibold">Create portfolio</h2><form action={createPortfolioAction} className="mt-4 flex gap-2"><label className="sr-only" htmlFor="portfolio-name">Portfolio name</label><input id="portfolio-name" name="name" required placeholder="Long-term portfolio" className="h-10 min-w-0 flex-1 rounded-md border border-white/12 bg-[#07111f] px-3" /><Button><Plus className="h-4 w-4" aria-hidden="true" />Create</Button></form></Card>
          <Card><h2 className="font-semibold">Add holding</h2>{portfolios?.length ? <form action={addHoldingAction} className="mt-4 grid gap-2 sm:grid-cols-2"><select name="portfolioId" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3">{portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input name="ticker" required placeholder="Ticker" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" /><input name="quantity" required type="number" min="0.000001" step="any" placeholder="Quantity" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" /><input name="averageCost" required type="number" min="0" step="any" placeholder="Average cost (SEK)" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3" /><Button className="sm:col-span-2"><Plus className="h-4 w-4" aria-hidden="true" />Add holding</Button></form> : <p className="mt-3 text-sm text-[#9aa7b8]">Create a portfolio first.</p>}</Card>
        </div>
        <div className="mt-6 overflow-hidden rounded-lg border border-white/10">{holdings?.length ? holdings.map((holding) => <div key={holding.id} className="grid gap-2 border-b border-white/10 bg-[#0d1c2e]/70 px-4 py-4 last:border-0 sm:grid-cols-[100px_1fr_1fr]"><span className="font-semibold text-[#e1cb95]">{holding.ticker}</span><span className="number text-sm">{Number(holding.quantity).toLocaleString()} shares</span><span className="number text-sm text-[#9aa7b8]">Avg. {Number(holding.average_cost).toLocaleString()} {holding.currency}</span></div>) : <div className="flex items-center gap-3 bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]"><BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />No holdings added yet.</div>}</div>
      </>}
    </Container></Section>
  );
}
