import { createAdminClient } from "@/lib/supabase/admin";

export async function reserveContractConfirmation(input: {
  invoiceId: string;
  userId: string;
  subscriptionId: string | null;
}) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, reserved: false };
  const { data, error } = await supabase.rpc("reserve_contract_confirmation", {
    p_stripe_invoice_id: input.invoiceId,
    p_user_id: input.userId,
    p_stripe_subscription_id: input.subscriptionId,
  });
  if (error) return { ok: false as const, reserved: false };
  return { ok: true as const, reserved: data === true };
}

export async function markContractConfirmationSent(invoiceId: string, providerMessageId?: string | null) {
  const supabase = createAdminClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("mark_contract_confirmation_sent", {
    p_stripe_invoice_id: invoiceId,
    p_provider_message_id: providerMessageId ?? "",
  });
  return !error && data === true;
}

export async function markContractConfirmationFailed(invoiceId: string) {
  const supabase = createAdminClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("mark_contract_confirmation_failed", {
    p_stripe_invoice_id: invoiceId,
  });
  return !error && data === true;
}
