import type { AssetClass, Position } from '../../data/schema';

export type ClassMap = Record<AssetClass, number>;

/**
 * Luca's allocation rule (decided 17 Oct 2026, recorded in `targets.scopeDecision`):
 * bonds are `bondsPct` of all investable wealth, pension funds included (looked through);
 * 'other' (single stock, crypto, private equity, loans) is a cap, not a target: it is never bought and
 * whatever it leaves unused goes to equity; equity takes the rest. The cash buffer and the home stay outside.
 */
export interface TargetSpec {
  bondsPct: number;
  otherCapPct: number;
  bufferEUR: number;
}

/** Investable wealth by class: liquid portfolio + pension look-through, receivables in 'other'; cash = all liquid cash. */
export type Wealth = ClassMap;

export const cashAboveBuffer = (w: Wealth, t: TargetSpec): number => Math.max(0, w.cash - t.bufferEUR);

export interface ClassTargets {
  /** invested wealth + the cash being invested (buffer and home excluded) */
  investable: number;
  equity: number;
  bonds: number;
  /** ceiling for 'other' */
  otherCap: number;
  /** the buffer */
  cash: number;
}

/** Class targets once `cashInvested` (default: all cash above the buffer) joins the invested wealth. */
export function classTargets(w: Wealth, t: TargetSpec, cashInvested = cashAboveBuffer(w, t)): ClassTargets {
  const investable = w.equity + w.bonds + w.other + Math.max(0, cashInvested);
  const bonds = (investable * t.bondsPct) / 100;
  return {
    investable,
    bonds,
    equity: Math.max(0, investable - bonds - w.other),
    otherCap: (investable * t.otherCapPct) / 100,
    cash: t.bufferEUR,
  };
}

/** Target − actual per class (positive = buy). 'other' gives the room left under its cap; cash gives buffer − cash. */
export function gaps(w: Wealth, t: TargetSpec): ClassMap {
  const ct = classTargets(w, t);
  return { equity: ct.equity - w.equity, bonds: ct.bonds - w.bonds, other: ct.otherCap - w.other, cash: ct.cash - w.cash };
}

export type SleeveClass = 'equity' | 'bonds';

export interface PlanRow {
  ticker: string;
  assetClass: SleeveClass;
  /** weight inside its sleeve, % */
  weightPct: number;
  current: number;
  target: number;
  deficit: number;
  buy: number;
  after: number;
  /** below target, but its share of the money was under the minimum order */
  skipped: boolean;
}

export interface PlanInput {
  wealth: Wealth;
  target: TargetSpec;
  /** new money invested now; it joins the investable wealth (cash not invested stays aside, like the buffer) */
  amountEUR: number;
  /** ETF weights per sleeve, e.g. { equity: { AAA: 75, BBB: 25 } } */
  sleeves: Partial<Record<SleeveClass, Record<string, number>>>;
  /** current liquid value per ticker */
  tickerValues: Record<string, number>;
  minOrderEUR?: number;
}

export interface Plan {
  targets: ClassTargets;
  rows: PlanRow[];
  total: number;
  before: ClassMap;
  /** class totals after the buys; cash = money left unspent */
  after: ClassMap;
  /** other ÷ investable */
  otherShare: number;
}

/**
 * Buy-only orders. Each ETF's target is its sleeve weight × (class target − what the class holds outside the
 * sleeve, e.g. the pension look-through). Money goes to ETFs below target in proportion to the shortfall; the
 * smallest order under the minimum is dropped and the split redone, while more than one ETF is left. With no
 * shortfall anywhere the money is spread by target. Same algorithm as the "Ribilanciatore 80/15/5" page.
 */
export function investPlan(inp: PlanInput): Plan {
  const w = inp.wealth;
  const C = Math.max(0, inp.amountEUR);
  const minOrder = Math.max(0, inp.minOrderEUR ?? 0);
  const ct = classTargets(w, inp.target, C);
  const rows: PlanRow[] = [];
  for (const cls of ['equity', 'bonds'] as const) {
    const split = inp.sleeves[cls] ?? {};
    const wsum = Object.values(split).reduce((a, b) => a + b, 0);
    if (wsum <= 0) continue;
    const held = Object.keys(split).reduce((a, k) => a + (inp.tickerValues[k] ?? 0), 0);
    const sleeveTarget = Math.max(0, ct[cls] - (w[cls] - held));
    for (const [ticker, wt] of Object.entries(split)) {
      const current = inp.tickerValues[ticker] ?? 0;
      const target = (sleeveTarget * wt) / wsum;
      rows.push({ ticker, assetClass: cls, weightPct: (wt / wsum) * 100, current, target, deficit: Math.max(0, target - current), buy: 0, after: current, skipped: false });
    }
  }
  const active = rows.map((r) => r.deficit > 0);
  if (C > 0 && active.some(Boolean)) {
    for (;;) {
      const D = rows.reduce((a, r, i) => a + (active[i] ? r.deficit : 0), 0);
      rows.forEach((r, i) => (r.buy = active[i] ? (r.deficit * C) / D : 0));
      const n = active.filter(Boolean).length;
      let idx = -1;
      rows.forEach((r, i) => {
        if (active[i] && r.buy < minOrder && (idx < 0 || r.buy < rows[idx].buy)) idx = i;
      });
      if (idx < 0 || n <= 1) break;
      active[idx] = false;
      rows[idx].skipped = true;
    }
  } else if (C > 0 && rows.length) {
    const T = rows.reduce((a, r) => a + r.target, 0);
    rows.forEach((r) => (r.buy = T > 0 ? (C * r.target) / T : C / rows.length));
  }
  rows.forEach((r) => (r.after = r.current + r.buy));
  const bought = (cls: SleeveClass) => rows.filter((r) => r.assetClass === cls).reduce((a, r) => a + r.buy, 0);
  const total = rows.reduce((a, r) => a + r.buy, 0);
  return {
    targets: ct,
    rows,
    total,
    before: { equity: w.equity, bonds: w.bonds, other: w.other, cash: C },
    after: { equity: w.equity + bought('equity'), bonds: w.bonds + bought('bonds'), other: w.other, cash: C - total },
    otherShare: ct.investable > 0 ? w.other / ct.investable : 0,
  };
}

/** Positive unrealised gains (winners) on a set of positions. */
export function winnersGain(ps: readonly Position[]): number {
  return ps.reduce((a, p) => a + Math.max(0, p.unrealisedEUR ?? 0), 0);
}
