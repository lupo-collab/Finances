import { useMemo, useState } from 'react';
import { useApp } from '../state';
import { Card, Money, Prov, Seg, Assumptions, PageTitle, Owner } from '../components/ui';
import { EChart } from '../charts/EChart';
import { sparkline, fan } from '../charts/options';
import { usePalette, BUCKET_LABEL, CLASS_LABEL } from '../theme';
import { eur, eurCompact, pct, fmtDate, signed } from '../lib/format';
import { daysBetween, parseISODate, isClosedStatus } from '../lib/calc/util';
import { runForecast } from '../lib/calc/forecast';
import { buildForecastInput, defaultForecastOptions } from '../lib/forecastInputs';
import { BUCKETS, ASSET_CLASSES } from '../data/schema';
import { Link } from 'react-router-dom';

export function Overview() {
  const { d, m, basis, today } = useApp();
  const pal = usePalette();
  const [real, setReal] = useState<'nominal' | 'real'>('nominal');

  const nw = basis === 'market' ? m.nw.market : m.nw.sheet;
  const ytd = basis === 'market' ? m.nw.ytdMarket : m.nw.ytd;
  const buckets = basis === 'market' ? m.nw.bucketsMarket : m.nw.buckets;
  const nextMs = [...d.milestones].sort((a, b) => a.date.localeCompare(b.date)).find((x) => daysBetween(today, parseISODate(x.date)) >= 0);

  // Forecast (base savings, RSUs excluded by default)
  const fc = useMemo(() => {
    const o = defaultForecastOptions(d, basis);
    const fi = buildForecastInput(d, m, o);
    return { ...fi, out: fi.savingsMissing ? null : runForecast(fi.input), o };
  }, [d, m, basis]);
  const startYear = Number(d.meta.asOf.slice(0, 4));
  const fcLabels = fc.out ? fc.out.years.map((y) => String(startYear + y)) : [];
  const fcBands = fc.out ? (real === 'real' ? fc.out.netWorthReal : fc.out.netWorth) : [];
  const p50End = fcBands[fcBands.length - 1];

  const snapTotals = m.snapRows.map((r) => r.total);
  const liquidSpark = m.snapRows.map((r) => r.buckets.invested + r.buckets.cash);

  // Allocation vs plan
  const cls = m.liquid.classes;
  const tv = m.targetVals;
  const gapText = (c: (typeof ASSET_CLASSES)[number]) => {
    const g = m.gaps[c];
    if (Math.abs(g) < 1000) return `on target (${signed(eurCompact(g), g)})`;
    if (c === 'cash') return g < 0 ? `${eurCompact(-g)} above target` : `${eurCompact(g)} below target`;
    return g > 0 ? `buy ${eurCompact(g)} ${c}` : `${eurCompact(-g)} over target`;
  };
  const allocOption = {
    grid: { left: 112, right: 16, top: 10, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: { dataIndex: number }[]) => {
        const c = [...ASSET_CLASSES].reverse()[ps[0].dataIndex];
        return `<b>${CLASS_LABEL[c]}</b><br/>Actual ${eur(cls[c])} (${pct(m.liquid.classPct[c])})<br/>Target ${eur(tv[c])}<br/>Gap ${eur(m.gaps[c])}`;
      },
    },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    yAxis: {
      type: 'category',
      data: [...ASSET_CLASSES].reverse().map((c) => `{b|${CLASS_LABEL[c]}}\n{g|${gapText(c)}}`),
      axisLabel: { rich: { b: { fontWeight: 600, color: pal.text, align: 'right' }, g: { color: pal.muted, fontSize: 11, align: 'right', padding: [3, 0, 0, 0] } } },
    },
    series: [
      {
        name: 'Actual',
        type: 'bar',
        barWidth: 16,
        data: [...ASSET_CLASSES].reverse().map((c) => ({ value: cls[c], itemStyle: { color: pal[c], borderRadius: 4 } })),
      },
      {
        name: 'Target',
        type: 'scatter',
        symbol: 'rect',
        symbolSize: [3, 26],
        itemStyle: { color: pal.text },
        data: [...ASSET_CLASSES].reverse().map((c) => tv[c]),
        z: 5,
      },
    ],
  };

  const donutOption = {
    tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}<br/><b>${eur(p.value)}</b> (${p.percent.toFixed(1)}%)` },
    series: [
      {
        type: 'pie',
        radius: ['58%', '84%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: pal.bg, borderWidth: 2 },
        label: { color: pal.muted, formatter: (p: { name: string; percent: number }) => `${p.name}\n${p.percent.toFixed(0)}%`, fontSize: 11 },
        labelLine: { length: 6, length2: 6 },
        data: BUCKETS.map((b) => ({ name: BUCKET_LABEL[b], value: buckets[b], itemStyle: { color: pal[b] } })).filter((x) => x.value > 0),
      },
    ],
  };
  const topBucket = BUCKETS.reduce((a, b) => (buckets[b] > buckets[a] ? b : a), BUCKETS[0]);

  const trendOption = {
    grid: { left: 56, right: 14, top: 28, bottom: 28 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
    legend: { top: 0, left: 0, data: ['Sheet total', 'Recomputed'] },
    xAxis: { type: 'time', max: '2027-03-01' },
    yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      {
        name: 'Sheet total',
        type: 'line',
        data: d.netWorth.historySheetTotalsOnly.map((h) => [h.date, h.total]),
        symbol: 'none',
        lineStyle: { type: 'dashed', width: 1.5, color: pal.muted },
        itemStyle: { color: pal.muted },
      },
      {
        name: 'Recomputed',
        type: 'line',
        data: m.snapRows.map((r) => [r.date, r.total]),
        symbolSize: 6,
        lineStyle: { width: 2.5, color: pal.invested },
        itemStyle: { color: pal.invested },
        areaStyle: { color: pal.invested, opacity: 0.08 },
        markLine: {
          symbol: 'none',
          label: { color: pal.muted, fontSize: 10, position: 'insideStartTop', formatter: (p: { name: string }) => p.name },
          lineStyle: { color: pal.muted, type: 'dotted' },
          data: [
            { xAxis: m.inc.prev.end, name: `Leave ${m.inc.prev.employer.split(/[ ,(]/)[0]}` },
            { xAxis: m.inc.next.startDate, name: `Start ${m.inc.next.employer.split(/[ ,(]/)[0]}` },
          ],
        },
      },
    ],
  };

  // Attention cards (rule-driven, max 4)
  const S = d.settings;
  const cards: { title: string; body: string; to: string; tag: string }[] = [];
  if (m.cashAboveBuffer > 0)
    cards.push({
      tag: 'Cash',
      title: `Cash is ${eurCompact(m.cashAboveBuffer)} above your buffer`,
      body: `${eur(cls.cash)} in cash (incl. fund look-through) vs a ${eur(S.cashBufferEUR)} buffer.`,
      to: '/plan',
    });
  const ingLo = m.costs.ingCost.low;
  const ingHi = m.costs.ingCost.high;
  if (ingLo > m.costs.etfTer)
    cards.push({
      tag: 'Costs',
      title: `${m.fundsAcctName} funds cost ≈ ${eurCompact(ingLo)}–${eurCompact(ingHi)} a year`,
      body: `${pct(m.costs.ingCost.lowPct, 2)}–${pct(m.costs.ingCost.highPct, 2)} on ${eurCompact(m.liquid.ingValue)}, vs ≈ ${eurCompact(m.costs.etfTer)} for all ETFs (${eurCompact(m.liquid.classes.total - m.liquid.ingValue)}). Estimate.`,
      to: '/portfolio',
    });
  for (const [acct, v] of Object.entries(m.deposits)) {
    if (v >= 0.9 * S.maxDepositPerBankEUR) {
      const name = d.accounts.find((a) => a.id === acct)?.name ?? acct;
      cards.push({ tag: 'Deposits', title: `${name} holds ${eurCompact(v)} in deposits`, body: `Close to the ${eur(S.maxDepositPerBankEUR)} per-bank limit you set.`, to: '/accounts' });
    }
  }
  if (m.liquid.singleStockPct >= 0.8 * S.googMaxShareOfLiquidPct)
    cards.push({ tag: 'Concentration', title: `${m.liquid.singleStockName} is ${pct(m.liquid.singleStockPct, 2)} of liquid`, body: `Guardrail: ${pct(S.googMaxShareOfLiquidPct)}.`, to: '/portfolio' });
  const dueSoon = d.actions.filter((a) => a.due && !isClosedStatus(a.status) && daysBetween(today, parseISODate(a.due)) <= 30);
  if (dueSoon.length) {
    const first = dueSoon.map((a) => a.due as string).sort()[0];
    const days = daysBetween(today, parseISODate(first));
    cards.push({
      tag: 'Actions',
      title: `${dueSoon.length} action${dueSoon.length > 1 ? 's' : ''} due ${days < 0 ? 'overdue' : `within ${Math.max(days, 0)} days`}`,
      body: dueSoon.slice(0, 3).map((a) => a.title).join(' · '),
      to: '/plan',
    });
  }

  return (
    <>
      <PageTitle sub={`${basis === 'market' ? 'Market-value home basis' : 'Sheet basis'} · as of ${fmtDate(m.latest.date)}`}>Overview</PageTitle>
      <div className="grid">
        <Card className="kpi span-3">
          <div className="kpi-label">Net worth</div>
          <div className="kpi-value">
            <Money v={nw} compact src="computed" note={basis === 'market' ? 'Sum of line items with house = value estimate − mortgage' : 'Sum of the latest snapshot line items'} />
          </div>
          <div className={`kpi-delta ${ytd.abs >= 0 ? 'up' : 'down'}`}>
            {signed(eurCompact(ytd.abs), ytd.abs)} ({signed(pct(ytd.pct), ytd.pct)}) since {fmtDate(m.ytdBase.date, { day: 'numeric', month: 'short' })}
          </div>
          <EChart height={40} option={sparkline(snapTotals, pal.invested)} ariaLabel={`Net worth trend across ${snapTotals.length} snapshots`} />
        </Card>
        <Card className="kpi span-3">
          <div className="kpi-label">Liquid portfolio</div>
          <div className="kpi-value">
            <Money v={cls.total} compact src="computed" note={`Positions + cash across ${Object.keys(m.liquid.acctTotals).map(m.acctName).join(', ')} (statement values)`} />
          </div>
          <div className="kpi-delta muted">
            {pct(m.liquid.classPct.equity, 0)} equity · {pct(m.liquid.classPct.cash, 0)} cash
          </div>
          <EChart height={40} option={sparkline(liquidSpark, pal.equity)} ariaLabel="Invested plus cash over snapshots (sheet values)" />
        </Card>
        <Card className="kpi span-3">
          <div className="kpi-label">Cash above buffer</div>
          <div className="kpi-value">
            <Money v={m.cashAboveBuffer} compact src="computed" />
          </div>
          <div className="kpi-delta muted">
            {eurCompact(cls.cash)} cash vs {eurCompact(m.target.bufferEUR)} buffer
          </div>
          <div className="bar near" style={{ marginTop: 14 }} aria-hidden>
            <span style={{ width: `${Math.min(100, (m.target.bufferEUR / cls.cash) * 100)}%`, background: 'var(--cash)' }} />
          </div>
        </Card>
        <Card className="kpi span-3">
          <div className="kpi-label">Next milestone</div>
          {nextMs ? (
            <>
              <div className="kpi-value">
                {daysBetween(today, parseISODate(nextMs.date))} <span style={{ fontSize: 15, fontWeight: 500 }}>days</span>
              </div>
              <div className="kpi-delta muted">
                {nextMs.label} · {fmtDate(nextMs.date)}
              </div>
            </>
          ) : (
            <div className="kpi-delta muted">No upcoming milestones</div>
          )}
        </Card>

        <Card className="span-5" title={`${BUCKET_LABEL[topBucket]} is your largest bucket`} sub="What I own: net worth by bucket">
          <EChart
            height={260}
            option={donutOption}
            ariaLabel={`Donut: ${BUCKETS.map((b) => `${BUCKET_LABEL[b]} ${eurCompact(buckets[b])}`).join(', ')}`}
          />
        </Card>
        <Card className="span-7" title={`Net worth up ${eurCompact(ytd.abs)} this year`} sub="Dashed: sheet's own totals (not recomputed). Solid: recomputed from line items (sheet basis).">
          <EChart height={260} option={trendOption} ariaLabel={`Net worth trend from ${eurCompact(d.netWorth.historySheetTotalsOnly[0]?.total ?? 0)} to ${eurCompact(m.nw.sheet)}`} />
        </Card>

        <Card
          className="span-6"
          title={m.gaps.equity > 0 ? `Equity is ${eurCompact(m.gaps.equity)} below plan` : 'Allocation vs plan'}
          sub={
            <>
              Liquid portfolio vs {d.targets.name}: {m.target.equityPct}/{m.target.bondsPct}/{m.target.otherPct} + {eurCompact(m.target.bufferEUR)} buffer. The tick shows the target.
            </>
          }
        >
          <EChart height={220} option={allocOption} ariaLabel={ASSET_CLASSES.map((c) => `${CLASS_LABEL[c]}: ${gapText(c)}`).join('; ')} />
        </Card>

        <Card
          className="span-6"
          title={p50End ? `Median path: ${eurCompact(p50End.p50)} by ${fcLabels[fcLabels.length - 1]}` : 'Forecast'}
          sub={
            <span className="row">
              10-year net worth, p10–p90 <Prov src="estimate" note="Monte Carlo, seeded; see Scenarios for controls" />
              <Seg
                label="Nominal or real"
                value={real}
                onChange={setReal}
                options={[
                  { v: 'nominal', label: 'Nominal' },
                  { v: 'real', label: 'Real' },
                ]}
              />
            </span>
          }
          soft
        >
          {fc.out ? (
            <>
              <EChart
                height={220}
                option={fan(fcLabels, fcBands, pal.invested, pal)}
                ariaLabel={`Forecast: by ${fcLabels[fcLabels.length - 1]} net worth between ${eurCompact(p50End.p10)} (p10) and ${eurCompact(p50End.p90)} (p90)`}
              />
              <Assumptions>
                Savings <b>{eurCompact(fc.input.savingsPerYear)}/yr</b> (base) + pension <b>{eurCompact(fc.input.pensionContribPerYear)}/yr</b> · equity{' '}
                <b>
                  {fc.input.returns.equity.mean}% ± {fc.input.returns.equity.vol}%
                </b>
                , bonds <b>{fc.input.returns.bonds.mean}%</b>, cash <b>{fc.input.returns.cash.mean}%</b>, pension <b>{fc.input.returns.pension.mean}%</b>, home <b>{fc.input.returns.home.mean}%</b> · inflation{' '}
                <b>{fc.input.inflationPct}%</b> · rebalanced yearly to target · fees {pct(fc.feeDragPct, 2)} · RSUs <b>excluded</b>{fc.oneOffs.provided.length > 0 && <> · one-offs <b>+{eurCompact(fc.oneOffNetTotal)}</b> net</>}{fc.oneOffs.missing.length > 0 && <> ({fc.oneOffs.missing.length} not yet provided)</>} · {fc.input.paths.toLocaleString()} paths.{' '}
                <Link to="/scenarios">Change in Scenarios →</Link>
              </Assumptions>
            </>
          ) : (
            <p className="notprov">Annual net savings not yet provided (forecastAssumptions.annualNetSavingsEUR).</p>
          )}
        </Card>

        <div className="span-12">
          <div className="alerts">
            {cards.slice(0, 4).map((c) => (
              <Link key={c.title} to={c.to} className="alert" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="tag">{c.tag}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </Link>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Attention cards are rules on your own settings, not new advice. Recommendations on the Plan page are marked <Owner kind="judgment" />.
          </p>
        </div>
      </div>
    </>
  );
}
