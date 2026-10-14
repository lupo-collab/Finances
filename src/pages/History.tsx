import { useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette, BUCKET_LABEL } from '../theme';
import { eur, eurCompact, fmtDate } from '../lib/format';
import { BUCKETS } from '../data/schema';
import { lineChanges } from '../lib/calc/networth';

export function History() {
  const { d, m } = useApp();
  const pal = usePalette();
  const rows = m.snapRows;
  const [a, setA] = useState(rows[0].date);
  const [b, setB] = useState(rows[rows.length - 1].date);

  const areaOption = {
    grid: { left: 56, right: 14, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: BUCKETS.map((k) => ({
      name: BUCKET_LABEL[k],
      type: 'line',
      stack: 'nw',
      symbol: 'none',
      lineStyle: { width: 0 },
      areaStyle: { color: pal[k], opacity: 0.85 },
      itemStyle: { color: pal[k] },
      data: rows.map((r) => [r.date, r.buckets[k]]),
    })),
  };

  const sa = m.snapshots.find((s) => s.date === a)!;
  const sb = m.snapshots.find((s) => s.date === b)!;
  const ch = lineChanges(sa, sb);
  const ta = rows.find((r) => r.date === a)!.total;
  const tb = rows.find((r) => r.date === b)!.total;
  // waterfall: invisible base + visible delta
  const cats = ['Start', ...ch.map((c) => d.netWorth.lineCatalog[c.line]?.label ?? c.line), 'End'];
  const base: number[] = [];
  const up: (number | string)[] = [];
  const down: (number | string)[] = [];
  let run = ta;
  base.push(0);
  up.push(ta);
  down.push('-');
  for (const c of ch) {
    if (c.change >= 0) {
      base.push(run);
      up.push(c.change);
      down.push('-');
    } else {
      base.push(run + c.change);
      up.push('-');
      down.push(-c.change);
    }
    run += c.change;
  }
  base.push(0);
  up.push(tb);
  down.push('-');
  const wfOption = {
    grid: { left: 210, right: 30, top: 10, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: { dataIndex: number }[]) => {
        const i = ps[0].dataIndex;
        if (i === 0) return `Start ${fmtDate(a)}: <b>${eur(ta)}</b>`;
        if (i === cats.length - 1) return `End ${fmtDate(b)}: <b>${eur(tb)}</b>`;
        const c = ch[i - 1];
        return `${cats[i]}<br/>${eur(c.from)} → ${eur(c.to)}<br/><b>${c.change > 0 ? '+' : ''}${eur(c.change)}</b>`;
      },
    },
    xAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => eurCompact(v) } },
    yAxis: { type: 'category', inverse: true, data: cats, axisLabel: { width: 200, overflow: 'truncate' } },
    series: [
      { type: 'bar', stack: 'w', itemStyle: { color: 'transparent' }, data: base, silent: true },
      { name: 'Increase', type: 'bar', stack: 'w', barWidth: 14, itemStyle: { color: pal.good }, data: up },
      { name: 'Decrease', type: 'bar', stack: 'w', itemStyle: { color: pal.bad }, data: down },
    ],
    aria: { enabled: true, decal: { show: true } },
  };

  return (
    <>
      <PageTitle sub="Line-item snapshots, recomputed in code. Sheet basis.">Net worth history</PageTitle>
      <div className="grid">
        <Card className="span-12" title={`From ${eurCompact(rows[0].total)} to ${eurCompact(rows[rows.length - 1].total)} across ${rows.length} snapshots`} sub="Stacked by bucket">
          <EChart height={300} option={areaOption} ariaLabel="Stacked net worth by bucket over time" />
        </Card>
        <Card className="span-12" title={`${tb >= ta ? '+' : ''}${eurCompact(tb - ta)} between ${fmtDate(a)} and ${fmtDate(b)}`} sub="What changed, line by line">
          <div className="row" style={{ marginBottom: 8 }}>
            <label className="small">
              From{' '}
              <select value={a} onChange={(e) => setA(e.target.value)}>
                {rows.map((r) => (
                  <option key={r.date}>{r.date}</option>
                ))}
              </select>
            </label>
            <label className="small">
              To{' '}
              <select value={b} onChange={(e) => setB(e.target.value)}>
                {rows.map((r) => (
                  <option key={r.date}>{r.date}</option>
                ))}
              </select>
            </label>
          </div>
          <EChart height={70 + cats.length * 24} option={wfOption} ariaLabel={`Waterfall of changes from ${a} to ${b}`} />
        </Card>
        <Card className="span-12" title="Snapshots" sub="Recomputed total vs what the sheet's own formula showed (differences flagged; see DQ7 on the Data page)">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="r">Recomputed</th>
                  <th className="r">Sheet-recorded</th>
                  <th className="r">Difference</th>
                  <th>Src</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.date} className={r.sheetDiff ? 'warn' : ''}>
                    <td>{fmtDate(r.date)}</td>
                    <td className="r">
                      {eur(r.total)} <Prov src="computed" />
                    </td>
                    <td className="r">{r.sheetRecordedTotal != null ? eur(r.sheetRecordedTotal) : <span className="muted">—</span>}</td>
                    <td className="r">{r.sheetDiff ? `${r.sheetDiff > 0 ? '+' : ''}${eur(r.sheetDiff)}` : '—'}</td>
                    <td>
                      <Prov src={r.src} />
                    </td>
                    <td className="muted">{r.note ?? ''}</td>
                  </tr>
                ))}
                {[...d.netWorth.historySheetTotalsOnly].reverse().map((h) => (
                  <tr key={h.date}>
                    <td>{fmtDate(h.date)}</td>
                    <td className="r muted">not recomputed</td>
                    <td className="r">{eur(h.total)}</td>
                    <td className="r">—</td>
                    <td>
                      <Prov src={h.src} />
                    </td>
                    <td className="muted">{h.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
