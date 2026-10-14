// Reusable ECharts option builders (one per chart type), all theme-aware via the palette.
import type { Pal } from '../theme';
import type { Band } from '../lib/calc/forecast';
import { eurCompact, eur } from '../lib/format';

export const tooltipEur = (v: unknown) => (typeof v === 'number' ? eur(v) : String(v));

export function sparkline(values: number[], color: string) {
  return {
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', show: false, data: values.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{ type: 'line', data: values, smooth: true, symbol: 'none', lineStyle: { width: 2, color }, areaStyle: { color, opacity: 0.12 } }],
    animation: false,
  };
}

/** p10–p90 band + p50 line; x = year labels. */
export function fan(labels: string[], bands: Band[], color: string, pal: Pal, name = 'Net worth') {
  const lo = bands.map((b) => b.p10);
  const span = bands.map((b) => b.p90 - b.p10);
  return {
    grid: { left: 56, right: 14, top: 28, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      formatter: (ps: { dataIndex: number }[]) => {
        const i = ps[0]?.dataIndex ?? 0;
        const b = bands[i];
        return `<b>${labels[i]}</b><br/>p90 ${eur(b.p90)}<br/>p50 <b>${eur(b.p50)}</b><br/>p10 ${eur(b.p10)}`;
      },
    },
    legend: { top: 0, right: 0, data: [`${name} p50`, 'p10–p90 range'] },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) }, scale: true },
    series: [
      { name: 'lo', type: 'line', data: lo, stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, silent: true },
      { name: 'p10–p90 range', type: 'line', data: span, stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color, opacity: 0.18 }, itemStyle: { color } },
      { name: `${name} p50`, type: 'line', data: bands.map((b) => b.p50), symbol: 'none', lineStyle: { width: 2.5, color }, itemStyle: { color } },
      { name: 'p10', type: 'line', data: lo, symbol: 'none', lineStyle: { width: 1, type: 'dashed', color: pal.muted }, silent: true },
      { name: 'p90', type: 'line', data: bands.map((b) => b.p90), symbol: 'none', lineStyle: { width: 1, type: 'dashed', color: pal.muted }, silent: true },
    ],
  };
}
