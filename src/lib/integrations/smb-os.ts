type JsonMetadata = Record<string, string | number | boolean | null>;

type BaseModuleEvent = {
  projectId: "stockbox";
  module: "stockbox";
  eventId: string;
};

export type StockBoxModuleEvent =
  | (BaseModuleEvent & {
      type: "measurement";
      metricName: "signup_completed" | "analysis_completed";
      metricValue: 1;
      unit: "count";
      metadata: JsonMetadata;
    })
  | (BaseModuleEvent & {
      type: "economic";
      kind: "revenue";
      amountSek: number;
      metadata: JsonMetadata;
    });

export type SmbOsDeliveryResult =
  | { status: "disabled" }
  | { status: "delivered"; duplicate: boolean }
  | { status: "failed" };

const endpointPath = "/_api/core/external-module-event";

function base(eventId: string): BaseModuleEvent {
  return { projectId: "stockbox", module: "stockbox", eventId };
}

export function stockBoxSignupEvent(idempotencyKey: string): StockBoxModuleEvent {
  return {
    ...base(`acquisition:${idempotencyKey}`),
    type: "measurement",
    metricName: "signup_completed",
    metricValue: 1,
    unit: "count",
    metadata: {},
  };
}

export function stockBoxAnalysisCompletedEvent(input: {
  analysisId: string;
  ticker: string;
  analysisType: string;
  researchView: string;
  score: number;
}): StockBoxModuleEvent {
  return {
    ...base(`analysis:${input.analysisId}:completed`),
    type: "measurement",
    metricName: "analysis_completed",
    metricValue: 1,
    unit: "count",
    metadata: {
      analysisId: input.analysisId,
      ticker: input.ticker,
      analysisType: input.analysisType,
      researchView: input.researchView,
      score: input.score,
    },
  };
}

export function stockBoxPaidInvoiceEvent(input: {
  stripeEventId: string;
  invoiceId: string;
  amountPaidCents: number;
  currency: string;
  billingReason?: string | null;
}): StockBoxModuleEvent | null {
  if (input.currency.toLowerCase() !== "sek" || input.amountPaidCents <= 0) return null;
  return {
    ...base(`stripe:${input.stripeEventId}:revenue`),
    type: "economic",
    kind: "revenue",
    amountSek: input.amountPaidCents / 100,
    metadata: {
      invoiceId: input.invoiceId,
      currency: "sek",
      billingReason: input.billingReason ?? null,
    },
  };
}

export async function reportStockBoxEvent(
  event: StockBoxModuleEvent,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<SmbOsDeliveryResult> {
  const coreUrl = process.env.SMB_OS_CORE_URL?.trim().replace(/\/$/, "");
  const ingestKey = process.env.SMB_OS_INGEST_KEY?.trim();
  if (!coreUrl || !ingestKey) return { status: "disabled" };

  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 1200;
  try {
    const response = await fetchImpl(`${coreUrl}${endpointPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ingestKey}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      console.warn("[smb-os] Module event delivery failed.", { status: response.status });
      return { status: "failed" };
    }
    const payload = await response.json().catch(() => null) as { duplicate?: unknown } | null;
    return { status: "delivered", duplicate: payload?.duplicate === true };
  } catch {
    console.warn("[smb-os] Module event delivery failed.");
    return { status: "failed" };
  }
}
