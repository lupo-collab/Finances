// Fails if any tracked file, or any commit in history, contains the plaintext canary
// or touches a path that must stay private.
import { execSync } from 'node:child_process';
import { CANARY } from './canary.mjs';

const sh = (c) => execSync(c, { encoding: 'utf8', maxBuffer: 1 << 28 });
const problems = [];
const forbidden = [/^data\/private\//, /\.seed\.json$/, /\.plain\.json$/, /(^|\/)\.env[^/]*\.local$/, /(^|\/)BUILD_PROMPT\.md$/];

for (const f of sh('git ls-files').split('\n').filter(Boolean)) {
  if (forbidden.some((r) => r.test(f))) problems.push(`tracked private path: ${f}`);
}
try {
  sh(`git grep -l -F "${CANARY}"`)
    .split('\n')
    .filter(Boolean)
    .forEach((f) => problems.push(`canary in tracked file: ${f}`));
} catch {
  /* git grep exits 1 when nothing matches */
}
const history = sh('git log --all -p --no-color --format=%H');
if (history.includes(CANARY)) problems.push('canary found in git history');
for (const f of sh('git log --all --name-only --format=').split('\n').filter(Boolean)) {
  if (forbidden.some((r) => r.test(f))) problems.push(`private path in history: ${f}`);
}
if (problems.length) {
  console.error('guard-repo FAILED:\n  ' + [...new Set(problems)].join('\n  '));
  process.exit(1);
}
console.log('guard-repo: ok (no canary or private paths in tree or history)');
