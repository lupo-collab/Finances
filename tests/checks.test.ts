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
