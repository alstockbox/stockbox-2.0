import { createClient } from "@/lib/supabase/server";
import { canonicalMetricToDisplay, getInvestorMetric, metricInputToCanonical } from "./metric-catalog";
import { parseCopilotAlertAction, resolveCopilotIntent } from "./copilot";
import type { CompanyMetricSnapshot } from "./types";
import { buildEstimateRevisionSummary, type EstimateSnapshotPoint } from "./estimates";

export type CopilotAnswer={kind:"answer"|"action";answer:string;evidence:Array<{label:string;value:string}>;action?:{type:"alert_created";ticker:string;metric:string;operator:string;threshold:string}};

export async function answerCopilotQuestion(userId:string,question:string):Promise<CopilotAnswer>{
  const supabase=await createClient();
  if(!supabase)return {kind:"answer",answer:"StockBox data is temporarily unavailable.",evidence:[]};
  const alert=parseCopilotAlertAction(question);
  if(alert){
    const metric=getInvestorMetric(alert.metricKey);
    if(!metric)return {kind:"answer",answer:"That alert metric is not supported by the canonical StockBox metric catalog.",evidence:[]};
    const threshold=metricInputToCanonical(metric,alert.displayThreshold);
    const {error}=await supabase.from("user_alerts").insert({user_id:userId,ticker:alert.ticker,kind:metric.group,metric_key:metric.key,operator:alert.operator,threshold,enabled:true,delivery_channels:["in_app"]});
    if(error)return {kind:"answer",answer:"The alert could not be saved.",evidence:[]};
    return {kind:"action",answer:`Created an in-app alert for ${alert.ticker}: ${metric.label} ${alert.operator} ${canonicalMetricToDisplay(metric,threshold)}.`,evidence:[{label:"Metric",value:metric.key}],action:{type:"alert_created",ticker:alert.ticker,metric:metric.label,operator:alert.operator,threshold:canonicalMetricToDisplay(metric,threshold)}};
  }

  const intent=resolveCopilotIntent(question);
  if(intent==="watchlist_historical_cheapest"||intent==="highest_fair_value_upside"){
    const {data:watchlist}=await supabase.from("watchlists").select("ticker").eq("user_id",userId);
    const tickers=[...new Set((watchlist??[]).map((row)=>row.ticker))];
    if(!tickers.length)return {kind:"answer",answer:"Your watchlist is empty.",evidence:[]};
    const {data:catalog}=await supabase.from("company_latest_metrics").select("ticker,company_name,normalized").in("ticker",tickers);
    const rows=(catalog??[]).map((row)=>({ticker:row.ticker,companyName:row.company_name,snapshot:row.normalized as CompanyMetricSnapshot}));
    const available=intent==="watchlist_historical_cheapest"?rows.filter((row)=>typeof row.snapshot.valuation.historicalPePercentile==="number").sort((a,b)=>(a.snapshot.valuation.historicalPePercentile??1)-(b.snapshot.valuation.historicalPePercentile??1)):rows.filter((row)=>typeof row.snapshot.fairValueUpside==="number").sort((a,b)=>(b.snapshot.fairValueUpside??-Infinity)-(a.snapshot.fairValueUpside??-Infinity));
    const best=available[0];
    if(!best)return {kind:"answer",answer:"None of the companies on your watchlist currently have the required StockBox data for that comparison.",evidence:[]};
    if(intent==="watchlist_historical_cheapest")return {kind:"answer",answer:`${best.ticker} currently has the lowest available historical P/E percentile on your watchlist. This is relative valuation context, not a claim that the stock is intrinsically cheap.`,evidence:[{label:"Historical P/E percentile",value:`${Math.round((best.snapshot.valuation.historicalPePercentile??0)*100)}th`},{label:"Current P/E",value:best.snapshot.valuation.pe===null?"Unavailable":`${best.snapshot.valuation.pe.toFixed(1)}x`}]};
    return {kind:"answer",answer:`${best.ticker} currently has the highest available StockBox fair-value upside on your watchlist.`,evidence:[{label:"Fair-value upside",value:`${((best.snapshot.fairValueUpside??0)*100).toFixed(1)}%`},{label:"StockBox Score",value:best.snapshot.score===null?"Unavailable":`${Math.round(best.snapshot.score)}/100`}]};
  }

  if(intent==="thesis_violations"){
    const {data}=await supabase.from("investment_theses").select("ticker,title,status").eq("user_id",userId).in("status",["WATCH","WEAKENING","BROKEN"]).is("archived_at",null).order("updated_at",{ascending:false});
    if(!data?.length)return {kind:"answer",answer:"No active investment thesis is currently in WATCH, WEAKENING or BROKEN status.",evidence:[]};
    return {kind:"answer",answer:`${data.length} active thesis${data.length===1?"":"es"} currently require attention: ${data.map((row)=>`${row.ticker} (${row.status})`).join(", ")}.`,evidence:data.slice(0,10).map((row)=>({label:row.ticker,value:`${row.status} — ${row.title}`}))};
  }

  if(intent==="portfolio_changes"){
    const {data:portfolios}=await supabase.from("portfolios").select("id").eq("user_id",userId);
    const ids=(portfolios??[]).map((row)=>row.id);
    const {data:holdings}=ids.length?await supabase.from("holdings").select("ticker").in("portfolio_id",ids):{data:[]};
    const tickers=[...new Set((holdings??[]).map((row)=>row.ticker))];
    if(!tickers.length)return {kind:"answer",answer:"No portfolio holdings are available.",evidence:[]};
    const since=new Date(Date.now()-7*86_400_000).toISOString();
    const {data:changes}=await supabase.from("material_changes").select("ticker,materiality,reasoning,created_at").eq("user_id",userId).in("ticker",tickers).gte("created_at",since).in("materiality",["IMPORTANT","THESIS_CHANGING"]).order("created_at",{ascending:false}).limit(15);
    if(!changes?.length)return {kind:"answer",answer:"StockBox has not recorded an IMPORTANT or THESIS_CHANGING portfolio change in the last seven days.",evidence:[]};
    return {kind:"answer",answer:`StockBox recorded ${changes.length} important portfolio change${changes.length===1?"":"s"} in the last seven days.`,evidence:changes.map((row)=>({label:`${row.ticker} · ${row.materiality}`,value:row.reasoning}))};
  }

  if(intent==="negative_estimate_revisions"){
    const {data:portfolios}=await supabase.from("portfolios").select("id").eq("user_id",userId);
    const ids=(portfolios??[]).map((row)=>row.id);
    const {data:holdings}=ids.length?await supabase.from("holdings").select("ticker").in("portfolio_id",ids):{data:[]};
    const tickers=[...new Set((holdings??[]).map((row)=>row.ticker))];
    const negative:Array<{ticker:string;label:string;average:number|null}>=[];
    for(const ticker of tickers){
      const {data:points}=await supabase.from("estimate_snapshots").select("captured_at,revenue_consensus,eps_consensus,target_price,analyst_count,high_estimate,low_estimate").eq("ticker",ticker).order("captured_at").limit(100);
      const mapped:EstimateSnapshotPoint[]=(points??[]).map((row)=>({capturedAt:row.captured_at,revenueConsensus:row.revenue_consensus===null?null:Number(row.revenue_consensus),epsConsensus:row.eps_consensus===null?null:Number(row.eps_consensus),targetPrice:row.target_price===null?null:Number(row.target_price),analystCount:row.analyst_count===null?null:Number(row.analyst_count),highEstimate:row.high_estimate===null?null:Number(row.high_estimate),lowEstimate:row.low_estimate===null?null:Number(row.low_estimate)}));
      if(!mapped.length)continue;
      const summary=buildEstimateRevisionSummary(mapped);
      if(summary.momentum.label==="Negative"||summary.momentum.label==="Strong Negative")negative.push({ticker,label:summary.momentum.label,average:summary.momentum.averageRevision});
    }
    if(!negative.length)return {kind:"answer",answer:"No holdings with available estimate history currently show Negative or Strong Negative estimate momentum. Holdings without estimate history are not classified.",evidence:[]};
    return {kind:"answer",answer:`${negative.length} holding${negative.length===1?"":"s"} currently show negative estimate momentum.`,evidence:negative.map((item)=>({label:item.ticker,value:`${item.label}${item.average===null?"":` · mean ${(item.average*100).toFixed(1)}%`}`}))};
  }

  return {kind:"answer",answer:"I can answer grounded questions about your watchlist valuation, fair-value upside, thesis violations, recent portfolio changes and estimate revisions. I can also create monitoring alerts such as “Alert me if MSFT P/E goes below 22”.",evidence:[]};
}
