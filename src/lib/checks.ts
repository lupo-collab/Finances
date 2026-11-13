// Reconciliation checks (BUILD_PROMPT §6). Expected values are read from the data file,
// so no real numbers live in committed code. Used by `npm run verify` and the Data page.
import type { Finance } from '../data/schema';
import { buildModel } from './model';
import { decimalsOf, parseISODate } from './calc/util';

const isoPlusDays = (iso: string, days: number) => {
  const t = parseISODate(iso);
  t.setDate(t.getDate() + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export interface Check {
  id: string;
  label: string;
  expected: string;
  actual: string;
  status: CheckStatus;
}

const f2 = (x: number) => x.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function runChecks(d: Finance, tolEUR = 1): Check[] {
  const m = buildModel(d);
  const out: Check[] = [];
  const near = (id: string, label: string, actual: number, expected: number | undefined | null, tol = tolEUR) => {
    if (expected == null) {
      out.push({ id, label, expected: 'n/a', actual: f2(actual), status: 'skip' });
      return;
    }
    out.push({ id, label, expected: f2(expected), actual: f2(actual), status: Math.abs(actual - expected) <= tol ? 'pass' : 'fail' });
  };
  const A = d.verifyAnchors;

  // Net worth snapshots: recomputed total vs expected; sheet-recorded differences are warnings (DQ7)
  for (const r of m.snapRows) {
    near(`nw-${r.date}`, `Net worth ${r.date} (sheet basis, recomputed)`, r.total, r.expectedTotal);
    if (r.sheetDiff != null && Math.abs(r.sheetDiff) > tolEUR) {
      out.push({
        id: `nw-sheet-${r.date}`,
        label: `Sheet-recorded total ${r.date} differs from recomputed`,
        expected: f2(r.sheetRecordedTotal as number),
        actual: `${f2(r.total)} (${r.sheetDiff > 0 ? '+' : ''}${f2(r.sheetDiff)})`,
        status: 'warn',
      });
    }
  }
  if (A?.bucketTotals) for (const [b, v] of Object.entries(A.bucketTotals)) near(`bucket-${b}`, `Bucket ${b}`, m.nw.buckets[b as keyof typeof m.nw.buckets] ?? 0, v);
  if (A?.ytd) {
    near('ytd-abs', `Δ vs ${m.ytdBase.date} (€)`, m.nw.ytd.abs, A.ytd.deltaEUR);
    near('ytd-pct', `Δ vs ${m.ytdBase.date} (%)`, m.nw.ytd.pct, A.ytd.deltaPct, 0.05);
  }
  near('mv-nw', 'Market-value net worth', m.nw.market, d.netWorth.marketValueBasis.netWorth);
  near('mv-equity', 'Home equity (market value)', m.nw.homeEquity, d.netWorth.marketValueBasis.homeEquity);

  // Liquid portfolio
  const E = d.liquidPortfolio.expected;
  near('liq-total', 'Liquid portfolio total', m.liquid.classes.total, E.total, 0.01);
  near('liq-equity', 'Liquid equity', m.liquid.classes.equity, E.equity, 0.01);
  near('liq-bonds', 'Liquid bonds', m.liquid.classes.bonds, E.bonds, 0.01);
  near('liq-other', 'Liquid other', m.liquid.classes.other, E.other, 0.01);
  near('liq-cash', 'Liquid cash', m.liquid.classes.cash, E.cash, 0.01);
  if (A?.classPct) for (const [c, v] of Object.entries(A.classPct)) near(`pct-${c}`, `Liquid ${c} %`, m.liquid.classPct[c as 'equity'], v, 0.005);
  if (E.ingLookThrough && m.liquid.fundsHeld) {
    near('ing-lt-eq', `${m.fundsAcctName} look-through equity`, m.liquid.ingLookThrough.equity, E.ingLookThrough.equity, 0.01);
    near('ing-lt-bd', `${m.fundsAcctName} look-through bonds`, m.liquid.ingLookThrough.bonds, E.ingLookThrough.bonds, 0.01);
    near('ing-lt-cs', `${m.fundsAcctName} look-through cash`, m.liquid.ingLookThrough.cash, E.ingLookThrough.cash, 0.01);
  }
  const ST = d.liquidPortfolio.statementTotals;
  for (const [k, v] of Object.entries(ST)) {
    const actual = k.endsWith('_mmc') ? (m.liquid.posByAcct[k.replace('_mmc', '')] ?? 0) : (m.liquid.acctTotals[k] ?? 0);
    near(`stmt-${k}`, `Statement total ${k}`, actual, v, 0.01);
  }
  if (A?.etfTotals) for (const [t, v] of Object.entries(A.etfTotals)) near(`etf-${t}`, `ETF total ${t}`, m.liquid.tickers[t] ?? 0, v, 0.01);

  // Costs
  near('etf-ter', 'ETF TER cost / yr', m.costs.etfTer, d.costs.etfTerAnnualEUR);
  const CR = d.costs.ingFundsCostRangeEUR;
  const CP = d.costs.ingFundsCostRangePct;
  if (m.liquid.fundsHeld && CR && CP) {
    near('ing-cost-lo', `${m.fundsAcctName} fund cost / yr (low)`, m.costs.ingCost.low, CR[0]);
    near('ing-cost-hi', `${m.fundsAcctName} fund cost / yr (high)`, m.costs.ingCost.high, CR[1]);
    near('ing-cost-lo-pct', `${m.fundsAcctName} fund cost % (low)`, m.costs.ingCost.lowPct, CP[0], 0.005);
    near('ing-cost-hi-pct', `${m.fundsAcctName} fund cost % (high)`, m.costs.ingCost.highPct, CP[1], 0.005);
  }
  near('bollo', 'Bollo + IVAFE estimate / yr', m.costs.bolloTotal, d.costs.bolloIvafeEstimateEUR.total);

  // Targets on investable wealth (liquid + pension look-through + receivables)
  const S = d.targets.sleeves;
  out.push({
    id: 'target-pcts',
    label: 'Target equity + bonds + other = 100%',
    expected: '100',
    actual: String(S.equity.pct + S.bonds.pct + S.other.pct),
    status: Math.abs(S.equity.pct + S.bonds.pct + S.other.pct - 100) < 1e-9 ? 'pass' : 'fail',
  });
  for (const p of m.pension.lines) {
    if (!p.split) {
      out.push({ id: `pension-lt-${p.line}`, label: `${p.label}: equity/bond split`, expected: 'provided', actual: 'not yet provided (left out of the allocation)', status: 'warn' });
      continue;
    }
    const s = p.split.equity + p.split.bonds;
    out.push({ id: `pension-lt-${p.line}`, label: `${p.label}: equity + bonds split`, expected: '100', actual: String(s), status: Math.abs(s - 100) < 0.005 ? 'pass' : 'warn' });
  }
  if (A?.wholeWealth) {
    near('ww-investable', 'Investable wealth (cash above buffer included)', m.targetVals.investable, A.wholeWealth.investable, 0.01);
    near('ww-pen-eq', 'Pension look-through equity', m.pension.equity, A.wholeWealth.pensionEquity, 0.01);
    near('ww-pen-bd', 'Pension look-through bonds', m.pension.bonds, A.wholeWealth.pensionBonds, 0.01);
  }
  const G = d.targets.expectedGaps;
  near('gap-equity', 'Gap equity (investable wealth)', m.gaps.equity, G.equity);
  near('gap-bonds', 'Gap bonds (investable wealth)', m.gaps.bonds, G.bonds);
  near('gap-other', 'Room under the other cap', m.gaps.other, G.other);
  near('gap-cash', 'Gap cash (buffer − cash)', m.gaps.cash, G.cash);
  if (A?.investPlan) {
    near('plan-amount', 'Buy list: amount (cash above buffer)', Math.max(0, m.cashAboveBuffer), A.investPlan.amountEUR, 0.01);
    for (const [t, v] of Object.entries(A.investPlan.buys)) near(`plan-${t}`, `Buy list: ${t}`, m.plan.rows.find((r) => r.ticker === t)?.buy ?? 0, v, 0.01);
    near('plan-total', 'Buy list spends the amount', m.plan.total, Math.max(0, m.cashAboveBuffer), 0.01);
  }

  // Realised sales: each line's net = gross − tax − fee; lines add up to the stated totals; proceeds in cash
  for (const r of m.realised) {
    r.lines.forEach((l, i) => near(`sale-${r.sale.id}-${i}`, `${l.name}: gross − tax − fee = credited`, l.netCheck, l.net, 0.005));
    const T = r.sale.totals;
    near(`sale-${r.sale.id}-paid`, `${r.sale.label}: paid in`, r.totals.paid, T.paidEUR, 0.01);
    near(`sale-${r.sale.id}-gross`, `${r.sale.label}: gross sale`, r.totals.gross, T.grossEUR, 0.01);
    near(`sale-${r.sale.id}-tax`, `${r.sale.label}: tax withheld`, r.totals.tax, T.taxEUR, 0.01);
    near(`sale-${r.sale.id}-net`, `${r.sale.label}: credited`, r.totals.net, T.netEUR, 0.01);
    near(`sale-${r.sale.id}-earlier`, `${r.sale.label}: dividends and earlier sales`, r.totals.earlier, T.earlierNetEUR, 0.01);
    near(`sale-${r.sale.id}-profit`, `${r.sale.label}: profit`, r.totals.profit, T.profitEUR, 0.01);
    for (const c of d.liquidPortfolio.cash.filter((x) => x.fromSale === r.sale.id)) near(`sale-${r.sale.id}-cash`, `${c.label} = sale proceeds`, c.valueEUR, r.totals.net, 0.01);
  }

  // Single-stock concentration
  if (A?.singleStock) {
    near('single', `${m.liquid.singleStockName} combined`, m.liquid.singleStock, A.singleStock.combinedEUR, 0.01);
    near('single-pct', `${m.liquid.singleStockName} share of liquid %`, m.liquid.singleStockPct, A.singleStock.shareOfLiquidPct, 0.005);
  }

  // Mortgage
  const M = d.home.mortgage;
  near('mort-annuity', 'Mortgage annuity', m.mortgage.annuity, M.computedAnnuityEUR, 0.01);
  near('mort-int12', 'Mortgage interest next 12 m', m.mortgage.interest12, M.interestNext12mEUR);
  near('mort-intall', 'Mortgage remaining interest', m.mortgage.interestTotal, M.totalRemainingInterestEUR);
  near('mort-gap', 'Stated instalment − annuity', m.mortgage.gap, M.instalmentGapEUR, 0.01);
  near('mort-detr', 'Detraction next year', m.mortgage.detr.amount, M.detraction.nextYearEUR);
  near('mort-eff', 'Effective rate after detraction %', m.mortgage.detr.effectiveRatePct, M.detraction.effectiveRatePct, 0.005);

  // Tax (switch estimate only while the managed funds are held)
  if (m.liquid.fundsHeld && d.tax.ingSwitch) {
    near('ing-gains', `${m.fundsAcctName} winners gain`, m.ingSwitch.gains, d.tax.ingSwitch.winnersGainEUR, 0.01);
    near('ing-tax', `${m.fundsAcctName} switch tax upper bound`, m.ingSwitch.tax, d.tax.ingSwitch.maxTaxAt26EUR, 0.01);
  }

  // Next employer: donation-matching deadline = start + 90 days
  const next = m.inc.next;
  if (next.donationMatching) {
    const exp = isoPlusDays(next.startDate, 90);
    out.push({ id: 'donation-deadline', label: 'Donation pledge deadline = start + 90 days', expected: exp, actual: next.donationMatching.deadline, status: next.donationMatching.deadline === exp ? 'pass' : 'fail' });
  }

  // RSU
  const rc = m.rsu.check;
  out.push({
    id: 'rsu-sum',
    label: 'RSU fractions sum to 1, values = fraction × grant',
    expected: `${A?.rsu?.events ?? '?'} events, Σ=1`,
    actual: `${rc.events} events, Σ=${rc.fractionSum.toFixed(4)}${rc.consistent ? '' : ' (inconsistent USD)'}`,
    status: Math.abs(rc.fractionSum - 1) < 1e-9 && rc.consistent && (A?.rsu ? rc.events === A.rsu.events : true) ? 'pass' : 'fail',
  });
  if (A?.rsu) {
    const s = m.rsu.schedule;
    const ok = s[0]?.usdAtGrant === A.rsu.firstUSD && s.slice(1).every((e) => e.usdAtGrant === A.rsu!.laterUSD);
    out.push({ id: 'rsu-usd', label: 'RSU first vest then quarterly', expected: `${A.rsu.firstUSD} then ${s.length - 1} × ${A.rsu.laterUSD}`, actual: s.map((e) => e.usdAtGrant).join(', '), status: ok ? 'pass' : 'fail' });
  }

  // Account statements: units × unit price should equal the stated value
  for (const st of d.accountStatements ?? []) {
    if (st.units != null && st.unitPrice != null)
      // statements often show a rounded unit price: allow half a unit of its last decimal (at least cents) on every unit
      near(
        `stmt-units-${st.account}-${st.date}`,
        `${d.accounts.find((a) => a.id === st.account)?.name ?? st.account} statement ${st.date}: units × price`,
        st.units * st.unitPrice,
        st.valueEUR,
        Math.max(tolEUR, st.units * 0.5 * Math.pow(10, -Math.max(2, decimalsOf(st.unitPrice)))),
      );
  }

  // Forecast inputs present?
  const sv = d.forecastAssumptions.annualNetSavingsEUR;
  out.push({
    id: 'savings',
    label: 'Annual net savings low/base/high provided',
    expected: 'numbers',
    actual: `${sv.low ?? '—'} / ${sv.base ?? '—'} / ${sv.high ?? '—'}`,
    status: sv.low != null && sv.base != null && sv.high != null ? 'pass' : 'warn',
  });
  return out;
}

export function summarise(cs: readonly Check[]) {
  return {
    pass: cs.filter((c) => c.status === 'pass').length,
    warn: cs.filter((c) => c.status === 'warn').length,
    fail: cs.filter((c) => c.status === 'fail').length,
    skip: cs.filter((c) => c.status === 'skip').length,
  };
}
