import type { AnalysisReport } from "@/lib/analysis/types";
import { getServerEnv } from "@/lib/env/server";
import { logApplicationError, markAdminAlertSent, releaseAdminAlert, reserveAdminAlert } from "@/lib/db/repositories";

export async function sendStrongBuyAlert(report: AnalysisReport, adminUrl: string) {
  const env = getServerEnv();
  if (report.recommendation !== "Strong Buy" || env.EMAIL_PROVIDER !== "resend") return;

  if (!env.RESEND_API_KEY || !env.ADMIN_ALERT_EMAIL || !env.FROM_EMAIL) {
    await logApplicationError({
      service: "admin-alerts",
      message: "Strong Buy alert skipped because email environment variables are incomplete.",
      context: { ticker: report.ticker, analysisId: report.id }
    });
    return;
  }

  const reserved = await reserveAdminAlert(report);
  if (!reserved) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.ADMIN_ALERT_EMAIL,
      subject: `StockBox Strong Buy: ${report.ticker}`,
      html: `<p><strong>${report.companyName}</strong> generated a Strong Buy model assessment.</p><p>Score: ${report.score.score} / Confidence: ${report.score.confidence}%</p><p>${report.oneSentence}</p><p><a href="${adminUrl}">Open admin report</a></p>`
    })
  });

  if (!response.ok) {
    await logApplicationError({
      service: "admin-alerts",
      message: "Resend rejected Strong Buy alert.",
      context: { ticker: report.ticker, status: response.status }
    });
    await releaseAdminAlert(report.id);
    return;
  }

  const payload = (await response.json().catch(() => null)) as { id?: string } | null;
  await markAdminAlertSent(report.id, payload?.id);
}
