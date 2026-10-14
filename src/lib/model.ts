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

export type Model = ReturnType<typeof buildModel>;

export function isEtf(p: Position): boolean {
  return !!p.ticker && p.terPct != null && p.assetClass !== 'other' && p.assetClass !== 'multi';
}

export function defaultTarget(d: Finance): tg.TargetSpec {
  return {
    equityPct: d.targets.sleeves.equity.pct,
    bondsPct: d.targets.sleeves.bonds.pct,
    otherPct: d.targets.sleeves.other.pct,
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

  // Targets
  const target = defaultTarget(d);
  const gaps = tg.gaps(classes, target);
  const targetVals = tg.targetValues(classes.total, target);
  const cashAboveBuffer = classes.cash - target.bufferEUR;

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
      mixByAcct: lq.classMixByAccount(pieces),
    },
    target,
    targetVals,
    gaps,
    cashAboveBuffer,
    costs: { etfTer, ingCost, bollo, bolloTotal },
    mortgage: { rows, annuity, interest12, interestTotal, detr, netCashYield, gap: mort.instalmentEUR - annuity },
    rsu: { schedule: rsuSched, check: rsuCheck },
    ingSwitch,
    deposits,
  };
}
