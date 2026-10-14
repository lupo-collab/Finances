import type { RsuEvent } from '../../data/schema';

export type RsuValuation = 'zero' | 'haircut50' | 'grant';
export const RSU_MULT: Record<RsuValuation, number> = { zero: 0, haircut50: 0.5, grant: 1 };

export interface RsuCheck {
  events: number;
  fractionSum: number;
  usdTotal: number;
  consistent: boolean; // usdAtGrant == fraction × grant for every event
}

export function checkSchedule(s: readonly RsuEvent[], grantUSD: number): RsuCheck {
  const fractionSum = s.reduce((a, e) => a + e.fraction, 0);
  const usdTotal = s.reduce((a, e) => a + e.usdAtGrant, 0);
  const consistent = s.every((e) => Math.abs(e.fraction * grantUSD - e.usdAtGrant) < 0.01);
  return { events: s.length, fractionSum, usdTotal, consistent };
}

export interface RsuPoint {
  date: string;
  usd: number;
  cumUSD: number;
  cumEUR: number;
}

/** Cumulative vest values. fxUsdPerEur converts USD → EUR (EUR = USD / fx). */
export function cumulative(s: readonly RsuEvent[], fxUsdPerEur: number, valuation: RsuValuation = 'grant'): RsuPoint[] {
  const m = RSU_MULT[valuation];
  let cum = 0;
  return [...s]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      cum += e.usdAtGrant * m;
      return { date: e.date, usd: e.usdAtGrant * m, cumUSD: cum, cumEUR: cum / fxUsdPerEur };
    });
}

/** USD vesting per calendar year. */
export function vestsByYear(s: readonly RsuEvent[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const e of s) {
    const y = Number(e.date.slice(0, 4));
    out[y] = (out[y] ?? 0) + e.usdAtGrant;
  }
  return out;
}
