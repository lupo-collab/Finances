import type { AssetClass, Position } from '../../data/schema';
import type { ClassTotals } from './liquid';

export interface TargetSpec {
  equityPct: number;
  bondsPct: number;
  otherPct: number;
  bufferEUR: number;
}

export type ClassMap = Record<AssetClass, number>;

/** investable = liquid − buffer; class target = investable × %; cash target = buffer; gap = target − actual. */
export function targetValues(total: number, t: TargetSpec): ClassMap {
  const investable = total - t.bufferEUR;
  return {
    equity: (investable * t.equityPct) / 100,
    bonds: (investable * t.bondsPct) / 100,
    other: (investable * t.otherPct) / 100,
    cash: t.bufferEUR,
  };
}

export function gaps(actual: ClassTotals, t: TargetSpec): ClassMap {
  const tv = targetValues(actual.total, t);
  return {
    equity: tv.equity - actual.equity,
    bonds: tv.bonds - actual.bonds,
    other: tv.other - actual.other,
    cash: tv.cash - actual.cash,
  };
}

export interface Order {
  assetClass: AssetClass;
  ticker: string; // "TBD" or "other" when no instrument chosen yet
  amountEUR: number;
}

export interface InvestInput {
  amountEUR: number;
  actual: ClassTotals; // must already include the amount as cash
  target: TargetSpec;
  /** sleeve splits in % (e.g. {AAA:75, BBB:15, CCC:10}) */
  sleeves: Partial<Record<AssetClass, Record<string, number>>>;
  /** current value per ticker (across accounts) */
  tickerValues: Record<string, number>;
}

/** Allocate `amount` across buckets proportionally to positive gaps, capped by the gap; overflow by weight. */
export function fillGaps(amount: number, gapMap: Record<string, number>, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights);
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  if (amount <= 0) return out;
  const pos = keys.map((k) => Math.max(0, gapMap[k] ?? 0));
  const posSum = pos.reduce((a, b) => a + b, 0);
  let left = amount;
  if (posSum > 0) {
    const scale = Math.min(1, amount / posSum);
    keys.forEach((k, i) => {
      out[k] = pos[i] * scale;
    });
    left = amount - posSum * scale;
  }
  if (left > 1e-9) {
    const wSum = keys.reduce((a, k) => a + (weights[k] ?? 0), 0);
    if (wSum > 0) keys.forEach((k) => (out[k] += (left * (weights[k] ?? 0)) / wSum));
  }
  return out;
}

/**
 * Buy-only plan: close class gaps first (equity/bonds/other), then within each class
 * move instruments toward the sleeve split. Money comes out of cash.
 */
export function investNewMoney(inp: InvestInput): Order[] {
  const g = gaps(inp.actual, inp.target);
  const classWeights = { equity: inp.target.equityPct, bonds: inp.target.bondsPct, other: inp.target.otherPct };
  const byClass = fillGaps(inp.amountEUR, g, classWeights);
  const tv = targetValues(inp.actual.total, inp.target);
  const orders: Order[] = [];
  for (const cls of ['equity', 'bonds', 'other'] as const) {
    const amt = byClass[cls];
    if (amt <= 0.005) continue;
    const split = inp.sleeves[cls];
    if (!split || Object.keys(split).length === 0) {
      orders.push({ assetClass: cls, ticker: cls, amountEUR: amt });
      continue;
    }
    const splitSum = Object.values(split).reduce((a, b) => a + b, 0);
    const tickerGaps: Record<string, number> = {};
    for (const [tk, pct] of Object.entries(split)) {
      tickerGaps[tk] = (tv[cls] * pct) / splitSum - (inp.tickerValues[tk] ?? 0);
    }
    const alloc = fillGaps(amt, tickerGaps, split);
    for (const [tk, a] of Object.entries(alloc)) if (a > 0.005) orders.push({ assetClass: cls, ticker: tk, amountEUR: a });
  }
  return orders;
}

/** Positive unrealised gains (winners) on a set of positions. */
export function winnersGain(ps: readonly Position[]): number {
  return ps.reduce((a, p) => a + Math.max(0, p.unrealisedEUR ?? 0), 0);
}
