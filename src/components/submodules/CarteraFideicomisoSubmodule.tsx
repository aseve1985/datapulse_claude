import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import MultiSelect from '../ui/MultiSelect';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
  ResponsiveContainer,
} from 'recharts';

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

// ── Paleta ────────────────────────────────────────────────────────────────────
const BUCKET_COLORS = ['#22C55E', '#F59E0B', '#F97316', '#DC2626', '#9B1C1C', '#4B0000'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fv = (v: unknown): number => typeof v === 'number' ? v : parseFloat(String(v)) || 0;
const fmt$ = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtAxis$ = (v: number) => `$${v.toFixed(0)}M`;
const fmtAxisPct = (v: number) => `${v.toFixed(0)}%`;
const shortDate = (s: string) => String(s).slice(0, 7);

const AXIS_STYLE = { fontSize: 9, fill: '#64748b' };
const GRID_STYLE = { stroke: '#1e293b', strokeDasharray: '3 3' };
const CHART_MARGIN = { top: 8, right: 16, left: 0, bottom: 40 };

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="flex-1 min-w-36 bg-slate-900 border border-slate-700 rounded-xl p-4" style={{ borderLeft: `3px solid ${accent}` }}>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Chart Section ─────────────────────────────────────────────────────────────
function ChartCard({ title, legend, children }: { title: string; legend?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{title}</p>
      {legend && <p className="text-[11px] text-zinc-500 italic mb-3">{legend}</p>}
      {!legend && <div className="mb-3" />}
      {children}
    </div>
  );
}

// ── Tabla cols ────────────────────────────────────────────────────────────────
const TABLE_COLS: { key: keyof CarteraRecord; label: string; fmt: (v: number) => string }[] = [
  { key: 'fecha_desembolso_periodo', label: 'Cosecha',  fmt: String as any },
  { key: 'tipo_cliente',             label: 'Tipo',     fmt: String as any },
  { key: 'k_originado',              label: 'K Orig',   fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'k_saldo_total',            label: 'Saldo',    fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'a_current',                label: 'Current',  fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'b_bucket_1_30',            label: '1-30d',    fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'c_bucket_31_60',           label: '31-60d',   fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'd_bucket_61_90',           label: '61-90d',   fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'e_bucket_91_120',          label: '91-120d',  fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'f_bucket_mas_120',         label: '+120d',    fmt: n => `$${(n/1e6).toFixed(1)}M` },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function CarteraFideicomisoSubmodule() {
  const [records, setRecords]     = useState<CarteraRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filterCosecha, setFilterCosecha] = useState<string[]>([]);
  const [filterTipo, setFilterTipo]       = useState<string[]>([]);

  const topScrollRef   = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef   = useRef(false);
  const [tableWidth, setTableWidth] = useState(0);

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

  useEffect(() => {
    requestAnimationFrame(() => {
      if (tableScrollRef.current) setTableWidth(tableScrollRef.current.scrollWidth);
    });
  }, [records, filterCosecha, filterTipo]);

  const handleTopScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (tableScrollRef.current && topScrollRef.current)
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    isSyncingRef.current = false;
  };
  const handleTableScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (topScrollRef.current && tableScrollRef.current)
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    isSyncingRef.current = false;
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const periodoFoto = useMemo(() => {
    const periodos = [...new Set(records.map(r => r.periodo))].sort().reverse();
    return periodos.find(p => records.filter(r => r.periodo === p).length > 1) ?? periodos[0] ?? '';
  }, [records]);

  const fotoRows = useMemo(() =>
    records.filter(r => r.periodo === periodoFoto)
  , [records, periodoFoto]);

  const fotoSorted = useMemo(() =>
    [...fotoRows].sort((a, b) => shortDate(a.fecha_desembolso_periodo).localeCompare(shortDate(b.fecha_desembolso_periodo)))
  , [fotoRows]);

  const kpis = useMemo(() => {
    const sum = (f: keyof CarteraRecord) => fotoRows.reduce((s, r) => s + fv(r[f]), 0);
    const orig    = sum('k_originado');
    const pagado  = sum('k_pagado_total');
    const prec    = sum('k_precancelado');
    const saldo   = sum('k_saldo_total');
    const current = sum('a_current');
    const b130    = sum('b_bucket_1_30');
    const b3160   = sum('c_bucket_31_60');
    const b6190   = sum('d_bucket_61_90');
    const b91120  = sum('e_bucket_91_120');
    const bmas120 = sum('f_bucket_mas_120');
    return { orig, pagado, prec, saldo, current, b130, b3160, b6190, b91120, bmas120 };
  }, [fotoRows]);

  // Chart 1 — Donut
  const bucketData = useMemo(() => [
    { name: 'Current', value: kpis.current, color: BUCKET_COLORS[0] },
    { name: '1-30d',   value: kpis.b130,    color: BUCKET_COLORS[1] },
    { name: '31-60d',  value: kpis.b3160,   color: BUCKET_COLORS[2] },
    { name: '61-90d',  value: kpis.b6190,   color: BUCKET_COLORS[3] },
    { name: '91-120d', value: kpis.b91120,  color: BUCKET_COLORS[4] },
    { name: '+120d',   value: kpis.bmas120, color: BUCKET_COLORS[5] },
  ].filter(d => d.value > 0), [kpis]);

  // Chart 2 — Clustered bar top 15
  const clusterData = useMemo(() => {
    const top15 = [...fotoRows]
      .sort((a, b) => fv(b.k_saldo_total) - fv(a.k_saldo_total))
      .slice(0, 15)
      .sort((a, b) => shortDate(a.fecha_desembolso_periodo).localeCompare(shortDate(b.fecha_desembolso_periodo)));
    return top15.map(r => ({
      cosecha:   shortDate(r.fecha_desembolso_periodo),
      originado: fv(r.k_originado) / 1e6,
      saldo:     fv(r.k_saldo_total) / 1e6,
    }));
  }, [fotoRows]);

  // Chart 3 — Stacked bar composición
  const stackedData = useMemo(() => fotoSorted.map(r => {
    const s = fv(r.k_saldo_total);
    return {
      cosecha:  shortDate(r.fecha_desembolso_periodo),
      current:  s > 0 ? fv(r.a_current) / s * 100 : 0,
      mora130:  s > 0 ? fv(r.b_bucket_1_30) / s * 100 : 0,
      mora3190: s > 0 ? (fv(r.c_bucket_31_60) + fv(r.d_bucket_61_90)) / s * 100 : 0,
      mora90p:  s > 0 ? (fv(r.e_bucket_91_120) + fv(r.f_bucket_mas_120)) / s * 100 : 0,
    };
  }), [fotoSorted]);

  // Chart 4 — Line mora 1+
  const moraData = useMemo(() => fotoSorted.map(r => ({
    cosecha: shortDate(r.fecha_desembolso_periodo),
    mora1p:  fv(r.k_originado) > 0
      ? (fv(r.k_saldo_total) - fv(r.a_current)) / fv(r.k_originado) * 100
      : 0,
  })), [fotoSorted]);

  // Chart 5 — Bar originación mensual
  const origData = useMemo(() => fotoSorted.map(r => ({
    cosecha:   shortDate(r.fecha_desembolso_periodo),
    originado: fv(r.k_originado) / 1e6,
  })), [fotoSorted]);

  // ── Filtros tabla ────────────────────────────────────────────────────────────
  const cosechaOptions = useMemo(() =>
    [...new Set(fotoRows.map(r => shortDate(r.fecha_desembolso_periodo)))].sort()
  , [fotoRows]);

  const tipoOptions = useMemo(() =>
    [...new Set(fotoRows.map(r => r.tipo_cliente))].sort()
  , [fotoRows]);

  const tableRows = useMemo(() =>
    fotoRows.filter(r =>
      (filterCosecha.length === 0 || filterCosecha.includes(shortDate(r.fecha_desembolso_periodo))) &&
      (filterTipo.length === 0    || filterTipo.includes(r.tipo_cliente))
    )
  , [fotoRows, filterCosecha, filterTipo]);

  // ── Export ──────────────────────────────────────────────────────────────────
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

  // ── Render ──────────────────────────────────────────────────────────────────
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
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Cartera ARG – Fideicomiso</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Período foto: <span className="text-zinc-300 font-bold">{periodoFoto}</span></p>
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

      {/* KPI Cards */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex gap-3 flex-wrap">
        <KpiCard label="K Originado Hist."  value={fmt$(kpis.orig)}   accent="#F59E0B" />
        <KpiCard label="K Pago Total"        value={fmt$(kpis.pagado)} accent="#22C55E"
          sub={kpis.orig > 0 ? `${fmtPct(kpis.pagado/kpis.orig)} del originado` : undefined} />
        <KpiCard label="K Precancelado"      value={fmt$(kpis.prec)}   accent="#5B8DEF" />
        <KpiCard label="Saldo Vigente"       value={fmt$(kpis.saldo)}  accent="#13A8A8"
          sub={kpis.orig > 0 ? `${fmtPct(kpis.saldo/kpis.orig)} del originado` : undefined} />
        <KpiCard label="% Current"           value={kpis.saldo > 0 ? fmtPct(kpis.current/kpis.saldo) : '—'} accent="#22C55E" />
        <KpiCard label="% Mora >90d"         value={kpis.saldo > 0 ? fmtPct((kpis.b91120+kpis.bmas120)/kpis.saldo) : '—'} accent="#DC2626" />
      </motion.div>

      {/* Charts row 1: Donut + Clustered Bar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <ChartCard title="Distribución de Saldo por Bucket"
          legend="Muestra cómo se distribuye el saldo vigente total entre los buckets de mora. Mientras más proporción verde (Current), mejor salud de la cartera.">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={bucketData} dataKey="value" innerRadius="50%" outerRadius="75%"
                startAngle={90} endAngle={-270} paddingAngle={1}>
                {bucketData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [fmt$(v), '']}
              />
              <Legend iconSize={10} iconType="circle"
                formatter={(value, entry: any) => (
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>
                    {value}: {fmt$(entry.payload?.value ?? 0)}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="K Originado vs Saldo Vigente (Top 15 cosechas)"
          legend="Compara el capital originado (azul) contra el saldo aún vigente (teal) en las 15 cosechas más grandes. La diferencia entre ambas barras refleja lo pagado + precancelado.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={clusterData} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxis$} tick={AXIS_STYLE} width={45} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any, name: string) => [fmtAxis$(v), name === 'originado' ? 'K Originado' : 'Saldo Vigente']}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="originado" name="K Originado"   fill="#1F4E78" radius={[2,2,0,0]} />
              <Bar dataKey="saldo"     name="Saldo Vigente" fill="#13A8A8" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Chart 3: Stacked */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <ChartCard title="Composición del Saldo por Cosecha (% sobre saldo vigente)"
          legend="Cada barra suma 100% del saldo de esa cosecha, dividido en tramos de mora. Cosechas más verdes tienen mejor comportamiento de pago; las más rojas concentran mora tardía.">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stackedData} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxisPct} tick={AXIS_STYLE} width={40} domain={[0, 100]} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [`${Number(v).toFixed(1)}%`, '']}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="current"  name="Current"     stackId="a" fill="#22C55E" />
              <Bar dataKey="mora130"  name="Mora 1-30d"  stackId="a" fill="#F59E0B" />
              <Bar dataKey="mora3190" name="Mora 31-90d" stackId="a" fill="#F97316" />
              <Bar dataKey="mora90p"  name="Mora >90d"   stackId="a" fill="#DC2626" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Chart 4: Line mora */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <ChartCard title="% Mora 1+ sobre K Originado por Cosecha"
          legend="Indica qué porcentaje del capital originado de cada cosecha está en mora (saldo vigente menos la porción current). Cosechas más maduras tienden a tener mayor mora acumulada.">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={moraData} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="moraGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxisPct} tick={AXIS_STYLE} width={40} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [`${Number(v).toFixed(1)}%`, '% Mora 1+']}
              />
              <Area dataKey="mora1p" name="% Mora 1+" stroke="#F97316" strokeWidth={2}
                fill="url(#moraGrad)" dot={{ r: 3, fill: '#F97316' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Chart 5: Bar originación */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <ChartCard title="Evolución Mensual de Originación"
          legend="Muestra el capital originado por período de desembolso dentro del período foto. Permite identificar meses con mayor volumen de colocación.">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={origData} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxis$} tick={AXIS_STYLE} width={45} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => [fmtAxis$(v), 'K Originado']}
              />
              <Bar dataKey="originado" name="K Originado" fill="#5B8DEF" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Tabla cosechas */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="flex flex-col gap-3">

        {/* Filtros */}
        <div className="flex items-end gap-4 flex-wrap">
          <MultiSelect
            label="Cosecha"
            options={cosechaOptions}
            value={filterCosecha}
            onChange={setFilterCosecha}
            placeholder="Todas"
          />
          <MultiSelect
            label="Tipo"
            options={tipoOptions}
            value={filterTipo}
            onChange={setFilterTipo}
            placeholder="Todos"
          />
          <p className="text-xs text-zinc-500 pb-1.5">
            <span className="font-bold text-white">{tableRows.length}</span> de {fotoRows.length} registros
          </p>
        </div>

        {/* Top scrollbar mirror */}
        <div ref={topScrollRef} onScroll={handleTopScroll}
          className="overflow-x-auto rounded-t-xl border-x border-t border-slate-700"
          style={{ height: 14 }}>
          <div style={{ width: tableWidth > 0 ? tableWidth : '100%', height: 1 }} />
        </div>

        <div ref={tableScrollRef} onScroll={handleTableScroll}
          className="overflow-x-auto rounded-b-xl border border-t-0 border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {TABLE_COLS.map(col => (
                  <th key={String(col.key)}
                    className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/30'}>
                  {TABLE_COLS.map(col => (
                    <td key={String(col.key)}
                      className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">
                      {col.key === 'fecha_desembolso_periodo'
                        ? shortDate(row[col.key] as string)
                        : col.key === 'tipo_cliente'
                        ? String(row[col.key])
                        : col.fmt(fv(row[col.key]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

    </div>
  );
}
