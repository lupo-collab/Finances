import { describe, it, expect } from 'vitest';
import { parseFinance } from '../src/data/schema';
import { runChecks, summarise } from '../src/lib/checks';
import { syntheticFinance } from './fixtures/synthetic';

describe('reconciliation checks on the synthetic fixture', () => {
  it('schema accepts the fixture', () => {
    expect(() => parseFinance(syntheticFinance())).not.toThrow();
  });
  it('passes, and flags the sheet-recorded difference as a warning', () => {
    const cs = runChecks(parseFinance(syntheticFinance()));
    const failures = cs.filter((c) => c.status === 'fail');
    expect(failures).toEqual([]);
    expect(cs.find((c) => c.id === 'nw-sheet-2030-01-02')?.status).toBe('warn');
    expect(summarise(cs).warn).toBe(1);
  });
  it('fails when a line item changes', () => {
    const f = syntheticFinance();
    f.netWorth.snapshots[1].values.a_inv += 5;
    const cs = runChecks(parseFinance(f));
    expect(cs.find((c) => c.id === 'nw-2030-06-30')?.status).toBe('fail');
  });
});

describe('account statement check', () => {
  it('passes when units × price matches and fails when it does not', () => {
    const f = syntheticFinance();
    f.accountStatements = [{ account: 'a', date: '2030-07-01', valueEUR: 1000, units: 40, unitPrice: 25, src: 'statement' }];
    expect(runChecks(parseFinance(f)).find((c) => c.id.startsWith('stmt-units-'))?.status).toBe('pass');
    f.accountStatements[0].valueEUR = 1010;
    expect(runChecks(parseFinance(f)).find((c) => c.id.startsWith('stmt-units-'))?.status).toBe('fail');
  });
});

describe('account statement check with a rounded unit price', () => {
  it('accepts the gap explained by the displayed price rounding, rejects a bigger one', () => {
    const f = syntheticFinance();
    // true price 10.006 shown as 10.01: 1000 units -> 4 EUR gap, within 1000 x 0.005 = 5
    f.accountStatements = [{ account: 'a', date: '2030-07-01', valueEUR: 10006, units: 1000, unitPrice: 10.01, src: 'statement' }];
    expect(runChecks(parseFinance(f)).find((c) => c.id.startsWith('stmt-units-'))?.status).toBe('pass');
    f.accountStatements[0].valueEUR = 10000; // 10 EUR gap > 5
    expect(runChecks(parseFinance(f)).find((c) => c.id.startsWith('stmt-units-'))?.status).toBe('fail');
  });
});

describe('realised sale checks', () => {
  const withSale = () => {
    const f = syntheticFinance();
    f.realisedSales = [
      {
        id: 's1',
        account: 'a',
        label: 'Funds sold',
        date: '2030-05-02',
        src: 'statement',
        lines: [
          { name: 'F1', paidEUR: 1000, grossEUR: 1200, taxEUR: 52, feeEUR: 10, netEUR: 1138, earlierNetEUR: 0 },
          { name: 'F2', paidEUR: 2000, grossEUR: 1900, taxEUR: 0, feeEUR: 10, netEUR: 1890, earlierNetEUR: 50 },
        ],
        totals: { paidEUR: 3000, grossEUR: 3100, taxEUR: 52, netEUR: 3028, earlierNetEUR: 50, profitEUR: 78 },
      },
    ];
    return f;
  };
  it('passes when the lines add up, and checks the proceeds held in cash', () => {
    const f = withSale();
    f.liquidPortfolio.cash[1] = { ...f.liquidPortfolio.cash[1], fromSale: 's1', valueEUR: 3028 };
    const cs = runChecks(parseFinance(f)).filter((c) => c.id.startsWith('sale-'));
    expect(cs.length).toBe(9);
    expect(cs.filter((c) => c.status !== 'pass').map((c) => c.id)).toEqual([]);
  });
  it('fails when a line does not add up', () => {
    const f = withSale();
    f.realisedSales![0].lines[0].taxEUR = 50;
    const cs = runChecks(parseFinance(f));
    expect(cs.find((c) => c.id === 'sale-s1-0')?.status).toBe('fail');
    expect(cs.find((c) => c.id === 'sale-s1-tax')?.status).toBe('fail');
  });
});
