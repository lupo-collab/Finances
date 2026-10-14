import { useApp } from '../state';
import { Card, PageTitle, Prov, Money } from '../components/ui';
import { eur, pct, eurCompact } from '../lib/format';

export function Accounts() {
  const { d, m, basis } = useApp();
  const latest = m.latest.values;
  const nw = basis === 'market' ? m.nw.market : m.nw.sheet;
  const cat = d.netWorth.lineCatalog;
  const maxDep = d.settings.maxDepositPerBankEUR;

  const cards = d.accounts.map((a) => {
    // value: liquid accounts use statement-based positions + cash; others use the snapshot lines
    const liquidVal = m.liquid.acctTotals[a.id];
    let value: number;
    let src: string;
    if (liquidVal != null) {
      value = liquidVal;
      src = 'computed';
    } else if (a.id === 'home' && basis === 'market') {
      value = m.nw.homeEquity;
      src = 'computed';
    } else {
      value = Object.entries(latest)
        .filter(([k]) => cat[k]?.account === a.id)
        .reduce((s, [, v]) => s + v, 0);
      src = 'sheet';
    }
    const cash = m.liquid.cashByAcct[a.id] ?? 0;
    const svs = d.liquidPortfolio.sheetVsStatement.find((x) => x.account === a.id);
    return { a, value, src, cash, bollo: m.costs.bollo[a.id] ?? null, svs };
  });
  cards.sort((x, y) => y.value - x.value);

  return (
    <>
      <PageTitle sub={`Share of net worth on ${basis === 'market' ? 'market-value' : 'sheet'} basis (${eurCompact(nw)})`}>Accounts</PageTitle>
      <div className="grid">
        {cards.map(({ a, value, src, cash, bollo, svs }) => (
          <Card key={a.id} className="span-4" title={a.name} sub={a.institution}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="big">
                <Money v={value} src={src} />
              </span>
              <span className="chip">{a.regime}</span>
            </div>
            <div className="muted small">{pct((value / nw) * 100)} of net worth</div>
            {cash > 0 && (
              <div style={{ marginTop: 10 }}>
                <div className="stat small">
                  <span>Cash deposits vs {eurCompact(maxDep)} limit</span>
                  <span className="num">{eur(cash)}</span>
                </div>
                <div className={`bar${cash >= 0.9 * maxDep ? ' near' : ''}`} role="meter" aria-valuenow={cash} aria-valuemax={maxDep} aria-label={`Cash ${eur(cash)} of ${eur(maxDep)}`}>
                  <span style={{ width: `${Math.min(100, (cash / maxDep) * 100)}%` }} />
                </div>
              </div>
            )}
            {bollo != null && (
              <div className="stat small">
                <span>{a.regime === 'dichiarativo' ? 'IVAFE' : 'Bollo'} estimate</span>
                <span className="num muted">
                  ≈ {eur(bollo)}/yr <Prov src="estimate" note="0.20% of securities value" />
                </span>
              </div>
            )}
            {svs && (
              <div className="stat small">
                <span>Sheet vs statement</span>
                <span className="num">
                  {eur(svs.diff, 2)} <span className="muted">({svs.note})</span>
                </span>
              </div>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              {a.notes} <span title={`Regime source: ${a.regimeSrc}`}>(regime: {a.regimeSrc})</span>
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}
