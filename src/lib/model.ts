// Derives every figure the UI and `verify` need from the raw (decrypted) file.
// Pure: no I/O, no clock. Nothing here contains personal data; it all comes from `d`.
import { incomeOf, type Finance, type Position } from '../data/schema';
import * as nwc from './calc/networth';
import * as lq from './calc/liquid';
import * as tg from './calc/targets';
import * as cs from './calc/costs';
import * as mg from './calc/mortgage';
import * as rsu from './calc/rsu';
import * as tx from './calc/tax';
import * as rl from './calc/realised';
import * as hs from './calc/history';
import { sum } from './calc/util';

export type Model = ReturnType<typeof buildModel>;

export function isEtf(p: Position): boolean {
  return !!p.ticker && p.terPct != null && p.assetClass !== 'other' && p.assetClass !== 'multi';
}

/** Bonds % of investable wealth, other's cap and the buffer; equity is whatever is left. */
export function defaultTarget(d: Finance): tg.TargetSpec {
  return {
    bondsPct: d.targets.sleeves.bonds.pct,
    otherCapPct: d.targets.sleeves.other.pct,
    bufferEUR: d.targets.cashBufferEUR,
  };
}

export function buildModel(d: Finance) {
  const catalog = d.netWorth.lineCatalog;
  const snapshots = nwc.sortedSnapshots(d.netWorth.snapshots);
  const latest = snapshots[snapshots.length - 1];
  const latestYear = latest.date.slice(0, 4);
  const ytdBase = snapshots.find((s) => s.date.startsWith(latestYear)) ?? snapshots[0];
  const mort = d.home.mortgage;
  const market: nwc.MarketInputs = { homeValueEUR: d.home.valueEstimateEUR, mortgageBalanceEUR: mort.balanceEUR };

  const snapRows = snapshots.map((s) => {
    const total = nwc.snapshotTotal(s);
    return {
      date: s.date,
      src: s.src,
      total,
      buckets: nwc.bucketTotals(s, catalog),
      expectedTotal: s.expectedTotal ?? null,
      sheetRecordedTotal: s.sheetRecordedTotal ?? null,
      sheetDiff: s.sheetRecordedTotal != null ? total - s.sheetRecordedTotal : null,
      note: s.note,
    };
  });

  const nwSheet = nwc.snapshotTotal(latest);
  const nwMarket = nwc.marketValueTotal(latest, market);
  const homeEq = nwc.homeEquity(market);

  // Liquid portfolio
  const { positions, cash } = d.liquidPortfolio;
  const pieces = lq.pieces(positions, cash);
  const classes = lq.classTotals(pieces);
  const classPct = lq.classPct(classes);
  const acctTotals = lq.accountTotals(positions, cash);
  const posByAcct = lq.positionsTotalByAccount(positions);
  const cashByAcct = lq.cashByAccount(cash);
  const tickers = lq.tickerTotals(positions);
  const etfTickers = [...new Set(positions.filter(isEtf).map((p) => p.ticker as string))];
  const singleStocks = positions.filter((p) => p.subClass === 'singleStock');
  const singleStock = singleStocks.reduce((a, p) => a + p.valueEUR, 0);
  const singleStockName = [...new Set(singleStocks.map((p) => p.ticker ?? p.name))].join(' / ') || 'Single stock';
  const multi = positions.filter((p) => p.assetClass === 'multi');
  // the managed-funds account: the one whose statement total is keyed `<account>_mmc`
  const fundsAcct = Object.keys(d.liquidPortfolio.statementTotals).find((k) => k.endsWith('_mmc'))?.replace(/_mmc$/, '') ?? '';
  const ingPositions = positions.filter((p) => p.account === fundsAcct);
  const acctName = (id: string) => d.accounts.find((a) => a.id === id)?.name ?? id;
  const ingLookThrough = lq.classTotals(lq.pieces(ingPositions, []));

  // Investable wealth (Luca, 17 Oct 2026): liquid portfolio + pension funds looked through + receivables in
  // 'other'; the home stays out. Pension and receivables come from the latest net-worth snapshot.
  const linesIn = (bucket: string) => Object.entries(latest.values).filter(([k]) => catalog[k]?.bucket === bucket);
  const pensionLines = linesIn('pension').map(([line, valueEUR]) => {
    const account = catalog[line].account;
    const split = d.targets.pensionLookThrough?.[account] ?? null;
    const t = split ? split.equity + split.bonds : 0;
    return {
      line,
      account,
      label: catalog[line].label,
      valueEUR,
      split,
      equity: split && t > 0 ? (valueEUR * split.equity) / t : 0,
      bonds: split && t > 0 ? (valueEUR * split.bonds) / t : 0,
    };
  });
  const penEq = sum(pensionLines.map((p) => p.equity));
  const penBd = sum(pensionLines.map((p) => p.bonds));
  const pension = {
    lines: pensionLines,
    equity: penEq,
    bonds: penBd,
    /** pension lines without a look-through are left out of the allocation */
    missing: pensionLines.filter((p) => !p.split).map((p) => p.label),
    equityShare: penEq + penBd > 0 ? penEq / (penEq + penBd) : 1,
  };
  const receivable = sum(linesIn('receivable').map(([, v]) => v));
  const wealth: tg.Wealth = { equity: classes.equity + penEq, bonds: classes.bonds + penBd, other: classes.other + receivable, cash: classes.cash };

  // Targets and the default buy list (all cash above the buffer)
  const target = defaultTarget(d);
  const targetVals = tg.classTargets(wealth, target);
  const gaps = tg.gaps(wealth, target);
  const cashAboveBuffer = classes.cash - target.bufferEUR;
  const sleeves = { equity: d.targets.sleeves.equity.split ?? {}, bonds: d.targets.sleeves.bonds.split ?? {} };
  const minOrderEUR = d.targets.rules?.minOrderEUR ?? 0;
  const plan = tg.investPlan({ wealth, target, amountEUR: Math.max(0, cashAboveBuffer), sleeves, tickerValues: tickers, minOrderEUR });
  /** name, ISIN and TER of a sleeve ETF: from the positions, else from `targets.instruments` */
  const instrument = (ticker: string) => {
    const p = positions.find((x) => x.ticker === ticker);
    const meta = d.targets.instruments?.[ticker];
    return { ticker, name: p?.name ?? meta?.name ?? ticker, isin: p?.isin ?? meta?.isin, terPct: p?.terPct ?? meta?.terPct ?? null, held: !!p, src: p ? p.terSrc ?? p.src : meta?.src };
  };

  // Realised sales and the history replay
  const realised = (d.realisedSales ?? []).map((s) => ({ sale: s, lines: rl.saleLines(s), totals: rl.saleTotals(s) }));
  const H = d.historicalReturns?.rows ?? [];
  const histEq = hs.sleeveHistory(H, sleeves.equity);
  const histBd = hs.sleeveHistory(H, sleeves.bonds);
  const histPlan = hs.mixHistory([
    { weight: 100 - target.bondsPct - target.otherCapPct, series: histEq },
    { weight: target.bondsPct, series: histBd },
  ]);

  // Costs
  const etfTer = cs.knownTerCost(positions.filter(isEtf));
  const ingCost = cs.terCostRange(ingPositions);
  const bollo = cs.bolloOnSecurities(positions);
  const bolloTotal = Object.values(bollo).reduce((a, b) => a + b, 0);

  // Mortgage
  const rows = mg.amortisation(mort.balanceEUR, mort.tanPct, mort.remainingInstalments);
  const annuity = mg.annuity(mort.balanceEUR, mort.tanPct, mort.remainingInstalments);
  const interest12 = mg.interestOverNext(rows, 12);
  const interestTotal = mg.totalInterest(rows);
  const detr = mg.detraction(interest12, mort.tanPct, mort.detraction.ratePct, mort.detraction.capInterestEUR);
  const trCash = cash.find((c) => c.ratePct != null);
  const netCashYield = trCash?.ratePct != null ? mg.netYield(trCash.ratePct, tx.CAPITAL_GAINS_PCT) : null;

  // RSU + tax
  const inc = incomeOf(d.income);
  const rsuSched = inc.next.rsu.schedule;
  const rsuCheck = rsu.checkSchedule(rsuSched, inc.next.rsu.grantValueUSD);
  const ingSwitch = tx.switchTaxUpperBound(ingPositions);

  // Deposits per bank (cash lines)
  const deposits = cashByAcct;

  return {
    d,
    catalog,
    inc,
    acctName,
    fundsAcct,
    fundsAcctName: acctName(fundsAcct),
    snapshots,
    snapRows,
    latest,
    ytdBase,
    nw: {
      sheet: nwSheet,
      market: nwMarket,
      homeEquity: homeEq,
      buckets: nwc.bucketTotals(latest, catalog),
      bucketsMarket: nwc.bucketTotalsForBasis(latest, catalog, 'market', market),
      ytd: nwc.delta(nwc.snapshotTotal(ytdBase), nwSheet),
      ytdMarket: nwc.delta(nwc.marketValueTotal(ytdBase, market), nwMarket),
    },
    market,
    liquid: {
      pieces,
      classes,
      classPct,
      acctTotals,
      posByAcct,
      cashByAcct,
      tickers,
      etfTickers,
      singleStock,
      singleStockName,
      singleStockPct: lq.shareOf(singleStock, classes.total),
      multi,
      ingPositions,
      ingLookThrough,
      ingValue: ingPositions.reduce((a, p) => a + p.valueEUR, 0),
      /** managed funds still held? (false once they are sold) */
      fundsHeld: ingPositions.length > 0,
      mixByAcct: lq.classMixByAccount(pieces),
    },
    pension,
    receivable,
    wealth,
    target,
    targetVals,
    gaps,
    cashAboveBuffer,
    sleeves,
    minOrderEUR,
    plan,
    instrument,
    realised,
    history: { equity: histEq, bonds: histBd, plan: histPlan },
    costs: { etfTer, ingCost, bollo, bolloTotal },
    mortgage: { rows, annuity, interest12, interestTotal, detr, netCashYield, gap: mort.instalmentEUR - annuity },
    rsu: { schedule: rsuSched, check: rsuCheck },
    ingSwitch,
    deposits,
  };
}
