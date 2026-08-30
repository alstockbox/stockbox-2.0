export type WithdrawalReceipt = {
  id: string;
  submittedAt: string;
  stripeSubscriptionId?: string | null;
  contractReference?: string | null;
  consumerName?: string | null;
  confirmationEmail?: string | null;
  planKey: string;
  status: string;
};

export function withdrawalReceiptText(receipt: WithdrawalReceipt): string {
  const submitted = new Date(receipt.submittedAt).toISOString();
  const contractReference = receipt.contractReference || receipt.stripeSubscriptionId || "Provided in withdrawal notice";
  return [
    "StockBox - withdrawal notice receipt",
    "",
    `Receipt ID: ${receipt.id}`,
    `Received at: ${submitted}`,
    receipt.consumerName ? `Name: ${receipt.consumerName}` : null,
    `Contract reference: ${contractReference}`,
    receipt.stripeSubscriptionId ? `Subscription: ${receipt.stripeSubscriptionId}` : null,
    `Plan: ${receipt.planKey}`,
    `Status: ${receipt.status}`,
    "",
    "This receipt confirms that StockBox received your withdrawal notice at the timestamp above.",
    "It confirms receipt of the notice, not the final legal assessment or refund outcome.",
    "Keep this receipt for your records.",
  ].filter((line): line is string => line !== null).join("\n");
}
