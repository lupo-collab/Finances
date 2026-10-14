// npm run verify: zod-validate data/private/finance.json and reproduce the reconciliation anchors.
// Prints only check labels and pass/fail by default; use --show to print values locally.
import { readFileSync } from 'node:fs';
import { parseFinance } from '../src/data/schema.ts';
import { runChecks, summarise } from '../src/lib/checks.ts';

export const PRIVATE_PATH = new URL('../data/private/finance.json', import.meta.url);

export function loadPrivate() {
  return parseFinance(JSON.parse(readFileSync(PRIVATE_PATH, 'utf8')));
}

export function verify({ show = false, quiet = false } = {}) {
  const d = loadPrivate();
  const checks = runChecks(d);
  const icon = { pass: '✔', warn: '⚠', fail: '✘', skip: '·' };
  if (!quiet)
    for (const c of checks) {
      const detail = show || c.status !== 'pass' ? `  expected ${c.expected} | actual ${c.actual}` : '';
      console.log(`${icon[c.status]} ${c.label}${detail}`);
    }
  const s = summarise(checks);
  console.log(`\nverify: ${s.pass} pass, ${s.warn} warn, ${s.fail} fail, ${s.skip} skipped`);
  return { d, ok: s.fail === 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok } = verify({ show: process.argv.includes('--show') });
  process.exit(ok ? 0 : 1);
}
