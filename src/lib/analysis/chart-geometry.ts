export type ChartDatum = {
  label: string;
  dateKey: string;
  value: number;
};

export type ChartDomain = {
  min: number;
  max: number;
  range: number;
};

export type ChartCoordinate<T extends ChartDatum = ChartDatum> = T & {
  x: number;
  y: number;
};

export type BarGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  baselineY: number;
};

export function chartDomain(points: ChartDatum[], includeZero = false): ChartDomain {
  if (!points.length) return { min: 0, max: 0, range: 1 };
  const values = points.map((point) => point.value);
  const min = includeZero ? Math.min(0, ...values) : Math.min(...values);
  const max = includeZero ? Math.max(0, ...values) : Math.max(...values);
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  return { min, max, range };
}

export function yForChartValue(value: number, domain: ChartDomain, height: number, paddingY: number) {
  return height - paddingY - ((value - domain.min) / domain.range) * (height - paddingY * 2);
}

export function chartCoordinates<T extends ChartDatum>(
  points: T[],
  width: number,
  height: number,
  includeZero = false,
  paddingX = 28,
  paddingY = 18,
): Array<ChartCoordinate<T>> {
  const domain = chartDomain(points, includeZero);
  return points.map((point, index) => ({
    ...point,
    x: paddingX + (index / Math.max(points.length - 1, 1)) * (width - paddingX * 2),
    y: yForChartValue(point.value, domain, height, paddingY),
  }));
}

export function barGeometry(
  point: ChartCoordinate,
  domain: ChartDomain,
  height: number,
  pointCount: number,
  paddingY = 18,
): BarGeometry {
  const barWidth = Math.max(8, Math.min(34, 520 / Math.max(pointCount, 1)));
  const baselineY = yForChartValue(0, domain, height, paddingY);
  return {
    x: point.x - barWidth / 2,
    y: Math.min(point.y, baselineY),
    width: barWidth,
    height: Math.max(2, Math.abs(point.y - baselineY)),
    baselineY,
  };
}
