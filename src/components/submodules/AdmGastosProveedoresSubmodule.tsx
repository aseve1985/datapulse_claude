import { useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCcw, Sparkles, Send, Bot, User,
  Receipt, Building2, ChevronLeft, ChevronRight, Filter, X, TrendingUp
} from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import { generateInsights, chatWithData } from '../../services/gemini';

Chart.register(...registerables);

// ── Types ────────────────────────────────────────────────────────────────────

interface GastoRecord {
  pais: string;
  id_factura: number;
  fecha_creacion: string;
  fecha_vencimiento: string;
  cuit: string;
  empresa_facturadora: string;
  proveedor: string;
  monto: string;
  estado: string;
  detalle_contabilidad: string;
  estado_aprobacion: string;
  tipo: string;
  moneda: string;
  cuenta_contable: string;
  cuenta_contable_agrupacion: string;
}

interface ProvStats { name: string; total: number; growing: boolean; pct: number }

interface Props { userEmail?: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultDates() {
  const today = new Date();
  const desde = new Date(today.getFullYear(), today.getMonth() - 1, 1);      // 1° del mes anterior
  const hasta = new Date(today.getFullYear(), today.getMonth(), 0);           // último día del mes anterior
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) };
}

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtNum = (n: number) => fmt.format(Math.round(n));
const fmtDate = (d: string) => d ? d.slice(0, 10) : '—';
const parseAmt = (v: string | number) => parseFloat(String(v || '0')) || 0;

const PAGE_SIZE = 20;

const ESTADO_COLORS: Record<string, string> = {
  approved: 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40',
  pending:  'bg-amber-900/40 text-amber-400 border-amber-700/40',
  rejected: 'bg-red-900/40 text-red-400 border-red-700/40',
};

const TIPO_LABELS: Record<string, string> = {
  factura: 'Factura', nota_de_debito: 'N. Débito', nota_de_credito: 'N. Crédito',
};

// ── Chart — horizontal bar, total por proveedor ───────────────────────────────

function ProveedorChart({ data, color, moneda }: {
  data: ProvStats[]; color: string; moneda: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map(d => d.name.length > 32 ? d.name.slice(0, 32) + '…' : d.name),
        datasets: [{
          data: data.map(d => d.total),
          backgroundColor: data.map(d => d.growing ? 'rgba(239,68,68,0.65)' : `${color}99`),
          borderColor:     data.map(d => d.growing ? 'rgba(239,68,68,0.9)'  : color),
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${fmtNum(ctx.parsed.x ?? 0)} ${moneda}`,
              afterLabel: ctx => {
                const d = data[ctx.dataIndex];
                return d.growing
                  ? `▲ subiendo ${(d.pct * 100).toFixed(0)}% vs 1ª mitad`
                  : `▼ estable o bajando`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#6b7280', font: { size: 10 }, callback: v => fmtNum(Number(v)) },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
          y: { ticks: { color: '#d1d5db', font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [data, color, moneda]);

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-32 text-zinc-600 text-sm">Sin datos para el período</div>
  );

  return (
    <div style={{ height: Math.max(150, data.length * 30) }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

// ── DualScroll ────────────────────────────────────────────────────────────────

function DualScroll({ children, maxHeight = '60vh' }: { children: ReactNode; maxHeight?: string }) {
  const topRef  = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const body = bodyRef.current;
    const top  = topRef.current;
    if (!body || !top) return;
    const measure = () => {
      const inner = top.querySelector('div') as HTMLDivElement | null;
      if (inner) inner.style.minWidth = `${body.scrollWidth}px`;
      top.style.marginRight = `${body.offsetWidth - body.clientWidth}px`;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    measure();
    return () => ro.disconnect();
  }, []);

  const onTop  = () => { if (syncing.current || !bodyRef.current || !topRef.current) return; syncing.current = true; bodyRef.current.scrollLeft = topRef.current.scrollLeft; syncing.current = false; };
  const onBody = () => { if (syncing.current || !topRef.current || !bodyRef.current) return; syncing.current = true; topRef.current.scrollLeft = bodyRef.current.scrollLeft; syncing.current = false; };

  return (
    <div>
      <div ref={topRef} onScroll={onTop}
        className="overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800">
        <div style={{ height: '1px' }} />
      </div>
      <div ref={bodyRef} onScroll={onBody} style={{ maxHeight }}
        className="overflow-x-auto overflow-y-auto [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-blue-500 [&::-webkit-scrollbar-track]:bg-slate-800">
        {children}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdmGastosProveedoresSubmodule({ userEmail }: Props) {
  const dates        = useMemo(defaultDates, []);
  const containerRef  = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [records, setRecords] = useState<GastoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [desde, setDesde] = useState(dates.desde);
  const [hasta, setHasta] = useState(dates.hasta);

  const [filterPais,      setFilterPais]      = useState('');
  const [filterProveedor, setFilterProveedor] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterEstado,    setFilterEstado]    = useState('');
  const [page, setPage] = useState(1);

  const [insights,        setInsights]        = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [chatMessages,    setChatMessages]    = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [chatInput,       setChatInput]       = useState('');
  const [chatLoading,     setChatLoading]     = useState(false);

  // ── Load ──

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInsights(null);
    setChatMessages([]);
    try {
      const res = await fetch(`/api/gastos-proveedores?fecha_desde=${desde}&fecha_hasta=${hasta}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Error al cargar datos');
      const data = await res.json();
      setRecords(data.records);
      setPage(1);

      if (data.records.length > 0) {
        setInsightsLoading(true);
        try {
          const result = await generateInsights(
            data.records, { from: desde, to: hasta }, [], userEmail, 'admin-gastos'
          );
          setInsights(result);
        } finally {
          setInsightsLoading(false);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, userEmail]);

  useEffect(() => { loadData(); }, []);

  // Scroll solo dentro del contenedor del chat, sin mover la página
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  // ── Derived ──

  const filtered = useMemo(() => records.filter(r =>
    (!filterPais      || r.pais === filterPais) &&
    (!filterProveedor || r.proveedor?.toLowerCase().includes(filterProveedor.toLowerCase())) &&
    (!filterCategoria || r.cuenta_contable_agrupacion === filterCategoria) &&
    (!filterEstado    || r.estado_aprobacion === filterEstado)
  ), [records, filterPais, filterProveedor, filterCategoria, filterEstado]);

  const paginated  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Opciones de cada filtro derivadas del dataset ya filtrado por los DEMÁS filtros activos (excluye el propio)
  const estadoOptions = useMemo(() => {
    const base = records.filter(r =>
      (!filterPais      || r.pais === filterPais) &&
      (!filterProveedor || r.proveedor?.toLowerCase().includes(filterProveedor.toLowerCase())) &&
      (!filterCategoria || r.cuenta_contable_agrupacion === filterCategoria)
    );
    return [...new Set(base.map(r => r.estado_aprobacion).filter(Boolean))].sort();
  }, [records, filterPais, filterProveedor, filterCategoria]);

  const categoriaOptions = useMemo(() => {
    const base = records.filter(r =>
      (!filterPais      || r.pais === filterPais) &&
      (!filterProveedor || r.proveedor?.toLowerCase().includes(filterProveedor.toLowerCase())) &&
      (!filterEstado    || r.estado_aprobacion === filterEstado)
    );
    return [...new Set(base.map(r => r.cuenta_contable_agrupacion).filter(Boolean))].sort();
  }, [records, filterPais, filterProveedor, filterEstado]);

  // KPIs
  const kpis = useMemo(() => {
    const sum = (pais: string, moneda: string) =>
      filtered.filter(r => r.pais === pais && r.moneda === moneda).reduce((s, r) => s + parseAmt(r.monto), 0);
    return {
      argARS: sum('ARG', 'ARS'), argUSD: sum('ARG', 'USD'),
      colCOP: sum('COL', 'COP'), colUSD: sum('COL', 'USD'),
      facturas:    filtered.length,
      proveedores: new Set(filtered.map(r => r.proveedor)).size,
    };
  }, [filtered]);

  // Gráficos — top 10 por total, color indica tendencia (1ª mitad vs 2ª mitad)
  const proveedorStats = useMemo(() => {
    const midDate = (() => {
      const s = new Date(desde).getTime(), e = new Date(hasta).getTime();
      return new Date((s + e) / 2).toISOString().slice(0, 10);
    })();

    const build = (pais: string, moneda: string): ProvStats[] => {
      const stats: Record<string, { total: number; h1: number; h2: number }> = {};
      filtered
        .filter(r => r.pais === pais && r.moneda === moneda && r.proveedor)
        .forEach(r => {
          const p = r.proveedor;
          if (!stats[p]) stats[p] = { total: 0, h1: 0, h2: 0 };
          const amt = parseAmt(r.monto);
          stats[p].total += amt;
          if (r.fecha_creacion <= midDate) stats[p].h1 += amt; else stats[p].h2 += amt;
        });
      return Object.entries(stats)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 10)
        .map(([name, s]) => ({
          name,
          total:   s.total,
          growing: s.h2 > s.h1,
          pct:     s.h1 > 0 ? (s.h2 - s.h1) / s.h1 : 0,
        }));
    };

    return {
      argARS: build('ARG', 'ARS'),
      argUSD: build('ARG', 'USD'),
      colCOP: build('COL', 'COP'),
      colUSD: build('COL', 'USD'),
    };
  }, [filtered, desde, hasta]);

  // ── AI ──

  const fetchInsights = async () => {
    if (filtered.length === 0) return;
    setInsightsLoading(true);
    try {
      const result = await generateInsights(filtered, { from: desde, to: hasta }, [], userEmail, 'admin-gastos');
      setInsights(result);
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading || records.length === 0) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await chatWithData(newMsgs, filtered.length > 0 ? filtered : records, [], userEmail, 'admin-gastos');
      setChatMessages([...newMsgs, { role: 'model' as const, content: reply }]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearFilters = () => {
    setFilterPais(''); setFilterProveedor(''); setFilterCategoria(''); setFilterEstado(''); setPage(1);
  };
  const hasFilters = filterPais || filterProveedor || filterCategoria || filterEstado;

  if (loading && records.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-zinc-400 text-sm">Cargando gastos de proveedores...</p>
      </div>
    );
  }

  // ── Render ──

  return (
    <div ref={containerRef} className="flex-1 flex flex-col p-6 gap-5 overflow-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Administración › Pago a Proveedores</h2>
          <p className="text-zinc-500 text-sm mt-0.5">{records.length} registros — {desde} → {hasta}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Desde</span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="bg-transparent text-sm text-white outline-none" />
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Hasta</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="bg-transparent text-sm text-white outline-none" />
          </div>
          <button onClick={loadData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Cargar
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {records.length > 0 && (<>

        {/* KPIs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          <div className="bg-slate-900 border border-blue-500/20 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400">ARG</span>
              <span className="text-[10px] text-zinc-600 font-bold">Argentina</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-end justify-between">
                <span className="text-[10px] text-zinc-500 font-bold">ARS</span>
                <span className="text-lg font-bold text-white leading-none">{fmtNum(kpis.argARS)}</span>
              </div>
              {kpis.argUSD > 0 && (
                <div className="flex items-end justify-between border-t border-slate-800 pt-1.5">
                  <span className="text-[10px] text-zinc-500 font-bold">USD</span>
                  <span className="text-base font-bold text-zinc-300 leading-none">{fmtNum(kpis.argUSD)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">COL</span>
              <span className="text-[10px] text-zinc-600 font-bold">Colombia</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-end justify-between">
                <span className="text-[10px] text-zinc-500 font-bold">COP</span>
                <span className="text-lg font-bold text-white leading-none">{fmtNum(kpis.colCOP)}</span>
              </div>
              {kpis.colUSD > 0 && (
                <div className="flex items-end justify-between border-t border-slate-800 pt-1.5">
                  <span className="text-[10px] text-zinc-500 font-bold">USD</span>
                  <span className="text-base font-bold text-zinc-300 leading-none">{fmtNum(kpis.colUSD)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Comprobantes</span>
              <Receipt className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">{kpis.facturas.toLocaleString('es-AR')}</p>
            {filtered.length !== records.length && (
              <p className="text-[10px] text-zinc-600">de {records.length} totales</p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Proveedores</span>
              <Building2 className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">{kpis.proveedores}</p>
            <p className="text-[10px] text-zinc-600">únicos</p>
          </div>
        </motion.div>

        {/* Filtros */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="flex flex-wrap items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          <select value={filterPais} onChange={e => { setFilterPais(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors">
            <option value="">Todos los países</option>
            <option value="ARG">ARG</option>
            <option value="COL">COL</option>
          </select>
          <select value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors">
            <option value="">Todos los estados</option>
            {estadoOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filterCategoria} onChange={e => { setFilterCategoria(e.target.value); setPage(1); }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors max-w-xs">
            <option value="">Todas las categorías</option>
            {categoriaOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input type="text" value={filterProveedor}
            onChange={e => { setFilterProveedor(e.target.value); setPage(1); }}
            placeholder="Buscar proveedor..."
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-blue-500 transition-colors min-w-[160px]" />
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-zinc-400 transition-colors">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
          <span className="ml-auto text-xs text-zinc-600">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </motion.div>

        {/* AI — Insights + Chat */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-white">Análisis IA</span>
              </div>
              <button onClick={fetchInsights} disabled={insightsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-zinc-300 text-xs font-bold rounded-lg border border-slate-700 transition-colors">
                {insightsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                Actualizar
              </button>
            </div>
            <div className="p-5 flex-1">
              {insightsLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
                  <p className="text-zinc-500 text-sm">Analizando {records.length} registros...</p>
                </div>
              ) : insights ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-zinc-300 leading-relaxed">{insights.summary}</p>
                  {insights.insights?.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {insights.insights.map((ins: string, i: number) => (
                        <div key={i} className="flex items-start gap-2.5 bg-slate-800/60 rounded-lg px-3 py-2.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <p className="text-xs text-zinc-300 leading-relaxed">{ins}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {insights.recommendation && (
                    <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg px-4 py-3">
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Recomendación</p>
                      <p className="text-xs text-zinc-300 leading-relaxed">{insights.recommendation}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <Sparkles className="w-7 h-7 text-zinc-700" />
                  <p className="text-zinc-500 text-sm">El análisis se generará automáticamente.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden" style={{ height: 440 }}>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800 shrink-0">
              <Bot className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-bold text-white">Chat con los datos</span>
            </div>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 h-full py-8 text-center">
                  <Bot className="w-7 h-7 text-zinc-700" />
                  <p className="text-zinc-500 text-sm">Preguntá sobre los gastos.</p>
                  <p className="text-zinc-600 text-xs">Ej: "¿Cuál es el proveedor con mayor gasto en ARG?"</p>
                </div>
              ) : chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'model' && <Bot className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />}
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-zinc-300'}`}>
                    {msg.content}
                  </div>
                  {msg.role === 'user' && <User className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />}
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2.5">
                  <Bot className="w-5 h-5 text-violet-400 shrink-0" />
                  <div className="bg-slate-800 rounded-xl px-3 py-2">
                    <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin" />
                  </div>
                </div>
              )}

            </div>
            <div className="px-4 py-3 border-t border-slate-800 flex gap-2 shrink-0">
              <input type="text" value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Preguntá sobre los gastos..."
                disabled={records.length === 0 || chatLoading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500 transition-colors disabled:opacity-50" />
              <button onClick={handleSendMessage}
                disabled={!chatInput.trim() || chatLoading || records.length === 0}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Tabla — todos los campos */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <DualScroll>
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="sticky top-0 z-10 bg-slate-900">
                <tr className="border-b border-slate-800">
                  {['ID', 'Fecha', 'Vencimiento', 'País', 'Proveedor', 'Empresa', 'CUIT',
                    'Tipo', 'Monto', 'Moneda', 'Estado', 'Aprobación', 'Cuenta Contable', 'Categoría', 'Detalle'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((r, i) => (
                  <tr key={`${r.id_factura}-${i}`} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-zinc-600 text-xs">{r.id_factura}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{fmtDate(r.fecha_creacion)}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs whitespace-nowrap">{fmtDate(r.fecha_vencimiento)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.pais === 'ARG' ? 'bg-blue-900/40 text-blue-400' : 'bg-amber-900/40 text-amber-400'}`}>{r.pais}</span>
                    </td>
                    <td className="px-3 py-2.5 text-white text-xs whitespace-nowrap">{r.proveedor || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{r.empresa_facturadora || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs whitespace-nowrap">{r.cuit || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{TIPO_LABELS[r.tipo] || r.tipo || '—'}</td>
                    <td className="px-3 py-2.5 text-white text-xs font-medium whitespace-nowrap text-right">{fmtNum(parseAmt(r.monto))}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs">{r.moneda && r.moneda !== 'true' ? r.moneda : '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{r.estado || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ESTADO_COLORS[r.estado_aprobacion] || 'bg-slate-800 text-zinc-500 border-slate-700'}`}>
                        {r.estado_aprobacion || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs whitespace-nowrap">{r.cuenta_contable || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs whitespace-nowrap">{r.cuenta_contable_agrupacion || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-600 text-xs whitespace-nowrap">{r.detalle_contabilidad || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DualScroll>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <span className="text-xs text-zinc-600">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 transition-colors text-zinc-400">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-zinc-500 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 transition-colors text-zinc-400">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Gráficos — top 10, barra horizontal, color = tendencia */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {[
            { key: 'argARS', data: proveedorStats.argARS, title: 'Top 10 proveedores — ARG (ARS)', color: '#3b82f6', moneda: 'ARS' },
            { key: 'argUSD', data: proveedorStats.argUSD, title: 'Top 10 proveedores — ARG (USD)', color: '#60a5fa', moneda: 'USD' },
            { key: 'colCOP', data: proveedorStats.colCOP, title: 'Top 10 proveedores — COL (COP)', color: '#f59e0b', moneda: 'COP' },
            { key: 'colUSD', data: proveedorStats.colUSD, title: 'Top 10 proveedores — COL (USD)', color: '#fbbf24', moneda: 'USD' },
          ].map(ch => (
            <div key={ch.key} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-bold text-white">{ch.title}</span>
              </div>
              <ProveedorChart data={ch.data} color={ch.color} moneda={ch.moneda} />
            </div>
          ))}
        </motion.div>

      </>)}
    </div>
  );
}
