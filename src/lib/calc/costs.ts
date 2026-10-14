import type { Position } from '../../data/schema';
import { sum } from './util';

/** Annual TER cost of positions with a known TER (ETFs etc). */
export function knownTerCost(ps: readonly Position[]): number {
  return sum(ps.filter((p) => p.terPct != null).map((p) => (p.valueEUR * (p.terPct as number)) / 100));
}

/** Cost range for positions: known TER at both ends, otherwise the terRangePct bounds. */
export function terCostRange(ps: readonly Position[]): { low: number; high: number; lowPct: number; highPct: number; value: number } {
  let low = 0;
  let high = 0;
  for (const p of ps) {
    if (p.terPct != null) {
      low += (p.valueEUR * p.terPct) / 100;
      high += (p.valueEUR * p.terPct) / 100;
    } else if (p.terRangePct) {
      low += (p.valueEUR * p.terRangePct[0]) / 100;
      high += (p.valueEUR * p.terRangePct[1]) / 100;
    }
  }
  const value = sum(ps.map((p) => p.valueEUR));
  return { low, high, value, lowPct: value ? (low / value) * 100 : 0, highPct: value ? (high / value) * 100 : 0 };
}

export function positionCost(p: Position): { low: number; high: number } | null {
  if (p.terPct != null) return { low: (p.valueEUR * p.terPct) / 100, high: (p.valueEUR * p.terPct) / 100 };
  if (p.terRangePct) return { low: (p.valueEUR * p.terRangePct[0]) / 100, high: (p.valueEUR * p.terRangePct[1]) / 100 };
  return null;
}

/** Imposta di bollo / IVAFE at a flat rate on securities value (cash excluded). */
export function bolloOnSecurities(ps: readonly Position[], ratePct = 0.2): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of ps) out[p.account] = (out[p.account] ?? 0) + (p.valueEUR * ratePct) / 100;
  return out;
}

/**
 * Value after `years` of compounding at `grossPct` minus cost `costPct` vs. no cost.
 * Returns the euro drag (what costs eat), contributions ignored.
 */
export function costDrag(value: number, grossPct: number, costPct: number, years: number): number {
  const gross = value * Math.pow(1 + grossPct / 100, years);
  const net = value * Math.pow(1 + (grossPct - costPct) / 100, years);
  return gross - net;
}
