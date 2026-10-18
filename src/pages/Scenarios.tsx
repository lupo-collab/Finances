import { useMemo, useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov, Seg, Slider, Toggle, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { fan } from '../charts/options';
import { usePalette, CLASS_LABEL } from '../theme';
import { eur, eurCompact, pct } from '../lib/format';
import { runForecast, stressTest } from '../lib/calc/forecast';
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
  const [eqPct, setEqPct] = useState(m.target.equityPct);
  const [bdPct, setBdPct] = useState(m.target.bondsPct);
  const [rsu, setRsu] = useState(false);
  const [rsuVal, setRsuVal] = useState<RsuValuation>('haircut50');
  const [stakeOn, setStakeOn] = useState(false);
  const [ing, setIng] = useState(false);
  const [oneOffsOn, setOneOffsOn] = useState(true);
  const [real, setReal] = useState<'nominal' | 'real'>('nominal');

  const otherPct = Math.max(0, 100 - eqPct - bdPct);
  const stake = contingentStake(d);
  const res = useMemo(() => {
    const o = {
      ...defaultForecastOptions(d, basis),
      years,
      savings,
      includeRsu: rsu,
      rsuValuation: rsuVal,
      includeStake: stakeOn,
      ingSwitch: ing,
      includeOneOffs: oneOffsOn,
      target: { ...m.target, equityPct: eqPct, bondsPct: bdPct, otherPct },
      returns: { equity: { mean: eqMean, vol: eqVol }, bonds: { mean: bdMean, vol: R.bonds.vol } },
      inflationPct: infl,
    };
    const fi = buildForecastInput(d, m, o);
    return { ...fi, out: fi.savingsMissing ? null : runForecast(fi.input), o };
  }, [d, m, basis, years, savings, rsu, rsuVal, stakeOn, ing, eqPct, bdPct, otherPct, eqMean, eqVol, bdMean, infl, R.bonds.vol]);

  const startYear = Number(d.meta.asOf.slice(0, 4));
  const labels = res.out ? res.out.years.map((y) => String(startYear + y)) : [];
  const nwB = res.out ? (real === 'real' ? res.out.netWorthReal : res.out.netWorth) : [];
  const lqB = res.out ? (real === 'real' ? res.out.liquidReal : res.out.liquid) : [];

  const [shockEq, setShockEq] = useState(-30);
  const [shockOther, setShockOther] = useState(-40);
  const [shockBd, setShockBd] = useState(-5);
  const st = stressTest(m.liquid.classes, { equity: shockEq, bonds: shockBd, other: shockOther, cash: 0 });
  const stOption = {
    grid: { left: 60, right: 14, top: 34, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: ASSET_CLASSES.map((c) => CLASS_LABEL[c]) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: 'Today', type: 'bar', itemStyle: { color: pal.off }, data: ASSET_CLASSES.map((c) => m.liquid.classes[c]) },
      { name: 'After shock', type: 'bar', data: ASSET_CLASSES.map((c) => ({ value: st.after[c], itemStyle: { color: pal[c] } })) },
    ],
  };

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
            <Slider label="Equity allocation" value={eqPct} min={0} max={100} step={5} onChange={(v) => { setEqPct(v); if (v + bdPct > 100) setBdPct(100 - v); }} fmt={(v) => `${v}%`} />
            <Slider label="Bond allocation" value={bdPct} min={0} max={100 - eqPct} step={5} onChange={setBdPct} fmt={(v) => `${v}% (other ${otherPct}%)`} />
          </div>
          <div className="row">
            {(d.forecastAssumptions.oneOffInflows?.length ?? 0) > 0 && <Toggle label="Include one-off inflows" checked={oneOffsOn} onChange={setOneOffsOn} />}
            <Toggle label="Include RSUs" checked={rsu} onChange={setRsu} />
            {rsu && <Seg label="RSU valuation" value={rsuVal} onChange={setRsuVal} options={[{ v: 'zero', label: 'Zero' }, { v: 'haircut50', label: '50%' }, { v: 'grant', label: 'Grant' }]} />}
            {stake && <Toggle label={`${stake.label.split(' (')[0]} (0 / ${eurCompact(stake.contingentUpsideEUR ?? 0)})`} checked={stakeOn} onChange={setStakeOn} />}
            <Toggle label={`${m.fundsAcctName} switch`} checked={ing} onChange={setIng} />
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
                {res.input.paths.toLocaleString()} paths, seed {res.input.seed}, annual steps. Savings <b>{eurCompact(res.input.savingsPerYear)}/yr</b> <Prov src={sv.src} note={sv.note} />, pension contributions <b>{eurCompact(res.input.pensionContribPerYear)}/yr</b> <Prov src={fa.pensionContributionsEURperYear.src} />. Returns (mean ± vol): equity {res.input.returns.equity.mean}±{res.input.returns.equity.vol}%, bonds {res.input.returns.bonds.mean}±{res.input.returns.bonds.vol}%, other {R.other.mean}±{R.other.vol}%, cash {R.cash.mean}%, pension {R.pension.mean}±{R.pension.vol}% (net of fees and tax{(fa.pensionEquityCorrelation ?? 0) > 0 ? `, correlation ${fa.pensionEquityCorrelation} with equities` : ''}), home {R.home.mean}±{R.home.vol}% <Prov src="judgment" note={R.equity.src} />. Equity–bond correlation {fa.equityBondCorrelation}. Rebalanced yearly to {eqPct}/{bdPct}/{otherPct} + {eurCompact(m.target.bufferEUR)} buffer. Fee drag {pct(res.feeDragPct, 2)}/yr. Mortgage amortises on schedule. Home starts at {basis === 'market' ? 'stated value' : 'sheet equity + mortgage'}.
                {oneOffsOn && res.oneOffs.provided.length > 0 && (
                  <>
                    {' '}One-offs: {res.oneOffs.provided.map((x) => `${x.label} ${eurCompact(x.grossEUR)} gross → ${eurCompact(x.netEUR)} net at ${x.taxPct}% tax`).join('; ')} <Prov src="estimate" note="Net = gross × (1 − marginal tax rate)" />.
                    {res.oneOffs.missing.length > 0 && <> Not yet provided: {res.oneOffs.missing.map((x) => x.label).join(', ')}.</>}
                  </>
                )}
                {rsu && <> RSUs: {eurCompact(res.rsuInflowTotal)} net added over the horizon ({rsuVal}, after {res.o.rsuWithholdPct}% withholding, estimate from previous employer's sell-to-cover).</>}
                {stakeOn && stake && <> {stake.label}: +{eurCompact(stake.contingentUpsideEUR ?? 0)} gross in year 1.</>}
                {ing && <> {m.fundsAcctName} switch: −{eurCompact(m.ingSwitch.tax)} tax today, ETF-level costs after.</>}
                {' '}Real view deflates by {infl}%/yr. Year 0 uses statement values, so it differs slightly from the sheet total.
              </Assumptions>
            </Card>
          </>
        ) : (
          <Card className="span-12"><p className="notprov">Annual net savings not yet provided: the forecast needs forecastAssumptions.annualNetSavingsEUR.</p></Card>
        )}

        <Card className="span-12" title={`Stress test: an instant shock costs ${eurCompact(-st.loss)} (${pct((st.loss / m.liquid.classes.total) * 100)})`} sub="Liquid portfolio only; no recovery modelled">
          <div className="controls">
            <Slider label="Equity" value={shockEq} min={-60} max={0} step={5} onChange={setShockEq} fmt={(v) => `${v}%`} />
            <Slider label="Bonds" value={shockBd} min={-20} max={5} step={1} onChange={setShockBd} fmt={(v) => `${v}%`} />
            <Slider label="Other" value={shockOther} min={-80} max={0} step={5} onChange={setShockOther} fmt={(v) => `${v}%`} />
            <div className="row">
              <button className="btn" onClick={() => { setShockEq(-30); setShockBd(-5); setShockOther(-40); }}>Equity −30%</button>
              <button className="btn" onClick={() => { setShockEq(-50); setShockBd(-10); setShockOther(-60); }}>Equity −50%</button>
            </div>
          </div>
          <EChart height={240} option={stOption} ariaLabel={`Stress test loss ${eur(st.loss)}`} />
          <Assumptions>
            After the shock: {ASSET_CLASSES.map((c) => `${CLASS_LABEL[c]} ${pct(st.pct[c])}`).join(' · ')} · total {eur(st.total)}.
          </Assumptions>
        </Card>
      </div>
    </>
  );
}
