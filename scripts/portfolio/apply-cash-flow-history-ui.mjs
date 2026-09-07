import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/portfolio/page.tsx";
let source = readFileSync(path, "utf8");

const importNeedle = 'import { PortfolioCashFlowForm } from "@/components/portfolio/portfolio-cash-flow-form";';
const importReplacement = `${importNeedle}\nimport { PortfolioCashFlowHistoryRow } from "@/components/portfolio/portfolio-cash-flow-history-row";`;
if (!source.includes(importNeedle) || source.includes("PortfolioCashFlowHistoryRow")) {
  throw new Error("Portfolio cash-flow history import precondition failed");
}
source = source.replace(importNeedle, importReplacement);

const rowNeedle = '                                    <div className="flex items-center justify-between gap-3 text-sm"><span><span className="mr-2 rounded bg-white/8 px-2 py-1 text-[10px] uppercase">{transaction.transaction_type}</span><strong>{transaction.ticker}</strong> · {money(transaction.cash_amount, transaction.currency, locale)} · {transaction.executed_at}</span><form action={removePortfolioTransactionAction}><input type="hidden" name="id" value={transaction.id} /><Button variant="ghost" className="min-h-10"><Trash2 className="h-4 w-4" /><span className="sr-only">{sv ? "Ta bort" : "Delete"}</span></Button></form></div>';
const rowReplacement = `                                    <PortfolioCashFlowHistoryRow\n                                      id={transaction.id}\n                                      ticker={transaction.ticker}\n                                      transactionType={transaction.transaction_type}\n                                      cashAmount={transaction.cash_amount}\n                                      currency={transaction.currency}\n                                      executedAt={transaction.executed_at}\n                                      today={today}\n                                      locale={locale}\n                                    />`;
if (!source.includes(rowNeedle)) {
  throw new Error("Portfolio cash-flow history row precondition failed");
}
source = source.replace(rowNeedle, rowReplacement);

writeFileSync(path, source);
