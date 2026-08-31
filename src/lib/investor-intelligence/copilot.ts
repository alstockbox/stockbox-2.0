export type CopilotIntent = "watchlist_historical_cheapest" | "highest_fair_value_upside" | "thesis_violations" | "portfolio_changes" | "negative_estimate_revisions" | "unknown";

export function resolveCopilotIntent(question:string):CopilotIntent{
  const q=question.toLowerCase();
  if(q.includes("watchlist")&&(q.includes("cheapest")||q.includes("10-year")||q.includes("10 year"))&&(q.includes("valuation")||q.includes("p/e")))return "watchlist_historical_cheapest";
  if(q.includes("fair")&&q.includes("value")&&q.includes("upside"))return "highest_fair_value_upside";
  if(q.includes("thesis")&&(q.includes("violate")||q.includes("fail")||q.includes("broken")||q.includes("weaken")))return "thesis_violations";
  if(q.includes("portfolio")&&(q.includes("changed")||q.includes("change")||q.includes("week")))return "portfolio_changes";
  if(q.includes("estimate")&&(q.includes("negative")||q.includes("down")||q.includes("revision")))return "negative_estimate_revisions";
  return "unknown";
}

type AlertAction={ticker:string;metricKey:string;operator:"below"|"above";displayThreshold:number;inputKind:"number"|"percent"};

export function parseCopilotAlertAction(question:string):AlertAction|null{
  const q=question.trim();
  if(!/^alert\s+me\s+if\s+/i.test(q))return null;
  const ticker=q.match(/\b([A-Z]{1,6}(?:[-.][A-Z])?)\b/)?.[1];
  const direction=/\bbelow\b/i.test(q)?"below":/\babove\b/i.test(q)?"above":null;
  const thresholdMatch=q.match(/(?:below|above)\s+(-?\d+(?:\.\d+)?)\s*(%)?/i);
  if(!ticker||!direction||!thresholdMatch)return null;
  const displayThreshold=Number(thresholdMatch[1]);
  if(!Number.isFinite(displayThreshold))return null;
  const lower=q.toLowerCase();
  if(/\bp\/e\b|price\s*\/\s*earnings/.test(lower))return {ticker,metricKey:"valuation.pe",operator:direction,displayThreshold,inputKind:"number"};
  if(/fcf\s*yield|free cash flow yield/.test(lower))return {ticker,metricKey:"valuation.fcfYield",operator:direction,displayThreshold,inputKind:"percent"};
  if(/fair\s*value\s*upside/.test(lower))return {ticker,metricKey:"fairValueUpside",operator:direction,displayThreshold,inputKind:"percent"};
  if(/stockbox\s*score|\bscore\b/.test(lower))return {ticker,metricKey:"score",operator:direction,displayThreshold,inputKind:"number"};
  if(/\bprice\b/.test(lower))return {ticker,metricKey:"price",operator:direction,displayThreshold,inputKind:"number"};
  return null;
}
