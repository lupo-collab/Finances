/** Standard annuity instalment for balance P, nominal annual rate (TAN %) and n monthly instalments. */
export function annuity(balance: number, tanPct: number, n: number): number {
  if (n <= 0) throw new Error('n must be positive');
  const r = tanPct / 100 / 12;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

export interface AmortRow {
  k: number; // 1-based instalment number
  payment: number;
  interest: number;
  principal: number;
  balance: number; // after this instalment
}

export function amortisation(balance: number, tanPct: number, n: number): AmortRow[] {
  const r = tanPct / 100 / 12;
  const pay = annuity(balance, tanPct, n);
  const rows: AmortRow[] = [];
  let b = balance;
  for (let k = 1; k <= n; k++) {
    const interest = b * r;
    const principal = k === n ? b : pay - interest;
    b = Math.max(0, b - principal);
    rows.push({ k, payment: principal + interest, interest, principal, balance: b });
  }
  return rows;
}

export function interestOverNext(rows: readonly AmortRow[], months: number): number {
  return rows.slice(0, months).reduce((a, r) => a + r.interest, 0);
}

export function totalInterest(rows: readonly AmortRow[]): number {
  return rows.reduce((a, r) => a + r.interest, 0);
}

/** Balance after `months` instalments (0 = today). */
export function balanceAfter(rows: readonly AmortRow[], start: number, months: number): number {
  if (months <= 0) return start;
  if (months >= rows.length) return 0;
  return rows[months - 1].balance;
}

export interface Detraction {
  amount: number;
  effectiveRatePct: number;
}

/** Prima-casa interest detraction: rate% of interest up to cap; effective rate after detraction. */
export function detraction(interest12m: number, tanPct: number, ratePct: number, capEUR: number): Detraction {
  const eligible = Math.min(interest12m, capEUR);
  const amount = (eligible * ratePct) / 100;
  const effective = interest12m > 0 ? tanPct * (1 - amount / interest12m) : tanPct;
  return { amount, effectiveRatePct: effective };
}

export function netYield(grossPct: number, taxPct: number): number {
  return grossPct * (1 - taxPct / 100);
}
