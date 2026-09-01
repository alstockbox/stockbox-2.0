export function GET() {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.getstockbox.app").replace(/\/$/, "");
  const body = `# StockBox

> StockBox is a source-backed stock-analysis and equity-research web application. It uses structured financial data and versioned model logic to calculate metrics and research scores while showing data coverage, confidence and missing information.

## Public research
- Aktieanalys guide: ${base}/aktieanalys
- AI aktieanalys: ${base}/ai-aktieanalys
- Fundamental analys: ${base}/fundamental-analys
- P/E guide: ${base}/nyckeltal/pe-tal
- Public stock analyses: ${base}/aktier
- Methodology: ${base}/docs/methodology
- Data sources: ${base}/data-sources

## Interpretation
StockBox Score and research views are analytical model outputs based on the data available at the stated analysis date. They are not individualized financial advice, trade execution instructions or guarantees of future returns. Public company pages are dated snapshots and may not represent current market data.

## Data integrity
StockBox is designed to keep missing financial data missing rather than invent values to complete a report. Public stock pages are explicitly published snapshots that must pass minimum coverage, confidence and freshness checks.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
