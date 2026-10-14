import type { ReactNode } from 'react';
import { useApp } from '../state';
import { srcTag, isSoft, TAG_SHORT } from '../lib/provenance';
import { eur, eurCompact } from '../lib/format';

export function Prov({ src, note }: { src: string | null | undefined; note?: string }) {
  const { d } = useApp();
  const t = srcTag(src);
  const legend = d.meta.provenanceLegend[t] ?? t;
  const title = `${t}: ${legend}${src && src.toLowerCase() !== t ? `\n${src}` : ''}${note ? `\n${note}` : ''}`;
  return (
    <span className={`prov prov-${t}${isSoft(t) ? ' soft' : ''}`} title={title} aria-label={`Provenance: ${title}`} tabIndex={0}>
      {TAG_SHORT[t]}
    </span>
  );
}

export function Money({ v, src, compact, digits = 0, note, className }: { v: number; src?: string; compact?: boolean; digits?: number; note?: string; className?: string }) {
  const soft = src ? isSoft(srcTag(src)) : false;
  return (
    <span className={`money${soft ? ' soft' : ''}${className ? ` ${className}` : ''}`} title={compact ? eur(v, digits) : undefined}>
      {compact ? eurCompact(v) : eur(v, digits)}
      {src && <Prov src={src} note={note} />}
    </span>
  );
}

export function Card({ title, children, className, soft, sub }: { title?: ReactNode; children: ReactNode; className?: string; soft?: boolean; sub?: ReactNode }) {
  return (
    <section className={`card${soft ? ' soft' : ''}${className ? ` ${className}` : ''}`}>
      {title && <h2 className="card-title">{title}</h2>}
      {sub && <div className="card-sub">{sub}</div>}
      {children}
    </section>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="slider">
      <span>
        {label} <b>{fmt ? fmt(value) : value}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function NotProvided({ what, action }: { what: string; action?: string }) {
  return (
    <span className="notprov">
      {what}: not yet provided{action ? ` (open action: ${action})` : ''}
    </span>
  );
}

export function Assumptions({ children }: { children: ReactNode }) {
  return <div className="assumptions">{children}</div>;
}

export function Owner({ kind }: { kind: 'judgment' | 'owner' }) {
  const { d } = useApp();
  const who = d.meta.owner;
  return kind === 'judgment' ? (
    <span className="owner owner-claude" title="Advisor judgment (Claude), not a fact or a decision">Claude's judgment</span>
  ) : (
    <span className="owner owner-self" title={`${who}'s own decision or statement`}>{who}'s decision</span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="page-title">
      <h1>{children}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}
