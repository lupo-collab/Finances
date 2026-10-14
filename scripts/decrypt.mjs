// npm run decrypt [-- --out path]: restore plaintext from public/data.enc.json (your backup).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { decryptJSON } from '../src/lib/crypto.ts';
import { parseFinance } from '../src/data/schema.ts';
import { getPassphrase } from './_prompt.mjs';

const i = process.argv.indexOf('--out');
const out = i > 0 ? process.argv[i + 1] : 'data/private/finance.json';
if (!out.startsWith('data/private/')) {
  console.error('Refusing to write plaintext outside data/private/.');
  process.exit(1);
}
const env = JSON.parse(readFileSync(new URL('../public/data.enc.json', import.meta.url), 'utf8'));
const pass = await getPassphrase({ confirm: false });
const data = parseFinance(await decryptJSON(env, pass));
mkdirSync('data/private', { recursive: true });
if (existsSync(out) && !process.argv.includes('--force')) {
  console.error(`${out} exists; pass --force to overwrite.`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`Restored ${out}`);
