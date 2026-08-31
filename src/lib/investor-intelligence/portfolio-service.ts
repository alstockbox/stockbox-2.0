import { createClient } from "@/lib/supabase/server";
import type { CompanyMetricSnapshot } from "./types";
import { buildPortfolioIntelligence } from "./portfolio";

export async function getPortfolioIntelligenceMap() {
  const supabase = await createClient();
  if (!supabase) return new Map<string, ReturnType<typeof buildPortfolioIntelligence>>();
  const { data: portfolios } = await supabase.from("portfolios").select("id,base_currency");
  const ids=(portfolios??[]).map((row)=>row.id);
  if (!ids.length) return new Map();
  const { data: holdings } = await supabase.from("holdings").select("portfolio_id,ticker,quantity,currency").in("portfolio_id",ids);
  const tickers=[...new Set((holdings??[]).map((row)=>row.ticker))];
  const { data: catalog } = tickers.length ? await supabase.from("company_latest_metrics").select("ticker,currency,sector,country,market_cap,normalized").in("ticker",tickers) : {data:[]};
  const catalogByTicker=new Map((catalog??[]).map((row)=>[row.ticker,row]));
  const result=new Map<string, ReturnType<typeof buildPortfolioIntelligence>>();
  for(const portfolio of portfolios??[]){
    const positions=(holdings??[]).filter((row)=>row.portfolio_id===portfolio.id).map((holding)=>{
      const item=catalogByTicker.get(holding.ticker);
      return {ticker:holding.ticker,quantity:Number(holding.quantity),holdingCurrency:holding.currency,catalogCurrency:item?.currency??null,sector:item?.sector??null,country:item?.country??null,marketCap:item?.market_cap===null||item?.market_cap===undefined?null:Number(item.market_cap),snapshot:item?.normalized ? item.normalized as CompanyMetricSnapshot : null};
    });
    result.set(portfolio.id,buildPortfolioIntelligence({baseCurrency:portfolio.base_currency,positions}));
  }
  return result;
}
