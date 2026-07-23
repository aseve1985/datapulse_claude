import { useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCcw, Sparkles, Send, Bot, User,
  ChevronLeft, ChevronRight, Filter, X, Trophy, Users, TrendingUp,
  AlertTriangle, Download, BarChart2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { generateInsights, chatWithData } from '../../services/gemini';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EsquemaVentas {
  sc_q: number | null; sc_m: number | null;
  m100_q: number | null; m100_m: number | null;
  m85_q: number | null; m85_m: number | null;
}

interface EsquemaMora {
  sc_p: number | null; sc_m: number | null;
  m100_p: number | null; m100_m: number | null;
  m85_p: number | null; m85_m: number | null;
}

interface OperadorRow {
  nombre: string;
  cedula: string;
  mes: string;
  campana: string; // = país ("Argentina" / "Colombia") — columna "Campaña" del sheet
  antiguedad: string;
  estado: string;
  semana: string;
  dias_lab: number;
  dias_semana: number;
  meta_ventas: number;
  meta_ventas_ajustada: number;
  meta_mora: number;
  faltas: number;
  penalty_pct: number;
  esquema_ventas: EsquemaVentas | null;
  esquema_mora: EsquemaMora | null;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  ventas_reales: number | null;
  mora_real: number | null;
  comision_ventas: number | null;
  comision_mora: number | null;
  comision_total: number | null;
  matched: boolean;
}

interface SemanaInfo {
  nombre: string;
  fecha_desde: string;
  fecha_hasta: string;
  dias_semana: number;
  pais: string;
}

interface Props { userEmail?: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fmtNum = (n: number) => new Intl.NumberFormat('es-AR').format(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtMoney = (n: number | null) => n == null ? '—' : fmtARS.format(n);

function calcComision(op: OperadorRow): { ventas: number | null; mora: number | null; total: number | null } {
  const hasVentas = op.ventas_reales != null && op.esquema_ventas != null;
  const hasMora   = op.mora_real     != null && op.esquema_mora   != null;
  if (!hasVentas && !hasMora) return { ventas: null, mora: null, total: null };

  let ventas = 0;
  if (hasVentas) {
    const ev = op.esquema_ventas!;
    const vr = op.ventas_reales!;
    if (ev.sc_q != null && vr >= ev.sc_q)        ventas = ev.sc_m  ?? 0;
    else if (ev.m100_q != null && vr >= ev.m100_q) ventas = ev.m100_m ?? 0;
    else if (ev.m85_q  != null && vr >= ev.m85_q)  ventas = ev.m85_m  ?? 0;
    ventas = Math.round(ventas * (1 - op.penalty_pct));
  }

  let mora = 0;
  if (hasMora) {
    const em = op.esquema_mora!;
    const mr = op.mora_real!;
    if (em.sc_p != null && mr <= em.sc_p)         mora = em.sc_m  ?? 0;
    else if (em.m100_p != null && mr <= em.m100_p) mora = em.m100_m ?? 0;
    else if (em.m85_p  != null && mr <= em.m85_p)  mora = em.m85_m  ?? 0;
    mora = Math.round(mora * (1 - op.penalty_pct));
  }

  return { ventas: hasVentas ? ventas : null, mora: hasMora ? mora : null, total: ventas + mora };
}

function cumplPct(ventas_reales: number | null, meta_ajustada: number): number | null {
  if (ventas_reales == null || meta_ajustada === 0) return null;
  return (ventas_reales / meta_ajustada) * 100;
}

const PAGE_SIZE = 20;

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

// ── PenaltyBadge ──────────────────────────────────────────────────────────────

function PenaltyBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-zinc-600 text-xs">—</span>;
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-900/30 text-red-400 border border-red-800/30">
      -{(pct * 100).toFixed(0)}%
    </span>
  );
}

// ── CumplBadge ────────────────────────────────────────────────────────────────

function CumplBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-zinc-600 text-xs">—</span>;
  const color = pct >= 90 ? 'text-emerald-400 bg-emerald-900/30 border-emerald-800/30'
    : pct >= 85 ? 'text-amber-400 bg-amber-900/30 border-amber-800/30'
    : 'text-red-400 bg-red-900/30 border-red-800/30';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${color}`}>{fmtPct(pct)}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OperadoresVentasSubmodule({ userEmail }: Props) {
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [operadores,         setOperadores]         = useState<OperadorRow[]>([]);
  const [semanas,            setSemanas]            = useState<SemanaInfo[]>([]);
  const [hasActuals,         setHasActuals]         = useState(false);
  const [unmatchedRedshift,  setUnmatchedRedshift]  = useState<{ pais: string; operador: string }[]>([]);
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState<string | null>(null);

  const [filterMes,    setFilterMes]    = useState<string>('');
  const [filterPais,   setFilterPais]   = useState<string>('');
  const [filterSemana, setFilterSemana] = useState<string>('');
  const [filterCampana, setFilterCampana] = useState<string>('');
  const [page, setPage] = useState(1);

  const [activeTab, setActiveTab] = useState<'detalle' | 'ranking' | 'esquemas'>('detalle');

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
      const res = await fetch('/api/operadores-ventas');
      if (!res.ok) throw new Error((await res.json()).error || 'Error al cargar datos');
      const data = await res.json();
      setOperadores(data.operadores || []);
      setSemanas(data.semanas || []);
      setHasActuals(!!data.has_actuals);
      setUnmatchedRedshift(data.unmatched_redshift || []);

      // Auto-seleccionar semana más reciente
      if (data.semanas?.length > 0 && !filterSemana) {
        setFilterSemana(data.semanas[data.semanas.length - 1].nombre);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  // ── Derived ──

  const mesOptions = useMemo(() =>
    [...new Set(operadores.map(o => o.mes).filter(Boolean))].sort(),
  [operadores]);

  // campana IS el país en la hoja ("Argentina" / "Colombia")
  const paisOptions = useMemo(() =>
    [...new Set(operadores.map(o => o.campana).filter(Boolean))].sort(),
  [operadores]);

  // Cuando hay un mes seleccionado, sólo mostramos las semanas de ese mes
  const semanaOptions = useMemo(() => {
    const base = filterMes ? operadores.filter(o => o.mes === filterMes) : operadores;
    return [...new Set(base.map(o => o.semana).filter(Boolean))].sort();
  }, [operadores, filterMes]);

  const filtered = useMemo(() =>
    operadores.filter(o =>
      (!filterMes     || o.mes     === filterMes) &&
      (!filterPais    || o.campana === filterPais) &&
      (!filterSemana  || o.semana  === filterSemana) &&
      (!filterCampana || o.campana === filterCampana)
    ),
  [operadores, filterMes, filterPais, filterSemana, filterCampana]);

  // Enriquecer con comisiones calculadas
  const enriched = useMemo(() =>
    filtered.map(op => {
      const c = calcComision(op);
      return { ...op, comision_ventas: c.ventas, comision_mora: c.mora, comision_total: c.total };
    }),
  [filtered]);

  const paginated  = useMemo(() => enriched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [enriched, page]);
  const totalPages = Math.max(1, Math.ceil(enriched.length / PAGE_SIZE));

  // KPIs
  const kpis = useMemo(() => {
    const activos = enriched.filter(o => o.estado?.toLowerCase() !== 'baja');
    const conActuals = enriched.filter(o => o.comision_total != null);
    const cumplieron = conActuals.filter(o => {
      const p = cumplPct(o.ventas_reales, o.meta_ventas_ajustada);
      return p != null && p >= 85;
    });
    const totalComision = conActuals.reduce((s, o) => s + (o.comision_total || 0), 0);
    return {
      activos: activos.length,
      total: enriched.length,
      cumplieron: cumplieron.length,
      cumplieronPct: conActuals.length > 0 ? (cumplieron.length / conActuals.length) * 100 : null,
      totalComision,
      promedio: conActuals.length > 0 ? totalComision / conActuals.length : null,
    };
  }, [enriched]);

  // Ranking
  const ranking = useMemo(() =>
    [...enriched]
      .filter(o => o.comision_total != null)
      .sort((a, b) => (b.comision_total || 0) - (a.comision_total || 0))
      .slice(0, 10),
  [enriched]);

  const semanaSel = useMemo(() =>
    semanas.find(s => s.nombre === filterSemana),
  [semanas, filterSemana]);

  // ── AI ──

  const fetchInsights = async () => {
    if (enriched.length === 0) return;
    setInsightsLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await generateInsights(enriched, { from: semanaSel?.fecha_desde || today, to: semanaSel?.fecha_hasta || today }, [], userEmail, 'callcenter-operadores');
      setInsights(result);
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading || enriched.length === 0) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await chatWithData(newMsgs, enriched, [], userEmail, 'callcenter-operadores');
      setChatMessages([...newMsgs, { role: 'model' as const, content: reply }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Export ──

  const handleExport = useCallback(() => {
    if (enriched.length === 0) return;
    const rows = enriched.map(o => ({
      Nombre: o.nombre,
      Cédula: o.cedula,
      País: o.campana,
      Antigüedad: o.antiguedad,
      Estado: o.estado,
      Semana: o.semana,
      'Días Lab': o.dias_lab,
      'Días Semana': o.dias_semana,
      Faltas: o.faltas,
      'Penalidad': o.penalty_pct > 0 ? `-${(o.penalty_pct * 100).toFixed(0)}%` : '0%',
      'Meta Ventas': o.meta_ventas,
      'Meta Ventas Ajustada': o.meta_ventas_ajustada,
      'Ventas Reales': o.ventas_reales ?? '',
      '% Cumpl. Ventas': cumplPct(o.ventas_reales, o.meta_ventas_ajustada)?.toFixed(1) ?? '',
      'Comisión Ventas': o.comision_ventas ?? '',
      'Meta Mora %': o.meta_mora,
      'Mora Real %': o.mora_real ?? '',
      'Comisión Mora': o.comision_mora ?? '',
      'Comisión Total': o.comision_total ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comisiones');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `comisiones_${filterSemana || 'todas'}_${today}.xlsx`);
  }, [enriched, filterSemana]);

  // ── Render ──

  if (loading && operadores.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-zinc-400 text-sm">Cargando datos del Callcenter...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Callcenter › Operadores de Ventas</h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            {operadores.length} operadores · {semanas.length} semanas cargadas
            {semanaSel && ` · ${semanaSel.fecha_desde} → ${semanaSel.fecha_hasta}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={enriched.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-zinc-300 text-sm font-bold rounded-xl transition-colors">
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
          <button onClick={loadData} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Actualizar
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {!hasActuals && operadores.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-950/20 border border-amber-600/30 rounded-xl px-4 py-3 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Los datos de ventas reales (Redshift) aún no están conectados. Las comisiones se calcularán automáticamente cuando estén disponibles.</span>
        </div>
      )}

      {hasActuals && unmatchedRedshift.length > 0 && (
        <div className="bg-orange-950/20 border border-orange-600/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="text-orange-400 text-sm font-bold">
              {unmatchedRedshift.length} operador{unmatchedRedshift.length !== 1 ? 'es' : ''} en Redshift sin match en la hoja
            </span>
          </div>
          <p className="text-orange-400/70 text-xs mb-2">Corregí el nombre en la hoja Comisiones del Google Sheet para que coincida:</p>
          <div className="flex flex-wrap gap-1.5">
            {unmatchedRedshift.map((u, i) => (
              <span key={i} className="px-2 py-0.5 bg-orange-900/30 border border-orange-700/30 rounded-lg text-[11px] text-orange-300 font-mono">
                {u.pais.slice(0, 3).toUpperCase()} · {u.operador}
              </span>
            ))}
          </div>
        </div>
      )}

      {operadores.length > 0 && (<>

        {/* Filtros */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 }}
          className="flex flex-wrap items-center gap-3">
          <Filter className="w-3.5 h-3.5 text-zinc-600 shrink-0" />

          {/* Mes */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Mes</span>
            <select value={filterMes} onChange={e => { setFilterMes(e.target.value); setFilterSemana(''); setPage(1); }}
              className="bg-slate-900 border border-slate-700 text-sm text-white rounded-xl px-3 py-1.5 outline-none focus:border-blue-500">
              <option value="">Todos</option>
              {mesOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* País */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">País</span>
            <select value={filterPais} onChange={e => { setFilterPais(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700 text-sm text-white rounded-xl px-3 py-1.5 outline-none focus:border-blue-500">
              <option value="">Todos</option>
              {paisOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Semana */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Semana</span>
            <select value={filterSemana} onChange={e => { setFilterSemana(e.target.value); setPage(1); }}
              className="bg-slate-900 border border-slate-700 text-sm text-white rounded-xl px-3 py-1.5 outline-none focus:border-blue-500">
              <option value="">Todas</option>
              {semanaOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {(filterMes || filterPais) && (
            <button onClick={() => { setFilterMes(''); setFilterPais(''); setFilterSemana(''); setPage(1); }}
              className="flex items-center gap-1.5 mt-5 px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 rounded-lg text-xs text-red-400 font-medium transition-colors">
              <X className="w-3 h-3" /> Limpiar
            </button>
          )}
          <span className="ml-auto text-xs text-zinc-600 mt-5">{enriched.length} operador{enriched.length !== 1 ? 'es' : ''}</span>

        </motion.div>

        {/* KPIs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3">

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Operadores</span>
              <Users className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">{kpis.activos}</p>
            <p className="text-[10px] text-zinc-600">activos en la selección</p>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Cumplimiento ≥85%</span>
              <TrendingUp className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">
              {kpis.cumplieronPct != null ? `${kpis.cumplieronPct.toFixed(0)}%` : '—'}
            </p>
            <p className="text-[10px] text-zinc-600">
              {kpis.cumplieron} de {kpis.total} operadores
            </p>
          </div>

          <div className="bg-slate-900 border border-blue-500/20 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Comisión Total</span>
              <BarChart2 className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-white">
              {kpis.totalComision > 0 ? fmtMoney(kpis.totalComision) : '—'}
            </p>
            <p className="text-[10px] text-zinc-600">estimada período</p>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Promedio Operador</span>
              <Trophy className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">
              {kpis.promedio != null ? fmtMoney(kpis.promedio) : '—'}
            </p>
            <p className="text-[10px] text-zinc-600">por operador</p>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
            {([
              ['detalle',  'Detalle'],
              ['ranking',  'Ranking'],
              ['esquemas', 'Esquemas'],
            ] as const).map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                  activeTab === id
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-500 hover:text-white'
                }`}>{label}</button>
            ))}
          </div>
        </motion.div>

        {/* ── Tab: Detalle ── */}
        {activeTab === 'detalle' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <DualScroll>
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="sticky top-0 z-10 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    {[
                      'Nombre', 'País', 'Campaña', 'Antigüedad', 'Días Lab', 'Faltas',
                      'Penalidad', 'Meta V. Aj.', 'Ventas Reales', '% Cumpl.',
                      'Comisión V.', 'Meta Mora', 'Mora Real', 'Comisión M.', 'Total',
                    ].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((op, i) => {
                    const cp = cumplPct(op.ventas_reales, op.meta_ventas_ajustada);
                    return (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-3 py-2.5 text-white text-xs font-medium whitespace-nowrap">{op.nombre || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            op.campana === 'Argentina' ? 'bg-blue-900/40 text-blue-400' : 'bg-amber-900/40 text-amber-400'
                          }`}>{op.campana?.slice(0, 3).toUpperCase() || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{op.campana || '—'}</td>
                        <td className="px-3 py-2.5 text-zinc-500 text-xs whitespace-nowrap">{op.antiguedad || '—'}</td>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs text-center">{op.dias_lab}</td>
                        <td className="px-3 py-2.5 text-center">
                          {op.faltas > 0
                            ? <span className="text-red-400 text-xs font-bold">{op.faltas}</span>
                            : <span className="text-zinc-600 text-xs">0</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center"><PenaltyBadge pct={op.penalty_pct} /></td>
                        <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{fmtNum(op.meta_ventas_ajustada)}</td>
                        <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">
                          {op.ventas_reales != null ? <span className="text-white font-medium">{fmtNum(op.ventas_reales)}</span> : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center"><CumplBadge pct={cp} /></td>
                        <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">
                          {op.comision_ventas != null ? <span className="text-emerald-400 font-medium">{fmtMoney(op.comision_ventas)}</span> : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400 text-xs text-right whitespace-nowrap">{op.meta_mora > 0 ? `${op.meta_mora}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">
                          {op.mora_real != null ? <span className="text-white font-medium">{op.mora_real}%</span> : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">
                          {op.comision_mora != null ? <span className="text-emerald-400 font-medium">{fmtMoney(op.comision_mora)}</span> : <span className="text-zinc-700">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">
                          {op.comision_total != null ? <span className="text-blue-400 font-bold">{fmtMoney(op.comision_total)}</span> : <span className="text-zinc-700">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DualScroll>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
              <span className="text-xs text-zinc-600">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, enriched.length)} de {enriched.length}
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
        )}

        {/* ── Tab: Ranking ── */}
        {activeTab === 'ranking' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {ranking.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Trophy className="w-8 h-8 text-zinc-700" />
                <p className="text-zinc-500 text-sm">El ranking se mostrará cuando estén disponibles los datos de ventas reales.</p>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Top 10 — Comisión Total</span>
                </div>
                {ranking.map((op, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      i === 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : i === 1 ? 'bg-zinc-400/20 text-zinc-300 border border-zinc-500/40'
                      : i === 2 ? 'bg-orange-700/20 text-orange-400 border border-orange-600/40'
                      : 'bg-slate-800 text-zinc-500 border border-slate-700'
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-white truncate">{op.nombre}</span>
                        <span className="text-sm font-bold text-blue-400 shrink-0">{fmtMoney(op.comision_total)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-600">{op.campana}</span>
                        {op.penalty_pct > 0 && <PenaltyBadge pct={op.penalty_pct} />}
                        <CumplBadge pct={cumplPct(op.ventas_reales, op.meta_ventas_ajustada)} />
                        <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((op.comision_total || 0) / (ranking[0]?.comision_total || 1)) * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Tab: Esquemas ── */}
        {activeTab === 'esquemas' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col gap-4">
            {enriched.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">Sin datos para el período seleccionado.</div>
            ) : (
              [...new Set(enriched.map(o => `${o.semana}||${o.campana}||${o.antiguedad}`))].map(key => {
                const [semana, campana, antiguedad] = key.split('||');
                const op = enriched.find(o => o.semana === semana && o.campana === campana && o.antiguedad === antiguedad);
                if (!op) return null;
                const ev = op.esquema_ventas;
                const em = op.esquema_mora;
                return (
                  <div key={key} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-zinc-300 text-xs font-bold">{semana}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-400 text-xs font-bold">{campana}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-slate-700 text-zinc-400 text-xs">{antiguedad}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Ventas scheme */}
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Escala Ventas</p>
                        {ev ? (
                          <div className="flex flex-col gap-2">
                            {ev.sc_q != null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-amber-400 font-bold">Sobrecumplimiento ({ev.sc_q}+ ventas)</span>
                                <span className="text-xs text-white font-bold">{fmtMoney(ev.sc_m)}</span>
                              </div>
                            )}
                            {ev.m100_q != null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-emerald-400 font-bold">100% ({ev.m100_q} ventas)</span>
                                <span className="text-xs text-white font-bold">{fmtMoney(ev.m100_m)}</span>
                              </div>
                            )}
                            {ev.m85_q != null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400">85% ({ev.m85_q} ventas)</span>
                                <span className="text-xs text-white">{fmtMoney(ev.m85_m)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-zinc-600 text-xs">Sin esquema configurado</p>
                        )}
                      </div>
                      {/* Mora scheme */}
                      <div className="bg-slate-800/50 rounded-xl p-4">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Escala Mora</p>
                        {em ? (
                          <div className="flex flex-col gap-2">
                            {em.sc_p != null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-amber-400 font-bold">Sobrecumplimiento (≤{em.sc_p}%)</span>
                                <span className="text-xs text-white font-bold">{fmtMoney(em.sc_m)}</span>
                              </div>
                            )}
                            {em.m100_p != null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-emerald-400 font-bold">100% (≤{em.m100_p}%)</span>
                                <span className="text-xs text-white font-bold">{fmtMoney(em.m100_m)}</span>
                              </div>
                            )}
                            {em.m85_p != null && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-zinc-400">85% (≤{em.m85_p}%)</span>
                                <span className="text-xs text-white">{fmtMoney(em.m85_m)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-zinc-600 text-xs">Sin esquema configurado</p>
                        )}
                      </div>
                    </div>
                    {/* Penalty info */}
                    <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-4">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Penalidades:</p>
                      <span className="text-xs text-zinc-400">1 falta → -15%</span>
                      <span className="text-xs text-zinc-400">2 faltas → -30%</span>
                      <span className="text-xs text-red-400">3+ faltas → -50%</span>
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}

        {/* AI — Insights + Chat */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-1 xl:grid-cols-2 gap-5">

          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-white">Análisis IA</span>
              </div>
              <button onClick={fetchInsights} disabled={insightsLoading || enriched.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-zinc-300 text-xs font-bold rounded-lg border border-slate-700 transition-colors">
                {insightsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
                Generar
              </button>
            </div>
            <div className="p-5 flex-1">
              {insightsLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
                  <p className="text-zinc-500 text-sm">Analizando {enriched.length} operadores...</p>
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
                  <p className="text-zinc-500 text-sm">Presioná "Generar" para analizar el período.</p>
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
                  <p className="text-zinc-500 text-sm">Consultá sobre comisiones y metas.</p>
                  <p className="text-zinc-600 text-xs">Ej: "¿Quién tiene más faltas esta semana?"</p>
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
                placeholder="Preguntá sobre operadores y comisiones..."
                disabled={enriched.length === 0 || chatLoading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500 transition-colors disabled:opacity-50" />
              <button onClick={handleSendMessage}
                disabled={!chatInput.trim() || chatLoading || enriched.length === 0}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

      </>)}

      {!loading && operadores.length === 0 && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
          <Users className="w-12 h-12 text-zinc-700" />
          <p className="text-zinc-500 text-sm">No se encontraron operadores. Verificá que el Google Sheet esté compartido con la cuenta de servicio.</p>
        </div>
      )}
    </div>
  );
}
