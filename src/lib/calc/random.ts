/** Deterministic PRNG (mulberry32) so charts don't jump on reload. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sampler (Box–Muller) on top of a uniform source. */
export function normalSampler(u: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u1 = 0;
    while (u1 <= Number.EPSILON) u1 = u();
    const u2 = u();
    const r = Math.sqrt(-2 * Math.log(u1));
    spare = r * Math.sin(2 * Math.PI * u2);
    return r * Math.cos(2 * Math.PI * u2);
  };
}

/** Lower-triangular Cholesky factor of a symmetric positive-definite matrix. */
export function cholesky(m: readonly (readonly number[])[]): number[][] {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (s <= 0) throw new Error('Matrix not positive definite');
        L[i][j] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  return L;
}

/** Log-space parameters so that E[gross return] = 1+mean and SD = vol (both in %). */
export function lognormalParams(meanPct: number, volPct: number): { mu: number; sigma: number } {
  const m = 1 + meanPct / 100;
  const s = volPct / 100;
  const sigma2 = Math.log(1 + (s * s) / (m * m));
  return { mu: Math.log(m) - sigma2 / 2, sigma: Math.sqrt(sigma2) };
}

export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
