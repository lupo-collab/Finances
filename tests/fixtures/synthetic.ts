// Synthetic fixture: invented numbers only. Never put real data in committed tests.
import type { Finance } from '../../src/data/schema';

export function syntheticFinance(): Finance {
  const sched = [{ date: '2031-03-01', fraction: 0.125, usdAtGrant: 10000 }];
  for (let i = 1; i <= 14; i++) {
    const m = 3 + i * 3;
    const y = 2031 + Math.floor((m - 1) / 12);
    const mm = String(((m - 1) % 12) + 1).padStart(2, '0');
    sched.push({ date: `${y}-${mm}-01`, fraction: 0.0625, usdAtGrant: 5000 });
  }
  return {
    schemaVersion: 1,
    meta: { siteTitle: 'Test', owner: 'Test', baseCurrency: 'EUR', locale: 'en-IE', asOf: '2030-06-30', compiledOn: '2030-07-01', provenanceLegend: { statement: 'stmt', estimate: 'est' } },
    settings: { cashBufferEUR: 1000, maxDepositPerBankEUR: 10000, googMaxShareOfLiquidPct: 10, fxUsdPerEur: { value: 1.25, src: 'computed' } },
    accounts: [
      { id: 'a', name: 'Broker A', institution: 'A', country: 'IT', regime: 'amministrato', regimeSrc: 'x', notes: '' },
      { id: 'b', name: 'Bank B', institution: 'B', country: 'IT', regime: 'amministrato', regimeSrc: 'x', notes: '' },
    ],
    netWorth: {
      lineCatalog: {
        house: { label: 'House', account: 'home', bucket: 'realEstate' },
        a_inv: { label: 'A invested', account: 'a', bucket: 'invested' },
        b_cash: { label: 'B cash', account: 'b', bucket: 'cash' },
        pen: { label: 'Pension', account: 'p', bucket: 'pension' },
      },
      snapshots: [
        { date: '2030-01-02', src: 'sheet', values: { house: 50000, a_inv: 20000, b_cash: 5000, pen: 3000 }, expectedTotal: 78000, sheetRecordedTotal: 77900 },
        { date: '2030-06-30', src: 'sheet', values: { house: 51000, a_inv: 22000, b_cash: 6000, pen: 3500 }, expectedTotal: 82500, sheetRecordedTotal: 82500 },
      ],
      historySheetTotalsOnly: [{ date: '2029-12-31', total: 77000, src: 'sheet' }],
      marketValueBasis: { homeValueEstimate: 90000, mortgageBalance: 30000, homeEquity: 60000, netWorth: 91500, src: 'computed' },
    },
    liquidPortfolio: {
      asOf: '2030-06-30',
      scope: 'test',
      statementTotals: { a: 22000 },
      sheetVsStatement: [],
      positions: [
        { account: 'a', ticker: 'EQ1', name: 'Equity ETF', assetClass: 'equity', currency: 'EUR', valueEUR: 10000, costBasisEUR: 8000, unrealisedEUR: 2000, terPct: 0.2, src: 'statement' },
        { account: 'a', ticker: 'BD1', name: 'Bond ETF', assetClass: 'bonds', currency: 'EUR', valueEUR: 4000, costBasisEUR: 4100, unrealisedEUR: -100, terPct: 0.1, src: 'statement' },
        { account: 'a', ticker: null, name: 'Multi fund', assetClass: 'multi', currency: 'EUR', valueEUR: 5000, unrealisedEUR: 500, costBasisEUR: 4500, terPct: 1, src: 'statement', lookThrough: { equity: 50, bonds: 40, cash: 9 } },
        { account: 'a', ticker: 'XYZ', name: 'Single stock', assetClass: 'other', currency: 'USD', valueEUR: 1000, src: 'statement' },
      ],
      cash: [
        { account: 'a', label: 'A cash', valueEUR: 2000, src: 'statement' },
        { account: 'b', label: 'B cash', valueEUR: 6000, src: 'sheet' },
      ],
      expected: { total: 28000, equity: 12525.25, bonds: 6020.2, other: 1000, cash: 8454.55 },
    },
    fundsOverlapNotes: {
      vwce: { usPct: 60, itSectorPct: 30, src: 'sourced' },
      techApprox: { valueEUR: 1, pctOfLiquid: 1, pctOfEquity: 1, src: 'estimate' },
      ingDedicatedTech: { funds: [], valueEUR: 0, src: 'computed' },
    },
    home: {
      description: 'test',
      sizeSqm: 50,
      purchasePriceEUR: null,
      renovationCostEUR: null,
      src: 'stated',
      valueEstimateEUR: 90000,
      valueEstimateSrc: 'stated',
      marketRefs: [],
      mortgage: {
        balanceEUR: 30000,
        balanceDate: '2030-06',
        rateType: 'fixed',
        tanPct: 1.2,
        remainingInstalments: 120,
        instalmentEUR: 266,
        src: 'stated',
        nextInstalmentMonth: '2030-07',
        computedAnnuityEUR: 265.42,
        instalmentGapEUR: 0.58,
        interestNext12mEUR: 344,
        totalRemainingInterestEUR: 1851,
        detraction: { ratePct: 19, capInterestEUR: 4000, nextYearEUR: 66, effectiveRatePct: 0.97, src: 'rule' },
      },
    },
    income: {
      prevCo: {
        employer: 'X',
        start: '2020-01-01',
        end: '2030-12-31',
        years: [{ year: 2029, taxableIrpef: 100, irpefWithheld: 40, inpsTaxable: null }],
        yearsSrc: 'payslip',
        pay2025: { baseAnnual: 100, commissionTargetPctOfBase: 150, oteAnnual: 250 },
        tfr: { ytdEUR: 10, annualisedEUR: 13, src: 'payslip' },
      },
      nextCo: {
        employer: 'Y',
        role: 'r',
        level: 'l',
        startDate: '2031-01-01',
        probationMonths: 6,
        baseAnnual: 100,
        instalments: 14,
        commissionTargetAnnual: 100,
        oteAnnual: 200,
        rsu: { issuer: 'Y', grantValueUSD: 80000, vestingCommencement: '2030-09-01', schedule: sched, liquidity: 'illiquid' },
        stipendsUSD: {},
        benefits: [],
        covenants: 'none',
        src: 'offer',
      },
      comparisonAtTarget: { prevCo: { base: 1, targetCommission: 1, ote: 2 }, nextCo: { base: 1, targetCommission: 1, ote: 2 } },
    },
    offPortfolio: [],
    targets: {
      name: 'Test strategy',
      src: 'stated',
      cashBufferEUR: 1000,
      sleeves: { equity: { pct: 80, split: { EQ1: 100 } }, bonds: { pct: 15, split: { BD1: 100 } }, other: { pct: 5 } },
      expectedGaps: { equity: 9074.75, bonds: -1970.2, other: 350, cash: -7454.55 },
    },
    costs: {
      etfTerAnnualEUR: 24,
      ingFundsCostRangeEUR: [0, 0],
      ingFundsCostRangePct: [0, 0],
      bolloIvafeEstimateEUR: { total: 40 },
    },
    tax: { rules: [], unrealisedLosses: [], ingSwitch: { winnersGainEUR: 0, maxTaxAt26EUR: 0, src: 'computed' }, openItems: [] },
    actions: [],
    milestones: [],
    dataQuality: [],
    forecastAssumptions: {
      horizonYears: 10,
      paths: 500,
      returnsNominalEUR: {
        equity: { mean: 6, vol: 16, src: 'j' },
        bonds: { mean: 3, vol: 5, src: 'j' },
        cash: { mean: 2, vol: 0.5, src: 'j' },
        other: { mean: 5, vol: 30, src: 'j' },
        pension: { mean: 4, vol: 8, src: 'j' },
        home: { mean: 2, vol: 5, src: 'j' },
      },
      inflationPct: 2,
      equityBondCorrelation: 0.2,
      annualNetSavingsEUR: { low: 1000, base: 2000, high: 3000, src: 'estimate' },
      pensionContributionsEURperYear: { value: 500, src: 'estimate' },
    },
    sources: [],
  };
}
