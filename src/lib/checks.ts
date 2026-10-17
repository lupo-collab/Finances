// Reconciliation checks (BUILD_PROMPT §6). Expected values are read from the data file,
// so no real numbers live in committed code. Used by `npm run verify` and the Data page.
import type { Finance } from '../data/schema';
import { buildModel } from './model';

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
  if (E.ingLookThrough) {
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
  near('ing-cost-lo', `${m.fundsAcctName} fund cost / yr (low)`, m.costs.ingCost.low, d.costs.ingFundsCostRangeEUR[0]);
  near('ing-cost-hi', `${m.fundsAcctName} fund cost / yr (high)`, m.costs.ingCost.high, d.costs.ingFundsCostRangeEUR[1]);
  near('ing-cost-lo-pct', `${m.fundsAcctName} fund cost % (low)`, m.costs.ingCost.lowPct, d.costs.ingFundsCostRangePct[0], 0.005);
  near('ing-cost-hi-pct', `${m.fundsAcctName} fund cost % (high)`, m.costs.ingCost.highPct, d.costs.ingFundsCostRangePct[1], 0.005);
  near('bollo', 'Bollo + IVAFE estimate / yr', m.costs.bolloTotal, d.costs.bolloIvafeEstimateEUR.total);

  // Targets
  const G = d.targets.expectedGaps;
  near('gap-equity', 'Gap equity', m.gaps.equity, G.equity);
  near('gap-bonds', 'Gap bonds', m.gaps.bonds, G.bonds);
  near('gap-other', 'Gap other', m.gaps.other, G.other);
  near('gap-cash', 'Gap cash', m.gaps.cash, G.cash);

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

  // Tax
  near('ing-gains', `${m.fundsAcctName} winners gain`, m.ingSwitch.gains, d.tax.ingSwitch.winnersGainEUR, 0.01);
  near('ing-tax', `${m.fundsAcctName} switch tax upper bound`, m.ingSwitch.tax, d.tax.ingSwitch.maxTaxAt26EUR, 0.01);

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
      near(`stmt-units-${st.account}-${st.date}`, `${d.accounts.find((a) => a.id === st.account)?.name ?? st.account} statement ${st.date}: units × price`, st.units * st.unitPrice, st.valueEUR);
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
