"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { PAPER_TRADING_V3_STARTING_CASH } from "@/lib/paper-trading/accounts-v3";
import { executePaperOrderServiceV3 } from "@/lib/paper-trading/order-service-v3";
import { createPaperAccountV3 } from "@/lib/paper-trading/repository-v3";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
});

const orderSchema = z.object({
  accountId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(128),
  ticker: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
  side: z.enum(["buy", "sell"]),
  quantity: z.coerce.number().finite().positive().max(1_000_000_000),
});

function featureAvailable(): boolean {
  return isFeatureEnabled("paperTrading") && !isKilled("paperTrading");
}

export async function createPaperAccountAction(formData: FormData) {
  const user = await requireUser();
  if (!featureAvailable()) redirect("/dashboard");

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: formData.get("baseCurrency"),
  });
  if (!parsed.success) redirect("/paper-trading?accountStatus=invalid");

  const result = await createPaperAccountV3({
    userId: user.id,
    name: parsed.data.name,
    baseCurrency: parsed.data.baseCurrency,
    startingCash: PAPER_TRADING_V3_STARTING_CASH,
  });
  if (!result.ok) redirect("/paper-trading?accountStatus=error");

  revalidatePath("/paper-trading");
  redirect(`/paper-trading?account=${encodeURIComponent(result.data.id)}&accountStatus=created`);
}

export async function executePaperOrderAction(formData: FormData) {
  const user = await requireUser();
  if (!featureAvailable()) redirect("/dashboard");

  const parsed = orderSchema.safeParse({
    accountId: formData.get("accountId"),
    idempotencyKey: formData.get("idempotencyKey"),
    ticker: formData.get("ticker"),
    side: formData.get("side"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) redirect("/paper-trading?tradeStatus=invalid");

  const result = await executePaperOrderServiceV3({
    userId: user.id,
    accountId: parsed.data.accountId,
    intent: {
      idempotencyKey: parsed.data.idempotencyKey,
      ticker: parsed.data.ticker,
      side: parsed.data.side,
      quantity: parsed.data.quantity,
    },
  });

  revalidatePath("/paper-trading");
  if (result.status === "FILLED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=filled`);
  if (result.status === "ALREADY_RECORDED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=existing`);
  if (result.status === "REJECTED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=rejected&reason=${encodeURIComponent(result.reason)}`);
  if (result.status === "KILLED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=paused`);
  if (result.status === "DISABLED") redirect("/dashboard");
  redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=error`);
}
