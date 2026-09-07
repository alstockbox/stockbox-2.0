"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const currencySchema = z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());
const transactionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && time <= Date.now() + 86_400_000;
});

export async function updatePortfolioCashFlowTransactionAction(formData: FormData) {
  await requireUser();
  const parsed = z.object({
    id: z.string().uuid(),
    amount: z.coerce.number().positive().max(1_000_000_000),
    currency: currencySchema,
    transactionDate: transactionDateSchema,
  }).safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    transactionDate: formData.get("transactionDate"),
  });

  if (!parsed.success) {
    redirect("/portfolio?error=transaction_input");
    return;
  }

  const supabase = await createClient();
  const { data, error } = await supabase?.rpc("update_portfolio_cash_flow_transaction", {
    p_transaction_id: parsed.data.id,
    p_cash_amount: parsed.data.amount,
    p_currency: parsed.data.currency,
    p_executed_at: parsed.data.transactionDate,
  }) ?? { data: false, error: new Error("Supabase unavailable") };

  if (error || data !== true) {
    redirect("/portfolio?error=transaction_save");
    return;
  }
  revalidatePath("/portfolio");
}
