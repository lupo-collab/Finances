import type { RealisedSale } from '../../data/schema';
import { CAPITAL_GAINS_PCT } from './tax';

export interface SaleLineResult {
  name: string;
  since?: string;
  paid: number;
  gross: number;
  tax: number;
  fee: number;
  net: number;
  earlier: number;
  /** gross − tax − fee: should equal the credited net */
  netCheck: number;
  /** net + earlier (dividends, partial sales) − paid */
  profit: number;
  profitPct: number | null;
}

export function saleLines(s: RealisedSale): SaleLineResult[] {
  return s.lines.map((l) => {
    const profit = l.netEUR + l.earlierNetEUR - l.paidEUR;
    return {
      name: l.name,
      since: l.since,
      paid: l.paidEUR,
      gross: l.grossEUR,
      tax: l.taxEUR,
      fee: l.feeEUR,
      net: l.netEUR,
      earlier: l.earlierNetEUR,
      netCheck: l.grossEUR - l.taxEUR - l.feeEUR,
      profit,
      profitPct: l.paidEUR > 0 ? (profit / l.paidEUR) * 100 : null,
    };
  });
}

export function saleTotals(s: RealisedSale) {
  const ls = saleLines(s);
  const t = (f: (l: SaleLineResult) => number) => ls.reduce((a, l) => a + f(l), 0);
  const paid = t((l) => l.paid);
  const profit = t((l) => l.profit);
  const net = t((l) => l.net);
  const earlier = t((l) => l.earlier);
  return {
    lines: ls.length,
    paid,
    gross: t((l) => l.gross),
    tax: t((l) => l.tax),
    fee: t((l) => l.fee),
    net,
    earlier,
    /** everything that came back: sale proceeds + dividends and earlier sales */
    gotBack: net + earlier,
    profit,
    profitPct: paid > 0 ? (profit / paid) * 100 : null,
  };
}

/** Minusvalenze can be used in the tax year they are realised and the next four. */
export const LOSS_CARRY_YEARS = 4;
export const carryUntilYear = (dateISO: string): number => Number(dateISO.slice(0, 4)) + LOSS_CARRY_YEARS;
/** The most tax a loss can save: the 26% rate on the gains it offsets. */
export const lossTaxValue = (lossEUR: number): number => (Math.abs(lossEUR) * CAPITAL_GAINS_PCT) / 100;
