import type { AnalysisReport, CompanySearchResult } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAlertEventKey } from "./alerts";
import { upsertCompanyMetricCatalog } from "./catalog";
import { evaluateInvestorIntelligence } from "./pipeline";
import {
  getActiveThesis,
  getEnabledAlerts,
  getLatestCompanySnapshot,
  getLatestThesisRuleResults,
  persistCompanySnapshot,
  persistMaterialChanges,
  persistThesisEvaluation,
  recordTriggeredAlert,
  updateMonitoringState,
} from "./repository";
import { buildCompanyMetricSnapshot } from "./snapshot";

function errorClass(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(":", 1)[0].slice(0, 80) || "investor_intelligence_error";
}

async function hasMonitoringDependency(userId:string,ticker:string,hasThesis:boolean,hasAlerts:boolean){
  if(hasThesis||hasAlerts)return true;
  const supabase=createAdminClient();
  if(!supabase)return false;
  const {data:watch}=await supabase.from("watchlists").select("id").eq("user_id",userId).eq("ticker",ticker).limit(1).maybeSingle();
  if(watch)return true;
  const {data:portfolios}=await supabase.from("portfolios").select("id").eq("user_id",userId);
  const ids=(portfolios??[]).map((row)=>row.id);
  if(!ids.length)return false;
  const {data:holding}=await supabase.from("holdings").select("id").in("portfolio_id",ids).eq("ticker",ticker).limit(1).maybeSingle();
  return Boolean(holding);
}

async function notifyThesisTransition(input:{userId:string;ticker:string;companyName:string;thesisId:string;snapshotId:string;previousStatus:string;newStatus:string;newlyFailed:string[];newlyRecovered:string[]}){
  if(input.previousStatus===input.newStatus&&!input.newlyFailed.length&&!input.newlyRecovered.length)return;
  const supabase=createAdminClient();
  if(!supabase)return;
  const eventKey=`thesis:${input.thesisId}:${input.snapshotId}:${input.previousStatus}:${input.newStatus}:${input.newlyFailed.join(",")}:${input.newlyRecovered.join(",")}`;
  const details=[input.previousStatus!==input.newStatus?`${input.previousStatus} → ${input.newStatus}`:null,input.newlyFailed.length?`Failed: ${input.newlyFailed.join(", ")}`:null,input.newlyRecovered.length?`Recovered: ${input.newlyRecovered.join(", ")}`:null].filter(Boolean).join(" · ");
  const {error}=await supabase.from("notifications").insert({user_id:input.userId,kind:"thesis_alert",title:`${input.ticker} thesis changed`,body:details||`${input.companyName} thesis conditions changed.`,metadata:{ticker:input.ticker,thesisId:input.thesisId,snapshotId:input.snapshotId,previousStatus:input.previousStatus,newStatus:input.newStatus,newlyFailed:input.newlyFailed,newlyRecovered:input.newlyRecovered},event_key:eventKey});
  if(error&&error.code!=="23505")throw new Error(`thesis_notification:${error.message}`);
}

export type InvestorIntelligenceProcessingResult = {
  status: "SUCCESS" | "PARTIAL";
  snapshotId: string;
  changeCount: number;
  thesisEvaluated: boolean;
  alertCount: number;
  errors: string[];
};

export async function processPersistedAnalysisIntelligence(input: {
  userId: string;
  report: AnalysisReport;
  company?: CompanySearchResult | null;
}): Promise<InvestorIntelligenceProcessingResult> {
  const errors: string[] = [];
  const snapshot = buildCompanyMetricSnapshot(input.report);

  const [previousResult, thesisResult, alertsResult] = await Promise.allSettled([
    getLatestCompanySnapshot(input.userId, input.report.ticker),
    getActiveThesis(input.userId, input.report.ticker),
    getEnabledAlerts(input.userId, input.report.ticker),
  ]);
  const previous = previousResult.status === "fulfilled" ? previousResult.value : null;
  const thesis = thesisResult.status === "fulfilled" ? thesisResult.value : null;
  const alerts = alertsResult.status === "fulfilled" ? alertsResult.value : [];
  if (previousResult.status === "rejected") errors.push(errorClass(previousResult.reason));
  if (thesisResult.status === "rejected") errors.push(errorClass(thesisResult.reason));
  if (alertsResult.status === "rejected") errors.push(errorClass(alertsResult.reason));

  const snapshotId = await persistCompanySnapshot(input.userId, snapshot);
  try {
    const catalog = await upsertCompanyMetricCatalog({ report: input.report, company: input.company });
    if (!catalog.ok) errors.push(`catalog:${catalog.error}`);
  } catch (error) {
    errors.push(errorClass(error));
  }

  let previousThesisResults;
  if (thesis) {
    try { previousThesisResults = await getLatestThesisRuleResults(input.userId, thesis.id); }
    catch (error) { errors.push(errorClass(error)); }
  }

  const evaluated = evaluateInvestorIntelligence({
    previous: previous?.snapshot ?? null,
    current: snapshot,
    thesis: thesis ? { currentStatus: thesis.status, rules: thesis.rules, previousResults: previousThesisResults } : null,
    alerts,
  });

  if (thesis && evaluated.thesis) {
    try {
      await persistThesisEvaluation({userId:input.userId,thesisId:thesis.id,analysisId:input.report.id,snapshotId,previousStatus:thesis.status,newStatus:evaluated.thesis.status,results:evaluated.thesis.results,reasoning:evaluated.thesis.reasoning,newlyFailed:evaluated.thesis.newlyFailed,newlyRecovered:evaluated.thesis.newlyRecovered});
      await notifyThesisTransition({userId:input.userId,ticker:input.report.ticker,companyName:input.report.companyName,thesisId:thesis.id,snapshotId,previousStatus:thesis.status,newStatus:evaluated.thesis.status,newlyFailed:evaluated.thesis.newlyFailed,newlyRecovered:evaluated.thesis.newlyRecovered});
    } catch (error) { errors.push(errorClass(error)); }
  }

  if (previous && evaluated.changes.length) {
    try { await persistMaterialChanges({userId:input.userId,ticker:input.report.ticker,previousSnapshotId:previous.id,currentSnapshotId:snapshotId,changes:evaluated.changes}); }
    catch (error) { errors.push(errorClass(error)); }
  }

  let alertCount = 0;
  for (const item of evaluated.triggeredAlerts) {
    const eventKey = buildAlertEventKey({alertId:item.alert.id,snapshotId,metricKey:item.alert.condition.metricKey,priorValue:item.evaluation.priorValue,triggerValue:item.evaluation.triggerValue});
    try {
      const result = await recordTriggeredAlert({userId:input.userId,alertId:item.alert.id,snapshotId,eventKey,ticker:input.report.ticker,companyName:input.report.companyName,kind:item.alert.kind,metricKey:item.alert.condition.metricKey,priorValue:item.evaluation.priorValue,triggerValue:item.evaluation.triggerValue,threshold:item.alert.condition.threshold,reason:item.evaluation.reason});
      if (result?.inserted) alertCount += 1;
    } catch (error) { errors.push(errorClass(error)); }
  }

  const status = errors.length ? "PARTIAL" : "SUCCESS";
  try {
    const monitor=await hasMonitoringDependency(input.userId,input.report.ticker,Boolean(thesis),alerts.length>0);
    await updateMonitoringState({userId:input.userId,ticker:input.report.ticker,snapshotId,status,refreshReason:monitor?"analysis_completed_monitoring_active":"analysis_completed_no_dependency",nextCheckAt:monitor?new Date(Date.now()+24*60*60*1000).toISOString():null,errorClass:errors[0]??null});
  } catch (error) { errors.push(errorClass(error)); }

  return {status:errors.length?"PARTIAL":"SUCCESS",snapshotId,changeCount:evaluated.changes.length,thesisEvaluated:Boolean(thesis&&evaluated.thesis),alertCount,errors};
}
