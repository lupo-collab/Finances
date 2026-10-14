import type { AssetClass, CashLine, Position } from '../../data/schema';
import { groupSum, sum } from './util';

export interface Normalised {
  equity: number;
  bonds: number;
  cash: number;
}

/** Look-through split as fractions summing to exactly 1 (factsheets often sum to 99.x%). */
export function normaliseLookThrough(lt: { equity: number; bonds: number; cash: number }): Normalised {
  const t = lt.equity + lt.bonds + lt.cash;
  if (t <= 0) throw new Error('Look-through split sums to zero');
  return { equity: lt.equity / t, bonds: lt.bonds / t, cash: lt.cash / t };
}

/** One class-pure slice of a position (multi-asset funds produce several). */
export interface Piece {
  account: string;
  name: string;
  ticker: string | null;
  assetClass: AssetClass;
  valueEUR: number;
  positionIndex: number | null; // null = cash line
  src: string;
}

export function pieces(positions: readonly Position[], cash: readonly CashLine[]): Piece[] {
  const out: Piece[] = [];
  positions.forEach((p, i) => {
    const base = { account: p.account, name: p.name, ticker: p.ticker ?? null, positionIndex: i, src: p.src };
    if (p.assetClass === 'multi') {
      if (!p.lookThrough) throw new Error(`Multi-asset position "${p.name}" has no lookThrough`);
      const n = normaliseLookThrough(p.lookThrough);
      (['equity', 'bonds', 'cash'] as const).forEach((c) => {
        out.push({ ...base, assetClass: c, valueEUR: p.valueEUR * n[c] });
      });
    } else {
      out.push({ ...base, assetClass: p.assetClass, valueEUR: p.valueEUR });
    }
  });
  cash.forEach((c) =>
    out.push({ account: c.account, name: c.label, ticker: null, assetClass: 'cash', valueEUR: c.valueEUR, positionIndex: null, src: c.src }),
  );
  return out;
}

export interface ClassTotals {
  equity: number;
  bonds: number;
  other: number;
  cash: number;
  total: number;
}

export function classTotals(ps: readonly Piece[]): ClassTotals {
  const g = groupSum(ps, (p) => p.assetClass, (p) => p.valueEUR);
  const t = { equity: g.equity ?? 0, bonds: g.bonds ?? 0, other: g.other ?? 0, cash: g.cash ?? 0 };
  return { ...t, total: t.equity + t.bonds + t.other + t.cash };
}

export function classPct(t: ClassTotals): Record<AssetClass, number> {
  const d = t.total || 1;
  return { equity: (t.equity / d) * 100, bonds: (t.bonds / d) * 100, other: (t.other / d) * 100, cash: (t.cash / d) * 100 };
}

export function liquidTotal(positions: readonly Position[], cash: readonly CashLine[]): number {
  return sum(positions.map((p) => p.valueEUR)) + sum(cash.map((c) => c.valueEUR));
}

/** Value by account: positions + cash lines. */
export function accountTotals(positions: readonly Position[], cash: readonly CashLine[]): Record<string, number> {
  const a = groupSum(positions, (p) => p.account, (p) => p.valueEUR);
  for (const c of cash) a[c.account] = (a[c.account] ?? 0) + c.valueEUR;
  return a;
}

export function positionsTotalByAccount(positions: readonly Position[]): Record<string, number> {
  return groupSum(positions, (p) => p.account, (p) => p.valueEUR);
}

export function cashByAccount(cash: readonly CashLine[]): Record<string, number> {
  return groupSum(cash, (c) => c.account, (c) => c.valueEUR);
}

/** Totals per ticker across accounts (positions with no ticker are skipped). */
export function tickerTotals(positions: readonly Position[]): Record<string, number> {
  return groupSum(
    positions.filter((p) => p.ticker),
    (p) => p.ticker as string,
    (p) => p.valueEUR,
  );
}

/** Class mix per account (for stacked bars). */
export function classMixByAccount(ps: readonly Piece[]): Record<string, Record<AssetClass, number>> {
  const out: Record<string, Record<AssetClass, number>> = {};
  for (const p of ps) {
    out[p.account] ??= { equity: 0, bonds: 0, other: 0, cash: 0 };
    out[p.account][p.assetClass] += p.valueEUR;
  }
  return out;
}

export function unrealised(p: Position): { eur: number | null; pct: number | null } {
  const eur = p.unrealisedEUR ?? (p.costBasisEUR != null ? p.valueEUR - p.costBasisEUR : null);
  const pct = eur != null && p.costBasisEUR ? (eur / p.costBasisEUR) * 100 : null;
  return { eur, pct };
}

export function shareOf(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}
