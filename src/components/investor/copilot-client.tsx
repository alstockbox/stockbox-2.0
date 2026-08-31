"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";

type Answer={kind:"answer"|"action";answer:string;evidence:Array<{label:string;value:string}>};

export function CopilotClient(){
  const [question,setQuestion]=useState("");
  const [answer,setAnswer]=useState<Answer|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function submit(event:FormEvent){
    event.preventDefault();
    setLoading(true);setError(null);
    try{
      const response=await fetch("/api/investor/copilot",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question})});
      const body=await response.json();
      if(!response.ok||!body?.ok)throw new Error(body?.error||"Copilot request failed.");
      setAnswer(body.data as Answer);
    }catch(err){setError(err instanceof Error?err.message:"Copilot request failed.");}finally{setLoading(false);}
  }
  return <div>
    <form onSubmit={submit} className="space-y-3"><textarea value={question} onChange={(event)=>setQuestion(event.target.value)} required minLength={3} maxLength={500} rows={4} placeholder="Which company on my watchlist trades cheapest relative to its historical P/E?" className="w-full rounded-md border border-white/12 bg-[#07111f] p-3 text-sm"/><Button disabled={loading||question.trim().length<3}>{loading?"Checking StockBox data…":"Ask StockBox"}</Button></form>
    <div className="mt-4 flex flex-wrap gap-2">{["Which stock has the highest fair-value upside?","Which companies currently violate my investment thesis?","What changed in my portfolio this week?","Which holdings have negative estimate revisions?","Alert me if MSFT P/E goes below 22"].map((prompt)=><button type="button" key={prompt} onClick={()=>setQuestion(prompt)} className="rounded-md border border-white/10 px-3 py-2 text-xs text-[#c9d2df] hover:bg-white/8">{prompt}</button>)}</div>
    {error?<p className="mt-5 text-sm text-red-300">{error}</p>:null}
    {answer?<div className="mt-6 rounded-md border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold uppercase text-[#e1cb95]">{answer.kind==="action"?"Structured action":"Grounded answer"}</p><p className="mt-2 text-sm leading-6 text-[#d6deea]">{answer.answer}</p>{answer.evidence.length?<dl className="mt-4 divide-y divide-white/10 text-xs">{answer.evidence.map((item,index)=><div key={`${item.label}-${index}`} className="grid gap-1 py-2 sm:grid-cols-[180px_1fr]"><dt className="font-semibold text-[#e1cb95]">{item.label}</dt><dd className="text-[#c9d2df]">{item.value}</dd></div>)}</dl>:null}</div>:null}
  </div>;
}
