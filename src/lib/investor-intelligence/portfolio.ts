import { readSnapshotMetric } from "./metrics";
import type { CompanyMetricSnapshot } from "./types";

export type PortfolioIntelligencePosition = {
  ticker: string;
  quantity: number;
  holdingCurrency: string;
  catalogCurrency: string | null;
  sector: string | null;
  country: string | null;
  marketCap: number | null;
  snapshot: CompanyMetricSnapshot | null;
};

function finitePositive(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function weightedAverage(items: Array<{ weight:number; value:number | null }>) {
  const valid=items.filter((item): item is {weight:number;value:number}=>typeof item.value === "number" && Number.isFinite(item.value) && item.weight>0);
  const total=valid.reduce((sum,item)=>sum+item.weight,0);
  return total ? valid.reduce((sum,item)=>sum+item.value*item.weight,0)/total : null;
}
function exposure(items:Array<{label:string|null;weight:number}>) {
  const map=new Map<string,number>();
  for(const item of items){ const label=item.label ?? "Unknown"; map.set(label,(map.get(label)??0)+item.weight); }
  return [...map.entries()].map(([label,weight])=>({label,weight})).sort((a,b)=>b.weight-a.weight);
}

export function buildPortfolioIntelligence(input:{baseCurrency:string;positions:PortfolioIntelligencePosition[]}) {
  const base=input.baseCurrency.toUpperCase();
  const positions=input.positions.map((position)=>{
    const price=position.snapshot?.price ?? null;
    const compatible=position.holdingCurrency.toUpperCase()===base && position.catalogCurrency?.toUpperCase()===base && finitePositive(price) && finitePositive(position.quantity);
    return {...position, marketValue:compatible ? position.quantity*(price as number) : null};
  });
  const totalMarketValue=positions.reduce((sum,position)=>sum+(position.marketValue??0),0);
  const totalPositions=positions.length;
  const coveredPositions=positions.filter((position)=>position.marketValue!==null);
  const weighted=coveredPositions.map((position)=>({...position,weight:totalMarketValue ? (position.marketValue??0)/totalMarketValue : 0}));
  const metric=(key:string)=>weightedAverage(weighted.map((item)=>({weight:item.weight,value:item.snapshot ? readSnapshotMetric(item.snapshot,key) : null})));
  const sortedWeights=weighted.map((item)=>item.weight).sort((a,b)=>b-a);
  const sumTop=(n:number)=>sortedWeights.slice(0,n).reduce((sum,value)=>sum+value,0);
  const highValuationWeight=weighted.filter((item)=>(item.snapshot?.valuation.historicalPePercentile??0)<1 && (item.snapshot?.valuation.historicalPePercentile??0)>=0.75).reduce((sum,item)=>sum+item.weight,0);
  const highLeverageWeight=weighted.filter((item)=>(item.snapshot?.fundamentals.netDebtToEbitda??0)>=3).reduce((sum,item)=>sum+item.weight,0);
  const scoreDistribution={
    high: weighted.filter((item)=>(item.snapshot?.score??0)>=75).reduce((sum,item)=>sum+item.weight,0),
    medium: weighted.filter((item)=>{const score=item.snapshot?.score;return typeof score==="number"&&score>=50&&score<75;}).reduce((sum,item)=>sum+item.weight,0),
    low: weighted.filter((item)=>typeof item.snapshot?.score==="number"&&(item.snapshot?.score??0)<50).reduce((sum,item)=>sum+item.weight,0),
  };
  return {
    coverage:{
      positionCount:totalPositions,
      coveredPositionCount:coveredPositions.length,
      marketValueCoverage:totalPositions ? coveredPositions.length/totalPositions : 0,
      note:"Weighted metrics include only positions whose holding currency, catalog price currency and portfolio base currency match. No FX conversion is inferred.",
    },
    totalCompatibleMarketValue: totalMarketValue || null,
    scores:{
      stockBox:metric("score"), quality:metric("dimensions.quality"), valuation:metric("dimensions.valuation"), growth:metric("dimensions.growth"), financialHealth:metric("dimensions.financialHealth"), risk:metric("dimensions.risk"), dividend:weightedAverage(weighted.map((item)=>({weight:item.weight,value:item.snapshot?.dividend.yield??null}))),
    },
    characteristics:{
      pe:metric("valuation.pe"), fcfYield:metric("valuation.fcfYield"), revenueGrowth:metric("fundamentals.revenueGrowth"), roic:metric("fundamentals.roic"), netDebtToEbitda:metric("fundamentals.netDebtToEbitda"), fairValueUpside:metric("fairValueUpside"),
    },
    concentration:{topHolding:sumTop(1),top3:sumTop(3),top5:sumTop(5),highValuationWeight,highLeverageWeight},
    exposures:{sector:exposure(weighted.map((item)=>({label:item.sector,weight:item.weight}))),country:exposure(weighted.map((item)=>({label:item.country,weight:item.weight}))),scoreDistribution},
    positions:weighted.map((item)=>({ticker:item.ticker,weight:item.weight,marketValue:item.marketValue,score:item.snapshot?.score??null,sector:item.sector,country:item.country,historicalPePercentile:item.snapshot?.valuation.historicalPePercentile??null,netDebtToEbitda:item.snapshot?.fundamentals.netDebtToEbitda??null})),
    excludedPositions:positions.filter((item)=>item.marketValue===null).map((item)=>({ticker:item.ticker,holdingCurrency:item.holdingCurrency,catalogCurrency:item.catalogCurrency,reason:"No compatible base-currency market value available."})),
  };
}
