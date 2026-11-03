# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Luca's private finance dashboard: a static Vite + React + TypeScript site on GitHub Pages
(https://lupo-collab.github.io/Finances/) that decrypts a single AES-256-GCM blob,
`public/data.enc.json`, in the browser. The repo and the site are public. The plaintext,
`data/private/finance.json`, is git-ignored and must never leave the machine.

## Non-negotiable
1. **Privacy first.** Never commit, print, log or send plaintext data anywhere: no git, no build
   output, no third-party request, no `console.log` of decrypted data. Only `public/data.enc.json` is
   committed. Do not paste figures from `data/private/` into commit messages, PRs, code, comments or
   tests. That includes "harmless" ones like a unit price.
2. **Numbers are sacred.** Use Luca's figures exactly as given; never reinterpret them. Every total,
   percentage and derived figure is computed in code (`src/lib/calc`, `src/lib/model.ts`), never typed in.
3. **Provenance.** Every new number in the data needs a `src` (`statement`, `sheet`, `stated`,
   `payslip`, `offer`, `sourced`, `computed`, `estimate`, `judgment`).
4. **Ranges, not point forecasts.** Forecasts show p10/p50/p90 with their assumptions.
5. **No advice theatre.** Existing recommendations are labelled Claude's judgment; Luca's decisions
   are labelled his. Don't invent new recommendations in the UI.

## Commands
Node 22 (CI uses it; the scripts rely on its global WebCrypto and CompressionStream).

| Command | Notes |
|---|---|
| `npm install` | Also sets `core.hooksPath` to `.githooks` (pre-commit guard) |
| `npm run dev` | No CSP in dev. `VITE_DEV_PASSPHRASE` in `.env.development.local` auto-unlocks, but only if it matches the passphrase the blob was encrypted with |
| `npm test` | vitest, `tests/**/*.test.ts`, node environment |
| `npx vitest run tests/calc.test.ts -t "mortgage"` | One file / tests whose name matches |
| `npm run typecheck` | `tsc -b`; there is no linter |
| `npm run build` | typecheck + `vite build` + `scripts/guard-dist.mjs`. Fails if `VITE_DEV_PASSPHRASE` is set |
| `npm run preview` | Serve `dist/`. The strict CSP is injected only at build time, so CSP problems only show here |
| `npm run verify` | zod-validate the private file and run the reconciliation checks. `-- --show` prints values: keep that out of shared logs |
| `npm run encrypt` | Refuses if verify fails. Passphrase from a hidden prompt or `LF_PASSPHRASE`; under 20 chars needs `LF_ALLOW_WEAK=1` |
| `npm run decrypt` | Restores `data/private/finance.json` from the blob; `-- --force` to overwrite |
| `npm run snapshot -- --date YYYY-MM-DD` | Copies the latest net-worth snapshot as a starting point |
| `node scripts/guard-repo.mjs` | Canary and private paths across tracked files and the whole git history |

Fresh checkout: get the plaintext with `npm run decrypt` and the passphrase (ask Luca; never write
it into the repo). Plaintext copies in Luca's Drive (`finance.seed.json`, `finance - OUTDATED…`) are stale.

Deploy: pushing to `main` runs `.github/workflows/pages.yml`: guard-repo, tests, build (with
guard-dist), then deploy to Pages. Other branches run the same checks but don't deploy. A data
update commits only `public/data.enc.json`; `UPDATE.md` has Luca's monthly steps.

## Architecture
- **One data path, shared by browser and Node.** `src/data/schema.ts` (zod 4 `z.looseObject`, so
  unknown fields pass through untyped) → `parseFinance()` → `buildModel(d)` in `src/lib/model.ts`
  (pure: every derived figure) → React context (`src/state.tsx`, `useApp()` → `{ d, m, basis, today, lock }`)
  → pages. The Node scripts import the same TS modules through `tsx`, so `src/lib` must stay free of
  DOM-only APIs.
- **Reconciliation.** `src/lib/checks.ts` (`runChecks`) is used by both `scripts/verify.mjs` and the
  Data page's live validation. Expected values are read from the private file, never from code.
- **Crypto and session.** `src/lib/crypto.ts` defines the envelope `{v, kdf, iter, salt, iv, ct}`:
  PBKDF2-SHA256 600k iterations, AES-GCM over gzipped JSON. It is used by the encrypt/decrypt
  scripts and by `src/session.ts` (fetch, unlock, "remember device" as a non-extractable key in
  IndexedDB). Decrypted data lives only in React state; `App.tsx` handles the 15-minute idle lock.
  Every encrypt uses a new salt, so remembered device keys stop working after an update. That's by design.
- **Forecast.** `src/lib/forecastInputs.ts` turns data + model + UI options into a `ForecastInput`:
  savings case, one-offs, RSU vests net of withholding, contingent stake, fund switch with fee drag,
  pension contributions. `src/lib/calc/forecast.ts` `runForecast` is a seeded Monte Carlo:
  mulberry32; lognormal per bucket; Cholesky equity–bond; pension correlated with equity; annual
  rebalancing; deterministic mortgage. The same seed gives the same chart. Overview and Scenarios share it.
- **Charts.** `src/charts/EChart.tsx` is the only ECharts entry point and uses a tree-shaken registry.
  A new chart or component type must be added to its `echarts.use([...])`, or ECharts only warns
  at runtime. Colours: one per asset class/bucket. They're defined twice and must stay in sync:
  `PALETTE` in `src/theme.ts` for charts, and the CSS variables in `src/styles.css` for swatches and bars.
- **Provenance UI.** Free-form `src` strings are normalised by `srcTag()` in `src/lib/provenance.ts`.
  `<Prov>` and `<Money>` in `src/components/ui.tsx` render the badge, dashed for estimate/judgment.
  Missing values render "not yet provided", never 0.
- **No names in code.** Labels come from the data. Code finds things by shape, not by name:
  - employers: `incomeOf()`;
  - managed-funds account: the `statementTotals` key ending `_mmc` (`m.fundsAcct`);
  - single stock: `subClass: 'singleStock'`;
  - core ETF: the largest equity sleeve weight;
  - contingent stake: the off-portfolio item with `contingentUpsideEUR`.

  Schema keys inherited from the seed (e.g. `googMaxShareOfLiquidPct`, `ing*`) are structural and stay.
- **Guards.** `scripts/canary.mjs` builds the canary string from parts so it never appears in source.
  `guard-dist` allows no canary, and no JSON in `dist/` except a valid envelope. `guard-repo` scans
  tracked files and history. `.githooks/pre-commit` blocks private paths, the canary and `"_canary"` keys.
- **Tests** use only `tests/fixtures/synthetic.ts`, which must satisfy the schema, including the
  `incomeOf` shapes. The crypto tests run the real 600k-iteration KDF, taking about 1 s each.

## Workflow
- Always run `npm run verify` before `npm run encrypt` (encrypt refuses if verify fails).
- **Flag, don't silently fix,** differences between statements and the sheet. Record them in
  `dataQuality` or the snapshot `note`.
- **Ask Luca** before changing assumptions (`forecastAssumptions`), targets (`targets`) or settings.
- Committed tests use synthetic fixtures (`tests/fixtures`); never real numbers.
- Reconciliation anchors live in the private file (`expectedTotal`, `liquidPortfolio.expected`,
  `statementTotals`, `targets.expectedGaps`, `verifyAnchors`), never in committed code. When a
  legitimate data change moves an anchor, work out the new value independently (old anchor ± the
  change), not by copying the app's output, so verify stays a real cross-check.
- The canary `meta._canary` must never appear in git or `dist/`. `scripts/guard-*.mjs` and the
  pre-commit hook enforce this; don't weaken them.
- Before pushing: `npm test`, `npm run build` (includes the dist guard), `node scripts/guard-repo.mjs`.

## Data model notes (private file)
- `income`: employer entries are keyed by whatever the data uses and recognised by shape
  (`incomeOf()` in `src/data/schema.ts`): the one with `years` is the previous employer, the one
  with `rsu` the next. Keep employer names out of code.
- `forecastAssumptions.oneOffInflows`: dated one-off cash (e.g. closing pay). Give `grossEUR`, or
  `hours` + `hourlyBasis` {monthlyEUR, divisor}; `taxPct` nets it. `grossEUR: null` shows as
  "not yet provided". Shares that vest into a brokerage account belong in that account, not here.
- `forecastAssumptions.pensionContributionsEURperYear`: with a `basis` (pay `'nextOte'` or a number,
  plus TFR/employer/employee %), contributions are computed in code; `value` is the older run-rate.
- `accountStatements`: statements for accounts the sheet tracks (e.g. pension funds). Record them
  and flag the gap in `dataQuality`; don't overwrite a sheet snapshot. Use the statement at the
  next snapshot. `units × unitPrice` is checked, allowing for the unit price's rounding.
- `actions`: `type` recommendation = Claude's judgment, decision = Luca's call, check/data = things
  Luca needs to look up. Status `done` or `dropped` closes an item. Data requests live here so they
  show on the Plan page.
- `targets.scopeDecision` holds Luca's recorded decision on where 80/15/5 applies (shown on the
  Plan page instead of `scopeOpenQuestion`).
- Assumptions marked `judgment` were set by Claude (some delegated by Luca, see `updateLog`).
