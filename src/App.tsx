import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import type { Finance } from './data/schema';
import { buildModel } from './lib/model';
import type { Basis } from './lib/calc/networth';
import { setLocale, fmtDate } from './lib/format';
import { daysBetween, parseISODate } from './lib/calc/util';
import { Ctx, type AppState } from './state';
import { LockScreen } from './LockScreen';
import { IDLE_LOCK_MS } from './session';
import { Seg } from './components/ui';
import { Overview } from './pages/Overview';
import { Portfolio } from './pages/Portfolio';
import { Accounts } from './pages/Accounts';
import { History } from './pages/History';
import { HomePage } from './pages/Home';
import { Career } from './pages/Career';
import { Pension } from './pages/Pension';
import { Plan } from './pages/Plan';
import { Tax } from './pages/Tax';
import { Scenarios } from './pages/Scenarios';
import { DataPage } from './pages/Data';

const NAV = [
  ['/', 'Overview'],
  ['/portfolio', 'Portfolio'],
  ['/accounts', 'Accounts'],
  ['/history', 'History'],
  ['/home', 'Home'],
  ['/career', 'Career'],
  ['/pension', 'Pension'],
  ['/plan', 'Plan'],
  ['/tax', 'Tax'],
  ['/scenarios', 'Scenarios'],
  ['/data', 'Data'],
] as const;

export function App() {
  const [data, setData] = useState<Finance | null>(null);
  const lock = useCallback(() => setData(null), []);
  const onUnlock = useCallback((d: Finance) => {
    setLocale(d.meta.locale);
    document.title = d.meta.siteTitle;
    setData(d);
  }, []);

  // Auto-lock after 15 min idle
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(lock, IDLE_LOCK_MS);
    };
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer.current);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [data, lock]);

  useEffect(() => {
    if (!data) document.title = 'Finance';
  }, [data]);

  if (!data) return <LockScreen onUnlock={onUnlock} />;
  return <Unlocked d={data} lock={lock} />;
}

function Unlocked({ d, lock }: { d: Finance; lock: () => void }) {
  const [basis, setBasis] = useState<Basis>('sheet');
  const m = useMemo(() => buildModel(d), [d]);
  const today = useMemo(() => new Date(), []);
  const state: AppState = { d, m, basis, setBasis, today, lock };
  const age = daysBetween(parseISODate(d.meta.asOf), today);
  const fresh = age > 90 ? 'red' : age > 45 ? 'amber' : 'ok';

  return (
    <Ctx.Provider value={state}>
      <HashRouter>
        <header className="top">
          <div className="top-row">
            <div className="brand">{d.meta.siteTitle}</div>
            <span className={`chip fresh-${fresh}`} title={`${age} days old${fresh !== 'ok' ? ': time to update' : ''}`}>
              Data as of {fmtDate(d.meta.asOf)}
            </span>
            <div className="spacer" />
            <Seg
              label="Net worth basis"
              value={basis}
              onChange={setBasis}
              options={[
                { v: 'sheet', label: 'Sheet basis' },
                { v: 'market', label: 'Market-value home' },
              ]}
            />
            <button className="btn lockbtn" onClick={lock} aria-label="Lock">
              Lock
            </button>
          </div>
          <nav className="nav" aria-label="Pages">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'}>
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="page">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/history" element={<History />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/career" element={<Career />} />
            <Route path="/pension" element={<Pension />} />
            <Route path="/plan" element={<Plan />} />
            <Route path="/tax" element={<Tax />} />
            <Route path="/scenarios" element={<Scenarios />} />
            <Route path="/data" element={<DataPage />} />
            <Route path="*" element={<Overview />} />
          </Routes>
        </main>
        <footer className="foot">Figures from your encrypted file; estimates and judgments are dashed. Not financial or tax advice.</footer>
      </HashRouter>
    </Ctx.Provider>
  );
}
