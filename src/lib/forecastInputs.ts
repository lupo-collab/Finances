// Turns the data file + UI options into Monte Carlo inputs. Every assumption used is returned
// alongside so the UI can print it under the chart.
import { incomeOf, type Finance } from '../data/schema';
import type { Model } from './model';
import type { Basis } from './calc/networth';
import { balanceAfter } from './calc/mortgage';
import { RSU_MULT, type RsuValuation } from './calc/rsu';
import { parseISODate } from './calc/util';
import type { ForecastInput } from './calc/forecast';
import type { TargetSpec } from './calc/targets';

export type SavingsCase = 'low' | 'base' | 'high';

export interface ForecastOptions {
  basis: Basis;
  years: number;
  savings: SavingsCase;
  savingsOverride?: number;
  includeRsu: boolean;
  rsuValuation: RsuValuation;
  /** share of each vest withheld for tax (sell-to-cover). Estimate: previous employer's stock history. */
  rsuWithholdPct: number;
  includeStake: boolean;
  ingSwitch: boolean;
  target?: TargetSpec;
  returns?: Partial<ForecastInput['returns']>;
  inflationPct?: number;
  seed?: number;
}

/** The off-portfolio item valued at zero with a contingent upside (e.g. a startup stake). */
export function contingentStake(d: Finance) {
  return d.offPortfolio.find((x) => x.contingentUpsideEUR != null);
}

export function defaultForecastOptions(d: Finance, basis: Basis = 'sheet'): ForecastOptions {
  const gsu = incomeOf(d.income).prev.gsu;
  return {
    basis,
    years: d.forecastAssumptions.horizonYears,
    savings: 'base',
    includeRsu: false,
    rsuValuation: 'haircut50',
    rsuWithholdPct: gsu?.sellToCoverPct ?? 47,
    includeStake: false,
    ingSwitch: false,
  };
}

export function buildForecastInput(d: Finance, m: Model, o: ForecastOptions) {
  const fa = d.forecastAssumptions;
  const R = fa.returnsNominalEUR;
  const returns = { ...R, ...o.returns } as ForecastInput['returns'];
  const sv = fa.annualNetSavingsEUR;
  const savings = o.savingsOverride ?? sv[o.savings];
  const mort = d.home.mortgage;
  const houseLine = m.latest.values['house'] ?? 0;
  const homeValue = o.basis === 'market' ? d.home.valueEstimateEUR : houseLine + mort.balanceEUR;
  const mortgageByYear = Array.from({ length: o.years + 1 }, (_, y) => balanceAfter(m.mortgage.rows, mort.balanceEUR, y * 12));

  const asOf = parseISODate(d.meta.asOf);
  const fx = d.settings.fxUsdPerEur.value;
  const inflows = new Array<number>(o.years + 1).fill(0);
  if (o.includeRsu) {
    const mult = RSU_MULT[o.rsuValuation] * (1 - o.rsuWithholdPct / 100);
    for (const e of m.inc.next.rsu.schedule) {
      const yrs = (parseISODate(e.date).getTime() - asOf.getTime()) / (365.25 * 86_400_000);
      const idx = Math.ceil(yrs);
      if (idx >= 1 && idx <= o.years) inflows[idx] += (e.usdAtGrant * mult) / fx;
    }
  }
  const stake = contingentStake(d);
  if (o.includeStake && stake?.contingentUpsideEUR && o.years >= 1) inflows[1] += stake.contingentUpsideEUR;

  // Fee drag on invested liquid assets: ETF TER + managed funds (mid of range), or ETF-equivalent after a switch
  const invested = m.liquid.classes.total - m.liquid.classes.cash;
  const ingMid = (m.costs.ingCost.low + m.costs.ingCost.high) / 2;
  const ingAfter = d.costs.etfEquivalentForIngEUR ?? 0;
  const feeEUR = m.costs.etfTer + (o.ingSwitch ? ingAfter : ingMid);
  const feeDragPct = invested > 0 ? (feeEUR / invested) * 100 : 0;

  const input: ForecastInput = {
    years: o.years,
    paths: fa.paths,
    seed: o.seed ?? 20261013,
    start: {
      equity: m.liquid.classes.equity,
      bonds: m.liquid.classes.bonds,
      other: m.liquid.classes.other,
      cash: m.liquid.classes.cash,
      pension: m.nw.buckets.pension,
      homeValue,
      receivable: m.nw.buckets.receivable,
    },
    mortgageByYear,
    returns,
    equityBondCorrelation: fa.equityBondCorrelation,
    target: o.target ?? m.target,
    savingsPerYear: savings ?? 0,
    pensionContribPerYear: fa.pensionContributionsEURperYear.value,
    extraInflows: inflows,
    oneOffNow: o.ingSwitch ? -m.ingSwitch.tax : 0,
    feeDragPct,
    inflationPct: o.inflationPct ?? fa.inflationPct,
  };
  return { input, savingsMissing: savings == null, feeDragPct, rsuInflowTotal: inflows.reduce((a, b) => a + b, 0) };
}
