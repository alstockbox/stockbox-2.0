type JsonMetadata = Record<string, string | number | boolean | null>;

type BaseModuleEvent = {
  projectId: "stockbox";
  module: "stockbox";
  eventId: string;
  occurredAt: string;
};

type MeasurementName = "signup_completed" | "analysis_completed" | "gross_cash_received_sek";

export type StockBoxModuleEvent =
  | (BaseModuleEvent & {
      type: "measurement";
      metricName: MeasurementName;
      metricValue: number;
      unit: "count" | "SEK";
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

function base(eventId: string, occurredAt: string): BaseModuleEvent {
  return { projectId: "stockbox", module: "stockbox", eventId, occurredAt };
}

export function stockBoxInvoicePaidOccurredAt(input: {
  paidAtSeconds?: number | null;
  eventCreatedSeconds: number;
}): string {
  const sourceSeconds = typeof input.paidAtSeconds === "number" && Number.isFinite(input.paidAtSeconds) && input.paidAtSeconds >= 0
    ? input.paidAtSeconds
    : input.eventCreatedSeconds;
  return new Date(sourceSeconds * 1000).toISOString();
}

export function stockBoxSignupEvent(input: { idempotencyKey: string; occurredAt: string }): StockBoxModuleEvent {
  return {
    ...base(`acquisition:${input.idempotencyKey}`, input.occurredAt),
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
  score: number;
  occurredAt: string;
}): StockBoxModuleEvent {
  return {
    ...base(`analysis:${input.analysisId}:completed`, input.occurredAt),
    type: "measurement",
    metricName: "analysis_completed",
    metricValue: 1,
    unit: "count",
    metadata: {
      analysisId: input.analysisId,
      ticker: input.ticker,
      analysisType: input.analysisType,
      score: input.score,
    },
  };
}

export function stockBoxPaidInvoiceEvent(input: {
  stripeEventId?: string;
  invoiceId: string;
  amountPaidCents: number;
  currency: string;
  occurredAt: string;
  vatMode?: "small_business_exempt" | "vat_registered" | "" | null;
  billingReason?: string | null;
}): StockBoxModuleEvent | null {
  if (input.currency.toLowerCase() !== "sek" || input.amountPaidCents <= 0) return null;
  const amountSek = input.amountPaidCents / 100;
  const metadata: JsonMetadata = {
    invoiceId: input.invoiceId,
    currency: "sek",
    billingReason: input.billingReason ?? null,
    vatMode: input.vatMode || null,
  };

  if (input.vatMode === "small_business_exempt") {
    return {
      ...base(`stripe:invoice:${input.invoiceId}:revenue`, input.occurredAt),
      type: "economic",
      kind: "revenue",
      amountSek,
      metadata,
    };
  }

  return {
    ...base(`stripe:invoice:${input.invoiceId}:gross-cash`, input.occurredAt),
    type: "measurement",
    metricName: "gross_cash_received_sek",
    metricValue: amountSek,
    unit: "SEK",
    metadata,
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
