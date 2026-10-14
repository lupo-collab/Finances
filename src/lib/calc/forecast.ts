import { cholesky, lognormalParams, mulberry32, normalSampler, percentile } from './random';

export interface RA {
  mean: number; // % nominal arithmetic
  vol: number; // %
}

export interface ForecastInput {
  years: number;
  paths: number;
  seed: number;
  start: {
    equity: number;
    bonds: number;
    other: number;
    cash: number;
    pension: number;
    homeValue: number;
    receivable: number;
  };
  /** mortgage balance at the end of each year index 0..years (0 = today) */
  mortgageByYear: number[];
  returns: { equity: RA; bonds: RA; cash: RA; other: RA; pension: RA; home: RA };
  equityBondCorrelation: number;
  target: { equityPct: number; bondsPct: number; otherPct: number; bufferEUR: number };
  savingsPerYear: number;
  pensionContribPerYear: number;
  /** extra inflow into the liquid portfolio at the end of year i (index 1..years) */
  extraInflows?: number[];
  /** one-off change to the liquid portfolio today (e.g. −switch tax) */
  oneOffNow?: number;
  /** annual fee drag on the invested (non-cash) liquid portfolio, % */
  feeDragPct?: number;
  inflationPct: number;
}

export interface Band {
  p10: number;
  p50: number;
  p90: number;
}

export interface ForecastOutput {
  years: number[]; // 0..N
  netWorth: Band[];
  liquid: Band[];
  netWorthReal: Band[];
  liquidReal: Band[];
}

/**
 * Annual-step Monte Carlo: lognormal returns per bucket, equity–bond correlation via Cholesky,
 * end-of-year contributions, annual rebalancing of the liquid portfolio to target,
 * deterministic mortgage amortisation. Seeded, so the same inputs give the same output.
 */
export function runForecast(inp: ForecastInput): ForecastOutput {
  const N = inp.years;
  const P = inp.paths;
  const rnd = normalSampler(mulberry32(inp.seed));
  const L = cholesky([
    [1, inp.equityBondCorrelation],
    [inp.equityBondCorrelation, 1],
  ]);
  const prm = {
    equity: lognormalParams(inp.returns.equity.mean, inp.returns.equity.vol),
    bonds: lognormalParams(inp.returns.bonds.mean, inp.returns.bonds.vol),
    cash: lognormalParams(inp.returns.cash.mean, inp.returns.cash.vol),
    other: lognormalParams(inp.returns.other.mean, inp.returns.other.vol),
    pension: lognormalParams(inp.returns.pension.mean, inp.returns.pension.vol),
    home: lognormalParams(inp.returns.home.mean, inp.returns.home.vol),
  };
  const fee = (inp.feeDragPct ?? 0) / 100;
  const tsum = inp.target.equityPct + inp.target.bondsPct + inp.target.otherPct || 1;
  const w = { e: inp.target.equityPct / tsum, b: inp.target.bondsPct / tsum, o: inp.target.otherPct / tsum };

  const nw = Array.from({ length: N + 1 }, () => new Float64Array(P));
  const lq = Array.from({ length: N + 1 }, () => new Float64Array(P));

  for (let p = 0; p < P; p++) {
    let e = inp.start.equity;
    let b = inp.start.bonds;
    let o = inp.start.other;
    let c = inp.start.cash + (inp.oneOffNow ?? 0);
    let pen = inp.start.pension;
    let home = inp.start.homeValue;
    const rec = inp.start.receivable;
    lq[0][p] = e + b + o + c;
    nw[0][p] = lq[0][p] + pen + home - inp.mortgageByYear[0] + rec;
    for (let y = 1; y <= N; y++) {
      const z1 = rnd();
      const z2 = rnd();
      const ze = L[0][0] * z1;
      const zb = L[1][0] * z1 + L[1][1] * z2;
      e *= Math.exp(prm.equity.mu + prm.equity.sigma * ze) * (1 - fee);
      b *= Math.exp(prm.bonds.mu + prm.bonds.sigma * zb) * (1 - fee);
      o *= Math.exp(prm.other.mu + prm.other.sigma * rnd()) * (1 - fee);
      c *= Math.exp(prm.cash.mu + prm.cash.sigma * rnd());
      pen *= Math.exp(prm.pension.mu + prm.pension.sigma * rnd());
      home *= Math.exp(prm.home.mu + prm.home.sigma * rnd());
      // end-of-year contributions
      c += inp.savingsPerYear + (inp.extraInflows?.[y] ?? 0);
      pen += inp.pensionContribPerYear;
      // annual rebalance to target
      const liquid = e + b + o + c;
      const cashT = Math.min(inp.target.bufferEUR, Math.max(0, liquid));
      const inv = liquid - cashT;
      e = inv * w.e;
      b = inv * w.b;
      o = inv * w.o;
      c = cashT;
      lq[y][p] = liquid;
      nw[y][p] = liquid + pen + home - (inp.mortgageByYear[y] ?? 0) + rec;
    }
  }

  const band = (arr: Float64Array): Band => {
    const s = Float64Array.from(arr).sort();
    return { p10: percentile(s, 0.1), p50: percentile(s, 0.5), p90: percentile(s, 0.9) };
  };
  const deflate = (bnd: Band, y: number): Band => {
    const d = Math.pow(1 + inp.inflationPct / 100, y);
    return { p10: bnd.p10 / d, p50: bnd.p50 / d, p90: bnd.p90 / d };
  };
  const years = Array.from({ length: N + 1 }, (_, i) => i);
  const netWorth = nw.map(band);
  const liquid = lq.map(band);
  return {
    years,
    netWorth,
    liquid,
    netWorthReal: netWorth.map(deflate),
    liquidReal: liquid.map(deflate),
  };
}

export interface Shock {
  equity: number; // % change, e.g. −30
  bonds: number;
  other: number;
  cash: number;
}

export function stressTest(t: { equity: number; bonds: number; other: number; cash: number }, s: Shock) {
  const after = {
    equity: t.equity * (1 + s.equity / 100),
    bonds: t.bonds * (1 + s.bonds / 100),
    other: t.other * (1 + s.other / 100),
    cash: t.cash * (1 + s.cash / 100),
  };
  const before = t.equity + t.bonds + t.other + t.cash;
  const total = after.equity + after.bonds + after.other + after.cash;
  return {
    after,
    total,
    loss: total - before,
    pct: {
      equity: (after.equity / total) * 100,
      bonds: (after.bonds / total) * 100,
      other: (after.other / total) * 100,
      cash: (after.cash / total) * 100,
    },
  };
}
