let LOCALE = 'en-IE';
export function setLocale(l: string) {
  LOCALE = l;
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(key: string, opts: Intl.NumberFormatOptions) {
  const k = LOCALE + key;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, opts);
    cache.set(k, f);
  }
  return f;
}

/** €1,234,567 */
export const eur = (x: number, digits = 0) =>
  nf(`eur${digits}`, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);

/** €1.79M / €148k */
export function eurCompact(x: number): string {
  const a = Math.abs(x);
  const sign = x < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}€${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}€${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}€${(a / 1e3).toFixed(1)}k`;
  return `${sign}€${Math.round(a)}`;
}

export const usd = (x: number) => nf('usd', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(x);

export const pct = (x: number, digits = 1) => `${nf(`p${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x)}%`;

export const num = (x: number, digits = 0) => nf(`n${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);

export const signed = (s: string, x: number) => (x > 0 ? `+${s}` : x < 0 ? s.replace('-', '−') : s);

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(LOCALE, opts);
}
