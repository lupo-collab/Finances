import { createContext, useContext } from 'react';
import type { Finance } from './data/schema';
import type { Model } from './lib/model';
import type { Basis } from './lib/calc/networth';

export interface AppState {
  d: Finance;
  m: Model;
  basis: Basis;
  setBasis: (b: Basis) => void;
  today: Date;
  lock: () => void;
}

export const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
