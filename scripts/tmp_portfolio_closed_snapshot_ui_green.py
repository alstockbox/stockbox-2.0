from pathlib import Path

page_path = Path("src/app/portfolio/page.tsx")
page = page_path.read_text()

old_outer = """                    {positions.length || portfolioTransactions.length ? (
                      <>
                        {positions.length ? ("""
new_outer = """                    {positions.length || portfolioTransactions.length ? (
                      <>
                        <PortfolioAnalyzer portfolioId={portfolio.id} holdings={analyzerHoldings} locale={locale} lastSnapshotAt={latest?.created_at ?? null} />

                        {positions.length ? ("""
if page.count(old_outer) != 1:
    raise SystemExit(f"expected one outer portfolio branch anchor, found {page.count(old_outer)}")
page = page.replace(old_outer, new_outer, 1)

analyzer_line = """
                        <PortfolioAnalyzer portfolioId={portfolio.id} holdings={analyzerHoldings} locale={locale} lastSnapshotAt={latest?.created_at ?? null} />
"""
if page.count(analyzer_line) != 2:
    raise SystemExit(f"expected inserted + existing analyzer before removal, found {page.count(analyzer_line)}")
first = page.find(analyzer_line)
second = page.find(analyzer_line, first + len(analyzer_line))
page = page[:second] + page[second + len(analyzer_line):]
page_path.write_text(page)

analyzer_path = Path("src/components/portfolio/portfolio-analyzer.tsx")
analyzer = analyzer_path.read_text()
old_guard = "    if (running || !holdings.length) return;"
if analyzer.count(old_guard) != 1:
    raise SystemExit(f"expected one analyzer guard, found {analyzer.count(old_guard)}")
analyzer = analyzer.replace(old_guard, "    if (running) return;", 1)

old_buttons = """        <div className=\"flex flex-col gap-2 sm:flex-row\">
          <Button type=\"button\" onClick={() => void run(false)} disabled={running || !holdings.length} className=\"min-h-11\">
            <Sparkles className=\"h-4 w-4\" />{running ? (sv ? \"Analyserar…\" : \"Analyzing…\") : (sv ? \"Analysera hela portföljen\" : \"Analyze entire portfolio\")}
          </Button>
          <Button type=\"button\" variant=\"secondary\" onClick={() => void run(true)} disabled={running || !holdings.length} className=\"min-h-11\">
            <RefreshCw className={`h-4 w-4 ${running ? \"animate-spin\" : \"\"}`} />{sv ? \"Senaste data\" : \"Latest data\"}
          </Button>
        </div>"""
new_buttons = """        <div className=\"flex flex-col gap-2 sm:flex-row\">
          {holdings.length ? (
            <>
              <Button type=\"button\" onClick={() => void run(false)} disabled={running} className=\"min-h-11\">
                <Sparkles className=\"h-4 w-4\" />{running ? (sv ? \"Analyserar…\" : \"Analyzing…\") : (sv ? \"Analysera hela portföljen\" : \"Analyze entire portfolio\")}
              </Button>
              <Button type=\"button\" variant=\"secondary\" onClick={() => void run(true)} disabled={running} className=\"min-h-11\">
                <RefreshCw className={`h-4 w-4 ${running ? \"animate-spin\" : \"\"}`} />{sv ? \"Senaste data\" : \"Latest data\"}
              </Button>
            </>
          ) : (
            <Button type=\"button\" onClick={() => void run(false)} disabled={running} className=\"min-h-11\">
              <Sparkles className=\"h-4 w-4\" />{running ? (sv ? \"Sparar…\" : \"Saving…\") : (sv ? \"Spara slut-snapshot\" : \"Save final snapshot\")}
            </Button>
          )}
        </div>"""
if analyzer.count(old_buttons) != 1:
    raise SystemExit(f"expected one analyzer button block, found {analyzer.count(old_buttons)}")
analyzer = analyzer.replace(old_buttons, new_buttons, 1)
analyzer_path.write_text(analyzer)
