import { createClient } from "@/lib/supabase/server";

export async function getDashboardExtensions(userId:string){
  const supabase=await createClient();
  if(!supabase)return {upcomingEarnings:[],screenerMatches:[]};
  const [{data:watchlist},{data:portfolios},{data:savedScreeners}]=await Promise.all([
    supabase.from("watchlists").select("ticker").eq("user_id",userId),
    supabase.from("portfolios").select("id").eq("user_id",userId),
    supabase.from("saved_screeners").select("id,name").eq("user_id",userId),
  ]);
  const portfolioIds=(portfolios??[]).map((row)=>row.id);
  const {data:holdings}=portfolioIds.length?await supabase.from("holdings").select("ticker").in("portfolio_id",portfolioIds):{data:[]};
  const tickers=[...new Set([...(watchlist??[]).map((row)=>row.ticker),...(holdings??[]).map((row)=>row.ticker)])];
  const now=new Date();
  const future=new Date(now.getTime()+21*86_400_000).toISOString();
  const {data:earnings}=tickers.length?await supabase.from("earnings_events").select("ticker,event_date,fiscal_quarter,fiscal_year,source_provider").in("ticker",tickers).gte("event_date",now.toISOString()).lte("event_date",future).order("event_date").limit(20):{data:[]};
  const screenersById=new Map((savedScreeners??[]).map((row)=>[row.id,row.name]));
  const ids=[...screenersById.keys()];
  const {data:snapshots}=ids.length?await supabase.from("screener_snapshots").select("saved_screener_id,entered_tickers,created_at").eq("user_id",userId).in("saved_screener_id",ids).order("created_at",{ascending:false}).limit(Math.max(30,ids.length*2)):{data:[]};
  const seen=new Set<string>();
  const screenerMatches:Array<{screenerId:string;screenerName:string;enteredTickers:string[];createdAt:string}>=[];
  for(const row of snapshots??[]){
    if(seen.has(row.saved_screener_id))continue;
    seen.add(row.saved_screener_id);
    const entered=(row.entered_tickers??[]) as string[];
    if(entered.length)screenerMatches.push({screenerId:row.saved_screener_id,screenerName:screenersById.get(row.saved_screener_id)??"Saved screener",enteredTickers:entered,createdAt:row.created_at});
  }
  return {upcomingEarnings:(earnings??[]).map((row)=>({ticker:row.ticker,eventDate:row.event_date,fiscalQuarter:row.fiscal_quarter,fiscalYear:row.fiscal_year,provider:row.source_provider})),screenerMatches};
}
