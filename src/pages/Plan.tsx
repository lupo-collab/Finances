import { useMemo, useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov, Slider, Toggle, Owner, Assumptions } from '../components/ui';
import { usePalette, CLASS_LABEL } from '../theme';
import { eur, eurCompact, pct, fmtDate } from '../lib/format';
import { investNewMoney, gaps as calcGaps, targetValues, type TargetSpec } from '../lib/calc/targets';
import { classTotals, pieces, tickerTotals } from '../lib/calc/liquid';
import { daysBetween, parseISODate } from '../lib/calc/util';
import { EChart } from '../charts/EChart';
import { ASSET_CLASSES } from '../data/schema';

export function Plan() {
  const { d, m, today } = useApp();
  const pal = usePalette();
  const [t, setT] = useState<TargetSpec>(m.target);
  const [ingExit, setIngExit] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);

  const scen = useMemo(() => {
    const positions = ingExit ? d.liquidPortfolio.positions.filter((p) => p.account !== m.fundsAcct) : d.liquidPortfolio.positions;
    const freed = ingExit ? m.liquid.ingValue - m.ingSwitch.tax : 0;
    // managed-fund proceeds land as cash, then get deployed
    const cash = [...d.liquidPortfolio.cash, ...(ingExit ? [{ account: m.fundsAcct, label: `${m.fundsAcctName} exit proceeds (after tax upper bound)`, valueEUR: freed, src: 'computed' }] : [])];
    const cls = classTotals(pieces(positions, cash));
    return { cls, tickers: tickerTotals(positions), freed };
  }, [d, m, ingExit]);
  const defaultAmt = Math.max(0, scen.cls.cash - t.bufferEUR);
  const amt = amount ?? defaultAmt;
  const orders = investNewMoney({
    amountEUR: amt,
    actual: scen.cls,
    target: t,
    sleeves: { equity: d.targets.sleeves.equity.split, bonds: d.targets.sleeves.bonds.split, other: d.targets.sleeves.other.split },
    tickerValues: scen.tickers,
  });
  const after = { ...scen.cls };
  after.cash -= amt;
  for (const o of orders) after[o.assetClass] += o.amountEUR;
  const g = calcGaps(scen.cls, t);
  const tv = targetValues(scen.cls.total, t);
  const sumPct = t.equityPct + t.bondsPct + t.otherPct;

  const beforeAfter = {
    grid: { left: 60, right: 14, top: 34, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: ASSET_CLASSES.map((c) => CLASS_LABEL[c]) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: 'Now', type: 'bar', itemStyle: { color: pal.off }, data: ASSET_CLASSES.map((c) => scen.cls[c]) },
      { name: 'After orders', type: 'bar', data: ASSET_CLASSES.map((c) => ({ value: after[c], itemStyle: { color: pal[c] } })) },
      { name: 'Target', type: 'scatter', symbol: 'rect', symbolSize: [30, 3], itemStyle: { color: pal.text }, data: ASSET_CLASSES.map((c) => tv[c]) },
    ],
  };

  const acts = [...d.actions].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const ms = [...d.milestones].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageTitle sub={`${d.targets.name} · applies to: ${(d.targets as { defaultScope?: string }).defaultScope ?? 'liquid portfolio'}`}>Plan</PageTitle>
      <div className="grid">
        <Card className="span-5" title="Target" sub={<>Defaults from {d.targets.name} <Prov src={d.targets.src} /></>}>
          <div className="controls">
            <Slider label="Equity" value={t.equityPct} min={0} max={100} step={1} onChange={(v) => setT({ ...t, equityPct: v })} fmt={(v) => `${v}%`} />
            <Slider label="Bonds" value={t.bondsPct} min={0} max={100} step={1} onChange={(v) => setT({ ...t, bondsPct: v })} fmt={(v) => `${v}%`} />
            <Slider label="Other" value={t.otherPct} min={0} max={30} step={1} onChange={(v) => setT({ ...t, otherPct: v })} fmt={(v) => `${v}%`} />
            <Slider label="Cash buffer" value={t.bufferEUR} min={0} max={100000} step={5000} onChange={(v) => setT({ ...t, bufferEUR: v })} fmt={eurCompact} />
          </div>
          {sumPct !== 100 && <p className="error">Equity + bonds + other = {sumPct}% (should be 100%).</p>}
          <button className="btn" onClick={() => setT(m.target)}>Reset to {d.targets.name}</button>
          {d.targets.scopeDecision ? (
            <Assumptions>
              <Owner kind="owner" /> {fmtDate(d.targets.scopeDecision.date)}: {d.targets.scopeDecision.text}
            </Assumptions>
          ) : (
            d.targets.scopeOpenQuestion && (
              <Assumptions>
                <b>Open question:</b> {d.targets.scopeOpenQuestion}
              </Assumptions>
            )
          )}
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Class</th><th className="r">Target</th><th className="r">Actual</th><th className="r">Gap</th></tr></thead>
            <tbody>
              {ASSET_CLASSES.map((c) => (
                <tr key={c}><td><span className="swatch" style={{ background: `var(--${c})` }} />{CLASS_LABEL[c]}</td><td className="r">{eur(tv[c])}</td><td className="r">{eur(scen.cls[c])}</td><td className={`r ${g[c] > 0 ? 'up' : 'down'}`}>{g[c] > 0 ? '+' : ''}{eur(g[c])}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="span-7" title={`Invest ${eurCompact(amt)}: buy-only orders`} sub="Closes class gaps first, then moves each ETF toward its sleeve split. A calculator, not a recommendation.">
          <div className="controls">
            <label className="slider">
              <span>Amount to invest (default = cash above buffer)</span>
              <input type="number" min={0} step={1000} value={Math.round(amt)} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <Toggle label={`Assume ${m.fundsAcctName} funds exited (+${eurCompact(m.liquid.ingValue - m.ingSwitch.tax)} after ≤ ${eurCompact(m.ingSwitch.tax)} tax)`} checked={ingExit} onChange={(v) => { setIngExit(v); setAmount(null); }} />
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Buy</th><th>Class</th><th className="r">Amount</th><th className="r">Share</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.ticker}>
                    <td><b>{o.ticker === 'TBD' ? 'TBD (bond ETF to choose)' : o.ticker}</b></td>
                    <td><span className="swatch" style={{ background: `var(--${o.assetClass})` }} />{CLASS_LABEL[o.assetClass]}</td>
                    <td className="r">{eur(o.amountEUR)}</td>
                    <td className="r">{pct((o.amountEUR / (amt || 1)) * 100)}</td>
                  </tr>
                ))}
                {!orders.length && <tr><td colSpan={4} className="muted">Nothing to buy.</td></tr>}
              </tbody>
            </table>
          </div>
          <EChart height={220} option={beforeAfter} ariaLabel="Allocation now vs after the orders, with targets" />
          <Assumptions>
            Sleeves: equity {Object.entries(d.targets.sleeves.equity.split ?? {}).map(([k, v]) => `${k} ${v}%`).join(', ')}; bonds {Object.entries(d.targets.sleeves.bonds.split ?? {}).map(([k, v]) => `${k} ${v}%`).join(', ')}; other: {d.targets.sleeves.other.candidates?.join(', ')}. {d.targets.googPolicy ? `${m.liquid.singleStockName} policy: ${d.targets.googPolicy.guardrails}` : ''}
            {ingExit && <> {m.fundsAcctName} exit uses the tax upper bound (26% of winners' gains <Prov src="computed" />).</>}
          </Assumptions>
        </Card>

        <Card className="span-8" title="Actions">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Action</th><th>Type</th><th>Who</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {acts.map((a) => {
                  const dd = a.due ? daysBetween(today, parseISODate(a.due)) : null;
                  return (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'normal', minWidth: 220 }} title={a.why}>{a.title}{a.why && <div className="muted small">{a.why}</div>}</td>
                      <td><span className="pill neutral">{a.type}</span></td>
                      <td>{a.type === 'recommendation' ? <Owner kind="judgment" /> : a.type === 'decision' ? <Owner kind="owner" /> : a.owner}</td>
                      <td className={dd != null && dd < 0 ? 'down' : ''}>{a.due ? `${fmtDate(a.due)}${dd != null ? ` (${dd < 0 ? `${-dd} d overdue` : `in ${dd} d`})` : ''}` : '—'}</td>
                      <td><span className={`pill ${a.status === 'done' ? 'pass' : a.status === 'standing' || a.status === 'dropped' ? 'neutral' : 'warn'}`}>{a.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="span-4" title="Milestones">
          <ul className="list timeline">
            {ms.map((x) => {
              const dd = daysBetween(today, parseISODate(x.date));
              return (
                <li key={x.date + x.label} className={dd < 0 ? 'past' : ''}>
                  <span className="when">{fmtDate(x.date)}</span>
                  <span style={{ flex: 1 }}>{x.label}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
