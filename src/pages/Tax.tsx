import { useApp } from '../state';
import { Card, PageTitle, Prov, Money, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette } from '../theme';
import { eur, eurCompact, pct } from '../lib/format';
import { unrealisedByPosition, paybackYears } from '../lib/calc/tax';

export function Tax() {
  const { d, m } = useApp();
  const pal = usePalette();
  const T = d.tax;
  const acctName = (id: string) => d.accounts.find((a) => a.id === id)?.name ?? id;
  const ur = unrealisedByPosition(d.liquidPortfolio.positions);
  const urOption = {
    grid: { left: 16, right: 60, top: 6, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v, 2) },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    yAxis: { type: 'category', data: ur.map((r) => `${r.name} · ${acctName(r.account)}`), axisLabel: { width: 180, overflow: 'truncate' } },
    series: [{ type: 'bar', barWidth: 12, data: ur.map((r) => ({ value: r.eur, itemStyle: { color: r.eur >= 0 ? pal.good : pal.bad, borderRadius: 3 } })), label: { show: true, position: 'right', color: pal.muted, fontSize: 10, formatter: (x: { value: number }) => eurCompact(x.value) } }],
  };
  const ingMid = (m.costs.ingCost.low + m.costs.ingCost.high) / 2;
  const saving = ingMid - (d.costs.etfEquivalentForIngEUR ?? 0);
  const payback = paybackYears(m.ingSwitch.tax, saving);
  const regimeAccounts = d.accounts.filter((a) => a.regime !== '-' && a.regime !== 'real estate');

  return (
    <>
      <PageTitle sub="Italian tax view of the portfolio">Tax</PageTitle>
      <div className="grid">
        <Card className="span-7" title="Regime by account">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Account</th><th>Regime</th><th className="r">Bollo/IVAFE est.</th><th>Source</th></tr></thead>
              <tbody>
                {regimeAccounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td><span className="chip">{a.regime}</span></td>
                    <td className="r">{m.costs.bollo[a.id] != null ? <>{eur(m.costs.bollo[a.id])} <Prov src="estimate" /></> : '—'}</td>
                    <td className="muted small" style={{ whiteSpace: 'normal' }}>{a.regimeSrc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Assumptions>Total bollo + IVAFE ≈ <b>{eur(m.costs.bolloTotal)}</b>/yr. {d.costs.bolloIvafeEstimateEUR.note}</Assumptions>
        </Card>
        <Card className="span-5" title={`Switching out of ${m.fundsAcctName} funds costs at most ${eurCompact(m.ingSwitch.tax)} in tax`} soft sub={<>Upper bound <Prov src={T.ingSwitch.src} /></>}>
          <div className="stat"><span>Winners' unrealised gains</span><Money v={m.ingSwitch.gains} digits={2} src="computed" /></div>
          <div className="stat"><span>Tax at 26% (upper bound)</span><Money v={m.ingSwitch.tax} digits={2} src="computed" /></div>
          <div className="stat"><span>Annual fee saving (fund mid − ETF equivalent)</span><Money v={saving} src="estimate" /></div>
          <div className="stat"><span><b>Payback</b></span><b>{Number.isFinite(payback) ? `${payback.toFixed(1)} years` : '—'} <Prov src="estimate" note="Tax upper bound ÷ estimated annual fee saving" /></b></div>
          <Assumptions>{T.ingSwitch.note}</Assumptions>
        </Card>

        <Card className="span-7" title="Unrealised gains and losses by position" sub="Positions with a known cost basis only (TR ETF cost basis not yet provided)">
          <EChart height={60 + ur.length * 22} option={urOption} ariaLabel={`Largest gain ${ur[ur.length - 1]?.name}, largest loss ${ur[0]?.name}`} />
        </Card>
        <Card className="span-5" title="Minusvalenze inventory">
          <ul className="list">
            {T.unrealisedLosses.map((l) => (
              <li key={l.position + l.account}>
                <span style={{ flex: 1 }}>{l.position} · {acctName(l.account)}</span>
                <span className="down num">{eur(l.lossEUR, 2)}</span> <Prov src={l.src} />
              </li>
            ))}
          </ul>
          <Assumptions>Unrealised only. Fund/ETF losses are redditi diversi; they cannot offset fund/ETF gains (redditi di capitale).</Assumptions>
          {T.googBasisCheck && (
            <div className="alert" style={{ marginTop: 12 }}>
              <div className="tag">Check</div>
              <h3>{m.liquid.singleStockName} cost basis</h3>
              <p>{T.googBasisCheck}</p>
            </div>
          )}
        </Card>

        <Card className="span-7" title="Rules used">
          <ul className="list">
            {T.rules.map((r) => (
              <li key={r.id}><span style={{ flex: 1 }}>{r.text}</span> <Prov src={r.src} /></li>
            ))}
          </ul>
        </Card>
        <Card className="span-5" title="Open items">
          <ul className="list">
            {T.openItems.map((o) => <li key={o}>{o}</li>)}
          </ul>
          <Assumptions>{m.liquid.singleStockName} share of liquid: {pct(m.liquid.singleStockPct, 2)}.</Assumptions>
        </Card>
      </div>
      <p className="hint" style={{ marginTop: 14 }}>Not tax advice; confirm material decisions with a commercialista.</p>
    </>
  );
}
