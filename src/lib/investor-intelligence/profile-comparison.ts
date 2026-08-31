import { weightsForSectorAndProfile } from "@/lib/analysis/config";
import type { InvestmentProfile, ScoreDimensionKey, Sector } from "@/lib/analysis/types";

const PROFILES: InvestmentProfile[] = ["balanced","growth","quality","value","dividend","long_term","short_term"];

export function buildProfileScoreComparison(input:{sector:Sector;dimensions:Partial<Record<ScoreDimensionKey,number|null>>}){
  return PROFILES.map((profile)=>{
    const weights=weightsForSectorAndProfile(input.sector,profile);
    const available=(Object.keys(weights) as ScoreDimensionKey[]).filter((key)=>typeof input.dimensions[key]==="number"&&Number.isFinite(input.dimensions[key]));
    const availableWeight=available.reduce((sum,key)=>sum+weights[key],0);
    const score=availableWeight>0?available.reduce((sum,key)=>sum+(input.dimensions[key] as number)*weights[key],0)/availableWeight:null;
    const topWeights=(Object.keys(weights) as ScoreDimensionKey[]).map((key)=>({key,weight:weights[key],score:input.dimensions[key]??null})).sort((a,b)=>b.weight-a.weight).slice(0,4);
    return {profile,score,coverageWeight:availableWeight,topWeights};
  });
}
