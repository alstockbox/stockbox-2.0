import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { fetchSecInsiderTransactions } from "@/lib/data/sec-insiders";

export async function getInsiderIntelligence(ticker:string,companyName:string){
  try{
    const candidates=await searchCompanies(ticker);
    const resolution=resolveCanonicalCompanySelection({ticker,canonicalTicker:ticker,name:companyName},candidates);
    if(!resolution.ok)return {status:"unavailable" as const,reason:`Company identity could not be resolved: ${resolution.reason}`,transactions:[]};
    return fetchSecInsiderTransactions(resolution.company,6);
  }catch{return {status:"unavailable" as const,reason:"Insider provider lookup failed.",transactions:[]};}
}
