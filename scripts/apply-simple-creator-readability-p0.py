from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"guard failed for {path}: expected 1 match, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/components/analysis/report-view.tsx",
    '''  const showExplainability = mode === "pro" || extended;\n  const showNumbers = mode === "pro" || report.analysisType !== "summary";\n  const showValuation = mode === "pro" || extended;''',
    '''  const showExplainability = mode === "pro";\n  const showNumbers = mode === "pro";\n  const showValuation = mode === "pro";''',
)

replace_once(
    "src/components/analysis/report-view.tsx",
    '''      </div>\n\n      <WhatChanged report={report} previousReport={previousReport} copy={copy} locale={locale} />''',
    '''      </div>\n\n      {mode === "simple" && report.historical ? <HistoricalResearchView report={report} mode={mode} locale={locale} /> : null}\n\n      <WhatChanged report={report} previousReport={previousReport} copy={copy} locale={locale} />''',
)

replace_once(
    "src/components/analysis/report-view.tsx",
    '''      {report.historical ? <HistoricalResearchView report={report} mode={mode} locale={locale} /> : null}''',
    '''      {mode === "pro" && report.historical ? <HistoricalResearchView report={report} mode={mode} locale={locale} /> : null}''',
)

replace_once(
    "src/components/analysis/historical-research.tsx",
    '''    <div className="space-y-5">\n      {showDividendSnapshot ? <DividendSnapshot report={report} locale={locale} /> : null}\n      {mode === "simple" ? <HistoricalCoverageCard report={report} locale={locale} /> : null}\n      {mode === "simple" ? <PriceContextCard report={report} locale={locale} /> : null}\n      {mode === "simple" ? <HistoricalSnapshot report={report} locale={locale} /> : null}\n      <HistoricalOverview report={report} locale={locale} />\n      <HistoricalDiscountQualityCard report={report} locale={locale} />''',
    '''    <div className="space-y-5">\n      {mode === "simple" ? <HistoricalSnapshot report={report} locale={locale} /> : null}\n      {mode === "simple" ? <PriceContextCard report={report} locale={locale} /> : null}\n      {showDividendSnapshot ? <DividendSnapshot report={report} locale={locale} /> : null}\n      <HistoricalDiscountQualityCard report={report} locale={locale} />\n      <HistoricalOverview report={report} locale={locale} />\n      {mode === "simple" ? <HistoricalCoverageCard report={report} locale={locale} /> : null}''',
)

print("Simple creator readability P0 patch applied")
