import { useApp } from '../state';
import { Card, PageTitle, Prov, Money, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette } from '../theme';
import { eur, eurCompact, pct, fmtDate } from '../lib/format';
import { unrealisedByPosition, paybackYears } from '../lib/calc/tax';
import { carryUntilYear, lossTaxValue } from '../lib/calc/realised';

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
  const realisedLosses = T.realisedLosses ?? [];

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
        {m.liquid.fundsHeld && T.ingSwitch && (
          <Card className="span-5" title={`Switching out of ${m.fundsAcctName} funds costs at most ${eurCompact(m.ingSwitch.tax)} in tax`} soft sub={<>Upper bound <Prov src={T.ingSwitch.src} /></>}>
            <div className="stat"><span>Winners' unrealised gains</span><Money v={m.ingSwitch.gains} digits={2} src="computed" /></div>
            <div className="stat"><span>Tax at 26% (upper bound)</span><Money v={m.ingSwitch.tax} digits={2} src="computed" /></div>
            <div className="stat"><span>Annual fee saving (fund mid − ETF equivalent)</span><Money v={saving} src="estimate" /></div>
            <div className="stat"><span><b>Payback</b></span><b>{Number.isFinite(payback) ? `${payback.toFixed(1)} years` : '—'} <Prov src="estimate" note="Tax upper bound ÷ estimated annual fee saving" /></b></div>
            <Assumptions>{T.ingSwitch.note}</Assumptions>
          </Card>
        )}
        {m.realised.map(({ sale, totals: t }) => (
          <Card key={sale.id} className="span-5" title={`${sale.label}: ${t.profit >= 0 ? 'profit' : 'loss'} ${eurCompact(t.profit)} (${t.profitPct != null ? pct(t.profitPct) : '—'})`} sub={<>Sold {fmtDate(sale.date)}{sale.creditedDate ? `, credited ${fmtDate(sale.creditedDate)}` : ''} <Prov src={sale.src} note={sale.note} /></>}>
            <div className="stat"><span>Paid in ({t.lines} funds, buy fees included)</span><Money v={t.paid} digits={2} src={sale.src} /></div>
            <div className="stat"><span>Gross sale value</span><Money v={t.gross} digits={2} src={sale.src} /></div>
            <div className="stat"><span>Tax withheld</span><Money v={-t.tax} digits={2} src={sale.src} /></div>
            <div className="stat"><span>Sale fees</span><Money v={-t.fee} digits={2} src={sale.src} /></div>
            <div className="stat"><span><b>Credited</b></span><b><Money v={t.net} digits={2} src={sale.src} /></b></div>
            <div className="stat"><span>Dividends and earlier sales, net</span><Money v={t.earlier} digits={2} src={sale.src} /></div>
            <div className="stat"><span><b>Profit</b> (credited + earlier − paid)</span><b><Money v={t.profit} digits={2} src="computed" /></b></div>
            <Assumptions>
              {sale.beforeSale?.taxUpperBoundEUR != null && (
                <>Tax was {eur(t.tax)} against the {eur(sale.beforeSale.taxUpperBoundEUR)} upper bound estimated on {fmtDate(sale.beforeSale.date)} <Prov src={sale.beforeSale.src} />. </>
              )}
              {sale.totals.feesAllOrdersEUR != null && <>Order fees over the funds' life: {eur(sale.totals.feesAllOrdersEUR)} <Prov src={sale.src} />. </>}
              {sale.beforeSale?.costPct != null ? (
                <>Fund costs no longer paid: about {eurCompact((sale.beforeSale.valueEUR * sale.beforeSale.costPct) / 100)} a year ({pct(sale.beforeSale.costPct, 2)}) <Prov src={sale.beforeSale.costPctSrc ?? 'sourced'} />.</>
              ) : (
                sale.beforeSale?.annualCostEUR && <>Fund costs no longer paid: about {eurCompact(sale.beforeSale.annualCostEUR[0])}–{eurCompact(sale.beforeSale.annualCostEUR[1])} a year <Prov src="estimate" />.</>
              )}
            </Assumptions>
          </Card>
        ))}
        {m.realised.map(({ sale, lines }) => (
          <Card key={`${sale.id}-lines`} className="span-12" title={`${sale.label}, fund by fund`} sub="Sorted by amount paid in. Percentages are simple totals, not annualised: a fund held since 2021 and one bought this year aren't comparable on that column.">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr><th>Fund</th><th>Since</th><th className="r">Paid in</th><th className="r">Gross sale</th><th className="r">Tax</th><th className="r">Credited</th><th className="r">Dividends, earlier sales</th><th className="r">Profit</th><th className="r">%</th></tr>
                </thead>
                <tbody>
                  {[...lines].sort((a, b) => b.paid - a.paid).map((l) => (
                    <tr key={l.name}>
                      <td>{l.name}</td>
                      <td>{l.since ? fmtDate(`${l.since}-01`, { month: 'short', year: 'numeric' }) : '—'}</td>
                      <td className="r">{eur(l.paid, 2)}</td>
                      <td className="r">{eur(l.gross, 2)}</td>
                      <td className="r">{eur(l.tax, 2)}</td>
                      <td className="r">{eur(l.net, 2)}</td>
                      <td className="r">{l.earlier ? eur(l.earlier, 2) : '—'}</td>
                      <td className={`r ${l.profit >= 0 ? 'up' : 'down'}`}>{eur(l.profit, 2)}</td>
                      <td className={`r ${l.profit >= 0 ? 'up' : 'down'}`}>{l.profitPct != null ? pct(l.profitPct) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sale.notes && (
              <Assumptions>
                {sale.notes.map((n) => <div key={n}>{n}</div>)}
              </Assumptions>
            )}
          </Card>
        ))}

        <Card className="span-7" title="Unrealised gains and losses by position" sub="Positions with a known cost basis only (TR ETF cost basis not yet provided)">
          <EChart height={60 + ur.length * 22} option={urOption} ariaLabel={`Largest gain ${ur[ur.length - 1]?.name}, largest loss ${ur[0]?.name}`} />
        </Card>
        <Card className="span-5" title="Minusvalenze inventory">
          {realisedLosses.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, margin: '0 0 4px' }} className="muted">Realised (usable)</h3>
              <ul className="list">
                {realisedLosses.map((l) => (
                  <li key={l.position + l.date} title={l.note}>
                    <span style={{ flex: 1 }}>
                      {l.position} · {acctName(l.account)}
                      <div className="muted small">Sold {fmtDate(l.date)}; usable until the end of {carryUntilYear(l.date)}; saves at most {eur(lossTaxValue(l.lossEUR))} of tax</div>
                    </span>
                    <span className="down num">{eur(l.lossEUR, 2)}</span> <Prov src={l.src} note={l.note} />
                  </li>
                ))}
              </ul>
              <h3 style={{ fontSize: 13, margin: '10px 0 4px' }} className="muted">Unrealised</h3>
            </>
          )}
          <ul className="list">
            {T.unrealisedLosses.map((l) => (
              <li key={l.position + l.account}>
                <span style={{ flex: 1 }}>{l.position} · {acctName(l.account)}</span>
                <span className="down num">{eur(l.lossEUR, 2)}</span> <Prov src={l.src} />
              </li>
            ))}
          </ul>
          <Assumptions>
            Fund/ETF losses are redditi diversi: they can offset gains on single stocks, bonds, ETC/ETN and derivatives in the same tax year and the next four, but not fund/ETF gains (redditi di capitale).
            {realisedLosses.length > 0 && ' A realised loss needs the bank’s certification when the account is closed.'}
          </Assumptions>
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
