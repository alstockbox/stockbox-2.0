from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"guard failed for {path}: expected 1 match, got {count}")
    target.write_text(text.replace(old, new, 1))


geometry_path = "src/lib/analysis/chart-geometry.ts"
geometry_anchor = '''export function barGeometry(
  point: ChartCoordinate,
'''
geometry_insert = '''export type GapAwareChartDatum = {
  label: string;
  dateKey: string;
  value: number | null | undefined;
};

export type GapAwareChartCoordinate<T extends GapAwareChartDatum = GapAwareChartDatum> = T & {
  value: number;
  x: number;
  y: number;
  sourceIndex: number;
};

export function gapAwareLineGeometry<T extends GapAwareChartDatum>(
  points: T[],
  domain: ChartDomain,
  width: number,
  height: number,
  paddingX = 28,
  paddingY = 18,
): { coordinates: Array<GapAwareChartCoordinate<T>>; paths: string[] } {
  const coordinates: Array<GapAwareChartCoordinate<T>> = [];
  const paths: string[] = [];
  let commands: string[] = [];

  const flush = () => {
    if (commands.length >= 2) paths.push(commands.join(" "));
    commands = [];
  };

  points.forEach((point, sourceIndex) => {
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) {
      flush();
      return;
    }
    const value = point.value;
    const x = paddingX + (sourceIndex / Math.max(points.length - 1, 1)) * (width - paddingX * 2);
    const y = yForChartValue(value, domain, height, paddingY);
    const coordinate = { ...point, value, x, y, sourceIndex } as GapAwareChartCoordinate<T>;
    coordinates.push(coordinate);
    commands.push(`${commands.length ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
  });
  flush();

  return { coordinates, paths };
}

export function barGeometry(
  point: ChartCoordinate,
'''
replace_once(geometry_path, geometry_anchor, geometry_insert)

research_path = "src/components/analysis/historical-research.tsx"
replace_once(
    research_path,
    'import { HistoricalChartExplorer } from "./historical-chart-explorer";\n',
    'import { HistoricalChartExplorer } from "./historical-chart-explorer";\nimport { chartDomain, gapAwareLineGeometry } from "@/lib/analysis/chart-geometry";\n',
)
old_line_chart = '''function LineChart({ points, label, unavailable }: { points: ChartPoint[]; label: string; unavailable: string }) {
  const values = points.filter((point): point is { label: string; value: number } => isNumber(point.value));
  if (values.length < 2) return <p className="text-sm text-[#9aa7b8]">{unavailable}</p>;
  const width = 640;
  const height = 180;
  const paddingX = 24;
  const paddingY = 18;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const coords = values.map((point, index) => ({
    ...point,
    x: paddingX + (index / (values.length - 1)) * (width - paddingX * 2),
    y: height - paddingY - ((point.value - min) / range) * (height - paddingY * 2),
  }));
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="h-44 w-full text-[#e1cb95]">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-[#9aa7b8]">
        <span>{coords[0]?.label}</span><span>{coords.at(-1)?.label}</span>
      </div>
    </div>
  );
}
'''
new_line_chart = '''function LineChart({ points, label, unavailable }: { points: ChartPoint[]; label: string; unavailable: string }) {
  const values = points.filter((point): point is { label: string; value: number } => isNumber(point.value));
  if (values.length < 2) return <p className="text-sm text-[#9aa7b8]">{unavailable}</p>;
  const width = 640;
  const height = 180;
  const paddingX = 24;
  const paddingY = 18;
  const domain = chartDomain(values.map((point, index) => ({ label: point.label, dateKey: String(index), value: point.value })));
  const { coordinates: coords, paths } = gapAwareLineGeometry(
    points.map((point, index) => ({ ...point, dateKey: String(index) })),
    domain,
    width,
    height,
    paddingX,
    paddingY,
  );
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="h-44 w-full text-[#e1cb95]">
        {paths.map((path, index) => (
          <path key={`${label}-segment-${index}`} d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-[#9aa7b8]">
        <span>{coords[0]?.label}</span><span>{coords.at(-1)?.label}</span>
      </div>
    </div>
  );
}
'''
replace_once(research_path, old_line_chart, new_line_chart)

explorer_path = "src/components/analysis/historical-chart-explorer.tsx"
replace_once(
    explorer_path,
    'import { barGeometry, chartCoordinates, chartDomain, yForChartValue } from "@/lib/analysis/chart-geometry";\n',
    'import { barGeometry, chartDomain, gapAwareLineGeometry, yForChartValue } from "@/lib/analysis/chart-geometry";\n',
)
old_geometry = '''  const numeric = points.filter((point): point is ChartPoint & { value: number } => isNumber(point.value));
  const domain = chartDomain(numeric, chartType === "bar");
  const coords = chartCoordinates(numeric, CHART_WIDTH, CHART_HEIGHT, chartType === "bar", PADDING_X, PADDING_Y);
  const ticks = tickValues(domain.min, domain.max);
  const zeroLine = barGeometry({ label: "0", dateKey: "0", value: 0, x: 0, y: 0 }, domain, CHART_HEIGHT, coords.length, PADDING_Y).baselineY;
'''
new_geometry = '''  const numeric = points.filter((point): point is ChartPoint & { value: number } => isNumber(point.value));
  const domain = chartDomain(numeric, chartType === "bar");
  const { coordinates: coords, paths } = gapAwareLineGeometry(
    points,
    domain,
    CHART_WIDTH,
    CHART_HEIGHT,
    PADDING_X,
    PADDING_Y,
  );
  const ticks = tickValues(domain.min, domain.max);
  const zeroLine = barGeometry({ label: "0", dateKey: "0", value: 0, x: 0, y: 0 }, domain, CHART_HEIGHT, points.length, PADDING_Y).baselineY;
'''
replace_once(explorer_path, old_geometry, new_geometry)
replace_once(
    explorer_path,
    '  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");\n',
    '',
)
replace_once(
    explorer_path,
    '            {chartType === "line" ? <path d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" /> : null}\n',
    '''            {chartType === "line" ? paths.map((path, index) => (
              <path key={`line-segment-${index}`} d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            )) : null}\n''',
)
replace_once(
    explorer_path,
    '              const bar = barGeometry(point, domain, CHART_HEIGHT, coords.length, PADDING_Y);\n',
    '              const bar = barGeometry(point, domain, CHART_HEIGHT, points.length, PADDING_Y);\n',
)

print("Chart gap integrity P0 patch applied")
