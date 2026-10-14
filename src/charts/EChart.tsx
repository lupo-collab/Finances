import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, SunburstChart, TreemapChart, GaugeChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  AriaComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { useDark, PALETTE, type Pal } from '../theme';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  SunburstChart,
  TreemapChart,
  GaugeChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  AriaComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export type Option = EChartsCoreOption;

type Axis = Record<string, unknown>;
function styleAxes(axes: unknown, pal: Pal): unknown {
  if (!axes) return axes;
  const one = (a: Axis): Axis => ({
    ...a,
    axisLine: { lineStyle: { color: pal.grid }, ...(a.axisLine as object) },
    axisTick: { show: false, ...(a.axisTick as object) },
    axisLabel: { color: pal.muted, hideOverlap: true, ...(a.axisLabel as object) },
    splitLine: { lineStyle: { color: pal.grid }, ...(a.splitLine as object) },
    nameTextStyle: { color: pal.muted, ...(a.nameTextStyle as object) },
  });
  return Array.isArray(axes) ? axes.map(one) : one(axes as Axis);
}

/** Theme-aware ECharts wrapper. `ariaLabel` should state the chart's takeaway. */
export function EChart({ option, height = 260, ariaLabel, onClick }: { option: Option; height?: number; ariaLabel: string; onClick?: (p: unknown) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const dark = useDark();
  const pal = dark ? PALETTE.dark : PALETTE.light;

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const o = option as Record<string, unknown>;
    c.setOption(
      {
        backgroundColor: 'transparent',
        animationDuration: 400,
        textStyle: { color: pal.text, fontFamily: 'inherit' },
        aria: { enabled: true, label: { description: ariaLabel } },
        ...o,
        tooltip: o.tooltip
          ? {
              backgroundColor: pal.bg,
              borderColor: pal.grid,
              textStyle: { color: pal.text },
              confine: true,
              ...(o.tooltip as object),
            }
          : undefined,
        legend: o.legend ? { textStyle: { color: pal.muted }, icon: 'roundRect', ...(o.legend as object) } : undefined,
        xAxis: styleAxes(o.xAxis, pal),
        yAxis: styleAxes(o.yAxis, pal),
      },
      { notMerge: true },
    );
    c.off('click');
    if (onClick) c.on('click', onClick);
  }, [option, pal, ariaLabel, onClick]);

  return <div ref={ref} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />;
}
