# Monthly update

1. **Get the plaintext.** If `data/private/finance.json` is not on this machine, restore it from the blob:
   `npm run decrypt`.
2. **Edit the data.** Edit `data/private/finance.json`, or paste a statement into Claude Code and ask it
   to update the file. For a new net-worth snapshot:
   `npm run snapshot -- --date YYYY-MM-DD` copies the last snapshot. Then update every line and set
   `expectedTotal` once you have reconciled it. Give every new number a `src`.
3. **Check it.** Run `npm run verify` and fix anything red. Warnings (⚠) are known sheet differences.
4. **Encrypt it.** Run `npm run encrypt`. You type the passphrase twice; it is never written to disk.
5. **Publish it.** Commit **only** `public/data.enc.json`, then push to `main`. GitHub Actions deploys the site.

The pre-commit hook and CI refuse any commit that contains plaintext data.
If you change the passphrase, devices that used "Remember on this device" will ask for it again.
