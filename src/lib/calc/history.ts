// Calendar-year replay of past returns on the plan's ETF sleeves.

export interface HistRow {
  ticker: string;
  returnsPct: Record<string, number>;
}

export interface SeriesByYear {
  years: string[];
  byYear: Record<string, number>;
}

/** Weighted return of a sleeve per year. Weights are renormalised over the tickers that have data; years = those all of them cover. */
export function sleeveHistory(rows: readonly HistRow[], split: Record<string, number>): SeriesByYear & { missing: string[] } {
  const have = Object.keys(split).filter((t) => split[t] > 0 && rows.some((r) => r.ticker === t));
  const missing = Object.keys(split).filter((t) => split[t] > 0 && !have.includes(t));
  if (!have.length) return { years: [], byYear: {}, missing };
  const rowOf = (t: string) => rows.find((r) => r.ticker === t) as HistRow;
  const years = Object.keys(rowOf(have[0]).returnsPct)
    .filter((y) => have.every((t) => rowOf(t).returnsPct[y] != null))
    .sort();
  const wsum = have.reduce((a, t) => a + split[t], 0);
  const byYear: Record<string, number> = {};
  for (const y of years) byYear[y] = have.reduce((a, t) => a + (split[t] / wsum) * rowOf(t).returnsPct[y], 0);
  return { years, byYear, missing };
}

/** Weighted mix of several series (weights renormalised), over the years they share. */
export function mixHistory(parts: readonly { weight: number; series: SeriesByYear }[]): SeriesByYear {
  const ps = parts.filter((p) => p.weight > 0 && p.series.years.length);
  if (!ps.length) return { years: [], byYear: {} };
  const years = ps[0].series.years.filter((y) => ps.every((p) => p.series.byYear[y] != null));
  const wsum = ps.reduce((a, p) => a + p.weight, 0);
  const byYear: Record<string, number> = {};
  for (const y of years) byYear[y] = ps.reduce((a, p) => a + (p.weight / wsum) * p.series.byYear[y], 0);
  return { years, byYear };
}

/** The `n` worst years of a series, worst first. */
export function worstYears(s: SeriesByYear, n: number): string[] {
  return [...s.years].sort((a, b) => s.byYear[a] - s.byYear[b]).slice(0, n);
}
