import { useMemo } from 'react';
import { useApp } from '../state';
import { Card, PageTitle } from '../components/ui';
import { runChecks, summarise } from '../lib/checks';
import { TAG_SHORT, isSoft } from '../lib/provenance';
import { SRC_TAGS } from '../data/schema';
import { fmtDate } from '../lib/format';

export function DataPage() {
  const { d } = useApp();
  const checks = useMemo(() => runChecks(d), [d]);
  const s = summarise(checks);
  return (
    <>
      <PageTitle sub={`Schema v${d.schemaVersion} · compiled ${fmtDate(d.meta.compiledOn)} · figures as of ${fmtDate(d.meta.asOf)}`}>Data & sources</PageTitle>
      <div className="grid">
        <Card className="span-12" title={`Live validation: ${s.pass} pass, ${s.warn} warn, ${s.fail} fail`} sub="The same reconciliation checks as npm run verify, run in your browser on the decrypted data.">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Status</th><th>Check</th><th className="r">Expected</th><th className="r">Computed</th></tr></thead>
              <tbody>
                {[...checks].sort((a, b) => ['fail', 'warn', 'skip', 'pass'].indexOf(a.status) - ['fail', 'warn', 'skip', 'pass'].indexOf(b.status)).map((c) => (
                  <tr key={c.id}>
                    <td><span className={`pill ${c.status}`}>{c.status}</span></td>
                    <td style={{ whiteSpace: 'normal' }}>{c.label}</td>
                    <td className="r">{c.expected}</td>
                    <td className="r">{c.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="span-6" title="Provenance legend">
          <ul className="list">
            {SRC_TAGS.map((t) => (
              <li key={t}>
                <span className={`prov${isSoft(t) ? ' soft' : ''}`}>{TAG_SHORT[t]}</span>
                <b>{t}</b>
                <span className="muted">{d.meta.provenanceLegend[t] ?? ''}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Dashed, italic badges and cards are estimates or judgments, not facts.</p>
        </Card>
        <Card className="span-6" title="Sources">
          <ul className="list">
            {d.sources.map((x) => (
              <li key={x.id}>
                {x.url ? (
                  <a href={x.url} target="_blank" rel="noopener noreferrer">{x.title}</a>
                ) : (
                  <span>{x.title} <span className="muted small">(no link)</span></span>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="span-8" title="Data-quality issues">
          <ul className="list">
            {d.dataQuality.map((q) => (
              <li key={q.id}><span className="pill neutral">{q.id}</span> <span style={{ flex: 1 }}>{q.text}</span></li>
            ))}
          </ul>
        </Card>
        <Card className="span-4" title="Update log">
          <ul className="list">
            <li><span className="when muted">{fmtDate(d.meta.compiledOn)}</span> Seed compiled and reconciled</li>
            {(d.updateLog ?? []).map((u, i) => (
              <li key={i}><span className="when muted">{fmtDate(u.date)}</span> {u.text}</li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
