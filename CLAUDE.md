# CLAUDE.md: rules for this repo

This is Luca's private finance dashboard. The plaintext data is in `data/private/finance.json` (git-ignored).

## Non-negotiable
1. **Privacy first.** Never commit, print, log or send plaintext data anywhere: no git, no build
   output, no third-party request, no `console.log` of decrypted data. Only `public/data.enc.json` is
   committed. Do not paste figures from `data/private/` into commit messages, PRs or code.
2. **Numbers are sacred.** Use Luca's figures exactly as given; never reinterpret them. Every total,
   percentage and derived figure is computed in code (`src/lib/calc`, `src/lib/model.ts`), never typed in.
3. **Provenance.** Every new number in the data needs a `src` (`statement`, `sheet`, `stated`,
   `payslip`, `offer`, `sourced`, `computed`, `estimate`, `judgment`).
4. **Ranges, not point forecasts.** Forecasts show p10/p50/p90 with their assumptions.
5. **No advice theatre.** Existing recommendations are labelled Claude's judgment; Luca's decisions
   are labelled his. Don't invent new recommendations in the UI.

## Workflow
- Always run `npm run verify` before `npm run encrypt` (encrypt refuses if verify fails).
- **Flag, don't silently fix,** differences between statements and the sheet. Record them in
  `dataQuality` or the snapshot `note`.
- **Ask Luca** before changing assumptions (`forecastAssumptions`), targets (`targets`) or settings.
- Committed tests use synthetic fixtures (`tests/fixtures`); never real numbers.
- Reconciliation anchors live in the private file (`expectedTotal`, `liquidPortfolio.expected`,
  `statementTotals`, `targets.expectedGaps`, `verifyAnchors`), never in committed code.
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
- `accountStatements`: statements for accounts the sheet tracks (e.g. pension funds). Record them
  and flag the gap in `dataQuality`; don't overwrite a sheet snapshot. Use the statement at the
  next snapshot.
- `actions`: `type` recommendation = Claude's judgment, decision = Luca's call, check/data = things
  Luca needs to look up. Data requests live here so they show on the Plan page.
- Assumptions marked `judgment` were set by Claude (some delegated by Luca, see `updateLog`).
