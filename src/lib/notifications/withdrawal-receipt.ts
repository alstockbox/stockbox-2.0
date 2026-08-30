import { getServerEnv } from "@/lib/env/server";
import { logApplicationError } from "@/lib/db/repositories";
import { withdrawalReceiptText, type WithdrawalReceipt } from "@/lib/legal/withdrawal";

type WithdrawalReceiptEmail = WithdrawalReceipt & {
  to: string;
};

export async function sendWithdrawalReceiptEmail(input: WithdrawalReceiptEmail): Promise<boolean> {
  const env = getServerEnv();
  if (env.EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY || !env.FROM_EMAIL) return false;

  const text = withdrawalReceiptText(input);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: input.to,
      subject: "StockBox withdrawal notice receipt",
      text,
    }),
  });
  if (response.ok) return true;

  await logApplicationError({
    service: "withdrawal-receipt",
    message: "Resend rejected a withdrawal receipt email.",
    context: { requestId: input.id, status: response.status },
  });
  return false;
}
