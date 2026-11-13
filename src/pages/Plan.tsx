import { useMemo, useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov, Slider, Toggle, Owner, Assumptions } from '../components/ui';
import { usePalette, CLASS_LABEL } from '../theme';
import { eur, eurCompact, pct, fmtDate } from '../lib/format';
import { investPlan, classTargets, gaps as calcGaps, type TargetSpec, type Wealth } from '../lib/calc/targets';
import { classTotals, pieces, tickerTotals } from '../lib/calc/liquid';
import { daysBetween, parseISODate } from '../lib/calc/util';
import { EChart } from '../charts/EChart';
import { ASSET_CLASSES } from '../data/schema';

export function Plan() {
  const { d, m, today } = useApp();
  const pal = usePalette();
  const [t, setT] = useState<TargetSpec>(m.target);
  const [fundsExit, setFundsExit] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [minOrder, setMinOrder] = useState(m.minOrderEUR);
  const [copied, setCopied] = useState('');

  // Investable wealth, optionally with the managed funds sold (proceeds after the tax upper bound land as cash)
  const base = useMemo(() => {
    if (!fundsExit || !m.liquid.fundsHeld) return { wealth: m.wealth, tickers: m.liquid.tickers };
    const positions = d.liquidPortfolio.positions.filter((p) => p.account !== m.fundsAcct);
    const cash = [...d.liquidPortfolio.cash, { account: m.fundsAcct, label: 'exit proceeds', valueEUR: m.liquid.ingValue - m.ingSwitch.tax, src: 'computed' }];
    const cls = classTotals(pieces(positions, cash));
    const wealth: Wealth = { equity: cls.equity + m.pension.equity, bonds: cls.bonds + m.pension.bonds, other: cls.other + m.receivable, cash: cls.cash };
    return { wealth, tickers: tickerTotals(positions) };
  }, [d, m, fundsExit]);
  const w = base.wealth;
  const defaultAmt = Math.max(0, w.cash - t.bufferEUR);
  const amt = Math.max(0, amount ?? defaultAmt);
  const plan = investPlan({ wealth: w, target: t, amountEUR: amt, sleeves: m.sleeves, tickerValues: base.tickers, minOrderEUR: minOrder });
  const ct = classTargets(w, t);
  const g = calcGaps(w, t);
  const eqNominal = 100 - t.bondsPct - t.otherCapPct;
  const pen = { equity: m.pension.equity, bonds: m.pension.bonds, other: 0, cash: 0 };
  const tv = { equity: ct.equity, bonds: ct.bonds, other: ct.otherCap, cash: ct.cash };
  const share = (x: number) => pct((x / (plan.targets.investable || 1)) * 100);

  const beforeAfter = {
    grid: { left: 60, right: 14, top: 34, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: ASSET_CLASSES.map((c) => (c === 'other' ? 'Other (cap)' : c === 'cash' ? 'Cash (buffer)' : CLASS_LABEL[c])) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: 'Now', type: 'bar', itemStyle: { color: pal.off }, data: ASSET_CLASSES.map((c) => w[c]) },
      { name: 'After the orders', type: 'bar', data: ASSET_CLASSES.map((c) => ({ value: c === 'cash' ? w.cash - plan.total : plan.after[c], itemStyle: { color: pal[c] } })) },
      { name: 'Target', type: 'scatter', symbol: 'rect', symbolSize: [30, 3], itemStyle: { color: pal.text }, data: ASSET_CLASSES.map((c) => tv[c]) },
    ],
  };

  const orderText = () => {
    const rows = plan.rows.filter((r) => r.buy >= 0.5).map((r) => {
      const i = m.instrument(r.ticker);
      return `${r.ticker}${i.isin ? ` (${i.isin})` : ''}: ${eur(r.buy)}`;
    });
    return `Buy orders, ${fmtDate(new Date().toISOString().slice(0, 10))}\n${rows.join('\n')}\nTotal: ${eur(plan.total)}`;
  };
  const copy = () => {
    const txt = orderText();
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => setCopied('Copied.'), () => setCopied(txt.replace(/\n/g, ' · ')));
    else setCopied(txt.replace(/\n/g, ' · '));
  };

  const acts = [...d.actions].sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const ms = [...d.milestones].sort((a, b) => a.date.localeCompare(b.date));
  const rules = d.targets.rules;

  return (
    <>
      <PageTitle sub={`${d.targets.name} · applies to: ${(d.targets as { defaultScope?: string }).defaultScope ?? 'investable wealth'}`}>Plan</PageTitle>
      <div className="grid">
        <Card className="span-5" title={`Target: ${eqNominal}/${t.bondsPct}/${t.otherCapPct} on ${eurCompact(ct.investable)} investable`} sub={<>Defaults from {d.targets.name} <Prov src={d.targets.src} /></>}>
          <div className="controls">
            <Slider label="Bonds, % of investable wealth" value={t.bondsPct} min={0} max={40} step={1} onChange={(v) => setT({ ...t, bondsPct: v })} fmt={(v) => `${v}%`} />
            <Slider label="Other: cap" value={t.otherCapPct} min={0} max={20} step={1} onChange={(v) => setT({ ...t, otherCapPct: v })} fmt={(v) => `${v}%`} />
            <Slider label="Cash buffer" value={t.bufferEUR} min={0} max={100000} step={5000} onChange={(v) => setT({ ...t, bufferEUR: v })} fmt={eurCompact} />
          </div>
          <button className="btn" onClick={() => setT(m.target)}>Reset to {d.targets.name}</button>
          {d.targets.scopeDecision ? (
            <Assumptions>
              <Owner kind="owner" /> {fmtDate(d.targets.scopeDecision.date)}: {d.targets.scopeDecision.text}
              {d.targets.scopeDecision.note && <div className="muted small">{d.targets.scopeDecision.note}</div>}
            </Assumptions>
          ) : (
            d.targets.scopeOpenQuestion && (
              <Assumptions>
                <b>Open question:</b> {d.targets.scopeOpenQuestion}
              </Assumptions>
            )
          )}
          <div className="tablewrap">
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Class</th><th className="r">Target</th><th className="r">Actual</th><th className="r">Gap</th></tr></thead>
              <tbody>
                {ASSET_CLASSES.map((c) => (
                  <tr key={c}>
                    <td>
                      <span className="swatch" style={{ background: `var(--${c})` }} />
                      {c === 'other' ? 'Other (cap)' : c === 'cash' ? 'Cash (buffer)' : CLASS_LABEL[c]}
                      {pen[c] > 0 && <div className="muted small">incl. pension {eurCompact(pen[c])}</div>}
                    </td>
                    <td className="r">{eur(tv[c])}{c !== 'cash' && <div className="muted small">{share(tv[c])}</div>}</td>
                    <td className="r">{eur(w[c])}{c !== 'cash' && <div className="muted small">{share(w[c])}</div>}</td>
                    <td className={`r ${g[c] > 0 ? 'up' : 'down'}`}>
                      {g[c] > 0 ? '+' : ''}{eur(g[c])}
                      <div className="muted small">{c === 'other' ? (g[c] >= 0 ? 'room left' : 'over the cap') : c === 'cash' ? (g[c] < 0 ? 'to invest' : 'to top up') : g[c] > 0 ? 'to buy' : 'over target'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Assumptions>
            Investable wealth {eur(ct.investable)} = liquid {eurCompact(m.liquid.classes.total)} − {eurCompact(t.bufferEUR)} buffer + pension {eurCompact(m.pension.equity + m.pension.bonds)}
            {m.receivable > 0 && <> + loan {eurCompact(m.receivable)}</>}; home excluded. Pension split:{' '}
            {m.pension.lines.map((p, i) => (
              <span key={p.line}>
                {i > 0 && '; '}
                {p.label.split(' (')[0]} {p.split ? `${p.split.equity}/${p.split.bonds}` : 'not yet provided'} {p.split && <Prov src={p.split.src} note={p.split.note} />}
              </span>
            ))}
            .
          </Assumptions>
        </Card>

        <Card className="span-7" title={`Invest ${eurCompact(amt)}: buy-only orders`} sub="Each ETF moves toward its share of the target; nothing is sold. A calculator, not a recommendation.">
          <div className="controls">
            <label className="slider">
              <span>Amount to invest (default = cash above the buffer)</span>
              <input type="number" min={0} step={1000} value={Math.round(amt)} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <label className="slider">
              <span>Minimum order <Prov src={rules?.src ?? 'judgment'} /></span>
              <input type="number" min={0} step={50} value={minOrder} onChange={(e) => setMinOrder(Math.max(0, Number(e.target.value)))} />
            </label>
            {m.liquid.fundsHeld && (
              <Toggle label={`Assume ${m.fundsAcctName} funds exited (+${eurCompact(m.liquid.ingValue - m.ingSwitch.tax)} after ≤ ${eurCompact(m.ingSwitch.tax)} tax)`} checked={fundsExit} onChange={(v) => { setFundsExit(v); setAmount(null); }} />
            )}
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr><th>ETF</th><th className="r">Today</th><th className="r">Target</th><th className="r">Buy</th><th className="r">After vs target</th></tr></thead>
              <tbody>
                {plan.rows.map((r) => {
                  const i = m.instrument(r.ticker);
                  const diff = r.after - r.target;
                  return (
                    <tr key={r.ticker}>
                      <td style={{ whiteSpace: 'normal', minWidth: 190 }}>
                        <span className="swatch" style={{ background: `var(--${r.assetClass})` }} />
                        <b>{r.ticker}</b> <span className="muted small">{pct(r.weightPct, 0)} of {CLASS_LABEL[r.assetClass].toLowerCase()}</span>
                        <div className="muted small">{i.name}{i.isin ? ` · ${i.isin}` : ''}{i.terPct != null ? ` · TER ${pct(i.terPct, 2)}` : ''} {!i.held && i.src && <Prov src={i.src} />}</div>
                      </td>
                      <td className="r">{eur(r.current)}</td>
                      <td className="r">{eur(r.target)}</td>
                      <td className="r">
                        <b>{eur(r.buy)}</b>
                        {r.buy < 0.5 && <div className="muted small">{r.deficit <= 0 ? 'above target' : r.skipped ? 'under the minimum order' : ''}</div>}
                      </td>
                      <td className="r muted">{Math.abs(diff) < 1 ? 'on target' : `${diff > 0 ? '+' : '−'}${eur(Math.abs(diff))}`}</td>
                    </tr>
                  );
                })}
                {!plan.rows.length && <tr><td colSpan={5} className="muted">No ETFs in the sleeves.</td></tr>}
              </tbody>
              <tfoot>
                <tr><td><b>Total</b></td><td className="r">{eur(plan.rows.reduce((a, r) => a + r.current, 0))}</td><td className="r">{eur(plan.rows.reduce((a, r) => a + r.target, 0))}</td><td className="r"><b>{eur(plan.total)}</b></td><td /></tr>
              </tfoot>
            </table>
          </div>
          {plan.otherShare * 100 > t.otherCapPct && (
            <p className="error">Other is {pct(plan.otherShare * 100)} of investable wealth, above the {t.otherCapPct}% cap: no new buys there{d.targets.googPolicy ? ` (${m.liquid.singleStockName} guardrails: ${d.targets.googPolicy.guardrails})` : ''}.</p>
          )}
          <div className="row">
            <button className="btn primary" onClick={copy} disabled={plan.total < 0.5}>Copy the orders</button>
            <span className="muted small" aria-live="polite">{copied}</span>
          </div>
          <EChart height={220} option={beforeAfter} ariaLabel={`Investable wealth by class now and after the orders: equity ${share(plan.after.equity)}, bonds ${share(plan.after.bonds)}`} />
          <Assumptions>
            After the orders: equity {share(plan.after.equity)}, bonds {share(plan.after.bonds)}, other {share(plan.after.other)} of {eurCompact(plan.targets.investable)}.{' '}
            {rules && <>{rules.text} <Prov src={rules.src} /></>}
            {fundsExit && m.liquid.fundsHeld && <> {m.fundsAcctName} exit uses the tax upper bound (26% of winners' gains <Prov src="computed" />).</>}
          </Assumptions>
        </Card>

        <Card className="span-8" title="Actions">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Action</th><th>Type</th><th>Who</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {acts.map((a) => {
                  const dd = a.due ? daysBetween(today, parseISODate(a.due)) : null;
                  const closed = a.status === 'done' || a.status === 'dropped';
                  return (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'normal', minWidth: 220 }} title={a.why}>{a.title}{a.why && <div className="muted small">{a.why}</div>}</td>
                      <td><span className="pill neutral">{a.type}</span></td>
                      <td>{a.type === 'recommendation' ? <Owner kind="judgment" /> : a.type === 'decision' ? <Owner kind="owner" /> : a.owner}</td>
                      <td className={dd != null && dd < 0 && !closed ? 'down' : ''}>{a.due ? `${fmtDate(a.due)}${dd != null && !closed ? ` (${dd < 0 ? `${-dd} d overdue` : `in ${dd} d`})` : ''}` : '—'}</td>
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
