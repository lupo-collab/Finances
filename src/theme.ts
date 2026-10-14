import { useEffect, useState } from 'react';

// Colour-blind-safe (Okabe–Ito based). One colour per asset class / bucket, used on every chart.
const KEYS = ['equity','bonds','other','cash','realEstate','pension','invested','receivable','off','text','muted','grid','bg','good','bad'] as const;
export type Pal = Record<(typeof KEYS)[number], string>;

export const PALETTE: { light: Pal; dark: Pal } = {
  light: {
    equity: '#2F6EBA',
    bonds: '#009E73',
    other: '#E69F00',
    cash: '#56B4E9',
    realEstate: '#CC79A7',
    pension: '#D55E00',
    invested: '#6A51A3',
    receivable: '#8C9399',
    off: '#9AA0A6',
    text: '#1d232a',
    muted: '#5f6b76',
    grid: '#e3e7eb',
    bg: '#ffffff',
    good: '#1b7f4c',
    bad: '#b3261e',
  },
  dark: {
    equity: '#6FA8EE',
    bonds: '#3CC79A',
    other: '#F2B73F',
    cash: '#7FCBF2',
    realEstate: '#E39BC4',
    pension: '#F07B3A',
    invested: '#A592D9',
    receivable: '#9AA3AB',
    off: '#7d858c',
    text: '#e6eaee',
    muted: '#9aa5b0',
    grid: '#2a333c',
    bg: '#151b21',
    good: '#4cc38a',
    bad: '#f2766b',
  },
};

export function useDark(): boolean {
  const q = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function usePalette(): Pal {
  return useDark() ? PALETTE.dark : PALETTE.light;
}

export const CLASS_LABEL = { equity: 'Equity', bonds: 'Bonds', other: 'Other', cash: 'Cash' } as const;
export const BUCKET_LABEL = {
  realEstate: 'Real estate',
  invested: 'Invested',
  cash: 'Cash',
  pension: 'Pension',
  receivable: 'Receivable',
} as const;
