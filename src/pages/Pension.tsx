import { useApp } from '../state';
import { Card, PageTitle, Prov, Money, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette } from '../theme';
import { eur, eurCompact, fmtDate } from '../lib/format';
import { pickNum } from '../data/schema';
import { isClosedStatus, sumWithinDays, decimalsOf } from '../lib/calc/util';
import { pensionContribution } from '../lib/forecastInputs';

export function Pension() {
  const { d, m } = useApp();
  const pal = usePalette();
  const funds = d.accounts.filter((a) => a.regime === 'pension');
  const lines = Object.entries(d.netWorth.lineCatalog).filter(([, v]) => v.bucket === 'pension');
  const shades = [pal.pension, pal.other];
  const option = {
    grid: { left: 56, right: 14, top: 34, bottom: 28 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: lines.map(([k, v], i) => ({
      name: v.label,
      type: 'line',
      stack: 'p',
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 1, color: shades[i % 2] },
      areaStyle: { color: shades[i % 2], opacity: 0.7 },
      itemStyle: { color: shades[i % 2] },
      data: m.snapRows.map((r) => [r.date, m.snapshots.find((s) => s.date === r.date)!.values[k] ?? 0]),
    })),
    aria: { enabled: true, decal: { show: true } },
  };
  const total = m.nw.buckets.pension;
  const pc = d.forecastAssumptions.pensionContributionsEURperYear;
  const pcNow = pensionContribution(d, m);
  const tfrYtd = pickNum(m.inc.prev.tfr, /ytd/i);
  const names = funds.map((f) => f.name.toLowerCase());
  const openActions = d.actions.filter((a) => !isClosedStatus(a.status) && (/pension|comparti/i.test(a.title) || names.some((n) => a.title.toLowerCase().includes(n))));
  return (
    <>
      <PageTitle sub={funds.map((f) => f.name).join(' + ')}>Pension · {eurCompact(total)}</PageTitle>
      <div className="grid">
        <Card className="span-8" title={`Pension funds total ${eurCompact(total)}`} sub="Stacked over line-item snapshots (sheet)">
          <EChart height={280} option={option} ariaLabel={`Pension funds over time, now ${eur(total)}`} />
        </Card>
        <Card className="span-4" title="Contributions" soft>
          <div className="stat">
            <span>Per year in forecasts</span>
            <Money v={pcNow.value} src="estimate" note={pc.basis?.src ?? pc.src} />
          </div>
          {pcNow.computed && pcNow.pay != null && pcNow.ratePct != null && (
            <div className="stat small">
              <span>How</span>
              <span className="num">
                {eur(pcNow.pay)} × {pcNow.ratePct.toFixed(2)}%
              </span>
            </div>
          )}
          {pcNow.computed && (
            <div className="stat small">
              <span>Previous run-rate</span>
              <Money v={pc.value} src="estimate" note={pc.src} />
            </div>
          )}
          {tfrYtd != null && <div className="stat"><span>TFR contributions year to date</span><Money v={tfrYtd} src="payslip" /></div>}
          <Assumptions>{pc.basis?.src ?? pc.src}</Assumptions>
        </Card>
        {funds.map((f) => {
          const line = lines.find(([, v]) => v.account === f.id);
          const sheetVal = line ? (m.latest.values[line[0]] ?? 0) : null;
          const st = [...(d.accountStatements ?? [])].filter((x) => x.account === f.id).sort((a, b) => a.date.localeCompare(b.date)).pop();
          return (
            <Card key={f.id} className="span-6" title={f.name} sub={f.institution}>
              <div className="big">{sheetVal != null ? <Money v={sheetVal} src="sheet" /> : '—'}</div>
              <div className="muted small">Sheet value, {fmtDate(m.latest.date)}</div>
              {st && (
                <>
                  <div className="stat" style={{ marginTop: 8 }}>
                    <span>Statement {fmtDate(st.date)}</span>
                    <Money v={st.valueEUR} digits={2} src={st.src} />
                  </div>
                  {st.units != null && st.unitPrice != null && (
                    <div className="stat small">
                      <span>{st.line ?? 'Units'}</span>
                      <span className="num">
                        {st.units.toLocaleString(d.meta.locale, { maximumFractionDigits: 3 })} × {eur(st.unitPrice, Math.max(2, decimalsOf(st.unitPrice)))} <Prov src={st.src} />
                      </span>
                    </div>
                  )}
                  {sheetVal != null && (
                    <div className="stat small">
                      <span>Statement − sheet</span>
                      <span className={`num ${st.valueEUR - sheetVal < 0 ? 'down' : 'up'}`}>{eur(st.valueEUR - sheetVal, 2)} <Prov src="computed" /></span>
                    </div>
                  )}
                  {st.contributionEvents && st.contributionEvents.length > 0 && (
                    <div className="stat small">
                      <span>Credited in the 12 months to {fmtDate(st.date)}</span>
                      <span className="num">
                        {eur(sumWithinDays(st.contributionEvents, st.date, 365), 2)} <Prov src="computed" note="Sum of contributions on the statement dated in the last 12 months" />
                      </span>
                    </div>
                  )}
                  {st.contributions?.map((c) => (
                    <div className="stat small" key={c.label}>
                      <span>{c.label} (to {fmtDate(c.asOf)})</span>
                      <span className="num">
                        {eur(c.valueEUR, 2)} <Prov src={st.src} />
                      </span>
                    </div>
                  ))}
                </>
              )}
              <p className="small muted">{f.notes}</p>
            </Card>
          );
        })}
        <Card className="span-12" title="Open items">
          <ul className="list">
            {openActions.map((a) => (
              <li key={a.id}><span className="pill neutral">{a.type}</span> {a.title} <span className="muted small">due {a.due ?? '—'}</span></li>
            ))}
            {!openActions.length && <li className="muted">None</li>}
          </ul>
          <Assumptions>
            Fees in each fund's note are public estimates; the exact figures are in each fund's cost sheet ("Scheda costi").
            <br />
            In forecasts, pension money grows about <b>{d.forecastAssumptions.returnsNominalEUR.pension.mean}% a year</b> after fees and the 20% tax on pension-fund returns, swings by about{' '}
            <b>±{d.forecastAssumptions.returnsNominalEUR.pension.vol}%</b> in a typical year
            {(d.forecastAssumptions.pensionEquityCorrelation ?? 0) > 0 && <> and tends to move with the stock market (correlation {d.forecastAssumptions.pensionEquityCorrelation})</>}{' '}
            <Prov src={d.forecastAssumptions.returnsNominalEUR.pension.src} />
          </Assumptions>
        </Card>
      </div>
    </>
  );
}
