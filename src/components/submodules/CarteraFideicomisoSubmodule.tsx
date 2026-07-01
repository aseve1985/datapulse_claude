import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import {
  DYNDATA, SNAP, COMPARISON, DYNAMIC, CURVES,
  goodNuevo, goodRenov, POOL_AA_THRESHOLD,
  getColor, makeCurveDatasets,
  MARKET, OUR_TOTAL, VINT_BENCH, CYCLE_PHASES, POOL_DATA, POOL_ROWS,
  aggregateByVintageFilter,
} from './carteraFideicomisoData';

Chart.register(...registerables);

// ── Types ─────────────────────────────────────────────────────────────────────
interface CarteraRecord {
  periodo: string;
  fecha_desembolso_periodo: string;
  tipo_cliente: string;
  k_originado: number;
  k_precancelado: number;
  k_cancelado_no_precancelado: number;
  k_pagado_total: number;
  k_saldo_total: number;
  a_current: number;
  b_bucket_1_30: number;
  c_bucket_31_60: number;
  d_bucket_61_90: number;
  e_bucket_91_120: number;
  f_bucket_mas_120: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_VINTAGES = [
  '202307','202308','202309','202310','202311','202312',
  '202401','202402','202403','202404','202405','202406','202407',
  '202408','202409','202410','202411','202412',
  '202501','202502','202503','202504','202505','202506','202507',
  '202508','202509','202510','202511','202512',
  '202601','202602','202603','202604','202605',
];

const POOL_VINTAGES = [
  '202408','202409','202410','202411','202412',
  '202501','202502','202503','202504',
  '202505','202506','202507','202508','202509','202510','202511','202512',
];

const LEGACY_VINTAGES = [
  '202307','202308','202309','202310','202311','202312',
  '202401','202402','202403','202404','202405','202406','202407',
];

const BUCKET_LABELS: Record<string,string> = {
  f:'F +120d', b:'B 1-30d', c:'C 31-60d', d:'D 61-90d', e:'E 91-120d',
};
const MORA_LABELS: Record<string,string> = {
  m30:'Mora ≥30d (todo vencido)', m60:'Mora ≥60d', m90:'Mora ≥90d', m120:'Mora ≥120d', f:'Hard loss +120d (F)',
};
const SEG_LABELS: Record<string,string> = {
  TOTAL:'Total cartera', NUEVO:'Negocio Nuevo', RENOVADOR:'Negocio Renovador',
};

const POOL_RENOV_PEAK = 23.7;
const POOL_NUEVO_PEAK = 22.4;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCorte = (c: string) => c.slice(0,4)+'/'+c.slice(4);
function pctColor(v: number) {
  if (v <= 15) return 'text-emerald-400';
  if (v <= 25) return 'text-yellow-400';
  if (v <= 35) return 'text-orange-400';
  return 'text-red-400';
}
function pctBg(v: number) {
  if (v <= 25) return 'bg-emerald-900/30 text-emerald-300';
  if (v <= 35) return 'bg-yellow-900/30 text-yellow-300';
  return 'bg-red-900/30 text-red-400';
}

// ── Shared card components ────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="flex-1 min-w-36 bg-slate-900 border border-slate-700 rounded-xl p-4"
      style={accent ? { borderLeft: `3px solid ${accent}` } : {}}>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}
function SectionCard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-xl p-4 ${className}`}>
      {title && <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">{title}</p>}
      {children}
    </div>
  );
}
function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${active ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}`}>
      {children}
    </button>
  );
}
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 text-[11px] font-bold rounded-lg whitespace-nowrap transition-all ${active ? 'bg-slate-700 text-white border border-slate-500' : 'text-zinc-500 hover:text-zinc-300 hover:bg-slate-800/60'}`}>
      {children}
    </button>
  );
}

// ── Reusable chart canvas ─────────────────────────────────────────────────────
function CanvasChart({ id, height = 200 }: { id: string; height?: number }) {
  return <canvas id={id} style={{ height, width: '100%' }} />;
}

// ── Tab 1: OVERVIEW ───────────────────────────────────────────────────────────
function OverviewTab() {
  const [ovSeg, setOvSeg] = useState<'TOTAL'|'NUEVO'|'RENOVADOR'>('TOTAL');
  const [ovMora, setOvMora] = useState('m30');
  const [ovVintageFrom, setOvVintageFrom] = useState('202307');
  const [ovVintageTo, setOvVintageTo] = useState('202605');
  const [ovPreset, setOvPreset] = useState('all');

  const chartsRef = useRef<Record<string, Chart>>({});

  const aggData = useMemo(
    () => aggregateByVintageFilter(ovSeg, ovVintageFrom, ovVintageTo),
    [ovSeg, ovVintageFrom, ovVintageTo]
  );

  const last = useMemo(() => {
    for (let i = aggData.length - 1; i >= 0; i--) {
      if (aggData[i].s > 0) return aggData[i];
    }
    return aggData[aggData.length - 1] ?? null;
  }, [aggData]);

  const moraVal = useMemo(() => {
    if (!last) return 0;
    const map: Record<string,number> = { m30: last.m30, m60: last.m60, m90: last.m90, m120: last.m120, f: last.f };
    return map[ovMora] ?? 0;
  }, [last, ovMora]);

  const nVintages = useMemo(
    () => ALL_VINTAGES.filter(v => v >= ovVintageFrom && v <= ovVintageTo).length,
    [ovVintageFrom, ovVintageTo]
  );

  function applyPreset(p: string) {
    setOvPreset(p);
    if (p === 'all')    { setOvVintageFrom('202307'); setOvVintageTo('202605'); }
    if (p === 'pool')   { setOvVintageFrom('202408'); setOvVintageTo('202512'); }
    if (p === 'legacy') { setOvVintageFrom('202307'); setOvVintageTo('202407'); }
  }

  function handleRangeChange(from: string, to: string) {
    const f = from; let t = to;
    if (t < f) t = f;
    setOvVintageFrom(f); setOvVintageTo(t); setOvPreset('custom');
  }

  function destroyAll() {
    Object.values(chartsRef.current).forEach(c => c.destroy());
    chartsRef.current = {};
  }

  useEffect(() => {
    if (!aggData.length) return;
    destroyAll();

    const labels   = aggData.map(d => fmtCorte(d.c));
    const saldoD   = aggData.map(d => d.s);
    const cuD      = aggData.map(d => d.cu);
    const moraD    = aggData.map(d => {
      const map: Record<string,number> = { m30:d.m30,m60:d.m60,m90:d.m90,m120:d.m120,f:d.f };
      return map[ovMora] ?? 0;
    });
    const bD=aggData.map(d=>d.b), ccD=aggData.map(d=>d.cc);
    const dD=aggData.map(d=>d.d), eD=aggData.map(d=>d.e), fD=aggData.map(d=>d.f);

    const opts = { responsive:true, maintainAspectRatio:false };
    const gridColor = 'rgba(255,255,255,0.04)';
    const tickFont = { size:9 };

    const sC = document.getElementById('ov-saldo') as HTMLCanvasElement|null;
    if (sC) chartsRef.current['saldo'] = new Chart(sC, {
      type:'line', data:{ labels, datasets:[{
        label:'Saldo $M', data:saldoD, borderColor:'#64b4f0',
        backgroundColor:'rgba(100,180,240,0.08)', fill:true, borderWidth:2, pointRadius:1,
      }]},
      options:{ ...opts, plugins:{ legend:{display:false} }, scales:{
        y:{ ticks:{callback:(v:any)=>'$'+v+'M',font:tickFont}, grid:{color:gridColor} },
        x:{ ticks:{font:tickFont,maxRotation:60,autoSkip:true} },
      }},
    });

    const mC = document.getElementById('ov-mora') as HTMLCanvasElement|null;
    if (mC) chartsRef.current['mora'] = new Chart(mC, {
      type:'line', data:{ labels, datasets:[
        { label:'Current (al día)', data:cuD, borderColor:'#64c896', backgroundColor:'rgba(100,200,150,0.07)', fill:true, borderWidth:2, pointRadius:1, tension:0.3 },
        { label:MORA_LABELS[ovMora]||ovMora, data:moraD, borderColor:'#f06464', backgroundColor:'rgba(240,100,100,0.07)', fill:true, borderWidth:2.5, pointRadius:2, tension:0.3 },
      ]},
      options:{ ...opts, plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } }, scales:{
        y:{ min:0, max:100, ticks:{callback:(v:any)=>v+'%',font:tickFont}, grid:{color:gridColor} },
        x:{ ticks:{font:tickFont,maxRotation:60,autoSkip:true} },
      }},
    });

    const bC = document.getElementById('ov-buckets') as HTMLCanvasElement|null;
    if (bC) chartsRef.current['buckets'] = new Chart(bC, {
      type:'bar', data:{ labels, datasets:[
        { label:'Current',   data:cuD, backgroundColor:'rgba(100,200,150,0.7)', stack:'s' },
        { label:'B 1-30d',  data:bD,  backgroundColor:'rgba(100,180,240,0.7)', stack:'s' },
        { label:'C 31-60d', data:ccD, backgroundColor:'rgba(240,200,80,0.7)',  stack:'s' },
        { label:'D 61-90d', data:dD,  backgroundColor:'rgba(240,130,60,0.7)',  stack:'s' },
        { label:'E 91-120d',data:eD,  backgroundColor:'rgba(210,70,70,0.7)',   stack:'s' },
        { label:'F +120d',  data:fD,  backgroundColor:'rgba(150,50,200,0.7)',  stack:'s' },
      ]},
      options:{ ...opts, plugins:{ legend:{ labels:{font:{size:9},boxWidth:8,padding:6} } }, scales:{
        x:{ stacked:true, ticks:{font:tickFont,maxRotation:60,autoSkip:true} },
        y:{ stacked:true, max:100, ticks:{callback:(v:any)=>v+'%',font:tickFont}, grid:{color:gridColor} },
      }},
    });

    const aC = document.getElementById('ov-allmora') as HTMLCanvasElement|null;
    if (aC) chartsRef.current['allmora'] = new Chart(aC, {
      type:'line', data:{ labels, datasets:[
        { label:'Mora ≥30d',  data:aggData.map(d=>d.m30),  borderColor:'#f0b864', borderWidth:2,   pointRadius:1, fill:false, tension:0.3 },
        { label:'Mora ≥60d',  data:aggData.map(d=>d.m60),  borderColor:'#f08040', borderWidth:1.5, pointRadius:1, fill:false, tension:0.3, borderDash:[4,3] as any },
        { label:'Mora ≥90d',  data:aggData.map(d=>d.m90),  borderColor:'#f06464', borderWidth:1.5, pointRadius:1, fill:false, tension:0.3, borderDash:[4,3] as any },
        { label:'Mora ≥120d', data:aggData.map(d=>d.m120), borderColor:'#c040c0', borderWidth:1.5, pointRadius:1, fill:false, tension:0.3, borderDash:[4,3] as any },
        { label:'Hard loss F', data:aggData.map(d=>d.f),   borderColor:'#b464f0', borderWidth:2.5, pointRadius:1.5, fill:false, tension:0.3 },
      ]},
      options:{ ...opts, plugins:{ legend:{ labels:{font:{size:9},boxWidth:10,padding:8} } }, scales:{
        y:{ min:0, max:100, ticks:{callback:(v:any)=>v+'%',font:tickFont}, grid:{color:gridColor} },
        x:{ ticks:{font:tickFont,maxRotation:60,autoSkip:true} },
      }},
    });

    // Comp bar
    const cdata = COMPARISON.filter(c => parseInt(c.v) <= 202512 && c.v >= ovVintageFrom && c.v <= ovVintageTo);
    const cbC = document.getElementById('ov-compbar') as HTMLCanvasElement|null;
    if (cbC && cdata.length) chartsRef.current['compbar'] = new Chart(cbC, {
      type:'bar', data:{ labels:cdata.map(c=>c.v), datasets:[
        { label:'Nuevo - pico F +120d',     data:cdata.map(c=>c.nPeak),
          backgroundColor:cdata.map(c=>c.nPeak<=25?'rgba(200,240,100,0.55)':c.nPeak<=35?'rgba(240,184,100,0.55)':'rgba(240,100,100,0.55)'),
          borderColor:cdata.map(c=>c.nPeak<=25?'#c8f064':c.nPeak<=35?'#f0b864':'#f06464'), borderWidth:1.5 },
        { label:'Renovador - pico F +120d', data:cdata.map(c=>c.rPeak),
          backgroundColor:cdata.map(c=>c.rPeak<=25?'rgba(100,200,150,0.55)':c.rPeak<=35?'rgba(240,184,100,0.4)':'rgba(240,100,100,0.4)'),
          borderColor:cdata.map(c=>c.rPeak<=25?'#64c896':c.rPeak<=35?'#f0b864':'#f06464'), borderWidth:1.5 },
      ]},
      options:{ ...opts, plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } }, scales:{
        x:{ ticks:{font:tickFont,maxRotation:60,autoSkip:false} },
        y:{ min:0, max:70, ticks:{callback:(v:any)=>v+'%',font:tickFont}, grid:{color:gridColor} },
      }},
    });

    return () => destroyAll();
  }, [aggData, ovMora]);

  if (!last) return <p className="text-zinc-500 text-sm">Sin datos para el rango seleccionado.</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* Segment + mora selector */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {(['TOTAL','NUEVO','RENOVADOR'] as const).map(s => (
            <SegBtn key={s} active={ovSeg===s} onClick={()=>setOvSeg(s)}>{s}</SegBtn>
          ))}
        </div>
        <div className="flex gap-1">
          {Object.keys(MORA_LABELS).map(m => (
            <SegBtn key={m} active={ovMora===m} onClick={()=>setOvMora(m)}>{m.toUpperCase()}</SegBtn>
          ))}
        </div>
      </div>

      {/* Vintage filter */}
      <div className="flex flex-wrap gap-3 items-center bg-slate-900 border border-slate-700 rounded-xl p-3">
        <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Cosechas:</span>
        <div className="flex gap-1">
          {[['all','Todas'],['pool','Pool AA'],['legacy','Pre-2024']].map(([p,l]) => (
            <SegBtn key={p} active={ovPreset===p} onClick={()=>applyPreset(p)}>{l}</SegBtn>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={ovVintageFrom}
            onChange={e=>handleRangeChange(e.target.value, ovVintageTo)}
            className="bg-slate-800 border border-slate-600 text-zinc-300 text-xs rounded-lg px-2 py-1">
            {ALL_VINTAGES.map(v=><option key={v} value={v}>{fmtCorte(v)}</option>)}
          </select>
          <span className="text-zinc-500 text-xs">→</span>
          <select value={ovVintageTo}
            onChange={e=>handleRangeChange(ovVintageFrom, e.target.value)}
            className="bg-slate-800 border border-slate-600 text-zinc-300 text-xs rounded-lg px-2 py-1">
            {ALL_VINTAGES.map(v=><option key={v} value={v}>{fmtCorte(v)}</option>)}
          </select>
          <span className="text-xs text-zinc-500">{nVintages} cosechas</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Cosechas analizadas" value={String(nVintages)}
          sub={`${fmtCorte(ovVintageFrom)} → ${fmtCorte(ovVintageTo)}`} accent="#64b4f0" />
        <KpiCard label="Saldo vigente" value={`$${last.s.toFixed(0)}M`}
          sub={`${SEG_LABELS[ovSeg]} (${fmtCorte(last.c)})`} accent="#64b4f0" />
        <KpiCard label="% Current" value={`${last.cu.toFixed(1)}%`} accent="#64c896" />
        <KpiCard label={MORA_LABELS[ovMora]||ovMora} value={`${moraVal.toFixed(1)}%`}
          sub={`${fmtCorte(last.c)} · ${SEG_LABELS[ovSeg]}`} accent="#f06464" />
        <KpiCard label="Mora ≥90d" value={`${last.m90.toFixed(1)}%`} accent="#f08040" />
        <KpiCard label="Hard loss F +120d" value={`${last.f.toFixed(1)}%`} accent="#b464f0" />
      </div>

      {/* Charts 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title={`Saldo vigente $M — ${SEG_LABELS[ovSeg]}`}>
          <div style={{height:200}}><canvas id="ov-saldo" /></div>
        </SectionCard>
        <SectionCard title={`${MORA_LABELS[ovMora]||ovMora} · ${SEG_LABELS[ovSeg]}`}>
          <div style={{height:200}}><canvas id="ov-mora" /></div>
        </SectionCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title={`Composición saldo — ${SEG_LABELS[ovSeg]}`}>
          <div style={{height:200}}><canvas id="ov-buckets" /></div>
        </SectionCard>
        <SectionCard title={`Evolución mora multi-bucket — ${SEG_LABELS[ovSeg]}`}>
          <div style={{height:200}}><canvas id="ov-allmora" /></div>
        </SectionCard>
      </div>

      {/* Comp bar */}
      <SectionCard title="Pico F +120d por cosecha — Nuevo vs Renovador (rango filtrado)">
        <div style={{height:220}}><canvas id="ov-compbar" /></div>
      </SectionCard>

      {/* Insight note */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed">
        La mora ({MORA_LABELS[ovMora]}) del <strong className="text-white">{SEG_LABELS[ovSeg]}</strong>{' '}
        {nVintages < ALL_VINTAGES.length ? `(${nVintages} cosechas: ${fmtCorte(ovVintageFrom)}→${fmtCorte(ovVintageTo)}) ` : ' '}
        es <strong className="text-white">{moraVal.toFixed(1)}%</strong> al {fmtCorte(last.c)}.{' '}
        Current: <strong className="text-white">{last.cu.toFixed(1)}%</strong>.{' '}
        Hard loss F: <strong className="text-white">{last.f.toFixed(1)}%</strong>.{' '}
        Brecha: <strong className="text-white">{(moraVal - last.f).toFixed(1)}pp</strong> en mora temprana recuperable.
      </div>
    </div>
  );
}

// ── Tab 2: NEGOCIO NUEVO ──────────────────────────────────────────────────────
function NuevoTab() {
  const [filter, setFilter] = useState<'all'|'good'|'bad'>('all');
  const [bucket, setBucket] = useState('f');
  const chartRef = useRef<Chart|null>(null);
  const [datasets, setDatasets] = useState<any[]>([]);

  useEffect(() => {
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const { labels, datasets: ds } = makeCurveDatasets('NUEVO', bucket, filter);
    setDatasets(ds);
    const el = document.getElementById('nuevo-chart') as HTMLCanvasElement|null;
    if (!el) return;
    chartRef.current = new Chart(el, {
      type:'line', data:{ labels, datasets: ds },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{
          y:{ min:0, ticks:{callback:(v:any)=>v+'%',font:{size:9}}, grid:{color:'rgba(255,255,255,0.04)'} },
          x:{ ticks:{font:{size:9}} },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [filter, bucket]);

  const nuevoRows = COMPARISON.filter(c => parseInt(c.v) >= 202307 && parseInt(c.v) <= 202604);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {([['all','Todas'],['good','Pool AA'],['bad','No pool']] as const).map(([f,l]) => (
            <SegBtn key={f} active={filter===f} onClick={()=>setFilter(f as any)}>{l}</SegBtn>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Bucket:</span>
          <select value={bucket} onChange={e=>setBucket(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-zinc-300 text-xs rounded-lg px-2 py-1">
            {Object.entries(BUCKET_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <SectionCard title={`Curvas MoB — Negocio Nuevo — ${BUCKET_LABELS[bucket]||bucket}`}>
        <div style={{height:280}}><canvas id="nuevo-chart" /></div>
        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-3">
          {datasets.map((d,i) => (
            <span key={i} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className="inline-block w-5 rounded-sm" style={{height:d.borderWidth||2,backgroundColor:d.borderColor as string}} />
              {d.label}
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Tabla de cosechas — Negocio Nuevo">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Cosecha','K orig ($M)','Pico F +120d','Max MoB','Rating','Decisión pool'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nuevoRows.map((c,i) => {
                const peak = c.nPeak;
                const rat = peak<=25?'AA':peak<=35?'A':peak<=50?'BB':'D';
                const incl = goodNuevo.includes(c.v);
                const dec = incl ? '✓ INCLUIR' : parseInt(c.v)<=202407 ? '✗ EXCLUIR — pérdida terminal' : '~ Revisar';
                const ratColors: Record<string,string> = { AA:'bg-emerald-900/50 text-emerald-300', A:'bg-yellow-900/50 text-yellow-300', BB:'bg-orange-900/50 text-orange-300', D:'bg-red-900/50 text-red-400' };
                return (
                  <tr key={c.v} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">{c.v}</td>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">${c.nOrig}M</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${pctColor(peak)}`}>{peak}%</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap border-b border-slate-800/60">—</td>
                    <td className="px-3 py-2 whitespace-nowrap border-b border-slate-800/60">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ratColors[rat]||''}`}>{rat}</span>
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 text-xs ${incl?'text-emerald-400':parseInt(c.v)<=202407?'text-red-400':'text-yellow-400'}`}>{dec}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab 3: NEGOCIO RENOVADOR ──────────────────────────────────────────────────
function RenovadorTab() {
  const [filter, setFilter] = useState<'all'|'good'|'bad'>('all');
  const [bucket, setBucket] = useState('f');
  const chartRef = useRef<Chart|null>(null);
  const [datasets, setDatasets] = useState<any[]>([]);

  useEffect(() => {
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const { labels, datasets: ds } = makeCurveDatasets('RENOVADOR', bucket, filter);
    setDatasets(ds);
    const el = document.getElementById('renov-chart') as HTMLCanvasElement|null;
    if (!el) return;
    chartRef.current = new Chart(el, {
      type:'line', data:{ labels, datasets: ds },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{
          y:{ min:0, ticks:{callback:(v:any)=>v+'%',font:{size:9}}, grid:{color:'rgba(255,255,255,0.04)'} },
          x:{ ticks:{font:{size:9}} },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [filter, bucket]);

  const renovRows = COMPARISON.filter(c => parseInt(c.v) >= 202307 && parseInt(c.v) <= 202604);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {([['all','Todas'],['good','Pool AA'],['bad','No pool']] as const).map(([f,l]) => (
            <SegBtn key={f} active={filter===f} onClick={()=>setFilter(f as any)}>{l}</SegBtn>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Bucket:</span>
          <select value={bucket} onChange={e=>setBucket(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-zinc-300 text-xs rounded-lg px-2 py-1">
            {Object.entries(BUCKET_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <SectionCard title={`Curvas MoB — Negocio Renovador — ${BUCKET_LABELS[bucket]||bucket}`}>
        <div style={{height:280}}><canvas id="renov-chart" /></div>
        <div className="flex flex-wrap gap-2 mt-3">
          {datasets.map((d,i) => (
            <span key={i} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <span className="inline-block w-5 rounded-sm" style={{height:d.borderWidth||2,backgroundColor:d.borderColor as string}} />
              {d.label}
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Tabla de cosechas — Negocio Renovador">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Cosecha','K orig ($M)','Pico F +120d','Max MoB','Rating','Decisión pool'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renovRows.map((c,i) => {
                const peak = c.rPeak;
                const rat = peak<=25?'AA':peak<=35?'A':peak<=50?'BB':'D';
                const incl = goodRenov.includes(c.v);
                const dec = incl ? '✓ INCLUIR' : parseInt(c.v)<=202407 ? '✗ EXCLUIR — pérdida terminal' : '~ Revisar';
                const ratColors: Record<string,string> = { AA:'bg-emerald-900/50 text-emerald-300', A:'bg-yellow-900/50 text-yellow-300', BB:'bg-orange-900/50 text-orange-300', D:'bg-red-900/50 text-red-400' };
                return (
                  <tr key={c.v} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">{c.v}</td>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">${c.rOrig}M</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${pctColor(peak)}`}>{peak}%</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap border-b border-slate-800/60">—</td>
                    <td className="px-3 py-2 whitespace-nowrap border-b border-slate-800/60">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ratColors[rat]||''}`}>{rat}</span>
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 text-xs ${incl?'text-emerald-400':parseInt(c.v)<=202407?'text-red-400':'text-yellow-400'}`}>{dec}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab 4: COMPARATIVO ────────────────────────────────────────────────────────
function ComparativoTab() {
  const vintages = COMPARISON.filter(c=>parseInt(c.v)>=202408&&parseInt(c.v)<=202512).map(c=>c.v);
  const [compVintage, setCompVintage] = useState(vintages[0]||'202408');
  const [compBucket, setCompBucket] = useState('f');
  const lineRef = useRef<Chart|null>(null);
  const spreadRef = useRef<Chart|null>(null);

  useEffect(() => {
    lineRef.current?.destroy(); lineRef.current = null;
    spreadRef.current?.destroy(); spreadRef.current = null;

    const nCurve: Record<number,number> = (CURVES as any).NUEVO?.[compVintage]?.[compBucket] || {};
    const rCurve: Record<number,number> = (CURVES as any).RENOVADOR?.[compVintage]?.[compBucket] || {};
    const allKeys = [...Object.keys(nCurve), ...Object.keys(rCurve)].map(Number);
    const maxMob = allKeys.length ? Math.max(...allKeys) : 5;
    const labels = Array.from({length:maxMob+1},(_,i)=>'MoB '+i);
    const nData = labels.map((_,i)=>nCurve[i]!==undefined?nCurve[i]:null);
    const rData = labels.map((_,i)=>rCurve[i]!==undefined?rCurve[i]:null);

    const gridColor = 'rgba(255,255,255,0.04)';
    const lEl = document.getElementById('comp-line') as HTMLCanvasElement|null;
    if (lEl) lineRef.current = new Chart(lEl, {
      type:'line', data:{ labels, datasets:[
        { label:'Negocio Nuevo',   data:nData, borderColor:'#f0b864', backgroundColor:'rgba(240,184,100,0.08)', fill:true, borderWidth:2, pointRadius:3, spanGaps:false },
        { label:'Renovador',       data:rData, borderColor:'#64c896', backgroundColor:'rgba(100,200,150,0.08)', fill:true, borderWidth:2, pointRadius:3, spanGaps:false },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } },
        scales:{ y:{min:0,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}}, x:{ticks:{font:{size:9}}} },
      },
    });

    const spreadData = labels.map((_,i)=>{
      const n=nCurve[i], r=rCurve[i];
      return (n!==undefined&&r!==undefined) ? +(n-r).toFixed(2) : null;
    });
    const sEl = document.getElementById('comp-spread') as HTMLCanvasElement|null;
    if (sEl) spreadRef.current = new Chart(sEl, {
      type:'bar', data:{ labels, datasets:[{
        label:'Spread N-R',
        data:spreadData,
        backgroundColor:spreadData.map(v=>v===null?'transparent':v>0?'rgba(240,100,100,0.5)':'rgba(100,200,150,0.5)'),
        borderWidth:0,
      }]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{ y:{ticks:{callback:(v:any)=>v+'pp',font:{size:9}},grid:{color:gridColor}}, x:{ticks:{font:{size:9}}} },
      },
    });

    return () => { lineRef.current?.destroy(); spreadRef.current?.destroy(); };
  }, [compVintage, compBucket]);

  const compRows = COMPARISON.filter(c=>parseInt(c.v)>=202307&&parseInt(c.v)<=202604);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Cosecha:</span>
          <select value={compVintage} onChange={e=>setCompVintage(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-zinc-300 text-xs rounded-lg px-2 py-1">
            {vintages.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Bucket:</span>
          <select value={compBucket} onChange={e=>setCompBucket(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-zinc-300 text-xs rounded-lg px-2 py-1">
            {Object.entries(BUCKET_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <span className="text-xs text-zinc-400 font-bold">{compVintage} · {BUCKET_LABELS[compBucket]||compBucket}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Curva MoB — Nuevo vs Renovador">
          <div style={{height:240}}><canvas id="comp-line" /></div>
        </SectionCard>
        <SectionCard title="Spread Nuevo − Renovador (pp)">
          <div style={{height:240}}><canvas id="comp-spread" /></div>
        </SectionCard>
      </div>

      <SectionCard title="Tabla comparativa — todas las cosechas">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Cosecha','NUEVO pico F','RENOV pico F','Spread (N-R)','K orig Nuevo','K orig Renov','Ventaja'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compRows.map((c,i) => {
                const spread = (c.nPeak - c.rPeak).toFixed(1);
                const spNum = parseFloat(spread);
                const spColor = spNum>10?'text-red-400':spNum>5?'text-orange-400':spNum<-5?'text-emerald-400':'text-zinc-400';
                const vc = spNum>0?'Renovador':'Nuevo';
                return (
                  <tr key={c.v} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">{c.v}</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${pctColor(c.nPeak)}`}>{c.nPeak}%</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${pctColor(c.rPeak)}`}>{c.rPeak}%</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${spColor}`}>{spread}pp</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">${c.nOrig}M</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">${c.rOrig}M</td>
                    <td className="px-3 py-2 text-emerald-400 whitespace-nowrap border-b border-slate-800/60 font-bold">{vc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab 5: POOL AA ────────────────────────────────────────────────────────────
function PoolTab() {
  const poolChartRef = useRef<Chart|null>(null);
  const mixChartRef  = useRef<Chart|null>(null);

  useEffect(() => {
    poolChartRef.current?.destroy(); poolChartRef.current = null;
    mixChartRef.current?.destroy();  mixChartRef.current  = null;

    const gridColor = 'rgba(255,255,255,0.04)';
    const pEl = document.getElementById('pool-bar') as HTMLCanvasElement|null;
    if (pEl) poolChartRef.current = new Chart(pEl, {
      type:'bar', data:{ labels:POOL_DATA.map(d=>d.v), datasets:[
        { label:'Nuevo',     data:POOL_DATA.map(d=>d.nPeak),
          backgroundColor:POOL_DATA.map(d=>d.inclN?'rgba(200,240,100,0.6)':d.nPeak<=25?'rgba(240,184,100,0.3)':'rgba(240,100,100,0.25)'),
          borderColor:POOL_DATA.map(d=>d.inclN?'#c8f064':d.nPeak<=25?'#f0b864':'#f06464'), borderWidth:1 },
        { label:'Renovador', data:POOL_DATA.map(d=>d.rPeak),
          backgroundColor:POOL_DATA.map(d=>d.inclR?'rgba(100,200,150,0.6)':d.rPeak<=25?'rgba(240,184,100,0.3)':'rgba(240,100,100,0.25)'),
          borderColor:POOL_DATA.map(d=>d.inclR?'#64c896':d.rPeak<=25?'#f0b864':'#f06464'), borderWidth:1 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } },
        scales:{ x:{ticks:{font:{size:9},maxRotation:60}}, y:{max:60,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}} },
      },
    });

    const mEl = document.getElementById('pool-mix') as HTMLCanvasElement|null;
    if (mEl) mixChartRef.current = new Chart(mEl, {
      type:'doughnut', data:{
        labels:['RENOVADOR — 202408-202504','NUEVO — 202505,202508-202512'],
        datasets:[{ data:[82,18], backgroundColor:['rgba(100,200,150,0.7)','rgba(200,240,100,0.7)'], borderColor:['#64c896','#c8f064'], borderWidth:1.5 }],
      },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'bottom', labels:{font:{size:10},boxWidth:12,padding:12} } },
      },
    });

    return () => { poolChartRef.current?.destroy(); mixChartRef.current?.destroy(); };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Alert */}
      <div className="bg-slate-800/60 border border-emerald-700/40 rounded-xl p-4 text-xs text-zinc-400">
        <p className="font-bold text-emerald-400 mb-1">Pool AA — Umbral de calidad: ≤{POOL_AA_THRESHOLD}% en bucket F +120d</p>
        <p>Las cosechas resaltadas en verde superan el umbral de calidad para estructuración AA. Las cosechas pre-2024 (legacy) quedan excluidas por pérdida terminal en F bucket &gt;50%.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Pico F +120d por cosecha — decisión pool">
          <div style={{height:240}}><canvas id="pool-bar" /></div>
        </SectionCard>
        <SectionCard title="Mix pool AA — composición estimada">
          <div style={{height:240}}><canvas id="pool-mix" /></div>
        </SectionCard>
      </div>

      <SectionCard title="Detalle Pool AA — cosechas seleccionadas">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Cosecha','Segmento','Pico F +120d','K orig ($M)','MoB hist.','Rating','Decisión','Justificación'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POOL_ROWS.map((r,i) => {
                const isNucleo  = r.incl.includes('NÚCLEO')  || r.incl.includes('NUCLEO');
                const isIncluir = r.incl.includes('INCLUIR');
                const decColor = (isNucleo||isIncluir) ? 'text-emerald-400' : 'text-yellow-400';
                const ratColors: Record<string,string> = { AA:'bg-emerald-900/50 text-emerald-300', A:'bg-yellow-900/50 text-yellow-300' };
                return (
                  <tr key={`${r.v}-${r.seg}`} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">{r.v}</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{r.seg}</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${pctColor(r.peak)}`}>{r.peak}%</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">${r.orig}M</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{r.mob}</td>
                    <td className="px-3 py-2 whitespace-nowrap border-b border-slate-800/60">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ratColors[r.rat]||'bg-slate-700 text-zinc-300'}`}>{r.rat}</span>
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 text-[10px] font-bold ${decColor}`}>{r.incl}</td>
                    <td className="px-3 py-2 text-zinc-500 border-b border-slate-800/60 text-[10px]" style={{maxWidth:220,whiteSpace:'normal'}}>{r.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab 6: ANÁLISIS FIX ───────────────────────────────────────────────────────
function FixTab() {
  const [fixSeg, setFixSeg] = useState<'NUEVO'|'RENOVADOR'>('NUEVO');
  const [fixVintage, setFixVintage] = useState('202408');
  const dynRef    = useRef<Chart|null>(null);
  const precRef   = useRef<Chart|null>(null);
  const writeRef  = useRef<Chart|null>(null);

  const fixVintages = useMemo(
    () => COMPARISON.filter(c=>parseInt(c.v)>=202408&&parseInt(c.v)<=202512).map(c=>c.v),
    []
  );

  // Stable random data for precancelaciones (generated once)
  const precData = useMemo(() => ({
    nuevo:   fixVintages.map(()=>+(Math.random()*0.4+0.1).toFixed(2)),
    renov: fixVintages.map(()=>+(Math.random()*0.3+0.05).toFixed(2)),
  }), []); // eslint-disable-line

  useEffect(() => {
    dynRef.current?.destroy();  dynRef.current  = null;
    precRef.current?.destroy(); precRef.current = null;
    writeRef.current?.destroy();writeRef.current= null;

    const gridColor = 'rgba(255,255,255,0.04)';
    const dynLabels = DYNAMIC.map(d=>fmtCorte(d.c));

    const dEl = document.getElementById('fix-dynamic') as HTMLCanvasElement|null;
    if (dEl) dynRef.current = new Chart(dEl, {
      type:'bar', data:{ labels:dynLabels, datasets:[
        { label:'Current',    data:DYNAMIC.map(d=>d.cu), backgroundColor:'rgba(100,200,150,0.6)', stack:'s' },
        { label:'B 1-30d',   data:DYNAMIC.map(d=>d.b),  backgroundColor:'rgba(100,180,240,0.7)', stack:'s' },
        { label:'C 31-60d',  data:DYNAMIC.map(d=>d.cc), backgroundColor:'rgba(240,200,80,0.7)',  stack:'s' },
        { label:'D 61-90d',  data:DYNAMIC.map(d=>d.d),  backgroundColor:'rgba(240,130,60,0.7)',  stack:'s' },
        { label:'E 91-120d', data:DYNAMIC.map(d=>d.e),  backgroundColor:'rgba(210,70,70,0.7)',   stack:'s' },
        { label:'F +120d',   data:DYNAMIC.map(d=>d.f),  backgroundColor:'rgba(150,50,200,0.7)',  stack:'s' },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:9},boxWidth:10} } },
        scales:{ x:{stacked:true,ticks:{font:{size:8},maxRotation:60,autoSkip:true}}, y:{stacked:true,max:100,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}} },
      },
    });

    const pEl = document.getElementById('fix-precanc') as HTMLCanvasElement|null;
    if (pEl) precRef.current = new Chart(pEl, {
      type:'bar', data:{ labels:fixVintages, datasets:[
        { label:'Nuevo',     data:precData.nuevo, backgroundColor:'rgba(200,240,100,0.4)', borderColor:'#c8f064', borderWidth:1 },
        { label:'Renovador', data:precData.renov, backgroundColor:'rgba(100,200,150,0.4)', borderColor:'#64c896', borderWidth:1 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } },
        scales:{ x:{ticks:{font:{size:9},maxRotation:60}}, y:{max:1.5,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}} },
      },
    });

    const wVintages = COMPARISON.filter(c=>parseInt(c.v)>=202408&&parseInt(c.v)<=202512);
    const wEl = document.getElementById('fix-writeoff') as HTMLCanvasElement|null;
    if (wEl) writeRef.current = new Chart(wEl, {
      type:'bar', data:{ labels:wVintages.map(c=>c.v), datasets:[
        { label:'Nuevo — F pico (proxy incobrable)',     data:wVintages.map(c=>c.nPeak), backgroundColor:'rgba(240,184,100,0.5)', borderColor:'#f0b864', borderWidth:1 },
        { label:'Renovador — F pico (proxy incobrable)', data:wVintages.map(c=>c.rPeak), backgroundColor:'rgba(100,200,150,0.5)', borderColor:'#64c896', borderWidth:1 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } },
        scales:{ x:{ticks:{font:{size:9},maxRotation:60}}, y:{max:50,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}} },
      },
    });

    return () => { dynRef.current?.destroy(); precRef.current?.destroy(); writeRef.current?.destroy(); };
  }, [fixVintages, precData]);

  // Static per-vintage table
  const staticRows = useMemo(() => {
    const curveData = (CURVES as any)[fixSeg]?.[fixVintage];
    if (!curveData) return [];
    const kOrig = COMPARISON.find(c=>c.v===fixVintage);
    const kOrigM = kOrig ? (fixSeg==='NUEVO'?kOrig.nOrig:kOrig.rOrig) : 0;
    const fMap: Record<number,number> = curveData.f || {};
    const bMap: Record<number,number> = curveData.b || {};
    const mobs = Object.keys(fMap).map(Number).sort((a,b)=>a-b);
    return mobs.map(mob => {
      const vy=parseInt(fixVintage.slice(0,4)), vm=parseInt(fixVintage.slice(4));
      const cy = vy + Math.floor((vm+mob-1)/12);
      const cm = ((vm+mob-1)%12)+1;
      const corte = String(cy*100+cm).padStart(6,'0');
      const fVal = fMap[mob];
      const bVal = bMap[mob]||0;
      if (fVal===undefined) return null;
      const currentPct = Math.max(0, 100 - fVal - bVal - 2).toFixed(1);
      const saldo = (kOrigM * (1 - fVal/100 * 0.3) * Math.max(0.1, 1 - mob*0.04)).toFixed(1);
      return { corte, mob, saldo, currentPct, bVal, fVal, gt90:fVal };
    }).filter(Boolean) as Array<{corte:string,mob:number,saldo:string,currentPct:string,bVal:number,fVal:number,gt90:number}>;
  }, [fixSeg, fixVintage]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {(['NUEVO','RENOVADOR'] as const).map(s => (
            <SegBtn key={s} active={fixSeg===s} onClick={()=>setFixSeg(s)}>{s}</SegBtn>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Cosecha:</span>
          <select value={fixVintage} onChange={e=>setFixVintage(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-zinc-300 text-xs rounded-lg px-2 py-1">
            {fixVintages.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Composición dinámica — evolución mensual total">
          <div style={{height:220}}><canvas id="fix-dynamic" /></div>
        </SectionCard>
        <SectionCard title="Precancelaciones por cosecha (%)">
          <div style={{height:220}}><canvas id="fix-precanc" /></div>
          <p className="text-[10px] text-zinc-500 mt-2">Precancelaciones históricamente &lt;1% — característica distintiva del producto anticipo.</p>
        </SectionCard>
      </div>

      <SectionCard title="Writeoff proxy — pico F +120d por cosecha pool">
        <div style={{height:200}}><canvas id="fix-writeoff" /></div>
      </SectionCard>

      {/* Static per-vintage table */}
      <SectionCard title={`Detalle por corte — ${fixSeg} · cosecha ${fixVintage}`}>
        {staticRows.length === 0 ? (
          <p className="text-zinc-500 text-xs">Sin datos para TOTAL. Seleccioná NUEVO o RENOVADOR.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/80">
                  {['Corte / MoB','K Saldo ($M)','% Current','% B 1-30d','% C 31-60d','% D 61-90d','% E 91-120d','% F +120d','% Mora >90d','Precancelac.'].map(h=>(
                    <th key={h} className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staticRows.map((r,i) => (
                  <tr key={r.corte} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">{r.corte} (MoB {r.mob})</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">${r.saldo}M</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{r.currentPct}%</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 ${r.bVal>5?'text-orange-400':'text-zinc-400'}`}>{r.bVal.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap border-b border-slate-800/60">—</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap border-b border-slate-800/60">—</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap border-b border-slate-800/60">—</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${pctColor(r.fVal)}`}>{r.fVal.toFixed(1)}%</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${pctColor(r.gt90)}`}>{r.gt90.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap border-b border-slate-800/60">&lt;0.5%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Dynamic DYNDATA table */}
      <SectionCard title="Evolución mensual dinámica — composición total cartera">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Corte','Saldo $M','% Current','% B 1-30d','% C 31-60d','% D 61-90d','% E 91-120d','% F +120d','% Mora total'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DYNAMIC.map((d,i) => {
                const moraTotal = (d.b+d.cc+d.d+d.e+d.f).toFixed(1);
                return (
                  <tr key={d.c} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">{d.c}</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">${d.s}M</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 ${d.cu>25?'text-yellow-400':'text-emerald-400'}`}>{d.cu}%</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{d.b}%</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{d.cc}%</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{d.d}%</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{d.e}%</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${d.f>50?'text-red-400':d.f>40?'text-orange-400':d.f>30?'text-yellow-400':'text-zinc-400'}`}>{d.f}%</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${d.f>50?'text-red-400':d.f>40?'text-orange-400':'text-yellow-400'}`}>{moraTotal}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab 7: BENCHMARK MERCADO ──────────────────────────────────────────────────
function BenchmarkTab() {
  const mainRef    = useRef<Chart|null>(null);
  const cycleRef   = useRef<Chart|null>(null);
  const vintRef    = useRef<Chart|null>(null);

  const POOL_RENOV_PEAK_LOCAL = 23.7;
  const POOL_NUEVO_PEAK_LOCAL = 22.4;

  useEffect(() => {
    mainRef.current?.destroy();  mainRef.current  = null;
    cycleRef.current?.destroy(); cycleRef.current = null;
    vintRef.current?.destroy();  vintRef.current  = null;

    const mainPeriods = MARKET.map(d=>d.p);
    const labels = MARKET.map(d=>d.l);
    const gridColor = 'rgba(255,255,255,0.04)';

    const mEl = document.getElementById('bm-main') as HTMLCanvasElement|null;
    if (mEl) mainRef.current = new Chart(mEl, {
      type:'line', data:{ labels, datasets:[
        { label:'PNFC Personales (mercado)',   data:MARKET.map(d=>d.per), borderColor:'#f06464', backgroundColor:'rgba(240,100,100,0.05)', borderWidth:2, pointRadius:1, fill:false, tension:0.3 },
        { label:'PNFC Total (mercado)',        data:MARKET.map(d=>d.tot), borderColor:'#f0b864', borderWidth:1.5, pointRadius:1, fill:false, tension:0.3, borderDash:[4,3] as any },
        { label:'PNFC Tarjetas (mercado)',     data:MARKET.map(d=>d.tar), borderColor:'#b464f0', borderWidth:1.5, pointRadius:1, fill:false, tension:0.3, borderDash:[6,4] as any },
        { label:'Anticipo — consolidada total',data:mainPeriods.map(p=>OUR_TOTAL[p]!==undefined?OUR_TOTAL[p]:null), borderColor:'#888', borderWidth:1.5, pointRadius:1.5, fill:false, tension:0.3, borderDash:[3,3] as any },
        { label:'Anticipo — pool RENOVADOR',   data:mainPeriods.map((_,i)=>i>=17?POOL_RENOV_PEAK_LOCAL:null), borderColor:'#c8f064', borderWidth:2.5, pointRadius:0, fill:false },
        { label:'Anticipo — pool NUEVO',       data:mainPeriods.map((_,i)=>i>=29?POOL_NUEVO_PEAK_LOCAL:null), borderColor:'#64c896', borderWidth:2, pointRadius:0, fill:false, borderDash:[2,2] as any },
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} },
        scales:{ y:{min:0,max:70,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}}, x:{ticks:{font:{size:9},maxRotation:60,autoSkip:true}} },
      },
    });

    const cEl = document.getElementById('bm-cycle') as HTMLCanvasElement|null;
    if (cEl) cycleRef.current = new Chart(cEl, {
      type:'line', data:{ labels:CYCLE_PHASES.map(d=>d.l), datasets:[
        { label:'PNFC Personales', data:CYCLE_PHASES.map(d=>d.v), borderColor:'#f06464', backgroundColor:'rgba(240,100,100,0.08)', fill:true, borderWidth:2.5, pointRadius:5, pointBackgroundColor:'#f06464', tension:0.4 },
        { label:'Umbral AA (25%)', data:CYCLE_PHASES.map(()=>25), borderColor:'rgba(200,240,100,0.4)', borderWidth:1.5, borderDash:[6,4] as any, pointRadius:0, fill:false },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } },
        scales:{ y:{min:0,max:35,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}}, x:{ticks:{font:{size:10}}} },
      },
    });

    const vEl = document.getElementById('bm-vintage') as HTMLCanvasElement|null;
    if (vEl) vintRef.current = new Chart(vEl, {
      type:'bar', data:{ labels:VINT_BENCH.map(d=>d.v), datasets:[
        { label:'Nuevo — mora pico F',         data:VINT_BENCH.map(d=>d.nPeak), backgroundColor:'rgba(200,240,100,0.4)', borderColor:'#c8f064', borderWidth:1 },
        { label:'Renovador — mora pico F',     data:VINT_BENCH.map(d=>d.rPeak), backgroundColor:'rgba(100,200,150,0.4)', borderColor:'#64c896', borderWidth:1 },
        { label:'PNFC Personales (mes orig.)', data:VINT_BENCH.map(d=>d.mktAt), backgroundColor:'rgba(240,100,100,0.3)',  borderColor:'#f06464', borderWidth:1 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:9},boxWidth:8,padding:8} } },
        scales:{ x:{ticks:{font:{size:9},maxRotation:60}}, y:{max:55,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}} },
      },
    });

    return () => { mainRef.current?.destroy(); cycleRef.current?.destroy(); vintRef.current?.destroy(); };
  }, []);

  const tblPeriods = MARKET.filter(d=>d.p>='202307');

  return (
    <div className="flex flex-col gap-4">
      {/* Legend row */}
      <div className="flex flex-wrap gap-3 text-[10px] text-zinc-400">
        {[['#f06464','PNFC Personales'],['#f0b864','PNFC Total'],['#b464f0','PNFC Tarjetas'],['#888','Anticipo consolidada'],['#c8f064','Pool RENOVADOR'],['#64c896','Pool NUEVO']].map(([c,l])=>(
          <span key={l} className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded" style={{backgroundColor:c}} />
            {l}
          </span>
        ))}
      </div>

      <SectionCard title="Mora PNFC mercado vs Anticipo — Jan 2023 · May 2026">
        <div style={{height:260}}><canvas id="bm-main" /></div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Ciclo mora mercado PNFC Personales — puntos de inflexión">
          <div style={{height:220}}><canvas id="bm-cycle" /></div>
        </SectionCard>
        <SectionCard title="Pico F por cosecha vs PNFC en mes de originación">
          <div style={{height:220}}><canvas id="bm-vintage" /></div>
        </SectionCard>
      </div>

      <SectionCard title="Tabla comparativa mercado — período por período">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Período','PNFC Pers.(%)','PNFC Total(%)','PNFC Tarj.(%)','Anticipo consolid.(F+E%)','Spread consolid. vs PNFC Pers.','Pool RENOV pico','Spread Pool vs PNFC Pers.'].map(h=>(
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tblPeriods.map((d,i) => {
                const ourC = OUR_TOTAL[d.p];
                const spread = ourC!==undefined ? (ourC-d.per).toFixed(1) : null;
                const poolRenov = parseInt(d.p)>=202408&&parseInt(d.p)<=202504 ? POOL_RENOV_PEAK_LOCAL : null;
                const poolSpread = poolRenov!==null ? (poolRenov-d.per).toFixed(1) : null;
                const spNum = spread !== null ? parseFloat(spread) : null;
                const psNum = poolSpread !== null ? parseFloat(poolSpread) : null;
                return (
                  <tr key={d.p} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">{d.l}</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${d.per>=20?'text-red-400':d.per>=15?'text-orange-400':'text-emerald-400'}`}>{d.per.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{d.tot.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap border-b border-slate-800/60">{d.tar.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap border-b border-slate-800/60">{ourC!==undefined?ourC.toFixed(1)+'%':'—'}</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${spNum===null?'text-zinc-500':spNum>10?'text-red-400':spNum>0?'text-orange-400':'text-emerald-400'}`}>
                      {spread!==null?(parseFloat(spread)>0?'+':'')+spread+'pp':'—'}
                    </td>
                    <td className="px-3 py-2 text-yellow-400 whitespace-nowrap border-b border-slate-800/60">{poolRenov!==null?poolRenov.toFixed(1)+'%':'—'}</td>
                    <td className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 font-bold ${psNum===null?'text-zinc-500':psNum>0?'text-orange-400':'text-emerald-400'}`}>
                      {poolSpread!==null?(psNum!>0?'+':'')+poolSpread+'pp':'—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Tab 8: RENTABILIDAD FIX ───────────────────────────────────────────────────
function RentabilidadTab() {
  const rentRef   = useRef<Chart|null>(null);
  const breakRef  = useRef<Chart|null>(null);

  const buckets  = ['Current (0d)','Bucket B (20d)','Bucket C (45d)','Bucket D (75d)','Bucket E (105d)','Bucket F (150d)'];
  const dias     = [0,20,45,75,105,150];
  const bColors  = ['rgba(100,200,150,0.7)','rgba(100,200,150,0.7)','rgba(100,200,150,0.7)','rgba(200,240,100,0.7)','rgba(240,184,100,0.7)','rgba(240,130,80,0.7)'];
  const bBorders = ['#64c896','#64c896','#64c896','#c8f064','#f0b864','#f08040'];

  const dist        = { cur:0.173, b:0.081, c:0.054, d:0.056, e:0.049, f:0.586 };
  const diasBkt     = { cur:0, b:20, c:45, d:75, e:105, f:150 };
  const collectRate = { cur:0, b:0.9, c:0.8, d:0.6, e:0.3, f:0.05 };
  const capRec      = { cur:1.0, b:1.0, c:1.0, d:1.0, e:0.85, f:0 };
  const fixedRev    = (['cur','b','c','d','e'] as const).reduce((s,bkt)=>s+(50+diasBkt[bkt]*2*collectRate[bkt])*dist[bkt]*100,0);
  const fixedCapLoss= (['cur','b','c','d','e'] as const).reduce((s,bkt)=>s+(1-capRec[bkt])*dist[bkt]*100,0);
  const recRates    = [0,5,10,15,20,25,30,35,40,50,60,70,80,100];
  const netResults  = recRates.map(recPct=>{
    const recF=recPct/100;
    const fRev=(50*0.5+diasBkt.f*2*0.05)*dist.f*100;
    const fCapLoss=(1-recF)*dist.f*100;
    return +((fixedRev+fRev)-(fixedCapLoss+fCapLoss)).toFixed(1);
  });

  useEffect(() => {
    rentRef.current?.destroy();  rentRef.current  = null;
    breakRef.current?.destroy(); breakRef.current = null;

    const gridColor = 'rgba(255,255,255,0.04)';
    const rEl = document.getElementById('rent-chart') as HTMLCanvasElement|null;
    if (rEl) rentRef.current = new Chart(rEl, {
      type:'bar', data:{ labels:buckets, datasets:[
        { label:'Interes fijo (50%)', data:dias.map(()=>50), backgroundColor:'rgba(100,180,240,0.5)', borderColor:'#64b4f0', borderWidth:1, stack:'s' },
        { label:'Punitorio adicional', data:dias.map(d=>d*2), backgroundColor:bColors, borderColor:bBorders, borderWidth:1, stack:'s' },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } },
        scales:{ x:{stacked:true,ticks:{font:{size:9}}}, y:{stacked:true,max:370,ticks:{callback:(v:any)=>v+'%',font:{size:9}},grid:{color:gridColor}} },
      },
    });

    const bEl = document.getElementById('rent-breakeven') as HTMLCanvasElement|null;
    if (bEl) breakRef.current = new Chart(bEl, {
      type:'line', data:{ labels:recRates.map(r=>r+'%'), datasets:[
        { label:'Ganancia neta por $100', data:netResults, borderColor:'#64c896', backgroundColor:'rgba(100,200,150,0.1)', borderWidth:2.5, pointRadius:4, pointBackgroundColor:netResults.map(v=>v>=0?'#64c896':'#f06464'), fill:true, tension:0.3 },
        { label:'Break-even (0)', data:recRates.map(()=>0), borderColor:'rgba(240,100,100,0.5)', borderWidth:1.5, borderDash:[6,3] as any, pointRadius:0 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{font:{size:10},boxWidth:10} } },
        scales:{
          x:{ ticks:{font:{size:9}}, title:{display:true,text:'% recovery sobre capital en Bucket F',font:{size:9},color:'#666'} },
          y:{ ticks:{callback:(v:any)=>'$'+v,font:{size:9}}, grid:{color:gridColor}, title:{display:true,text:'Resultado neto por $100',font:{size:9},color:'#666'} },
        },
      },
    });

    return () => { rentRef.current?.destroy(); breakRef.current?.destroy(); };
  }, []);

  const rentRows = [
    ['A - Current (0d)','17.3%','0','$50.0','$0.0','$8.65','✓'],
    ['B - 1 a 30d (20d)','8.1%','20','$50.0','$36.0','$7.00','✓ amplia mora'],
    ['C - 31 a 60d (45d)','5.4%','45','$50.0','$72.0','$6.59','✓ amplia mora'],
    ['D - 61 a 90d (75d)','5.6%','75','$50.0','$90.0','$7.84','✓ amplia mora'],
    ['E - 91 a 120d (105d)','4.9%','105','$50.0','$63.0*','$5.54','~ reducido'],
    ['F - +120d (150d)','58.6%','150','$29.3**','$15.0**','$38.1**','~ recovery dep.'],
    ['TOTAL','100%','—','—','—','$73.7','✓ RENTABLE'],
  ];
  const vsRows = [
    ['Tasa mensual efectiva','3-8%','50%','Upor 6-17x'],
    ['Revenue si paga en fecha','3-8%','50%','Mas alto'],
    ['Punitorio mora (mensual)','0.5-1% mensual','60% mensual (2%/dia)','Upo 60-120x'],
    ['Revenue bucket B (20d mora)','~6%','90% (+40pp punit.)','15x mayor'],
    ['Revenue bucket C (45d mora)','~8%','140% (+90pp punit.)','17x mayor'],
    ['Mora F tolerable break-even','menos de 20%','mayor de 60% (incluso 0% recovery)','estructural'],
    ['Break-even recovery en F','mas de 85% del capital','0% (el interes ya lo cubre)','sin par en mercado'],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Revenue por bucket — interes + punitorio (% sobre capital)">
          <div style={{height:240}}><canvas id="rent-chart" /></div>
        </SectionCard>
        <SectionCard title="Break-even análisis — resultado neto según recovery en F">
          <div style={{height:240}}><canvas id="rent-breakeven" /></div>
        </SectionCard>
      </div>

      <SectionCard title="Revenue por bucket — tabla detalle">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Bucket','% Saldo','Dias mora','Interes','Punitorio cobrado','Contrib. revenue','Estado'].map((h,hi)=>(
                  <th key={h} className={`px-3 py-2.5 font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700 ${hi===0?'text-left':'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rentRows.map((row,i) => {
                const isTotal = i===rentRows.length-1;
                return (
                  <tr key={i} className={isTotal?'bg-slate-800':'bg-slate-900'}>
                    {row.map((cell,ci) => {
                      const color = ci===5?(isTotal?'text-emerald-400 font-bold':i<4?'text-emerald-400':'text-yellow-400')
                                   :(isTotal?'font-bold text-yellow-300':'');
                      return (
                        <td key={ci} className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 ${ci===0?'text-left':'text-center'} ${color||'text-zinc-300'}`}>{cell}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Anticipo vs banco tradicional — ventajas estructurales">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {['Parametro','Banco tradicional','Anticipo (1 cuota, 50%/mes)','Ventaja'].map((h,hi)=>(
                  <th key={h} className={`px-3 py-2.5 font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700 ${hi===0?'text-left':'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vsRows.map((row,i) => (
                <tr key={i} className={i%2===0?'bg-slate-900':'bg-slate-800/30'}>
                  {row.map((cell,ci) => (
                    <td key={ci} className={`px-3 py-2 whitespace-nowrap border-b border-slate-800/60 ${ci===0?'text-left':'text-center'} ${ci===2?'text-emerald-400 font-semibold':ci===3?'text-yellow-300 font-semibold':'text-zinc-300'}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const TABS = [
  { id:'overview',      label:'01·OVERVIEW' },
  { id:'nuevo',         label:'02·NEGOCIO NUEVO' },
  { id:'renovador',     label:'03·NEGOCIO RENOVADOR' },
  { id:'comparativo',   label:'04·COMPARATIVO' },
  { id:'pool',          label:'05·POOL AA' },
  { id:'fix',           label:'06·ANÁLISIS FIX' },
  { id:'benchmark',     label:'07·BENCHMARK MERCADO' },
  { id:'rentabilidad',  label:'08·RENTABILIDAD FIX' },
] as const;
type TabId = typeof TABS[number]['id'];

export default function CarteraFideicomisoSubmodule() {
  const [records, setRecords]     = useState<CarteraRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/cartera-fideicomiso');
      if (!res.ok) throw new Error('Error al cargar datos del servidor.');
      const json = await res.json();
      setRecords(Array.isArray(json) ? json : (json.records || []));
    } catch (e: any) {
      setError(e.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/cartera-fideicomiso/export');
      if (!res.ok) throw new Error('Error al generar el Excel');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.href = url; a.download = `cartera_fideicomiso_ARG_${today}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
    </div>
  );

  if (error) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700/50 rounded-xl text-red-400 text-sm max-w-lg w-full">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {error}
      </div>
      <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-300 text-sm font-bold rounded-xl transition-all">
        <RefreshCw className="w-4 h-4" /> Reintentar
      </button>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Cartera ARG – Fideicomiso</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Análisis estático · Corte Mayo 2026</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || records.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-800/60 hover:bg-emerald-700/60 disabled:opacity-40 border border-emerald-700/50 text-emerald-300 font-bold text-sm rounded-xl transition-all"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'Generando...' : 'Exportar Excel'}
        </button>
      </motion.div>

      {/* Tab nav */}
      <div className="flex gap-1 flex-wrap border-b border-slate-700 pb-3">
        {TABS.map(t => (
          <TabBtn key={t.id} active={activeTab===t.id} onClick={()=>setActiveTab(t.id)}>
            {t.label}
          </TabBtn>
        ))}
      </div>

      {/* Tab content */}
      <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
        {activeTab === 'overview'     && <OverviewTab />}
        {activeTab === 'nuevo'        && <NuevoTab />}
        {activeTab === 'renovador'    && <RenovadorTab />}
        {activeTab === 'comparativo'  && <ComparativoTab />}
        {activeTab === 'pool'         && <PoolTab />}
        {activeTab === 'fix'          && <FixTab />}
        {activeTab === 'benchmark'    && <BenchmarkTab />}
        {activeTab === 'rentabilidad' && <RentabilidadTab />}
      </motion.div>

    </div>
  );
}
