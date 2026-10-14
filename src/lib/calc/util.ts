export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
export const round2 = (x: number): number => Math.round(x * 100) / 100;

export function groupSum<T>(items: readonly T[], key: (t: T) => string, val: (t: T) => number) {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    out[k] = (out[k] ?? 0) + val(it);
  }
  return out;
}

/** Whole days from a to b (b - a), using UTC dates so DST never shifts the count. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
