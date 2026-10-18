import { useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov, Seg, Assumptions, Owner, Money } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette } from '../theme';
import { eur, eurCompact, usd, fmtDate } from '../lib/format';
import { cumulative, type RsuValuation } from '../lib/calc/rsu';
import { daysBetween, parseISODate } from '../lib/calc/util';
import { pickNum } from '../data/schema';
import { oneOffInflows } from '../lib/forecastInputs';

export function Career() {
  const { d, m, today } = useApp();
  const pal = usePalette();
  const G = m.inc.prev;
  const A = m.inc.next;
  const C = m.inc.cmp;
  const short = (e: string) => e.split(/[ ,(]/)[0];
  const prevName = short(G.employer);
  const nextName = short(A.employer);
  const [val, setVal] = useState<RsuValuation>('haircut50');
  const fx = d.settings.fxUsdPerEur.value;

  const hatch = { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [3, 3], rotation: -Math.PI / 4, color: 'rgba(255,255,255,0.45)' };
  const incOption = {
    grid: { left: 56, right: 14, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: G.years.map((y) => `${y.year}${y.partial ? '*' : ''}`) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: 'Taxable (IRPEF)', type: 'bar', barGap: '-100%', itemStyle: { color: pal.equity }, data: G.years.map((y) => ({ value: y.taxableIrpef, itemStyle: y.partial ? { decal: hatch, opacity: 0.6 } : {} })) },
      { name: 'IRPEF withheld', type: 'bar', barWidth: '30%', itemStyle: { color: pal.pension }, data: G.years.map((y) => ({ value: y.irpefWithheld, itemStyle: y.partial ? { decal: hatch, opacity: 0.6 } : {} })) },
    ],
  };
  const cmpOption = {
    grid: { left: 56, right: 14, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: ['Base', 'Commission at target', 'OTE'] },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: prevName, type: 'bar', itemStyle: { color: pal.off }, data: C ? [C.prev.base, C.prev.targetCommission, C.prev.ote] : [] },
      { name: nextName, type: 'bar', itemStyle: { color: pal.equity }, data: C ? [C.next.base, C.next.targetCommission, C.next.ote] : [], label: { show: true, position: 'top', color: pal.muted, fontSize: 10, formatter: (x: { value: number }) => eurCompact(x.value) } },
    ],
    aria: { enabled: true, decal: { show: true } },
  };
  const pts = cumulative(A.rsu.schedule, fx, val);
  const rsuOption = {
    grid: { left: 60, right: 60, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', formatter: (ps: { dataIndex: number }[]) => { const p = pts[ps[0].dataIndex]; return `${fmtDate(p.date)}<br/>vest ${usd(p.usd)}<br/>cumulative <b>${usd(p.cumUSD)}</b> ≈ ${eur(p.cumEUR)}`; } },
    xAxis: { type: 'category', data: pts.map((p) => p.date.slice(0, 7)) },
    yAxis: [
      { type: 'value', axisLabel: { formatter: (v: number) => `$${Math.round(v / 1000)}k` } },
      { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Cumulative USD', type: 'line', step: 'end', symbol: 'circle', symbolSize: 5, lineStyle: { color: pal.other, width: 2 }, itemStyle: { color: pal.other }, areaStyle: { color: pal.other, opacity: 0.12 }, data: pts.map((p) => p.cumUSD) },
      { name: `Cumulative EUR (@ ${fx})`, type: 'line', step: 'end', yAxisIndex: 1, symbol: 'none', lineStyle: { color: pal.muted, type: 'dashed' }, itemStyle: { color: pal.muted }, data: pts.map((p) => p.cumEUR) },
    ],
  };
  const tfrAnnual = pickNum(G.tfr, /annualised/i);
  const oneOffs = oneOffInflows(d);
  const ms = [...d.milestones].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageTitle sub={`${G.employer} → ${A.employer}`}>Career & income</PageTitle>
      <div className="grid">
        <Card className="span-6" title="Taxable income 2021–2026" sub={<>{prevName} payslips / CU <Prov src={G.yearsSrc} /> · * = partial year (hatched)</>}>
          <EChart height={260} option={incOption} ariaLabel={G.years.map((y) => `${y.year}: ${eurCompact(y.taxableIrpef)}`).join(', ')} />
          <Assumptions>{G.years.filter((y) => y.note).map((y) => `${y.year}: ${y.note}`).join(' · ')}</Assumptions>
        </Card>
        <Card className="span-6" title={C ? `${nextName} OTE is ${eurCompact(C.next.ote - C.prev.ote)} ${C.next.ote >= C.prev.ote ? 'above' : 'below'} ${prevName} at target` : 'Comparison at target'} sub={<>{prevName} base × (1 + {G.pay2025?.commissionTargetPctOfBase ?? '—'}%) <Prov src="computed" /> vs offer <Prov src={A.src} /></>}>
          <EChart height={260} option={cmpOption} ariaLabel={C ? `${prevName} OTE ${eur(C.prev.ote)} vs ${nextName} ${eur(C.next.ote)}` : 'comparison'} />
          <Assumptions>
            {C?.netNote && C.oteGapNetApprox != null && <>Net gap ≈ {eurCompact(C.oteGapNetApprox)} {C.netNote} <Prov src="estimate" />. </>}
            {A.commissionNote} {C?.planningRule && <><br />{C.planningRule} <Owner kind="judgment" /></>}
          </Assumptions>
        </Card>
        <Card
          className="span-8"
          title={`${usd(A.rsu.grantValueUSD)} RSU grant vests through ${A.rsu.schedule[A.rsu.schedule.length - 1].date.slice(0, 4)}`}
          sub={
            <span className="row">
              {A.rsu.liquidity} <Prov src={A.src} />
              <Seg label="RSU valuation" value={val} onChange={setVal} options={[{ v: 'zero', label: 'Zero' }, { v: 'haircut50', label: '50%' }, { v: 'grant', label: 'Grant value' }]} />
            </span>
          }
          soft={val !== 'grant'}
        >
          <EChart height={260} option={rsuOption} ariaLabel={`RSU vesting: ${A.rsu.schedule.length} events, total ${usd(pts[pts.length - 1]?.cumUSD ?? 0)} at chosen valuation`} />
          <Assumptions>
            Schedule as given: {A.rsu.schedule.length} vests from {A.rsu.schedule[0].date}. EUR at stored FX {fx} USD/EUR <Prov src={d.settings.fxUsdPerEur.src} note={d.settings.fxUsdPerEur.note} />. Gross of tax.
            {A.donationMatching && <> Donation matching: {A.donationMatching.rule}; deadline {fmtDate(A.donationMatching.deadline)}.</>}
          </Assumptions>
        </Card>
        <Card className="span-4" title="Milestones">
          <ul className="list timeline">
            {ms.map((x) => {
              const dd = daysBetween(today, parseISODate(x.date));
              return (
                <li key={x.date + x.label} className={dd < 0 ? 'past' : ''}>
                  <span className="when">{fmtDate(x.date)}</span>
                  <span style={{ flex: 1 }}>{x.label}</span>
                  <span className="muted small">{dd >= 0 ? `in ${dd} d` : 'done'}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        {oneOffs.provided.length + oneOffs.missing.length > 0 && (
          <Card className="span-12" title={`Closing pay: ≈ ${eurCompact(oneOffs.provided.reduce((a, x) => a + x.netEUR, 0))} net so far`} sub="One-off inflows counted in the forecast (net of tax at the stated rate)">
            <div className="tablewrap">
              <table>
                <thead><tr><th>Item</th><th>When</th><th className="r">Gross</th><th className="r">Tax</th><th className="r">Net</th><th>Src</th></tr></thead>
                <tbody>
                  {[...oneOffs.provided, ...oneOffs.missing].map((x) => (
                    <tr key={x.label}>
                      <td style={{ whiteSpace: 'normal' }}>
                        {x.label}
                        {x.hourlyRateEUR != null && x.hours != null && (
                          <div className="muted small">
                            {x.hours} h × {eur(x.hourlyRateEUR, 2)}/h ({eur(x.hourlyBasis!.monthlyEUR, 2)} ÷ {x.hourlyBasis!.divisor}) <Prov src="estimate" note={x.hourlyBasis!.src} />
                          </div>
                        )}
                        {x.note && <div className="muted small">{x.note}</div>}
                      </td>
                      <td>{fmtDate(x.date)}</td>
                      <td className="r">{x.grossEUR != null ? eur(x.grossEUR) : <span className="notprov">not yet provided</span>}</td>
                      <td className="r muted">{x.taxPct}% <Prov src={x.taxSrc ?? 'estimate'} /></td>
                      <td className="r">{'netEUR' in x ? eur(x.netEUR as number) : '—'}</td>
                      <td><Prov src={x.src} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <Card className="span-6" title={`${A.role}`} sub={`${A.level} · start ${fmtDate(A.startDate)} · ${A.probationMonths}-month probation`}>
          <div className="stat"><span>Base</span><span>{eur(A.baseAnnual)} ({A.instalments} instalments) <Prov src={A.src} /></span></div>
          <div className="stat"><span>Commission at target</span><span>{eur(A.commissionTargetAnnual)} <Prov src={A.src} /></span></div>
          <div className="stat"><span>Sales pass</span><span className="muted small">{A.salesPassExpectation} <Prov src="stated" /></span></div>
          <h3 style={{ fontSize: 13, margin: '12px 0 4px' }} className="muted">
            Stipends (USD) <Prov src={A.src} />
          </h3>
          {Object.entries(A.stipendsUSD).map(([k, v]) => (
            <div className="stat small" key={k}><span>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><span>{usd(v)}</span></div>
          ))}
        </Card>
        <Card className="span-6" title="Benefits & covenants">
          <ul className="list">
            {A.benefits.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <Assumptions>
            <b>Covenant:</b> {A.covenants}. {G.gsu?.note}
          </Assumptions>
          {tfrAnnual != null && <div className="stat"><span>TFR to pension fund, annualised ({prevName} era)</span><span>{eur(tfrAnnual)} <Prov src="estimate" note={String(G.tfr?.src ?? '')} /></span></div>}
          <div className="stat"><span>Net worth today</span><Money v={m.nw.sheet} compact src="computed" /></div>
        </Card>
      </div>
    </>
  );
}
