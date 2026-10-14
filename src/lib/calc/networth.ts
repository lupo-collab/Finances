import type { Bucket, LineCatalog, Snapshot } from '../../data/schema';
import { BUCKETS } from '../../data/schema';
import { sum } from './util';

export type Basis = 'sheet' | 'market';

export function snapshotTotal(s: Pick<Snapshot, 'values'>): number {
  return sum(Object.values(s.values));
}

export function bucketTotals(s: Pick<Snapshot, 'values'>, catalog: LineCatalog): Record<Bucket, number> {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const [line, v] of Object.entries(s.values)) {
    const entry = catalog[line];
    if (!entry) throw new Error(`Unknown net-worth line "${line}" (add it to lineCatalog)`);
    out[entry.bucket] += v;
  }
  return out;
}

export interface MarketInputs {
  homeValueEUR: number;
  mortgageBalanceEUR: number;
  houseLine?: string;
}

export function homeEquity(m: MarketInputs): number {
  return m.homeValueEUR - m.mortgageBalanceEUR;
}

/** Replace the sheet's tracked house line with value − mortgage balance. */
export function marketValueTotal(s: Pick<Snapshot, 'values'>, m: MarketInputs): number {
  const line = m.houseLine ?? 'house';
  return snapshotTotal(s) - (s.values[line] ?? 0) + homeEquity(m);
}

export function bucketTotalsForBasis(
  s: Pick<Snapshot, 'values'>,
  catalog: LineCatalog,
  basis: Basis,
  m: MarketInputs,
): Record<Bucket, number> {
  const b = bucketTotals(s, catalog);
  if (basis === 'market') b.realEstate = b.realEstate - (s.values[m.houseLine ?? 'house'] ?? 0) + homeEquity(m);
  return b;
}

export function delta(from: number, to: number): { abs: number; pct: number } {
  return { abs: to - from, pct: from === 0 ? 0 : ((to - from) / from) * 100 };
}

/** Per-line change between two snapshots, sorted by absolute size (for waterfalls). */
export function lineChanges(a: Pick<Snapshot, 'values'>, b: Pick<Snapshot, 'values'>) {
  const keys = new Set([...Object.keys(a.values), ...Object.keys(b.values)]);
  return [...keys]
    .map((k) => ({ line: k, from: a.values[k] ?? 0, to: b.values[k] ?? 0, change: (b.values[k] ?? 0) - (a.values[k] ?? 0) }))
    .filter((r) => r.change !== 0)
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
}

export function sortedSnapshots<T extends { date: string }>(s: readonly T[]): T[] {
  return [...s].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestSnapshot<T extends { date: string }>(s: readonly T[]): T {
  const sorted = sortedSnapshots(s);
  return sorted[sorted.length - 1];
}

/** Latest snapshot dated on or before `date` (ISO). */
export function snapshotOnOrBefore<T extends { date: string }>(s: readonly T[], date: string): T | undefined {
  return sortedSnapshots(s).filter((x) => x.date <= date).pop();
}
