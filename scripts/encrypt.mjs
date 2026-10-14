// npm run encrypt: validate → verify → passphrase → gzip → AES-256-GCM → public/data.enc.json
import { writeFileSync } from 'node:fs';
import { verify } from './verify.mjs';
import { encryptJSON, decryptJSON, DEFAULT_ITERATIONS } from '../src/lib/crypto.ts';
import { getPassphrase } from './_prompt.mjs';

const OUT = new URL('../public/data.enc.json', import.meta.url);
const MIN_LEN = 20;

const { d, ok } = verify({ quiet: true });
if (!ok) {
  console.error('verify failed: run `npm run verify` and fix the red lines before encrypting.');
  process.exit(1);
}
const pass = await getPassphrase({ confirm: true });
if (pass.length < MIN_LEN) {
  if (process.env.LF_ALLOW_WEAK !== '1') {
    console.error(`Passphrase too short (< ${MIN_LEN} chars). Use 5+ random words, or set LF_ALLOW_WEAK=1 to accept the risk.`);
    process.exit(1);
  }
  console.warn(`WARNING: passphrase is under ${MIN_LEN} chars. The blob is public and stays in git history even after you change it.`);
}
const iter = Number(process.env.LF_ITERATIONS ?? DEFAULT_ITERATIONS);
const t0 = Date.now();
const env = await encryptJSON(d, pass, iter);
// round-trip before writing
const back = await decryptJSON(env, pass);
if (JSON.stringify(back) !== JSON.stringify(d)) throw new Error('Round-trip mismatch');
writeFileSync(OUT, JSON.stringify(env) + '\n');
console.log(`Wrote public/data.enc.json (${iter.toLocaleString()} PBKDF2 iterations, ${Date.now() - t0} ms incl. round-trip).`);
console.log('Commit only public/data.enc.json, then push.');
