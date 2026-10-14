// npm run snapshot -- --date YYYY-MM-DD: copy the latest net-worth snapshot as a starting point.
import { readFileSync, writeFileSync } from 'node:fs';
import { PRIVATE_PATH } from './verify.mjs';

const i = process.argv.indexOf('--date');
const date = i > 0 ? process.argv[i + 1] : null;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Usage: npm run snapshot -- --date YYYY-MM-DD');
  process.exit(1);
}
const d = JSON.parse(readFileSync(PRIVATE_PATH, 'utf8'));
const snaps = d.netWorth.snapshots.sort((a, b) => a.date.localeCompare(b.date));
if (snaps.some((s) => s.date === date)) {
  console.error(`A snapshot for ${date} already exists.`);
  process.exit(1);
}
const last = snaps[snaps.length - 1];
snaps.push({ date, src: last.src, values: { ...last.values }, note: `Copied from ${last.date}: update every line, then set expectedTotal` });
d.meta.asOf = date;
d.updateLog = [...(d.updateLog ?? []), { date: new Date().toISOString().slice(0, 10), text: `Snapshot ${date} created from ${last.date}` }];
writeFileSync(PRIVATE_PATH, JSON.stringify(d, null, 2) + '\n');
console.log(`Added snapshot ${date} (copied from ${last.date}) and set meta.asOf. Now edit the values, then run npm run verify.`);
