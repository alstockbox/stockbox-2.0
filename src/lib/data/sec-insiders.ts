import type { CompanySearchResult, InsiderTransaction, ResearchEvidence } from "@/lib/analysis/types";
import { getSecUserAgent } from "@/lib/env/server";
import { padCik } from "./sec";

type Form4Document = { filingDate:string; accession:string; primaryDocument:string; url:string };
type SubmissionPayload = { filings?:{recent?:{form?:unknown[];filingDate?:unknown[];accessionNumber?:unknown[];primaryDocument?:unknown[]}} };

function tag(block:string,name:string){const match=block.match(new RegExp(`<${name}[^>]*>(?:\\s*<value[^>]*>)?\\s*([^<]+)`,`i`));return match?.[1]?.trim()??null;}
function numberTag(block:string,name:string){const value=tag(block,name);if(value===null)return null;const parsed=Number(value.replace(/,/g,""));return Number.isFinite(parsed)?parsed:null;}
function textBlocks(xml:string,name:string){return [...xml.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,`gi`))].map((match)=>match[1]);}

export function parseForm4Xml(xml:string,meta:{filingDate:string;url:string}):InsiderTransaction[]{
  const owner=textBlocks(xml,"reportingOwner")[0]??"";
  const ownerName=tag(owner,"rptOwnerName");
  const officerTitle=tag(owner,"officerTitle");
  const director=tag(owner,"isDirector")==="1";
  const officer=tag(owner,"isOfficer")==="1";
  const role=[officerTitle, director?"Director":null, officer&&!officerTitle?"Officer":null].filter(Boolean).join(" · ")||ownerName||null;
  const automaticPlan=/10b5-1/i.test(xml);
  return textBlocks(xml,"nonDerivativeTransaction").map((block):InsiderTransaction|null=>{
    const code=tag(block,"transactionCode");
    const date=tag(block,"transactionDate")??meta.filingDate;
    const shares=numberTag(block,"transactionShares");
    const price=numberTag(block,"transactionPricePerShare");
    const acquiredDisposed=tag(block,"transactionAcquiredDisposedCode");
    let transactionType:InsiderTransaction["transactionType"]="other";
    if(code==="P"|| (code==="S"&&acquiredDisposed==="A")) transactionType="open_market_buy";
    else if(code==="S") transactionType="open_market_sell";
    else if(code==="M") transactionType="option_exercise";
    else if(code==="F") transactionType="tax_related";
    const evidence:ResearchEvidence={id:`form4-${meta.filingDate}-${shares??"na"}-${price??"na"}`,kind:"reported_fact",sourceTier:"regulatory_filing",title:`SEC Form 4${ownerName?` — ${ownerName}`:""}`,source:{name:"SEC EDGAR Form 4",url:meta.url,accessedAt:new Date().toISOString(),freshness:"Live SEC filing document."},dataAsOf:date};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    return {transactionType,insiderRole:role,shares,value:shares!==null&&price!==null?shares*price:null,ownershipChange:null,date,automaticPlan,evidence};
  }).filter((item):item is InsiderTransaction=>Boolean(item));
}

async function recentForm4Documents(company:CompanySearchResult,limit=5):Promise<Form4Document[]>{
  const userAgent=getSecUserAgent();
  if(!userAgent||!company.cik)return [];
  const cik=padCik(company.cik);
  const response=await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`,{headers:{"User-Agent":userAgent,Accept:"application/json"},next:{revalidate:3600}});
  if(!response.ok)return [];
  const payload=await response.json() as SubmissionPayload;
  const recent=payload.filings?.recent;
  const forms=recent?.form??[];
  const out:Form4Document[]=[];
  for(let i=0;i<forms.length&&out.length<limit;i+=1){
    if(forms[i]!=="4"&&forms[i]!=="4/A")continue;
    const filingDate=typeof recent?.filingDate?.[i]==="string"?recent.filingDate[i] as string:null;
    const accession=typeof recent?.accessionNumber?.[i]==="string"?recent.accessionNumber[i] as string:null;
    const primaryDocument=typeof recent?.primaryDocument?.[i]==="string"?recent.primaryDocument[i] as string:null;
    if(!filingDate||!accession||!primaryDocument)continue;
    const accessionPath=accession.replace(/-/g,"");
    const url=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}/${encodeURIComponent(primaryDocument)}`;
    out.push({filingDate,accession,primaryDocument,url});
  }
  return out;
}

export async function fetchSecInsiderTransactions(company:CompanySearchResult,limit=5){
  const userAgent=getSecUserAgent();
  if(!userAgent)return {status:"unavailable" as const,reason:"SEC contact is not configured.",transactions:[] as InsiderTransaction[]};
  if(!company.cik)return {status:"unsupported" as const,reason:"SEC Form 4 requires a US SEC CIK.",transactions:[] as InsiderTransaction[]};
  try{
    const docs=await recentForm4Documents(company,limit);
    const transactions:InsiderTransaction[]=[];
    for(const doc of docs){
      const response=await fetch(doc.url,{headers:{"User-Agent":userAgent,Accept:"application/xml,text/xml,*/*"},next:{revalidate:3600}});
      if(!response.ok)continue;
      const xml=await response.text();
      transactions.push(...parseForm4Xml(xml,{filingDate:doc.filingDate,url:doc.url}));
    }
    return {status:"available" as const,reason:null,transactions:transactions.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),source:"SEC EDGAR Form 4"};
  }catch{return {status:"unavailable" as const,reason:"SEC Form 4 filings could not be retrieved.",transactions:[] as InsiderTransaction[]};}
}
