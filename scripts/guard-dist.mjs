// Fails if dist/ contains the plaintext canary or any .json other than data.enc.json.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { CANARY } from './canary.mjs';

const DIST = 'dist';
if (!existsSync(DIST)) {
  console.error('guard-dist: dist/ not found (run the build first)');
  process.exit(1);
}
const problems = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else {
      if (p.endsWith('.json') && basename(p) !== 'data.enc.json') problems.push(`unexpected JSON in dist: ${p}`);
      const buf = readFileSync(p);
      if (buf.includes(CANARY)) problems.push(`canary found in ${p}`);
    }
  }
};
walk(DIST);
const enc = join(DIST, 'data.enc.json');
if (existsSync(enc)) {
  const e = JSON.parse(readFileSync(enc, 'utf8'));
  const keys = Object.keys(e).sort().join(',');
  if (keys !== 'ct,iter,iv,kdf,salt,v') problems.push(`data.enc.json is not an encryption envelope (keys: ${keys})`);
}
if (problems.length) {
  console.error('guard-dist FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log('guard-dist: ok (no canary, only data.enc.json)');
