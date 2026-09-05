from pathlib import Path

path = Path("src/app/portfolio/page.tsx")
source = path.read_text(encoding="utf-8")

replacements = []

replacements.append((
'''import { buildPortfolioPositions, type PortfolioTransactionInput } from "@/lib/portfolio/portfolio-math";''',
'''import { buildPortfolioPositions, calculateRealizedPortfolioPerformance, type PortfolioTransactionInput } from "@/lib/portfolio/portfolio-math";'''
))

replacements.append((
'''  removePortfolioTransactionAction,\n  updatePortfolioTransactionAction,''',
'''  removePortfolioTransactionAction,\n  sellHoldingAction,\n  updatePortfolioTransactionAction,'''
))

replacements.append((
'''        : params.error === "transaction_delete"\n          ? (sv ? "Transaktionen kunde inte tas bort." : "The transaction could not be deleted.")\n          : params.error''',
'''        : params.error === "transaction_delete"\n          ? (sv ? "Transaktionen kunde inte tas bort." : "The transaction could not be deleted.")\n          : params.error === "transaction_sell_quantity"\n            ? (sv ? "Försäljningen är större än det tillgängliga innehavet för den tickern och valutan." : "The sale is larger than the available position for that ticker and currency.")\n          : params.error'''
))

buy_tail = '''                    <Button className="min-h-11 sm:col-span-2 xl:col-span-3"><Plus className="h-4 w-4" aria-hidden="true" />{sv ? "Lägg till köp" : "Add purchase"}</Button>\n                  </form>\n                ) : <p className="mt-3 text-sm text-[#9aa7b8]">{copy.createFirst}</p>}\n              </Card>\n            </div>\n\n            <div className="mt-7 grid gap-6">'''

sell_block = '''                    <Button className="min-h-11 sm:col-span-2 xl:col-span-3"><Plus className="h-4 w-4" aria-hidden="true" />{sv ? "Lägg till köp" : "Add purchase"}</Button>\n                  </form>\n                ) : <p className="mt-3 text-sm text-[#9aa7b8]">{copy.createFirst}</p>}\n              </Card>\n            </div>\n\n            {portfolios.length ? (\n              <Card className="mt-5">\n                <h2 className="font-semibold">{sv ? "Registrera en försäljning" : "Record a sale"}</h2>\n                <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Försäljningen sparas i samma transaktionsledger som köpen. StockBox tillåter aldrig att fler aktier säljs än positionen äger." : "The sale is stored in the same transaction ledger as purchases. StockBox never allows more shares to be sold than the position owns."}</p>\n                <form action={sellHoldingAction} className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">\n                  <select name="portfolioId" required aria-label={copy.portfolio} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3">\n                    {portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}\n                  </select>\n                  <input name="ticker" required maxLength={16} placeholder={copy.ticker} aria-label={copy.ticker} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />\n                  <input name="quantity" required type="number" min="0.000001" step="any" placeholder={sv ? "Antal att sälja" : "Quantity to sell"} aria-label={sv ? "Antal att sälja" : "Quantity to sell"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />\n                  <input name="salePrice" required type="number" min="0" step="any" placeholder={sv ? "Säljpris per aktie" : "Sale price per share"} aria-label={sv ? "Säljpris per aktie" : "Sale price per share"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />\n                  <input name="saleDate" required type="date" max={today} defaultValue={today} aria-label={sv ? "Säljdatum" : "Sale date"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />\n                  <div className="grid grid-cols-[1fr_1.2fr] gap-2"><input name="currency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={copy.currency} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" /><input name="fees" type="number" min="0" step="any" defaultValue="0" aria-label={sv ? "Avgift" : "Fee"} placeholder={sv ? "Avgift" : "Fee"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" /></div>\n                  <Button className="min-h-11 sm:col-span-2 xl:col-span-3">{sv ? "Registrera försäljning" : "Record sale"}</Button>\n                </form>\n              </Card>\n            ) : null}\n\n            <div className="mt-7 grid gap-6">'''
replacements.append((buy_tail, sell_block))

replacements.append((
'''                const positions = buildPortfolioPositions(transactionInputs);\n                const latest = latestSnapshot.get(portfolio.id) ?? null;''',
'''                const positions = buildPortfolioPositions(transactionInputs);\n                const realizedPerformance = calculateRealizedPortfolioPerformance(transactionInputs);\n                const latest = latestSnapshot.get(portfolio.id) ?? null;'''
))

analyzer_anchor = '''                        <PortfolioAnalyzer portfolioId={portfolio.id} holdings={analyzerHoldings} locale={locale} lastSnapshotAt={latest?.created_at ?? null} />'''
realized_block = '''                        {realizedPerformance.complete && realizedPerformance.byCurrency.length ? (\n                          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.025] p-4">\n                            <div className="flex flex-wrap items-end justify-between gap-2">\n                              <div><p className="text-xs text-[#8f9bac]">{sv ? "Realiserat P/L" : "Realized P/L"}</p><p className="mt-1 text-xs text-[#7f8b9b]">{sv ? "Visas separat per transaktionsvaluta. StockBox blandar inte valutor utan verifierad FX." : "Shown separately by transaction currency. StockBox does not mix currencies without verified FX."}</p></div>\n                            </div>\n                            <div className="mt-3 flex flex-wrap gap-2">\n                              {realizedPerformance.byCurrency.map((item) => (\n                                <div key={item.currency} className="rounded-md border border-white/10 bg-[#07111f]/70 px-3 py-2">\n                                  <span className="text-xs text-[#8f9bac]">{item.currency}</span>\n                                  <p className={`mt-1 font-semibold ${item.realizedProfitLoss >= 0 ? "text-emerald-200" : "text-red-200"}`}>{money(item.realizedProfitLoss, item.currency, locale)}</p>\n                                </div>\n                              ))}\n                            </div>\n                          </div>\n                        ) : !realizedPerformance.complete ? (\n                          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3 text-sm text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />{sv ? "Realiserat P/L visas inte eftersom transaktionshistoriken innehåller en ogiltig köp-/säljsekvens. StockBox fyller inte i ett delresultat." : "Realized P/L is hidden because transaction history contains an invalid buy/sell sequence. StockBox does not fill in a partial result."}</div>\n                        ) : null}\n\n                        <PortfolioAnalyzer portfolioId={portfolio.id} holdings={analyzerHoldings} locale={locale} lastSnapshotAt={latest?.created_at ?? null} />'''
replacements.append((analyzer_anchor, realized_block))

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match, found {count}: {old[:100]!r}")
    source = source.replace(old, new, 1)

path.write_text(source, encoding="utf-8")
