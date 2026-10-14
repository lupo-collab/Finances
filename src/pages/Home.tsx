import { useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov, Money, Slider, Owner, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette } from '../theme';
import { eur, eurCompact, pct, num } from '../lib/format';
import { balanceAfter } from '../lib/calc/mortgage';

export function HomePage() {
  const { d, m } = useApp();
  const pal = usePalette();
  const h = d.home;
  const M = h.mortgage;
  const mm = m.mortgage;
  const [growth, setGrowth] = useState(d.forecastAssumptions.returnsNominalEUR.home.mean);

  const value = h.valueEstimateEUR;
  const valueVsOption = {
    grid: { left: 16, right: 16, top: 30, bottom: 24, containLabel: true },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    yAxis: { type: 'category', data: ['Home'] },
    series: [
      { name: 'Equity', type: 'bar', stack: 'h', barWidth: 34, itemStyle: { color: pal.realEstate }, data: [value - M.balanceEUR], label: { show: true, color: '#fff', formatter: () => `Equity ${eurCompact(value - M.balanceEUR)}` } },
      { name: 'Mortgage', type: 'bar', stack: 'h', itemStyle: { color: pal.off }, data: [M.balanceEUR], label: { show: true, color: '#fff', formatter: () => `Mortgage ${eurCompact(M.balanceEUR)}` } },
    ],
    aria: { enabled: true, decal: { show: true } },
  };

  // Amortisation by year
  const [y0, mo0] = M.nextInstalmentMonth.split('-').map(Number);
  const byYear: Record<number, { i: number; p: number; bal: number }> = {};
  mm.rows.forEach((r, idx) => {
    const year = y0 + Math.floor((mo0 - 1 + idx) / 12);
    byYear[year] ??= { i: 0, p: 0, bal: 0 };
    byYear[year].i += r.interest;
    byYear[year].p += r.principal;
    byYear[year].bal = r.balance;
  });
  const yrs = Object.keys(byYear).map(Number);
  const lastYear = yrs[yrs.length - 1];
  const amortOption = {
    grid: { left: 56, right: 56, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: yrs.map(String) },
    yAxis: [
      { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
      { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Principal', type: 'bar', stack: 'p', itemStyle: { color: pal.realEstate }, data: yrs.map((y) => byYear[y].p) },
      { name: 'Interest', type: 'bar', stack: 'p', itemStyle: { color: pal.bad }, data: yrs.map((y) => byYear[y].i) },
      { name: 'Balance (end of year)', type: 'line', yAxisIndex: 1, symbol: 'none', lineStyle: { color: pal.text, width: 2 }, itemStyle: { color: pal.text }, data: yrs.map((y) => byYear[y].bal) },
    ],
    aria: { enabled: true, decal: { show: true } },
  };

  // Equity projection
  const N = Math.ceil(M.remainingInstalments / 12) + 2;
  const proj = Array.from({ length: N + 1 }, (_, y) => {
    const v = value * Math.pow(1 + growth / 100, y);
    const b = balanceAfter(mm.rows, M.balanceEUR, y * 12);
    return { y, v, b, eq: v - b };
  });
  const startYear = Number(d.meta.asOf.slice(0, 4));
  const projOption = {
    grid: { left: 56, right: 14, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: proj.map((p) => String(startYear + p.y)) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: 'Home equity', type: 'line', symbol: 'none', areaStyle: { color: pal.realEstate, opacity: 0.25 }, lineStyle: { color: pal.realEstate, width: 2.5 }, itemStyle: { color: pal.realEstate }, data: proj.map((p) => p.eq) },
      { name: 'Value', type: 'line', symbol: 'none', lineStyle: { color: pal.muted, type: 'dashed' }, itemStyle: { color: pal.muted }, data: proj.map((p) => p.v) },
    ],
  };

  const refs = [{ label: 'Stated estimate', eurPerSqm: value / h.sizeSqm, src: h.valueEstimateSrc }, ...h.marketRefs];
  const sqmOption = {
    grid: { left: 16, right: 50, top: 6, bottom: 20, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${eur(v)}/mq` },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `€${num(v / 1000, 1)}k` } },
    yAxis: { type: 'category', inverse: true, data: refs.map((r) => r.label), axisLabel: { width: 170, overflow: 'break' } },
    series: [{ type: 'bar', barWidth: 14, data: refs.map((r, i) => ({ value: r.eurPerSqm, itemStyle: { color: i === 0 ? pal.realEstate : pal.off, borderRadius: 3 } })), label: { show: true, position: 'right', color: pal.muted, formatter: (x: { value: number }) => eur(x.value) } }],
  };

  const rateAfter = mm.detr.effectiveRatePct;
  const cashNet = mm.netCashYield;
  const trCash = d.liquidPortfolio.cash.find((c) => c.ratePct != null);

  return (
    <>
      <PageTitle sub={h.description}>Home & mortgage</PageTitle>
      <div className="grid">
        <Card className="span-6" title={`You own ${pct(((value - M.balanceEUR) / value) * 100, 0)} of the home's estimated value`} sub={<>Value {eur(value)} <Prov src={h.valueEstimateSrc} /> · mortgage balance {eur(M.balanceEUR)} <Prov src={M.src} /></>}>
          <EChart height={120} option={valueVsOption} ariaLabel={`Home value ${eur(value)}, mortgage ${eur(M.balanceEUR)}`} />
          <div className="stat">
            <span>Purchase price</span>
            <span>{h.purchasePriceEUR != null ? <Money v={h.purchasePriceEUR} src={h.src} /> : <span className="notprov">not yet provided</span>}</span>
          </div>
          <div className="stat">
            <span>Renovation cost</span>
            <span>{h.renovationCostEUR != null ? <Money v={h.renovationCostEUR} src={h.src} /> : <span className="notprov">not yet provided</span>}</span>
          </div>
          <div className="stat">
            <span>Sheet-tracked equity line</span>
            <span>
              <Money v={m.latest.values['house'] ?? 0} src="sheet" />
            </span>
          </div>
          {h.monthlyHouseExpensesEUR != null && (
            <div className="stat">
              <span>House expenses</span>
              <span>
                {eur(h.monthlyHouseExpensesEUR)}/month <Prov src={h.monthlyHouseExpensesSrc ?? 'stated'} />
              </span>
            </div>
          )}
        </Card>
        <Card className="span-6" title={`Price per mq: ${eur(value / h.sizeSqm)} vs ${h.marketRefs.length} market references`}>
          <EChart height={150} option={sqmOption} ariaLabel="Price per square metre comparison" />
          <Assumptions>
            {h.marketRefs.map((r) => (
              <span key={r.label}>
                {r.label} <Prov src={r.src} />{' '}
              </span>
            ))}
          </Assumptions>
        </Card>

        <Card className="span-8" title={`Mortgage paid off in ${lastYear}; ${eurCompact(mm.interestTotal)} interest left`} sub={`${M.rateType}, TAN ${pct(M.tanPct, 2)}, ${M.remainingInstalments} instalments from ${M.nextInstalmentMonth}`}>
          <EChart height={280} option={amortOption} ariaLabel={`Amortisation to ${lastYear}; total remaining interest ${eur(mm.interestTotal)}`} />
          <div className="stat">
            <span>Computed annuity</span>
            <Money v={mm.annuity} digits={2} src="computed" />
          </div>
          <div className="stat">
            <span>Stated instalment</span>
            <Money v={M.instalmentEUR} digits={2} src={M.src} />
          </div>
          <Assumptions>
            Note: the stated instalment is <b>{eur(mm.gap, 2)}</b> above the pure annuity. {M.instalmentGapNote} First instalment month: {M.nextInstalmentMonth} <Prov src={M.nextInstalmentMonthSrc ?? 'stated'} />.
          </Assumptions>
        </Card>
        <Card className="span-4" title="Don't prepay" sub={<Owner kind="judgment" />} soft>
          <div className="stat">
            <span>Mortgage rate (TAN)</span>
            <span className="num">{pct(M.tanPct, 2)}</span>
          </div>
          <div className="stat">
            <span>Interest next 12 months</span>
            <Money v={mm.interest12} src="computed" />
          </div>
          <div className="stat">
            <span>Detraction ({M.detraction.ratePct}% up to {eurCompact(M.detraction.capInterestEUR)})</span>
            <span>
              <Money v={mm.detr.amount} src={M.detraction.src} />
            </span>
          </div>
          <div className="stat">
            <span>
              <b>Rate after detraction</b>
            </span>
            <b className="num">{pct(rateAfter, 2)}</b>
          </div>
          <div className="stat">
            <span>
              <b>Net cash yield</b> ({trCash ? `${pct(trCash.ratePct!, 2)} gross × (1 − 26%)` : '—'})
            </span>
            <b className="num">{cashNet != null ? pct(cashNet, 2) : '—'}</b>
          </div>
          <p className="small">
            {cashNet != null && cashNet > rateAfter
              ? `Cash earns ≈ ${pct(cashNet - rateAfter, 2)} more after tax than prepaying saves.`
              : 'Prepaying would save more than cash earns after tax.'}{' '}
            <span className="muted">{M.judgment}</span>
          </p>
        </Card>

        <Card className="span-12" title={`Home equity ≈ ${eurCompact(proj[proj.length - 1].eq)} by ${startYear + N} at ${pct(growth)} a year`} soft sub="Projection: value grows at the slider rate; balance follows the amortisation schedule">
          <div className="controls">
            <Slider label="Home value growth" value={growth} min={-3} max={6} step={0.5} onChange={setGrowth} fmt={(v) => pct(v)} />
          </div>
          <EChart height={260} option={projOption} ariaLabel="Home equity projection" />
          {h.saleTaxNote && <Assumptions>{h.saleTaxNote}</Assumptions>}
        </Card>
      </div>
    </>
  );
}
