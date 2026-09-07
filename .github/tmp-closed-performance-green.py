from pathlib import Path

path = Path("src/app/portfolio/page.tsx")
page = path.read_text()

active_marker = '''                        {positions.length ? (
                          <>
'''
dims_marker = '''                        {latest ? (
                          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
'''

active_index = page.index(active_marker)
dims_index = page.index(dims_marker, active_index)
financial = page[active_index + len(active_marker):dims_index]

score_line = next(line for line in financial.splitlines(keepends=True) if "StockBox Portfolio Score" in line)
financial = financial.replace(score_line, "", 1)
financial = financial.replace("lg:grid-cols-4", "lg:grid-cols-3", 1)

first_grid_start = financial.index('                        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">')
first_grid_end = financial.index("                        </div>\n\n", first_grid_start) + len("                        </div>\n\n")
first_grid = financial[first_grid_start:first_grid_end]
conditional_first_grid = "                        {latest ? (\n" + first_grid + "                        ) : null}\n\n"
financial = financial[:first_grid_start] + conditional_first_grid + financial[first_grid_end:]

score_block = '''                        {latest ? (
                          <div className="mt-5 rounded-lg border border-[#e1cb95]/20 bg-[#e1cb95]/5 p-3"><p className="text-xs text-[#bba975]">StockBox Portfolio Score</p><p className="mt-1 text-lg font-semibold text-[#f4efe5]">{score(latest.portfolio_score)}<span className="text-xs text-[#8f9bac]">/100</span></p></div>
                        ) : null}

'''

page = page[:active_index] + financial + active_marker + score_block + page[dims_index:]
path.write_text(page)
