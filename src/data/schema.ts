// Zod schema for data/private/finance.json: the single source of truth for types.
// Objects are "loose" so extra informational fields survive validation untouched.
import { z } from 'zod';

const num = z.number();
const numN = z.number().nullable();
const str = z.string();
const strN = z.string().nullable();

export const SRC_TAGS = [
  'statement',
  'sheet',
  'stated',
  'payslip',
  'offer',
  'sourced',
  'computed',
  'estimate',
  'judgment',
] as const;
export type SrcTag = (typeof SRC_TAGS)[number];

export const BUCKETS = ['realEstate', 'invested', 'cash', 'pension', 'receivable'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const ASSET_CLASSES = ['equity', 'bonds', 'other', 'cash'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

const lookThrough = z.looseObject({
  equity: num,
  bonds: num,
  cash: num,
  note: str.optional(),
});

export const positionSchema = z.looseObject({
  account: str,
  ticker: strN.optional(),
  name: str,
  isin: str.optional(),
  assetClass: z.enum(['equity', 'bonds', 'other', 'multi']),
  subClass: str.optional(),
  fundType: str.optional(),
  units: numN.optional(),
  price: numN.optional(),
  currency: str,
  valueEUR: num,
  avgCostEUR: numN.optional(),
  costBasisEUR: numN.optional(),
  unrealisedEUR: numN.optional(),
  terPct: numN.optional(),
  terRangePct: z.tuple([num, num]).optional(),
  terSrc: str.optional(),
  src: str,
  note: str.optional(),
  lookThrough: lookThrough.optional(),
});
export type Position = z.infer<typeof positionSchema>;

export const cashLineSchema = z.looseObject({
  account: str,
  label: str,
  valueEUR: num,
  ratePct: num.optional(),
  src: str,
  note: str.optional(),
});
export type CashLine = z.infer<typeof cashLineSchema>;

export const snapshotSchema = z.looseObject({
  date: str,
  src: str,
  values: z.record(str, num),
  expectedTotal: num.optional(),
  sheetRecordedTotal: num.optional(),
  note: str.optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

const lineCatalogEntry = z.looseObject({
  label: str,
  account: str,
  bucket: z.enum(BUCKETS),
});
export type LineCatalog = Record<string, z.infer<typeof lineCatalogEntry>>;

const returnAssumption = z.looseObject({ mean: num, vol: num, src: str });

const sleeve = z.looseObject({
  pct: num,
  split: z.record(str, num).optional(),
  candidates: z.array(str).optional(),
});

const action = z.looseObject({
  id: str,
  title: str,
  type: z.enum(['recommendation', 'decision', 'check', 'data']),
  owner: str,
  due: strN,
  status: str,
  why: str.optional(),
});
export type Action = z.infer<typeof action>;

const rsuEvent = z.looseObject({ date: str, fraction: num, usdAtGrant: num });
export type RsuEvent = z.infer<typeof rsuEvent>;

export const financeSchema = z.looseObject({
  schemaVersion: z.literal(1),
  meta: z.looseObject({
    siteTitle: str,
    owner: str,
    baseCurrency: str,
    locale: str,
    asOf: str,
    compiledOn: str,
    _canary: str.optional(),
    provenanceLegend: z.record(str, str),
  }),
  settings: z.looseObject({
    cashBufferEUR: num,
    maxDepositPerBankEUR: num,
    googMaxShareOfLiquidPct: num,
    fxUsdPerEur: z.looseObject({ value: num, src: str, note: str.optional() }),
  }),
  accounts: z.array(
    z.looseObject({
      id: str,
      name: str,
      institution: str,
      country: str,
      regime: str,
      regimeSrc: str,
      notes: str,
    }),
  ),
  netWorth: z.looseObject({
    note: str.optional(),
    lineCatalog: z.record(str, lineCatalogEntry),
    snapshots: z.array(snapshotSchema).min(1),
    historySheetTotalsOnly: z.array(
      z.looseObject({ date: str, total: num, src: str, note: str.optional() }),
    ),
    marketValueBasis: z.looseObject({
      homeValueEstimate: num,
      mortgageBalance: num,
      homeEquity: num,
      netWorth: num,
      src: str,
    }),
  }),
  liquidPortfolio: z.looseObject({
    asOf: str,
    scope: str,
    statementTotals: z.record(str, num),
    sheetVsStatement: z.array(
      z.looseObject({ account: str, sheet: num, statement: num, diff: num, note: str.optional() }),
    ),
    positions: z.array(positionSchema),
    cash: z.array(cashLineSchema),
    expected: z.looseObject({
      note: str.optional(),
      total: num,
      equity: num,
      bonds: num,
      other: num,
      cash: num,
      ingLookThrough: z.looseObject({ equity: num, bonds: num, cash: num }).optional(),
    }),
  }),
  fundsOverlapNotes: z.looseObject({
    vwce: z.looseObject({ usPct: num, itSectorPct: num, src: str }),
    techApprox: z.looseObject({ valueEUR: num, pctOfLiquid: num, pctOfEquity: num, src: str }),
    ingDedicatedTech: z.looseObject({ funds: z.array(str), valueEUR: num, src: str }),
  }),
  home: z.looseObject({
    description: str,
    sizeSqm: num,
    purchasePriceEUR: numN,
    renovationCostEUR: numN,
    src: str,
    valueEstimateEUR: num,
    valueEstimateSrc: str,
    marketRefs: z.array(z.looseObject({ label: str, eurPerSqm: num, src: str })),
    monthlyHouseExpensesEUR: numN.optional(),
    monthlyHouseExpensesSrc: str.optional(),
    mortgage: z.looseObject({
      balanceEUR: num,
      balanceDate: str,
      rateType: str,
      tanPct: num,
      remainingInstalments: z.number().int().positive(),
      instalmentEUR: num,
      src: str,
      nextInstalmentMonth: str,
      nextInstalmentMonthSrc: str.optional(),
      computedAnnuityEUR: num,
      instalmentGapEUR: num,
      instalmentGapNote: str.optional(),
      interestNext12mEUR: num,
      totalRemainingInterestEUR: num,
      detraction: z.looseObject({
        ratePct: num,
        capInterestEUR: num,
        nextYearEUR: num,
        effectiveRatePct: num,
        src: str,
      }),
      judgment: str.optional(),
    }),
    saleTaxNote: str.optional(),
  }),
  // Employer entries are keyed by whatever the data uses; identified by shape (see incomeOf).
  income: z.record(str, z.unknown()),
  offPortfolio: z.array(
    z.looseObject({
      id: str,
      label: str,
      valueUSDAtGrant: num.optional(),
      valueEUR: num.optional(),
      contingentUpsideEUR: num.optional(),
      src: str,
      note: str.optional(),
    }),
  ),
  targets: z.looseObject({
    name: str,
    src: str,
    scopeOpenQuestion: str.optional(),
    scopeDecision: z.looseObject({ text: str, date: str, src: str }).optional(),
    cashBufferEUR: num,
    sleeves: z.looseObject({ equity: sleeve, bonds: sleeve, other: sleeve }),
    googPolicy: z.looseObject({ decision: str, guardrails: str, guardrailsSrc: str }).optional(),
    expectedGaps: z.looseObject({ equity: num, bonds: num, other: num, cash: num }),
  }),
  costs: z.looseObject({
    etfTerAnnualEUR: num,
    ingFundsCostRangeEUR: z.tuple([num, num]),
    ingFundsCostRangePct: z.tuple([num, num]),
    ingFundsCostSrc: str.optional(),
    ingServiceFeeAnnualEUR: num.optional(),
    etfEquivalentForIngEUR: num.optional(),
    etfEquivalentNote: str.optional(),
    bolloIvafeEstimateEUR: z.looseObject({ total: num, note: str.optional() }),
  }),
  tax: z.looseObject({
    rules: z.array(z.looseObject({ id: str, text: str, src: str })),
    unrealisedLosses: z.array(
      z.looseObject({ account: str, position: str, lossEUR: num, src: str }),
    ),
    ingSwitch: z.looseObject({
      winnersGainEUR: num,
      maxTaxAt26EUR: num,
      paybackYears: num.optional(),
      note: str.optional(),
      src: str,
    }),
    googBasisCheck: str.optional(),
    openItems: z.array(str),
  }),
  actions: z.array(action),
  milestones: z.array(z.looseObject({ date: str, label: str })),
  dataQuality: z.array(z.looseObject({ id: str, text: str })),
  /** Statements for accounts tracked only through sheet snapshots (e.g. pension funds). */
  accountStatements: z
    .array(
      z.looseObject({
        account: str,
        date: str,
        valueEUR: num,
        units: num.optional(),
        unitPrice: num.optional(),
        line: str.optional(),
        contributions: z.array(z.looseObject({ label: str, asOf: str, valueEUR: num })).optional(),
        /** dated amounts credited to the account (e.g. quarterly pension contributions) */
        contributionEvents: z.array(z.looseObject({ date: str, valueEUR: num })).optional(),
        src: str,
        note: str.optional(),
      }),
    )
    .optional(),
  forecastAssumptions: z.looseObject({
    horizonYears: num,
    paths: num,
    note: str.optional(),
    returnsNominalEUR: z.looseObject({
      equity: returnAssumption,
      bonds: returnAssumption,
      cash: returnAssumption,
      other: returnAssumption,
      pension: returnAssumption,
      home: returnAssumption,
    }),
    inflationPct: num,
    inflationSrc: str.optional(),
    equityBondCorrelation: num,
    pensionEquityCorrelation: num.optional(),
    pensionEquityCorrelationSrc: str.optional(),
    correlationSrc: str.optional(),
    annualNetSavingsEUR: z.looseObject({
      low: numN,
      base: numN,
      high: numN,
      src: str,
      note: str.optional(),
    }),
    pensionContributionsEURperYear: z.looseObject({
      value: num,
      src: str,
      /** when present, contributions = pay × (tfr + employer + employee)% computed in code */
      basis: z
        .looseObject({
          pay: z.union([z.literal('nextOte'), num]),
          tfrPct: num,
          employerPct: num,
          employeePct: num,
          src: str,
        })
        .optional(),
    }),
    /** One-off cash inflows (e.g. closing pay). grossEUR null = not yet provided. */
    oneOffInflows: z
      .array(
        z.looseObject({
          date: str,
          label: str,
          grossEUR: numN,
          taxPct: num,
          src: str,
          taxSrc: str.optional(),
          note: str.optional(),
          /** Alternative to grossEUR: hours × (monthlyEUR / divisor), computed in code. */
          hours: num.optional(),
          hourlyBasis: z.looseObject({ monthlyEUR: num, divisor: num, src: str }).optional(),
        }),
      )
      .optional(),
    rebalancing: str.optional(),
  }),
  sources: z.array(z.looseObject({ id: str, title: str, url: strN })),
  updateLog: z.array(z.looseObject({ date: str, text: str })).optional(),
  verifyAnchors: z
    .looseObject({
      bucketTotals: z.record(str, num).optional(),
      ytd: z.looseObject({ baseDate: str, deltaEUR: num, deltaPct: num }).optional(),
      etfTotals: z.record(str, num).optional(),
      classPct: z.record(str, num).optional(),
      singleStock: z.looseObject({ combinedEUR: num, shareOfLiquidPct: num }).optional(),
      rsu: z.looseObject({ events: num, firstUSD: num, laterUSD: num }).optional(),
    })
    .optional(),
});

export const prevEmployerSchema = z.looseObject({
  employer: str,
  start: str,
  end: str,
  years: z.array(
    z.looseObject({
      year: num,
      taxableIrpef: num,
      irpefWithheld: num,
      inpsTaxable: numN,
      partial: z.boolean().optional(),
      note: str.optional(),
    }),
  ),
  yearsSrc: str,
  pay2025: z.looseObject({ baseAnnual: num, commissionTargetPctOfBase: num, oteAnnual: num }).optional(),
  gsu: z.looseObject({ sellToCoverPct: num.optional(), note: str.optional() }).optional(),
  tfr: z.record(str, z.union([num, str])).optional(),
});

export const nextEmployerSchema = z.looseObject({
  employer: str,
  role: str,
  level: str,
  startDate: str,
  probationMonths: num,
  baseAnnual: num,
  instalments: num,
  commissionTargetAnnual: num,
  oteAnnual: num,
  commissionNote: str.optional(),
  salesPassExpectation: str.optional(),
  rsu: z.looseObject({
    issuer: str,
    grantValueUSD: num,
    vestingCommencement: str,
    schedule: z.array(rsuEvent),
    liquidity: str,
  }),
  donationMatching: z.looseObject({ rule: str, deadline: str }).optional(),
  stipendsUSD: z.record(str, num),
  benefits: z.array(str),
  covenants: str,
  src: str,
});

const cmpRow = z.looseObject({ base: num, targetCommission: num, ote: num });
const cmpMeta = z.looseObject({
  oteGapNetApprox: num.optional(),
  netNote: str.optional(),
  equity: str.optional(),
  planningRule: str.optional(),
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Splits `income` into the previous employer (has `years`), the next one (has `rsu`) and the comparison. */
export function incomeOf(income: Record<string, unknown>) {
  const entries = Object.entries(income);
  const prevE = entries.find(([, v]) => isObj(v) && 'years' in v);
  const nextE = entries.find(([, v]) => isObj(v) && 'rsu' in v);
  if (!prevE || !nextE) throw new Error('income needs one employer with `years` and one with `rsu`');
  const cmpE = entries.find(([, v]) => isObj(v) && isObj(v[prevE[0]]) && isObj(v[nextE[0]]));
  const cmpRaw = cmpE ? (cmpE[1] as Record<string, unknown>) : null;
  return {
    prev: prevEmployerSchema.parse(prevE[1]),
    next: nextEmployerSchema.parse(nextE[1]),
    cmp: cmpRaw ? { prev: cmpRow.parse(cmpRaw[prevE[0]]), next: cmpRow.parse(cmpRaw[nextE[0]]), ...cmpMeta.parse(cmpRaw) } : null,
  };
}
export type Income = ReturnType<typeof incomeOf>;

/** First numeric field whose key matches `re` (keeps provider-specific key names out of code). */
export function pickNum(o: Record<string, unknown> | undefined, re: RegExp): number | null {
  if (!o) return null;
  const k = Object.keys(o).find((x) => re.test(x) && typeof o[x] === 'number');
  return k ? (o[k] as number) : null;
}

export type Finance = z.infer<typeof financeSchema>;

export function parseFinance(input: unknown): Finance {
  const d = financeSchema.parse(input);
  incomeOf(d.income); // validates the employer entries
  return d;
}
