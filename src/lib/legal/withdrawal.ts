export type WithdrawalReceipt = {
  id: string;
  submittedAt: string;
  stripeSubscriptionId: string;
  planKey: string;
  status: string;
};

export function withdrawalReceiptText(receipt: WithdrawalReceipt): string {
  const submitted = new Date(receipt.submittedAt).toISOString();
  return [
    "StockBox - withdrawal notice receipt",
    "",
    `Receipt ID: ${receipt.id}`,
    `Received at: ${submitted}`,
    `Subscription: ${receipt.stripeSubscriptionId}`,
    `Plan: ${receipt.planKey}`,
    `Status: ${receipt.status}`,
    "",
    "This receipt confirms that StockBox received your withdrawal notice at the timestamp above.",
    "Keep this file for your records.",
  ].join("\n");
}
