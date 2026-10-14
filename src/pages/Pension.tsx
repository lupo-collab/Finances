import { useApp } from '../state';
import { Card, PageTitle, Prov, Money, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette } from '../theme';
import { eur, eurCompact } from '../lib/format';
import { pickNum } from '../data/schema';

export function Pension() {
  const { d, m } = useApp();
  const pal = usePalette();
  const funds = d.accounts.filter((a) => a.regime === 'pension');
  const lines = Object.entries(d.netWorth.lineCatalog).filter(([, v]) => v.bucket === 'pension');
  const shades = [pal.pension, pal.other];
  const option = {
    grid: { left: 56, right: 14, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: lines.map(([k, v], i) => ({
      name: v.label,
      type: 'line',
      stack: 'p',
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 1, color: shades[i % 2] },
      areaStyle: { color: shades[i % 2], opacity: 0.7 },
      itemStyle: { color: shades[i % 2] },
      data: m.snapRows.map((r) => [r.date, m.snapshots.find((s) => s.date === r.date)!.values[k] ?? 0]),
    })),
    aria: { enabled: true, decal: { show: true } },
  };
  const total = m.nw.buckets.pension;
  const pc = d.forecastAssumptions.pensionContributionsEURperYear;
  const tfrYtd = pickNum(m.inc.prev.tfr, /ytd/i);
  const names = funds.map((f) => f.name.toLowerCase());
  const openActions = d.actions.filter((a) => /pension|comparti/i.test(a.title) || names.some((n) => a.title.toLowerCase().includes(n)));
  return (
    <>
      <PageTitle sub={funds.map((f) => f.name).join(' + ')}>Pension · {eurCompact(total)}</PageTitle>
      <div className="grid">
        <Card className="span-8" title={`Pension funds total ${eurCompact(total)}`} sub="Stacked over line-item snapshots (sheet)">
          <EChart height={280} option={option} ariaLabel={`Pension funds over time, now ${eur(total)}`} />
        </Card>
        <Card className="span-4" title="Contributions" soft>
          <div className="stat"><span>Run-rate used in forecasts</span><Money v={pc.value} src="estimate" note={pc.src} /></div>
          {tfrYtd != null && <div className="stat"><span>TFR contributions year to date</span><Money v={tfrYtd} src="payslip" /></div>}
          <Assumptions>{pc.src}</Assumptions>
        </Card>
        {funds.map((f) => {
          const line = lines.find(([, v]) => v.account === f.id);
          return (
            <Card key={f.id} className="span-6" title={f.name} sub={f.institution}>
              <div className="big">{line ? <Money v={m.latest.values[line[0]] ?? 0} src="sheet" /> : '—'}</div>
              <p className="small muted">{f.notes}</p>
            </Card>
          );
        })}
        <Card className="span-12" title="Open items">
          <ul className="list">
            {openActions.map((a) => (
              <li key={a.id}><span className="pill neutral">{a.type}</span> {a.title} <span className="muted small">due {a.due ?? '—'}</span></li>
            ))}
            {!openActions.length && <li className="muted">None</li>}
          </ul>
          <Assumptions>Comparti and fees: <span className="notprov">not yet provided</span>. Forecast pension return: {d.forecastAssumptions.returnsNominalEUR.pension.mean}% <Prov src={d.forecastAssumptions.returnsNominalEUR.pension.src} /></Assumptions>
        </Card>
      </div>
    </>
  );
}
