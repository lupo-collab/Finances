import { useCallback, useMemo, useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov, Seg, Slider, Toggle, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { fan } from '../charts/options';
import { usePalette, CLASS_LABEL } from '../theme';
import { eur, eurCompact, pct } from '../lib/format';
import { runForecast, stressTest } from '../lib/calc/forecast';
import { worstYears } from '../lib/calc/history';
import { buildForecastInput, defaultForecastOptions, contingentStake, type SavingsCase } from '../lib/forecastInputs';
import type { RsuValuation } from '../lib/calc/rsu';
import { ASSET_CLASSES } from '../data/schema';

export function Scenarios() {
  const { d, m, basis } = useApp();
  const pal = usePalette();
  const fa = d.forecastAssumptions;
  const R = fa.returnsNominalEUR;
  const sv = fa.annualNetSavingsEUR;
  const [savings, setSavings] = useState<SavingsCase>('base');
  const [years, setYears] = useState(fa.horizonYears);
  const [eqMean, setEqMean] = useState(R.equity.mean);
  const [eqVol, setEqVol] = useState(R.equity.vol);
  const [bdMean, setBdMean] = useState(R.bonds.mean);
  const [infl, setInfl] = useState(fa.inflationPct);
  const [bdPct, setBdPct] = useState(m.target.bondsPct);
  const [otherCap, setOtherCap] = useState(m.target.otherCapPct);
  const [rsu, setRsu] = useState(false);
  const [rsuVal, setRsuVal] = useState<RsuValuation>('haircut50');
  const [stakeOn, setStakeOn] = useState(false);
  const [ing, setIng] = useState(false);
  const [oneOffsOn, setOneOffsOn] = useState(true);
  const [real, setReal] = useState<'nominal' | 'real'>('nominal');

  const eqPct = Math.max(0, 100 - bdPct - otherCap);
  const stake = contingentStake(d);
  const res = useMemo(() => {
    const o = {
      ...defaultForecastOptions(d, basis),
      years,
      savings,
      includeRsu: rsu,
      rsuValuation: rsuVal,
      includeStake: stakeOn,
      ingSwitch: ing && m.liquid.fundsHeld,
      includeOneOffs: oneOffsOn,
      target: { ...m.target, bondsPct: bdPct, otherCapPct: otherCap },
      returns: { equity: { mean: eqMean, vol: eqVol }, bonds: { mean: bdMean, vol: R.bonds.vol } },
      inflationPct: infl,
    };
    const fi = buildForecastInput(d, m, o);
    return { ...fi, out: fi.savingsMissing ? null : runForecast(fi.input), o };
  }, [d, m, basis, years, savings, rsu, rsuVal, stakeOn, ing, bdPct, otherCap, eqMean, eqVol, bdMean, infl, R.bonds.vol]);

  const startYear = Number(d.meta.asOf.slice(0, 4));
  const labels = res.out ? res.out.years.map((y) => String(startYear + y)) : [];
  const nwB = res.out ? (real === 'real' ? res.out.netWorthReal : res.out.netWorth) : [];
  const lqB = res.out ? (real === 'real' ? res.out.liquidReal : res.out.liquid) : [];

  // Stress test: an instant shock on the liquid portfolio or on all investable wealth, by hand or replaying a past year
  const [scope, setScope] = useState<'investable' | 'liquid'>('investable');
  const [shockEq, setShockEq] = useState(-30);
  const [shockOther, setShockOther] = useState(-40);
  const [shockBd, setShockBd] = useState(-5);
  const [replay, setReplay] = useState<string | null>(null);
  const H = m.history;
  const hasHistory = H.plan.years.length > 0;
  const worst = worstYears(H.plan, 4).sort();
  const worst1 = worstYears(H.plan, 1)[0] ?? '';
  const applyYear = useCallback(
    (y: string) => {
      if (H.equity.byYear[y] == null || H.bonds.byYear[y] == null) return;
      setShockEq(H.equity.byYear[y]);
      setShockBd(H.bonds.byYear[y]);
      setShockOther(H.equity.byYear[y]);
      setReplay(y);
    },
    [H],
  );
  const manual = (f: (v: number) => void) => (v: number) => {
    f(v);
    setReplay(null);
  };
  const stBase = scope === 'liquid' ? m.liquid.classes : m.wealth;
  const stTotal = stBase.equity + stBase.bonds + stBase.other + stBase.cash;
  const st = stressTest(stBase, { equity: shockEq, bonds: shockBd, other: shockOther, cash: 0 });
  const stOption = {
    grid: { left: 60, right: 14, top: 34, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: ASSET_CLASSES.map((c) => CLASS_LABEL[c]) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: 'Today', type: 'bar', itemStyle: { color: pal.off }, data: ASSET_CLASSES.map((c) => stBase[c]) },
      { name: replay ? `Replaying ${replay}` : 'After the shock', type: 'bar', data: ASSET_CLASSES.map((c) => ({ value: st.after[c], itemStyle: { color: pal[c] } })) },
    ],
  };

  // History: the plan's ETF sleeves, year by year
  const growth = H.plan.years.reduce((a, y) => a * (1 + H.plan.byYear[y] / 100), 1);
  const cagr = H.plan.years.length ? (Math.pow(growth, 1 / H.plan.years.length) - 1) * 100 : 0;
  const histOption = {
    grid: { left: 44, right: 14, top: 34, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => pct(v, 1) },
    xAxis: { type: 'category', data: H.plan.years, triggerEvent: true },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${v}%` } },
    series: [
      { name: 'Equity ETFs', type: 'bar', itemStyle: { color: pal.equity }, data: H.plan.years.map((y) => H.equity.byYear[y]) },
      { name: 'Bond ETFs', type: 'bar', itemStyle: { color: pal.bonds }, data: H.plan.years.map((y) => H.bonds.byYear[y]) },
      { name: `Plan mix ${100 - m.target.bondsPct - m.target.otherCapPct}/${m.target.bondsPct}`, type: 'line', symbolSize: 6, itemStyle: { color: pal.text }, lineStyle: { color: pal.text, width: 2 }, data: H.plan.years.map((y) => H.plan.byYear[y]) },
    ],
  };
  // a click on a bar or point gives the category in `name`; on a year label (triggerEvent) in `value`
  const onHistClick = useCallback(
    (p: unknown) => {
      const e = p as { componentType?: string; name?: string; value?: unknown };
      applyYear(String(e.componentType === 'xAxis' ? e.value : e.name));
    },
    [applyYear],
  );
  const sleeveText = (cls: 'equity' | 'bonds') => Object.entries(m.sleeves[cls]).map(([k, v]) => `${k} ${v}%`).join(', ');

  const at = (bands: typeof nwB, y: number) => bands[Math.min(y, bands.length - 1)];
  return (
    <>
      <PageTitle sub="Monte Carlo with a fixed seed: same inputs, same picture. Ranges, not predictions.">Scenarios</PageTitle>
      <div className="grid">
        <Card className="span-12" title="Assumptions">
          <div className="controls">
            <label className="slider">
              <span>Net savings / yr (low · base · high) <Prov src={sv.src} note={sv.note} /></span>
              <Seg label="Savings case" value={savings} onChange={setSavings} options={[{ v: 'low', label: `${sv.low != null ? eurCompact(sv.low) : '—'}` }, { v: 'base', label: `${sv.base != null ? eurCompact(sv.base) : '—'}` }, { v: 'high', label: `${sv.high != null ? eurCompact(sv.high) : '—'}` }]} />
            </label>
            <label className="slider">
              <span>Horizon</span>
              <Seg label="Horizon" value={String(years) as '10' | '20'} onChange={(v) => setYears(Number(v))} options={[{ v: '10', label: '10 years' }, { v: '20', label: '20 years' }]} />
            </label>
            <label className="slider">
              <span>View</span>
              <Seg label="Nominal or real" value={real} onChange={setReal} options={[{ v: 'nominal', label: 'Nominal' }, { v: 'real', label: 'Real' }]} />
            </label>
            <Slider label="Equity return" value={eqMean} min={0} max={10} step={0.5} onChange={setEqMean} fmt={(v) => pct(v)} />
            <Slider label="Equity volatility" value={eqVol} min={5} max={30} step={1} onChange={setEqVol} fmt={(v) => pct(v, 0)} />
            <Slider label="Bond return" value={bdMean} min={0} max={6} step={0.5} onChange={setBdMean} fmt={(v) => pct(v)} />
            <Slider label="Inflation" value={infl} min={0} max={6} step={0.5} onChange={setInfl} fmt={(v) => pct(v)} />
            <Slider label="Bonds, % of investable wealth" value={bdPct} min={0} max={60} step={5} onChange={setBdPct} fmt={(v) => `${v}% (equity ${eqPct}%)`} />
            <Slider label="Other: cap" value={otherCap} min={0} max={20} step={1} onChange={setOtherCap} fmt={(v) => `${v}%`} />
          </div>
          <div className="row">
            {(d.forecastAssumptions.oneOffInflows?.length ?? 0) > 0 && <Toggle label="Include one-off inflows" checked={oneOffsOn} onChange={setOneOffsOn} />}
            <Toggle label="Include RSUs" checked={rsu} onChange={setRsu} />
            {rsu && <Seg label="RSU valuation" value={rsuVal} onChange={setRsuVal} options={[{ v: 'zero', label: 'Zero' }, { v: 'haircut50', label: '50%' }, { v: 'grant', label: 'Grant' }]} />}
            {stake && <Toggle label={`${stake.label.split(' (')[0]} (0 / ${eurCompact(stake.contingentUpsideEUR ?? 0)})`} checked={stakeOn} onChange={setStakeOn} />}
            {m.liquid.fundsHeld && <Toggle label={`${m.fundsAcctName} switch`} checked={ing} onChange={setIng} />}
          </div>
        </Card>

        {res.out ? (
          <>
            <Card className="span-6" soft title={`Net worth: ${eurCompact(at(nwB, years).p10)}–${eurCompact(at(nwB, years).p90)} by ${labels[labels.length - 1]}`} sub={`p50 ${eurCompact(at(nwB, years).p50)} · ${real}`}>
              <EChart height={280} option={fan(labels, nwB, pal.invested, pal)} ariaLabel={`Net worth fan, p50 ${eurCompact(at(nwB, years).p50)} at year ${years}`} />
            </Card>
            <Card className="span-6" soft title={`Liquid portfolio: p50 ${eurCompact(at(lqB, years).p50)} by ${labels[labels.length - 1]}`} sub={`p10–p90 ${eurCompact(at(lqB, years).p10)}–${eurCompact(at(lqB, years).p90)} · ${real}`}>
              <EChart height={280} option={fan(labels, lqB, pal.equity, pal, 'Liquid')} ariaLabel={`Liquid portfolio fan, p50 ${eurCompact(at(lqB, years).p50)}`} />
            </Card>
            <Card className="span-12" title="Percentiles">
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Horizon</th><th>Measure</th><th className="r">p10</th><th className="r">p50</th><th className="r">p90</th></tr></thead>
                  <tbody>
                    {[5, 10, ...(years >= 20 ? [20] : [])].filter((y) => y <= years).flatMap((y) => [
                      <tr key={`nw${y}`}><td>{y} years ({startYear + y})</td><td>Net worth</td><td className="r">{eur(at(nwB, y).p10)}</td><td className="r"><b>{eur(at(nwB, y).p50)}</b></td><td className="r">{eur(at(nwB, y).p90)}</td></tr>,
                      <tr key={`lq${y}`}><td></td><td>Liquid portfolio</td><td className="r">{eur(at(lqB, y).p10)}</td><td className="r">{eur(at(lqB, y).p50)}</td><td className="r">{eur(at(lqB, y).p90)}</td></tr>,
                    ])}
                  </tbody>
                </table>
              </div>
              <Assumptions>
                {res.input.paths.toLocaleString()} paths, seed {res.input.seed}, annual steps. Savings <b>{eurCompact(res.input.savingsPerYear)}/yr</b> <Prov src={sv.src} note={sv.note} />, pension contributions <b>{eurCompact(res.input.pensionContribPerYear)}/yr</b> <Prov src={fa.pensionContributionsEURperYear.src} />. Returns (mean ± vol): equity {res.input.returns.equity.mean}±{res.input.returns.equity.vol}%, bonds {res.input.returns.bonds.mean}±{res.input.returns.bonds.vol}%, other {R.other.mean}±{R.other.vol}%, cash {R.cash.mean}%, pension {R.pension.mean}±{R.pension.vol}% (net of fees and tax{(fa.pensionEquityCorrelation ?? 0) > 0 ? `, correlation ${fa.pensionEquityCorrelation} with equities` : ''}), home {R.home.mean}±{R.home.vol}% <Prov src="judgment" note={R.equity.src} />. Equity–bond correlation {fa.equityBondCorrelation}. Rebalanced yearly: bonds {bdPct}% of investable wealth, counting the pension's bond share ({pct((1 - m.pension.equityShare) * 100, 0)} of it); other held, never bought, capped at {otherCap}%; equity the rest; {eurCompact(m.target.bufferEUR)} cash buffer. Fee drag {pct(res.feeDragPct, 2)}/yr. Mortgage amortises on schedule. Home starts at {basis === 'market' ? 'stated value' : 'sheet equity + mortgage'}.
                {oneOffsOn && res.oneOffs.provided.length > 0 && (
                  <>
                    {' '}One-offs: {res.oneOffs.provided.map((x) => `${x.label} ${eurCompact(x.grossEUR)} gross → ${eurCompact(x.netEUR)} net at ${x.taxPct}% tax`).join('; ')} <Prov src="estimate" note="Net = gross × (1 − marginal tax rate)" />.
                    {res.oneOffs.missing.length > 0 && <> Not yet provided: {res.oneOffs.missing.map((x) => x.label).join(', ')}.</>}
                  </>
                )}
                {rsu && <> RSUs: {eurCompact(res.rsuInflowTotal)} net added over the horizon ({rsuVal}, after {res.o.rsuWithholdPct}% withholding, estimate from previous employer's sell-to-cover).</>}
                {stakeOn && stake && <> {stake.label}: +{eurCompact(stake.contingentUpsideEUR ?? 0)} gross in year 1.</>}
                {ing && m.liquid.fundsHeld && <> {m.fundsAcctName} switch: −{eurCompact(m.ingSwitch.tax)} tax today, ETF-level costs after.</>}
                {' '}Real view deflates by {infl}%/yr. Year 0 uses statement values, so it differs slightly from the sheet total.
              </Assumptions>
            </Card>
          </>
        ) : (
          <Card className="span-12"><p className="notprov">Annual net savings not yet provided: the forecast needs forecastAssumptions.annualNetSavingsEUR.</p></Card>
        )}

        <Card
          className="span-12"
          title={`Stress test: ${replay ? `a repeat of ${replay}` : 'an instant shock'} costs ${eurCompact(-st.loss)} (${pct((st.loss / (stTotal || 1)) * 100)})`}
          sub={`${scope === 'liquid' ? 'Liquid portfolio' : 'Investable wealth: liquid + pension funds (looked through) + loan'}; no recovery modelled`}
        >
          <div className="controls">
            <label className="slider">
              <span>Applies to</span>
              <Seg label="Stress test scope" value={scope} onChange={setScope} options={[{ v: 'investable', label: 'Investable wealth' }, { v: 'liquid', label: 'Liquid only' }]} />
            </label>
            <Slider label="Equity" value={shockEq} min={-60} max={40} step={1} onChange={manual(setShockEq)} fmt={(v) => pct(v, 1)} />
            <Slider label="Bonds" value={shockBd} min={-20} max={20} step={1} onChange={manual(setShockBd)} fmt={(v) => pct(v, 1)} />
            <Slider label="Other" value={shockOther} min={-80} max={40} step={1} onChange={manual(setShockOther)} fmt={(v) => pct(v, 1)} />
          </div>
          <div className="row" style={{ margin: '4px 0 8px' }}>
            <button className="btn" onClick={() => { setShockEq(-30); setShockBd(-5); setShockOther(-40); setReplay(null); }}>Equity −30%</button>
            <button className="btn" onClick={() => { setShockEq(-50); setShockBd(-10); setShockOther(-60); setReplay(null); }}>Equity −50%</button>
            {hasHistory && (
              <>
                <span className="muted small">Replay the plan's worst years:</span>
                {worst.map((y) => (
                  <button key={y} className={`btn${replay === y ? ' primary' : ''}`} onClick={() => applyYear(y)}>{y}</button>
                ))}
              </>
            )}
          </div>
          <EChart height={240} option={stOption} ariaLabel={`Stress test loss ${eur(st.loss)}`} />
          <Assumptions>
            After the shock: {ASSET_CLASSES.map((c) => `${CLASS_LABEL[c]} ${pct(st.pct[c])}`).join(' · ')} · total {eur(st.total)}.
            {replay && <> {replay} as the plan's ETFs lived it, after costs: equity sleeve {pct(shockEq, 1)}, bond sleeve {pct(shockBd, 1)} <Prov src={d.historicalReturns?.src} note={d.historicalReturns?.note} />. Other is assumed to move like equity (no history for it) <Prov src="judgment" />{scope === 'investable' ? '; the pension is counted by its equity/bond split' : ''}.</>}
          </Assumptions>
        </Card>

        {hasHistory && (
          <Card
            className="span-12"
            title={`The plan's ETFs, ${H.plan.years[0]}–${H.plan.years[H.plan.years.length - 1]}: ${pct(cagr, 1)} a year; worst year ${worst1} (${pct(H.plan.byYear[worst1], 1)})`}
            sub="Calendar-year returns after product costs, before tax, rebalanced yearly. Click a year to replay it in the stress test."
          >
            <EChart height={280} option={histOption} ariaLabel={`Yearly returns of the plan's ETF sleeves; the worst year for the mix was ${worst1}`} onClick={onHistClick} />
            <Assumptions>
              Equity sleeve {sleeveText('equity')}; bond sleeve {sleeveText('bonds')}; plan mix weights them {100 - m.target.bondsPct - m.target.otherCapPct}/{m.target.bondsPct} (other has no history).
              {H.equity.missing.length + H.bonds.missing.length > 0 && <> No history for {[...H.equity.missing, ...H.bonds.missing].join(', ')}: left out.</>} {d.historicalReturns?.note} <Prov src={d.historicalReturns?.src} />
            </Assumptions>
          </Card>
        )}
      </div>
    </>
  );
}
