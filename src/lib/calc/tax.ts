import type { Position } from '../../data/schema';
import { winnersGain } from './targets';

export const CAPITAL_GAINS_PCT = 26;

/** Upper bound of tax on selling a set of fund positions: 26% of the winners' gains (losses can't offset fund gains). */
export function switchTaxUpperBound(ps: readonly Position[], ratePct = CAPITAL_GAINS_PCT): { gains: number; tax: number } {
  const gains = winnersGain(ps);
  return { gains, tax: (gains * ratePct) / 100 };
}

export function unrealisedByPosition(ps: readonly Position[]) {
  return ps
    .map((p) => ({ account: p.account, name: p.ticker ?? p.name, eur: p.unrealisedEUR ?? (p.costBasisEUR != null ? p.valueEUR - p.costBasisEUR : null) }))
    .filter((r): r is { account: string; name: string; eur: number } => r.eur != null)
    .sort((a, b) => a.eur - b.eur);
}

/** Years for annual savings to repay a one-off cost. */
export function paybackYears(oneOff: number, annualSaving: number): number {
  return annualSaving > 0 ? oneOff / annualSaving : Infinity;
}
