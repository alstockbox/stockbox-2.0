import { logApplicationError } from "@/lib/db/repositories";
import { getServerEnv } from "@/lib/env/server";
import { getLegalCommerceReadiness } from "@/lib/legal/commerce";
import { contractConfirmationText, type ContractConfirmationInput } from "@/lib/legal/contract-confirmation";

type EmailInput = Omit<ContractConfirmationInput, "seller" | "appUrl"> & {
  to: string;
};

export async function sendContractConfirmationEmail(input: EmailInput) {
  const env = getServerEnv();
  const legal = getLegalCommerceReadiness(env);
  if (
    env.EMAIL_PROVIDER !== "resend" ||
    !env.RESEND_API_KEY ||
    !env.FROM_EMAIL ||
    !legal.ready
  ) {
    return { ok: false as const, providerMessageId: null };
  }

  const text = contractConfirmationText({
    ...input,
    seller: legal.seller,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `stockbox-contract-${input.invoiceId}`,
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: input.to,
      subject: input.locale === "sv" ? "StockBox – avtalsbekräftelse" : "StockBox – contract confirmation",
      text,
    }),
  });

  if (response.ok) {
    const payload = await response.json().catch(() => null) as { id?: unknown } | null;
    return {
      ok: true as const,
      providerMessageId: typeof payload?.id === "string" ? payload.id : null,
    };
  }
  await logApplicationError({
    service: "contract-confirmation",
    message: "Resend rejected a contract confirmation email.",
    context: { invoiceId: input.invoiceId, status: response.status },
  });
  return { ok: false as const, providerMessageId: null };
}
