import { describe, it, expect } from 'vitest';
import { annuity, amortisation, totalInterest, interestOverNext, detraction, balanceAfter } from '../src/lib/calc/mortgage';
import { checkSchedule, cumulative, vestsByYear } from '../src/lib/calc/rsu';
import { normaliseLookThrough, pieces, classTotals, accountTotals } from '../src/lib/calc/liquid';
import { gaps, targetValues, investNewMoney, fillGaps } from '../src/lib/calc/targets';
import { snapshotTotal, bucketTotals, marketValueTotal, lineChanges, delta } from '../src/lib/calc/networth';
import { terCostRange, knownTerCost, bolloOnSecurities, costDrag } from '../src/lib/calc/costs';
import { switchTaxUpperBound, paybackYears } from '../src/lib/calc/tax';
import { runForecast, stressTest, type ForecastInput } from '../src/lib/calc/forecast';
import { mulberry32, lognormalParams, cholesky, percentile } from '../src/lib/calc/random';
import { srcTag } from '../src/lib/provenance';
import { syntheticFinance } from './fixtures/synthetic';
import { incomeOf, type Position } from '../src/data/schema';

describe('mortgage', () => {
  it('annuity matches the closed form and amortises to zero', () => {
    const a = annuity(100000, 1.2, 120);
    const r = 0.012 / 12;
    expect(a).toBeCloseTo((100000 * r) / (1 - Math.pow(1 + r, -120)), 8);
    const rows = amortisation(100000, 1.2, 120);
    expect(rows).toHaveLength(120);
    expect(rows[119].balance).toBeCloseTo(0, 6);
    expect(rows.reduce((s, x) => s + x.principal, 0)).toBeCloseTo(100000, 6);
    expect(totalInterest(rows)).toBeCloseTo(a * 120 - 100000, 4);
    expect(interestOverNext(rows, 1)).toBeCloseTo(100000 * r, 8);
    expect(balanceAfter(rows, 100000, 0)).toBe(100000);
    expect(balanceAfter(rows, 100000, 500)).toBe(0);
  });
  it('zero rate divides evenly', () => {
    expect(annuity(1200, 0, 12)).toBe(100);
  });
  it('detraction is capped and lowers the effective rate', () => {
    const d1 = detraction(1000, 1, 19, 4000);
    expect(d1.amount).toBeCloseTo(190);
    expect(d1.effectiveRatePct).toBeCloseTo(0.81);
    expect(detraction(10000, 3, 19, 4000).amount).toBeCloseTo(760);
  });
});

describe('rsu', () => {
  const f = syntheticFinance();
  const s = incomeOf(f.income).next.rsu.schedule;
  it('schedule fractions sum to 1 and match the grant', () => {
    const c = checkSchedule(s, 80000);
    expect(c.events).toBe(15);
    expect(c.fractionSum).toBeCloseTo(1, 12);
    expect(c.consistent).toBe(true);
    expect(c.usdTotal).toBe(80000);
  });
  it('cumulative applies valuation and FX', () => {
    const pts = cumulative(s, 1.25, 'haircut50');
    expect(pts[pts.length - 1].cumUSD).toBe(40000);
    expect(pts[pts.length - 1].cumEUR).toBe(32000);
    expect(cumulative(s, 1.25, 'zero').every((p) => p.cumUSD === 0)).toBe(true);
    expect(Object.values(vestsByYear(s)).reduce((a, b) => a + b, 0)).toBe(80000);
  });
});

describe('liquid portfolio', () => {
  it('normalises look-through to exactly 100%', () => {
    const n = normaliseLookThrough({ equity: 54, bonds: 41, cash: 4.7 });
    expect(n.equity + n.bonds + n.cash).toBeCloseTo(1, 12);
    expect(n.equity).toBeCloseTo(54 / 99.7, 12);
  });
  it('classifies multi-asset by look-through; cash part counts as cash', () => {
    const f = syntheticFinance();
    const t = classTotals(pieces(f.liquidPortfolio.positions, f.liquidPortfolio.cash));
    const e = f.liquidPortfolio.expected;
    expect(t.total).toBeCloseTo(e.total, 6);
    expect(t.equity).toBeCloseTo(e.equity, 2);
    expect(t.bonds).toBeCloseTo(e.bonds, 2);
    expect(t.cash).toBeCloseTo(e.cash, 2);
    expect(t.equity + t.bonds + t.other + t.cash).toBeCloseTo(t.total, 9);
    expect(accountTotals(f.liquidPortfolio.positions, f.liquidPortfolio.cash)).toEqual({ a: 22000, b: 6000 });
  });
  it('throws on a multi-asset fund without look-through', () => {
    const p = { account: 'a', name: 'x', assetClass: 'multi', currency: 'EUR', valueEUR: 1, src: 'statement' } as Position;
    expect(() => pieces([p], [])).toThrow();
  });
});

describe('targets', () => {
  const spec = { equityPct: 80, bondsPct: 15, otherPct: 5, bufferEUR: 1000 };
  const actual = { equity: 50000, bonds: 5000, other: 2000, cash: 43000, total: 100000 };
  it('gap = (total − buffer) × % − actual; cash target = buffer', () => {
    const tv = targetValues(100000, spec);
    expect(tv.equity).toBe(79200);
    expect(tv.cash).toBe(1000);
    const g = gaps(actual, spec);
    expect(g.equity).toBe(29200);
    expect(g.cash).toBe(-42000);
    expect(g.equity + g.bonds + g.other + g.cash).toBeCloseTo(0, 9);
  });
  it('fillGaps caps at the gap and spreads overflow by weight', () => {
    expect(fillGaps(100, { x: 60, y: 60 }, { x: 1, y: 1 })).toEqual({ x: 50, y: 50 });
    const r = fillGaps(200, { x: 60, y: 20 }, { x: 3, y: 1 });
    expect(r.x).toBeCloseTo(60 + 90);
    expect(r.y).toBeCloseTo(20 + 30);
  });
  it('investNewMoney is buy-only and spends exactly the amount', () => {
    const orders = investNewMoney({ amountEUR: 42000, actual, target: spec, sleeves: { equity: { A: 75, B: 25 }, bonds: { C: 100 } }, tickerValues: { A: 45000, B: 5000, C: 5000 } });
    const total = orders.reduce((s, o) => s + o.amountEUR, 0);
    expect(total).toBeCloseTo(42000, 6);
    expect(orders.every((o) => o.amountEUR > 0)).toBe(true);
    // B is furthest below its split, so it gets money before A
    const b = orders.find((o) => o.ticker === 'B')!.amountEUR;
    expect(b).toBeGreaterThan(0);
  });
});

describe('net worth', () => {
  const f = syntheticFinance();
  const [s0, s1] = f.netWorth.snapshots;
  it('sums lines and buckets', () => {
    expect(snapshotTotal(s1)).toBe(82500);
    expect(bucketTotals(s1, f.netWorth.lineCatalog).realEstate).toBe(51000);
    expect(marketValueTotal(s1, { homeValueEUR: 90000, mortgageBalanceEUR: 30000 })).toBe(91500);
    expect(delta(snapshotTotal(s0), snapshotTotal(s1)).abs).toBe(4500);
    expect(lineChanges(s0, s1)[0]).toMatchObject({ line: 'a_inv', change: 2000 });
  });
  it('rejects unknown lines', () => {
    expect(() => bucketTotals({ values: { nope: 1 } }, f.netWorth.lineCatalog)).toThrow();
  });
});

describe('costs and tax', () => {
  const f = syntheticFinance();
  const ps = f.liquidPortfolio.positions;
  it('TER cost, ranges and bollo', () => {
    expect(knownTerCost(ps.slice(0, 2))).toBeCloseTo(24);
    const withRange = [...ps, { ...ps[0], terPct: null, terRangePct: [1, 2] as [number, number], valueEUR: 1000 }];
    const r = terCostRange(withRange);
    expect(r.high - r.low).toBeCloseTo(10);
    expect(bolloOnSecurities(ps).a).toBeCloseTo(40);
    expect(costDrag(1000, 5, 0, 10)).toBe(0);
    expect(costDrag(1000, 5, 1, 10)).toBeGreaterThan(0);
  });
  it('switch tax upper bound ignores losses', () => {
    expect(switchTaxUpperBound(ps).gains).toBe(2500);
    expect(switchTaxUpperBound(ps).tax).toBeCloseTo(650);
    expect(paybackYears(650, 325)).toBe(2);
    expect(paybackYears(1, 0)).toBe(Infinity);
  });
});

describe('random + forecast', () => {
  it('PRNG is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('lognormal params reproduce the arithmetic mean', () => {
    const { mu, sigma } = lognormalParams(6, 16);
    expect(Math.exp(mu + (sigma * sigma) / 2)).toBeCloseTo(1.06, 12);
  });
  it('cholesky reconstructs the matrix', () => {
    const L = cholesky([[1, 0.3], [0.3, 1]]);
    expect(L[1][0] * L[1][0] + L[1][1] * L[1][1]).toBeCloseTo(1, 12);
    expect(L[1][0]).toBeCloseTo(0.3, 12);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
  const inp: ForecastInput = {
    years: 10,
    paths: 2000,
    seed: 7,
    start: { equity: 60000, bonds: 20000, other: 5000, cash: 15000, pension: 10000, homeValue: 200000, receivable: 0 },
    mortgageByYear: Array.from({ length: 11 }, (_, y) => Math.max(0, 100000 - y * 10000)),
    returns: { equity: { mean: 6, vol: 16 }, bonds: { mean: 3, vol: 5 }, cash: { mean: 2, vol: 0.5 }, other: { mean: 5, vol: 30 }, pension: { mean: 4, vol: 8 }, home: { mean: 2, vol: 5 } },
    equityBondCorrelation: 0.2,
    target: { equityPct: 80, bondsPct: 15, otherPct: 5, bufferEUR: 10000 },
    savingsPerYear: 10000,
    pensionContribPerYear: 1000,
    inflationPct: 2,
  };
  it('seeded Monte Carlo is deterministic and ordered', () => {
    const a = runForecast(inp);
    const b = runForecast(inp);
    expect(a).toEqual(b);
    const c = runForecast({ ...inp, seed: 8 });
    expect(c.netWorth[10].p50).not.toBe(a.netWorth[10].p50);
    for (const band of a.netWorth) {
      expect(band.p10).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p90);
    }
    expect(a.netWorth[0].p50).toBeCloseTo(100000 + 10000 + 200000 - 100000, 6);
    expect(a.netWorthReal[10].p50).toBeCloseTo(a.netWorth[10].p50 / Math.pow(1.02, 10), 6);
  });
  it('zero volatility gives a degenerate fan', () => {
    const z = { mean: 0, vol: 0 };
    const out = runForecast({ ...inp, returns: { equity: z, bonds: z, cash: z, other: z, pension: z, home: z }, equityBondCorrelation: 0 });
    expect(out.liquid[10].p10).toBeCloseTo(out.liquid[10].p90, 6);
    expect(out.liquid[10].p50).toBeCloseTo(100000 + 10 * 10000, 6);
  });
  it('stress test computes loss and new mix', () => {
    const s = stressTest({ equity: 100, bonds: 0, other: 0, cash: 100 }, { equity: -50, bonds: 0, other: 0, cash: 0 });
    expect(s.loss).toBe(-50);
    expect(s.pct.cash).toBeCloseTo(66.666, 2);
  });
});

describe('provenance', () => {
  it('normalises free-form src strings', () => {
    expect(srcTag('sourced: justETF')).toBe('sourced');
    expect(srcTag('estimate: typical OCF')).toBe('estimate');
    expect(srcTag('rule (re-verify)')).toBe('sourced');
    expect(srcTag('approx, not re-verified')).toBe('estimate');
    expect(srcTag('sheet, not re-verified')).toBe('sheet');
  });
});

describe('one-off inflows', () => {
  it('nets provided items at their tax rate, lists missing ones, and adds them to the forecast year', async () => {
    const { oneOffInflows, buildForecastInput, defaultForecastOptions } = await import('../src/lib/forecastInputs');
    const { buildModel } = await import('../src/lib/model');
    const f = syntheticFinance();
    f.forecastAssumptions.oneOffInflows = [
      { date: '2030-11-30', label: 'Bonus', grossEUR: 10000, taxPct: 40, src: 'stated' },
      { date: '2030-11-30', label: 'Unknown', grossEUR: null, taxPct: 40, src: 'stated' },
    ];
    const o = oneOffInflows(f);
    expect(o.provided[0].netEUR).toBeCloseTo(6000);
    expect(o.missing.map((x) => x.label)).toEqual(['Unknown']);
    const m = buildModel(f);
    const on = buildForecastInput(f, m, defaultForecastOptions(f));
    expect(on.input.extraInflows?.[1]).toBeCloseTo(6000);
    expect(on.oneOffNetTotal).toBeCloseTo(6000);
    const off = buildForecastInput(f, m, { ...defaultForecastOptions(f), includeOneOffs: false });
    expect(off.input.extraInflows?.[1]).toBe(0);
  });
});

describe('one-off inflows from hours', () => {
  it('computes gross = hours × monthly / divisor', async () => {
    const { oneOffInflows } = await import('../src/lib/forecastInputs');
    const f = syntheticFinance();
    f.forecastAssumptions.oneOffInflows = [
      { date: '2030-11-30', label: 'Leave payout', grossEUR: null, taxPct: 50, src: 'stated', hours: 100, hourlyBasis: { monthlyEUR: 1680, divisor: 168, src: 'rule' } },
    ];
    const o = oneOffInflows(f);
    expect(o.provided[0].grossEUR).toBeCloseTo(1000);
    expect(o.provided[0].netEUR).toBeCloseTo(500);
    expect(o.provided[0].hourlyRateEUR).toBeCloseTo(10);
    expect(o.missing).toHaveLength(0);
  });
});

describe('pension–equity correlation', () => {
  it('widens the net-worth range when pension moves with equities, and leaves medians close', () => {
    const base: ForecastInput = {
      years: 10,
      paths: 3000,
      seed: 11,
      start: { equity: 100000, bonds: 0, other: 0, cash: 10000, pension: 100000, homeValue: 0, receivable: 0 },
      mortgageByYear: new Array(11).fill(0),
      returns: { equity: { mean: 6, vol: 16 }, bonds: { mean: 3, vol: 5 }, cash: { mean: 2, vol: 0.5 }, other: { mean: 5, vol: 30 }, pension: { mean: 4, vol: 12 }, home: { mean: 2, vol: 5 } },
      equityBondCorrelation: 0.2,
      target: { equityPct: 100, bondsPct: 0, otherPct: 0, bufferEUR: 10000 },
      savingsPerYear: 0,
      pensionContribPerYear: 0,
      inflationPct: 2,
    };
    const indep = runForecast({ ...base, pensionEquityCorrelation: 0 });
    const corr = runForecast({ ...base, pensionEquityCorrelation: 0.9 });
    const spread = (o: typeof indep) => o.netWorth[10].p90 - o.netWorth[10].p10;
    expect(spread(corr)).toBeGreaterThan(spread(indep));
    expect(Math.abs(corr.netWorth[10].p50 - indep.netWorth[10].p50) / indep.netWorth[10].p50).toBeLessThan(0.05);
    // default (no field) behaves as independent
    expect(runForecast(base)).toEqual(indep);
  });
});

describe('util helpers', () => {
  it('decimalsOf reads the written precision', async () => {
    const { decimalsOf } = await import('../src/lib/calc/util');
    expect(decimalsOf(26.58)).toBe(2);
    expect(decimalsOf(32.343)).toBe(3);
    expect(decimalsOf(100)).toBe(0);
    expect(decimalsOf(1e-7)).toBe(7);
  });
  it('sumWithinDays sums the trailing window, inclusive of the end date', async () => {
    const { sumWithinDays } = await import('../src/lib/calc/util');
    const ev = [
      { date: '2029-07-31', valueEUR: 1 },
      { date: '2029-10-31', valueEUR: 10 },
      { date: '2030-04-30', valueEUR: 100 },
      { date: '2030-10-18', valueEUR: 1000 },
      { date: '2030-10-19', valueEUR: 5000 },
    ];
    expect(sumWithinDays(ev, '2030-10-18', 365)).toBe(1110);
  });
});
