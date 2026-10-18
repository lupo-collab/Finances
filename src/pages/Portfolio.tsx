import { useMemo, useState } from 'react';
import { useApp } from '../state';
import { Card, PageTitle, Prov, Money, Assumptions } from '../components/ui';
import { EChart } from '../charts/EChart';
import { usePalette, CLASS_LABEL } from '../theme';
import { eur, eurCompact, pct } from '../lib/format';
import { ASSET_CLASSES, type AssetClass, type Position } from '../data/schema';
import { unrealised } from '../lib/calc/liquid';
import { positionCost, costDrag } from '../lib/calc/costs';

type SortKey = 'name' | 'account' | 'cls' | 'value' | 'weight' | 'cost' | 'pnl' | 'pnlPct' | 'ter' | 'annual';

export function Portfolio() {
  const { d, m } = useApp();
  const pal = usePalette();
  const L = m.liquid;
  const acctName = (id: string) => d.accounts.find((a) => a.id === id)?.name ?? id;
  const total = L.classes.total;

  // Sunburst: class → account → position
  const sunData = ASSET_CLASSES.map((c) => {
    const byAcct: Record<string, { name: string; value: number }[]> = {};
    for (const p of L.pieces.filter((x) => x.assetClass === c)) {
      const label = p.positionIndex != null && d.liquidPortfolio.positions[p.positionIndex].assetClass === 'multi' ? `${p.ticker ?? p.name} (look-through)` : (p.ticker ?? p.name);
      (byAcct[p.account] ??= []).push({ name: label, value: p.valueEUR });
    }
    return {
      name: CLASS_LABEL[c],
      itemStyle: { color: pal[c] },
      children: Object.entries(byAcct).map(([a, kids]) => ({ name: acctName(a), children: kids })),
    };
  });
  const sunOption = {
    tooltip: { formatter: (p: { name: string; value: number; treePathInfo: { name: string }[] }) => `${p.treePathInfo.map((t) => t.name).filter(Boolean).join(' › ')}<br/><b>${eur(p.value)}</b> (${pct((p.value / total) * 100)})` },
    series: [
      {
        type: 'sunburst',
        data: sunData,
        radius: ['12%', '95%'],
        sort: undefined,
        itemStyle: { borderColor: pal.bg, borderWidth: 1 },
        label: { color: '#fff', fontSize: 10, minAngle: 14, overflow: 'truncate', rotate: 'tangential' },
        levels: [{}, { r0: '12%', r: '38%', label: { fontSize: 12, fontWeight: 600 } }, { r0: '38%', r: '62%', itemStyle: { opacity: 0.85 } }, { r0: '62%', r: '95%', itemStyle: { opacity: 0.7 }, label: { show: false } }],
      },
    ],
  };

  // Treemap of positions
  const posRows = d.liquidPortfolio.positions.map((p) => {
    const u = unrealised(p);
    const c = positionCost(p);
    return { p, u, c, cls: (p.assetClass === 'multi' ? 'multi' : p.assetClass) as AssetClass | 'multi' };
  });
  const treeOption = {
    tooltip: {
      formatter: (x: { data: { p: Position; name: string; value: number } }) => {
        const p = x.data.p;
        if (!p) return x.data.name;
        const u = unrealised(p);
        const c = positionCost(p);
        return `<b>${p.name}</b> · ${acctName(p.account)}<br/>${eur(p.valueEUR)}<br/>P&L ${u.eur != null ? `${eur(u.eur)} (${u.pct != null ? pct(u.pct) : '—'})` : 'not yet provided'}<br/>TER ${p.terPct != null ? pct(p.terPct, 2) : p.terRangePct ? `${p.terRangePct[0]}–${p.terRangePct[1]}% (est.)` : '—'}${c ? ` · ${eur(c.low)}${c.high !== c.low ? `–${eur(c.high)}` : ''}/yr` : ''}<br/>source: ${p.src}`;
      },
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%',
        height: '100%',
        label: { fontSize: 11, formatter: (x: { name: string; value: number }) => `${x.name}\n${eurCompact(x.value)}` },
        itemStyle: { borderColor: pal.bg, borderWidth: 2, gapWidth: 2 },
        data: posRows
          .filter((r) => r.p.valueEUR > 0)
          .map((r) => ({
            name: `${r.p.ticker ?? r.p.name} · ${acctName(r.p.account)}`,
            value: r.p.valueEUR,
            p: r.p,
            itemStyle: { color: r.cls === 'multi' ? pal.invested : pal[r.cls] },
          })),
      },
    ],
  };

  // Stacked by account
  const accts = Object.keys(L.mixByAcct).sort((a, b) => (L.acctTotals[b] ?? 0) - (L.acctTotals[a] ?? 0));
  const stackOption = {
    grid: { left: 110, right: 16, top: 30, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    yAxis: { type: 'category', data: accts.map(acctName), inverse: true },
    series: ASSET_CLASSES.map((c) => ({ name: CLASS_LABEL[c], type: 'bar', stack: 'a', barWidth: 18, itemStyle: { color: pal[c] }, data: accts.map((a) => L.mixByAcct[a][c]) })),
    aria: { enabled: true, decal: { show: true } },
  };

  // Holdings table
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'value', desc: true });
  const [q, setQ] = useState('');
  const [acctF, setAcctF] = useState('all');
  const rows = useMemo(() => {
    const r = posRows
      .map((x) => ({
        ...x,
        name: x.p.ticker ? `${x.p.ticker} · ${x.p.name}` : x.p.name,
        account: acctName(x.p.account),
        weight: (x.p.valueEUR / total) * 100,
        annualMid: x.c ? (x.c.low + x.c.high) / 2 : null,
      }))
      .filter((x) => (acctF === 'all' || x.p.account === acctF) && x.name.toLowerCase().includes(q.toLowerCase()));
    const key = (x: (typeof r)[number]): number | string => {
      switch (sort.k) {
        case 'name':
          return x.name;
        case 'account':
          return x.account;
        case 'cls':
          return x.cls;
        case 'value':
          return x.p.valueEUR;
        case 'weight':
          return x.weight;
        case 'cost':
          return x.p.costBasisEUR ?? -Infinity;
        case 'pnl':
          return x.u.eur ?? -Infinity;
        case 'pnlPct':
          return x.u.pct ?? -Infinity;
        case 'ter':
          return x.p.terPct ?? x.p.terRangePct?.[0] ?? -Infinity;
        case 'annual':
          return x.annualMid ?? -Infinity;
      }
    };
    return r.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      const c = typeof ka === 'string' ? ka.localeCompare(kb as string) : (ka as number) - (kb as number);
      return sort.desc ? -c : c;
    });
  }, [posRows, sort, q, acctF, total]);
  const th = (k: SortKey, label: string, r = false) => (
    <th className={r ? 'r' : ''} aria-sort={sort.k === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button onClick={() => setSort({ k, desc: sort.k === k ? !sort.desc : true })}>
        {label}
        {sort.k === k ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  // Overlap & concentration
  // core ETF = largest weight in the equity sleeve
  const coreSplit = Object.entries(d.targets.sleeves.equity.split ?? {}).sort((a, b) => b[1] - a[1]);
  const core = coreSplit[0]?.[0] ?? '';
  const vwceByAcct = d.liquidPortfolio.positions.filter((p) => p.ticker === core);
  const ingTech = d.fundsOverlapNotes.ingDedicatedTech;
  const ingTechComputed = d.liquidPortfolio.positions.filter((p) => ingTech.funds.includes(p.name)).reduce((a, p) => a + p.valueEUR, 0);
  const ingGlobal = L.ingPositions.filter((p) => /world|global/i.test(p.name) && p.assetClass === 'equity');
  const top10 = [...d.liquidPortfolio.positions].sort((a, b) => b.valueEUR - a.valueEUR).slice(0, 10);
  const top10Option = {
    grid: { left: 150, right: 50, top: 6, bottom: 20 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    yAxis: { type: 'category', inverse: true, data: top10.map((p) => `${p.ticker ?? p.name} · ${acctName(p.account)}`), axisLabel: { width: 140, overflow: 'truncate' } },
    series: [
      {
        type: 'bar',
        barWidth: 12,
        data: top10.map((p) => ({ value: p.valueEUR, itemStyle: { color: p.assetClass === 'multi' ? pal.invested : pal[p.assetClass as AssetClass], borderRadius: 3 } })),
        label: { show: true, position: 'right', color: pal.muted, fontSize: 10, formatter: (x: { value: number }) => pct((x.value / total) * 100, 1) },
      },
    ],
  };
  const G = d.settings.googMaxShareOfLiquidPct;
  const ss = L.singleStockName;
  const singleAccts = [...new Set(d.liquidPortfolio.positions.filter((p) => p.subClass === 'singleStock').map((p) => acctName(p.account)))].join(' + ');
  const gaugeOption = {
    series: [
      {
        type: 'gauge',
        min: 0,
        max: Math.max(10, Math.ceil(G * 1.4)),
        startAngle: 200,
        endAngle: -20,
        radius: '95%',
        center: ['50%', '62%'],
        progress: { show: true, width: 12, itemStyle: { color: pal.other } },
        axisLine: { lineStyle: { width: 12, color: [[G / Math.max(10, Math.ceil(G * 1.4)), pal.grid], [1, pal.bad]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: { valueAnimation: false, offsetCenter: [0, '10%'], fontSize: 22, color: pal.text, formatter: (v: number) => `${v.toFixed(2)}%` },
        title: { offsetCenter: [0, '40%'], color: pal.muted, fontSize: 11 },
        data: [{ value: L.singleStockPct, name: `guardrail ${G}%` }],
      },
    ],
  };
  const tech = d.fundsOverlapNotes.techApprox;

  // Currency exposure (estimate): only where fund data is known; managed funds explicit "unknown"
  const vw = d.fundsOverlapNotes.vwce;
  const cur = { EUR: 0, USD: 0, 'Mixed currencies': 0, Crypto: 0, Unknown: 0 };
  for (const p of d.liquidPortfolio.positions) {
    if (p.account === m.fundsAcct) cur.Unknown += p.valueEUR;
    else if (p.ticker === core) {
      cur.USD += (p.valueEUR * vw.usPct) / 100;
      cur['Mixed currencies'] += (p.valueEUR * (100 - vw.usPct)) / 100;
    } else if (p.currency === 'USD') cur.USD += p.valueEUR;
    else if (p.subClass === 'crypto') cur.Crypto += p.valueEUR;
    else if (p.assetClass === 'equity') cur['Mixed currencies'] += p.valueEUR; // regional equity ETFs (Europe incl. EUR, EM)
    else cur.EUR += p.valueEUR; // EUR-hedged / euro govt bonds, EUR PE
  }
  for (const c of d.liquidPortfolio.cash) cur.EUR += c.valueEUR;
  const curColors: Record<string, string> = { EUR: pal.cash, USD: pal.equity, 'Mixed currencies': pal.invested, Crypto: pal.other, Unknown: pal.off };
  const curOption = {
    tooltip: { trigger: 'item', formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: <b>${eur(p.value)}</b> (${p.percent.toFixed(1)}%)` },
    series: [
      {
        type: 'pie',
        radius: ['50%', '80%'],
        label: { color: pal.muted, fontSize: 11, formatter: (p: { name: string; percent: number }) => `${p.name}\n${p.percent.toFixed(0)}%` },
        itemStyle: { borderColor: pal.bg, borderWidth: 2 },
        data: Object.entries(cur).map(([k, v]) => ({ name: k, value: v, itemStyle: { color: curColors[k], decal: k === 'Unknown' ? { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4, color: 'rgba(255,255,255,0.35)' } : undefined } })),
      },
    ],
  };

  // Costs by account (TER mid + bollo)
  const costByAcct: Record<string, { ter: number; bollo: number }> = {};
  for (const p of d.liquidPortfolio.positions) {
    const c = positionCost(p);
    costByAcct[p.account] ??= { ter: 0, bollo: 0 };
    if (c) costByAcct[p.account].ter += (c.low + c.high) / 2;
  }
  for (const [a, v] of Object.entries(m.costs.bollo)) (costByAcct[a] ??= { ter: 0, bollo: 0 }).bollo += v;
  const ca = Object.keys(costByAcct).sort((a, b) => costByAcct[b].ter + costByAcct[b].bollo - (costByAcct[a].ter + costByAcct[a].bollo));
  const costOption = {
    grid: { left: 110, right: 16, top: 30, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    yAxis: { type: 'category', inverse: true, data: ca.map(acctName) },
    series: [
      { name: 'Fund costs (TER, mid of range)', type: 'bar', stack: 'c', barWidth: 16, itemStyle: { color: pal.other }, data: ca.map((a) => costByAcct[a].ter) },
      { name: 'Bollo / IVAFE (est.)', type: 'bar', stack: 'c', itemStyle: { color: pal.off }, data: ca.map((a) => costByAcct[a].bollo) },
    ],
    aria: { enabled: true, decal: { show: true } },
  };
  const eqMean = d.forecastAssumptions.returnsNominalEUR.equity.mean;
  const ingMidPct = (m.costs.ingCost.lowPct + m.costs.ingCost.highPct) / 2;
  const etfEqPct = d.costs.etfEquivalentForIngEUR != null ? (d.costs.etfEquivalentForIngEUR / L.ingValue) * 100 : 0.15;
  const dragYears = Array.from({ length: 11 }, (_, i) => i);
  const dragOption = {
    grid: { left: 56, right: 16, top: 30, bottom: 24 },
    legend: { top: 0, left: 0 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => eur(v) },
    xAxis: { type: 'category', data: dragYears.map((y) => `${y}y`) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => eurCompact(v) } },
    series: [
      { name: `${m.fundsAcctName} funds as-is (${pct(ingMidPct, 2)})`, type: 'line', symbol: 'none', lineStyle: { color: pal.bad, width: 2 }, itemStyle: { color: pal.bad }, data: dragYears.map((y) => costDrag(L.ingValue, eqMean, ingMidPct, y)) },
      { name: `ETF equivalent (${pct(etfEqPct, 2)})`, type: 'line', symbol: 'none', lineStyle: { color: pal.good, width: 2, type: 'dashed' }, itemStyle: { color: pal.good }, data: dragYears.map((y) => costDrag(L.ingValue, eqMean, etfEqPct, y)) },
    ],
  };
  const drag10 = costDrag(L.ingValue, eqMean, ingMidPct, 10) - costDrag(L.ingValue, eqMean, etfEqPct, 10);

  return (
    <>
      <PageTitle sub={d.liquidPortfolio.scope}>Liquid portfolio · {eurCompact(total)}</PageTitle>
      <div className="grid">
        <Card className="span-6" title={`Equity is ${pct(L.classPct.equity, 0)} of the liquid portfolio`} sub="Asset class › account › position (multi-asset fund split by its look-through, normalised to 100%)">
          <EChart height={340} option={sunOption} ariaLabel={ASSET_CLASSES.map((c) => `${CLASS_LABEL[c]} ${pct(L.classPct[c])}`).join(', ')} />
        </Card>
        <Card className="span-6" title={`${core} is ${pct(((L.tickers[core] ?? 0) / total) * 100, 0)} of everything liquid`} sub="Positions sized by value, coloured by asset class (purple = multi-asset)">
          <EChart height={340} option={treeOption} ariaLabel="Treemap of positions by value" />
        </Card>
        <Card className="span-12" title="Class mix by account">
          <EChart height={60 + accts.length * 34} option={stackOption} ariaLabel={accts.map((a) => `${acctName(a)} ${eurCompact(L.acctTotals[a])}`).join(', ')} />
        </Card>

        <Card className="span-12" title="Holdings">
          <div className="row" style={{ marginBottom: 8 }}>
            <input type="text" placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter holdings" />
            <select value={acctF} onChange={(e) => setAcctF(e.target.value)} aria-label="Account">
              <option value="all">All accounts</option>
              {[...new Set(d.liquidPortfolio.positions.map((p) => p.account))].map((a) => (
                <option key={a} value={a}>
                  {acctName(a)}
                </option>
              ))}
            </select>
            <span className="muted small">Cash lines ({eurCompact(d.liquidPortfolio.cash.reduce((a, c) => a + c.valueEUR, 0))}) are on the Accounts page.</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  {th('name', 'Position')}
                  {th('account', 'Account')}
                  {th('cls', 'Class')}
                  {th('value', 'Value', true)}
                  {th('weight', 'Weight', true)}
                  {th('cost', 'Cost basis', true)}
                  {th('pnl', 'Unrealised €', true)}
                  {th('pnlPct', '%', true)}
                  {th('ter', 'TER', true)}
                  {th('annual', 'Cost €/yr', true)}
                  <th>Src</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const terSoft = r.p.terPct == null && !!r.p.terRangePct;
                  return (
                    <tr key={i}>
                      <td title={r.p.note ?? r.p.isin}>{r.name}</td>
                      <td>{r.account}</td>
                      <td>
                        <span className="swatch" style={{ background: r.cls === 'multi' ? 'var(--invested)' : `var(--${r.cls})` }} />
                        {r.cls === 'multi' ? 'Multi-asset' : CLASS_LABEL[r.cls]}
                      </td>
                      <td className="r">{eur(r.p.valueEUR, 2)}</td>
                      <td className="r">{pct(r.weight, 2)}</td>
                      <td className="r">{r.p.costBasisEUR != null ? eur(r.p.costBasisEUR, 2) : <span className="notprov">not yet provided</span>}</td>
                      <td className={`r ${(r.u.eur ?? 0) >= 0 ? 'up' : 'down'}`}>{r.u.eur != null ? eur(r.u.eur, 2) : '—'}</td>
                      <td className="r">{r.u.pct != null ? pct(r.u.pct) : '—'}</td>
                      <td className={`r${terSoft ? ' muted' : ''}`} title={r.p.terSrc}>
                        {r.p.terPct != null ? pct(r.p.terPct, 2) : r.p.terRangePct ? `${r.p.terRangePct[0]}–${r.p.terRangePct[1]}%` : '—'}
                        {r.p.terSrc && r.p.terSrc !== 'n/a' && <Prov src={r.p.terSrc} />}
                      </td>
                      <td className={`r${terSoft ? ' muted' : ''}`}>{r.c ? (r.c.low === r.c.high ? eur(r.c.low) : `${eur(r.c.low)}–${eur(r.c.high)}`) : '—'}</td>
                      <td>
                        <Prov src={r.p.src} note={r.p.note} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="span-6" title="Overlap & concentration">
          <div className="stat">
            <span>{core} across {vwceByAcct.map((p) => acctName(p.account)).join(' + ')}</span>
            <Money v={L.tickers[core] ?? 0} src="computed" />
          </div>
          {vwceByAcct.map((p) => (
            <div className="stat" key={p.account} style={{ paddingLeft: 12, fontSize: 13 }}>
              <span>{acctName(p.account)}</span>
              <span className="num">
                {eur(p.valueEUR)} <Prov src={p.src} />
              </span>
            </div>
          ))}
          <div className="stat">
            <span>{m.fundsAcctName} dedicated tech/growth funds ({ingTech.funds.length}) duplicate {core}'s tech tilt</span>
            <Money v={ingTechComputed} src="computed" />
          </div>
          <div className="stat">
            <span>{m.fundsAcctName} global equity funds overlapping {core}</span>
            <span className="num">{ingGlobal.map((p) => p.name).join(', ') || '—'}</span>
          </div>
          <div className="stat">
            <span>{core}: US share / IT sector</span>
            <span className="num">
              {pct(vw.usPct)} / {pct(vw.itSectorPct)} <Prov src={vw.src} />
            </span>
          </div>
          <div className="stat">
            <span>Tech share of liquid (approx.)</span>
            <span className="num muted">
              ≈ {pct(tech.pctOfLiquid, 0)} ({eurCompact(tech.valueEUR)}); ≈ {pct(tech.pctOfEquity, 0)} of equity <Prov src={tech.src} />
            </span>
          </div>
          <h3 style={{ fontSize: 13, margin: '12px 0 4px' }} className="muted">
            Top 10 positions (% of liquid)
          </h3>
          <EChart height={280} option={top10Option} ariaLabel={`Largest position ${top10[0]?.ticker ?? top10[0]?.name}`} />
        </Card>
        <Card className="span-6" title={`${ss} is ${pct(L.singleStockPct, 2)} of liquid, ${L.singleStockPct <= G ? 'under' : 'over'} the ${G}% guardrail`} sub={`${singleAccts}: ${eur(L.singleStock, 2)}`}>
          <EChart height={200} option={gaugeOption} ariaLabel={`${ss} share ${pct(L.singleStockPct, 2)} vs guardrail ${G}%`} />
          {d.targets.googPolicy && (
            <Assumptions>
              Decision: <b>{d.targets.googPolicy.decision}</b>. Guardrails: {d.targets.googPolicy.guardrails} <Prov src={d.targets.googPolicy.guardrailsSrc} />
            </Assumptions>
          )}
          <h3 style={{ fontSize: 14, margin: '18px 0 2px' }}>
            Currency exposure <Prov src="estimate" note={`${core} split by its US share; ${m.fundsAcctName} funds not classified`} />
          </h3>
          <p className="card-sub">Where fund data is known. {m.fundsAcctName} funds are shown as unknown rather than guessed.</p>
          <EChart height={230} option={curOption} ariaLabel={Object.entries(cur).map(([k, v]) => `${k} ${eurCompact(v)}`).join(', ')} />
        </Card>

        <Card className="span-6" title={`${m.fundsAcctName} funds carry most of the fund costs`} sub="Annual cost by account: fund TER (mid of range where estimated) + bollo/IVAFE">
          <EChart height={60 + ca.length * 34} option={costOption} ariaLabel="Annual costs by account" />
          <Assumptions>
            ETF TER total <b>{eur(m.costs.etfTer)}</b>/yr on {m.liquid.etfTickers.join(', ')} <Prov src="computed" />. {m.fundsAcctName} funds{' '}
            <b>
              {eur(m.costs.ingCost.low)}–{eur(m.costs.ingCost.high)}
            </b>
            /yr <Prov src={d.costs.ingFundsCostSrc ?? 'estimate'} />. Bollo + IVAFE ≈ <b>{eur(m.costs.bolloTotal)}</b>/yr <Prov src="estimate" note={d.costs.bolloIvafeEstimateEUR.note} />.
          </Assumptions>
        </Card>
        <Card className="span-6" soft title={`Over 10 years ${m.fundsAcctName} fees cost ≈ ${eurCompact(drag10)} more than ETFs`} sub={`Cumulative cost drag on today's ${eurCompact(L.ingValue)} at ${eqMean}% gross, no new money`}>
          <EChart height={240} option={dragOption} ariaLabel={`Ten-year extra cost of ${m.fundsAcctName} funds vs ETFs about ${eurCompact(drag10)}`} />
          <Assumptions>
            <Prov src="estimate" /> {m.fundsAcctName} mid cost {pct(ingMidPct, 2)} vs ETF equivalent {pct(etfEqPct, 2)} ({d.costs.etfEquivalentNote}). Ignores the one-off switch tax (see Tax).
          </Assumptions>
        </Card>
      </div>
    </>
  );
}

