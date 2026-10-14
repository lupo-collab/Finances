# Lupo Finance

A private, **encrypted** personal-finance dashboard, published as a static site on GitHub Pages.

The site and this repository are public. The financial data is not: the only data file that
ever gets committed or deployed is `public/data.enc.json`, encrypted with **AES-256-GCM**. Its
key comes from your passphrase via **PBKDF2-HMAC-SHA256 (600,000 iterations)**. The browser
decrypts it locally with WebCrypto after you type the passphrase. Security rests on the passphrase
being strong (5+ random words, not reused).

## Pages

Overview (one screen, no tables) · Portfolio · Accounts · Net worth history · Home & mortgage ·
Career & income · Pension · Plan · Tax · Scenarios (Monte Carlo + stress test) · Data & sources
(live reconciliation checks).

Every number carries a provenance badge (`stmt`, `sheet`, `stated`, `payslip`, `offer`, `src`,
`calc`, `est`, `judg`). Estimates and judgments are dashed and muted. Forecasts are always
p10/p50/p90 ranges with their assumptions printed underneath.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install deps (also wires the pre-commit hook via `npm prepare`) |
| `npm run dev` | Local dev server. Put `VITE_DEV_PASSPHRASE=…` in `.env.development.local` to auto-unlock (dev only; a production build fails if it is set) |
| `npm run verify` | Zod-validate `data/private/finance.json` and reproduce the reconciliation anchors |
| `npm run encrypt` | validate → verify → passphrase (hidden prompt or `LF_PASSPHRASE`) → gzip → encrypt → `public/data.enc.json` |
| `npm run decrypt` | Restore `data/private/finance.json` from the committed blob (the blob is your backup) |
| `npm run snapshot -- --date YYYY-MM-DD` | Start a new net-worth snapshot from the last one |
| `npm test` | Unit tests (synthetic fixtures only) |
| `npm run build` | Typecheck, build to `dist/`, then run the dist guard |

## Guardrails

- `.gitignore` covers `data/private/`, `*.seed.json`, `*.plain.json`, `.env*.local` and `BUILD_PROMPT.md`.
- `.githooks/pre-commit` blocks commits that touch those paths or contain the plaintext canary.
- CI (`.github/workflows/pages.yml`) scans the whole git history for the canary and private paths,
  runs the tests, builds, and fails if `dist/` holds the canary or any JSON besides `data.enc.json`.
  It deploys with the official `actions/upload-pages-artifact` + `actions/deploy-pages`, from `main` only.
- Strict CSP (`script-src 'self'`, `connect-src 'self'`), system fonts, no CDNs, no analytics,
  `noindex` + `robots.txt` disallow-all.
- Decrypted data lives only in memory. The site auto-locks after 15 minutes idle and has a Lock button.
  "Remember on this device" (off by default) stores a non-extractable key in IndexedDB.
- No personal data in source code or tests: all labels and numbers come from the decrypted file.

## Layout

```
src/data/schema.ts      zod schema (single source of truth for types)
src/lib/calc/*.ts       pure functions: networth, liquid, targets, costs, mortgage, rsu, tax, forecast
src/lib/model.ts        derives every figure from the data file
src/lib/checks.ts       reconciliation checks shared by `verify` and the Data page
src/lib/crypto.ts       envelope format, shared by browser and scripts
src/charts, src/pages   ECharts wrappers and pages
scripts/                encrypt, decrypt, verify, snapshot, guards
tests/                  vitest, synthetic fixtures
data/private/           git-ignored plaintext
```

## One-time GitHub setup

Settings → Pages → Build and deployment → Source: **GitHub Actions**.
