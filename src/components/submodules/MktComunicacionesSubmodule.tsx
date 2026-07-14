import { useState, useEffect, useMemo, useRef, useCallback, ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, AlertCircle, RefreshCcw, Sparkles, Send, Bot, User,
  MessageSquare, Layers, ChevronLeft, ChevronRight, Filter, X, TrendingUp,
} from 'lucide-react';
import MultiSelect from '../ui/MultiSelect';
import { Chart, registerables } from 'chart.js';
import { generateInsights, chatWithData } from '../../services/gemini';

Chart.register(...registerables);

// ── Types ────────────────────────────────────────────────────────────────────

interface ComunicacionRecord {
  fecha_envio: string;
  plataforma: string;
  proveedor: string;
  canal: string;
  pais: string;
  tipo_mensaje: string;
  sender: string;
  total_envios: number;
}

interface Props { userEmail?: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultDates() {
  const today = new Date();
  const desde = new Date(today.getFullYear(), today.getMonth() - 5, 1); // 6 meses atrás, 1° del mes
  return { desde: desde.toISOString().slice(0, 10), hasta: today.toISOString().slice(0, 10) };
}

const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtNum = (n: number) => fmt.format(Math.round(n));
const fmtDate = (d: string) => d ? d.slice(0, 10) : '—';

const PAGE_SIZE = 20;

const PALETTE = [
  '#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
  '#a78bfa','#fb923c','#34d399','#f87171','#60a5fa',
];

// Plugin inline que dibuja el valor sobre cada punto
const dataLabelsPlugin = {
  id: 'mktDataLabels',
  afterDatasetsDraw(chart: Chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      meta.data.forEach((el, idx) => {
        const v = ds.data[idx] as number;
        if (!v) return;
        ctx.save();
        ctx.fillStyle = (ds.borderColor as string) || '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v), el.x, el.y - 4);
        ctx.restore();
      });
    });
  },
};

// ── LineChart ─────────────────────────────────────────────────────────────────

interface LineDataset { label: string; data: number[]; color: string }

function LineChart({ labels, datasets, title }: { labels: string[]; datasets: LineDataset[]; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || labels.length === 0) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map(ds => ({
          label: ds.label,
          data: ds.data,
          borderColor: ds.color,
          backgroundColor: ds.color + '22',
          pointBackgroundColor: ds.color,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${new Intl.NumberFormat('es-AR').format(ctx.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#6b7280', font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
          y: {
            ticks: { color: '#6b7280', font: { size: 10 }, callback: v => new Intl.NumberFormat('es-AR').format(Number(v)) },
            grid: { color: 'rgba(255,255,255,0.06)' },
          },
        },
      },
      plugins: [dataLabelsPlugin],
    });
    return () => { chartRef.current?.destroy(); };
  }, [labels, datasets]);

  if (labels.length === 0) return (
    <div className="flex items-center justify-center h-40 text-zinc-600 text-sm">Sin datos para el período</div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-zinc-500" />
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      <div style={{ height: Math.max(220, datasets.length * 28 + 140) }}>
        <canvas ref={canvasRef} />
      </div>
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

export default function MktComunicacionesSubmodule({ userEmail }: Props) {
  const dates        = useMemo(defaultDates, []);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [records, setRecords] = useState<ComunicacionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [desde, setDesde] = useState(dates.desde);
  const [hasta, setHasta] = useState(dates.hasta);

  const [filterPais,       setFilterPais]       = useState<string[]>([]);
  const [filterCanal,      setFilterCanal]      = useState<string[]>([]);
  const [filterTipo,       setFilterTipo]       = useState<string[]>([]);
  const [filterSender,     setFilterSender]     = useState<string[]>([]);
  const [filterPlataforma, setFilterPlataforma] = useState<string[]>([]);
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
      const res = await fetch(`/api/comunicaciones?fecha_desde=${desde}&fecha_hasta=${hasta}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Error al cargar datos');
      const data = await res.json();
      setRecords(data.records);
      setPage(1);

      if (data.records.length > 0) {
        setInsightsLoading(true);
        try {
          const result = await generateInsights(
            data.records, { from: desde, to: hasta }, [], userEmail, 'marketing-comunicaciones'
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

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  // ── Derived ──

  const filtered = useMemo(() => records.filter(r =>
    (!filterPais.length       || filterPais.includes(r.pais)) &&
    (!filterCanal.length      || filterCanal.includes(r.canal)) &&
    (!filterTipo.length       || filterTipo.includes(r.tipo_mensaje)) &&
    (!filterSender.length     || filterSender.includes(r.sender)) &&
    (!filterPlataforma.length || filterPlataforma.includes(r.plataforma))
  ), [records, filterPais, filterCanal, filterTipo, filterSender, filterPlataforma]);

  const paginated  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Cascading filter options — each excludes its own filter when computing options
  const canalOptions = useMemo(() => {
    const base = records.filter(r =>
      (!filterPais.length       || filterPais.includes(r.pais)) &&
      (!filterTipo.length       || filterTipo.includes(r.tipo_mensaje)) &&
      (!filterSender.length     || filterSender.includes(r.sender)) &&
      (!filterPlataforma.length || filterPlataforma.includes(r.plataforma))
    );
    return [...new Set(base.map(r => r.canal).filter(Boolean))].sort();
  }, [records, filterPais, filterTipo, filterSender, filterPlataforma]);

  const tipoOptions = useMemo(() => {
    const base = records.filter(r =>
      (!filterPais.length       || filterPais.includes(r.pais)) &&
      (!filterCanal.length      || filterCanal.includes(r.canal)) &&
      (!filterSender.length     || filterSender.includes(r.sender)) &&
      (!filterPlataforma.length || filterPlataforma.includes(r.plataforma))
    );
    return [...new Set(base.map(r => r.tipo_mensaje).filter(Boolean))].sort();
  }, [records, filterPais, filterCanal, filterSender, filterPlataforma]);

  const senderOptions = useMemo(() => {
    const base = records.filter(r =>
      (!filterPais.length       || filterPais.includes(r.pais)) &&
      (!filterCanal.length      || filterCanal.includes(r.canal)) &&
      (!filterTipo.length       || filterTipo.includes(r.tipo_mensaje)) &&
      (!filterPlataforma.length || filterPlataforma.includes(r.plataforma))
    );
    return [...new Set(base.map(r => r.sender).filter(Boolean))].sort();
  }, [records, filterPais, filterCanal, filterTipo, filterPlataforma]);

  const plataformaOptions = useMemo(() => {
    const base = records.filter(r =>
      (!filterPais.length   || filterPais.includes(r.pais)) &&
      (!filterCanal.length  || filterCanal.includes(r.canal)) &&
      (!filterTipo.length   || filterTipo.includes(r.tipo_mensaje)) &&
      (!filterSender.length || filterSender.includes(r.sender))
    );
    return [...new Set(base.map(r => r.plataforma).filter(Boolean))].sort();
  }, [records, filterPais, filterCanal, filterTipo, filterSender]);

  // KPIs
  const kpis = useMemo(() => {
    const totalEnvios = (pais: string) =>
      filtered.filter(r => r.pais === pais).reduce((s, r) => s + (Number(r.total_envios) || 0), 0);
    return {
      arg:     totalEnvios('Argentina'),
      col:     totalEnvios('Colombia'),
      canales: new Set(filtered.map(r => r.canal).filter(Boolean)).size,
      tipos:   new Set(filtered.map(r => r.tipo_mensaje).filter(Boolean)).size,
    };
  }, [filtered]);

  // ── Chart data ──

  const buildLineChart = (keyFn: (r: ComunicacionRecord) => string) => {
    const dates = [...new Set(filtered.map(r => r.fecha_envio?.slice(0, 10)).filter(Boolean))].sort() as string[];
    const keys  = [...new Set(filtered.map(keyFn).filter(Boolean))].sort();
    const datasets: LineDataset[] = keys.map((key, i) => ({
      label: key,
      color: PALETTE[i % PALETTE.length],
      data: dates.map(d =>
        filtered
          .filter(r => r.fecha_envio?.startsWith(d) && keyFn(r) === key)
          .reduce((s, r) => s + (Number(r.total_envios) || 0), 0)
      ),
    }));
    return { labels: dates, datasets };
  };

  const chartPlatCanal = useMemo(
    () => buildLineChart(r => [r.plataforma, r.canal].filter(Boolean).join(' / ')),
    [filtered] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const chartTipo = useMemo(
    () => buildLineChart(r => r.tipo_mensaje),
    [filtered] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── AI ──

  const fetchInsights = async () => {
    if (filtered.length === 0) return;
    setInsightsLoading(true);
    try {
      const result = await generateInsights(filtered, { from: desde, to: hasta }, [], userEmail, 'marketing-comunicaciones');
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
      const reply = await chatWithData(newMsgs, filtered.length > 0 ? filtered : records, [], userEmail, 'marketing-comunicaciones');
      setChatMessages([...newMsgs, { role: 'model' as const, content: reply }]);
    } finally {
      setChatLoading(false);
    }
  };

  const clearFilters = () => {
    setFilterPais([]); setFilterCanal([]); setFilterTipo([]); setFilterSender([]); setFilterPlataforma([]); setPage(1);
  };
  const hasFilters = filterPais.length > 0 || filterCanal.length > 0 || filterTipo.length > 0 || filterSender.length > 0 || filterPlataforma.length > 0;

  if (loading && records.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-zinc-400 text-sm">Cargando datos de comunicaciones...</p>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Marketing › Comunicaciones</h2>
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
            <p className="text-2xl font-bold text-white">{fmtNum(kpis.arg)}</p>
            <p className="text-[10px] text-zinc-500">total envíos</p>
          </div>

          <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">COL</span>
              <span className="text-[10px] text-zinc-600 font-bold">Colombia</span>
            </div>
            <p className="text-2xl font-bold text-white">{fmtNum(kpis.col)}</p>
            <p className="text-[10px] text-zinc-500">total envíos</p>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Canales</span>
              <Layers className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">{kpis.canales}</p>
            <p className="text-[10px] text-zinc-600">únicos</p>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tipos mensaje</span>
              <MessageSquare className="w-3.5 h-3.5 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">{kpis.tipos}</p>
            <p className="text-[10px] text-zinc-600">únicos</p>
          </div>
        </motion.div>

        {/* Filtros */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="flex flex-wrap items-end gap-4">
          <Filter className="w-3.5 h-3.5 text-zinc-600 shrink-0 mb-2" />

          <MultiSelect label="País" options={['Argentina', 'Colombia']}
            value={filterPais} onChange={v => { setFilterPais(v); setPage(1); }} />

          <MultiSelect label="Plataforma" options={plataformaOptions}
            value={filterPlataforma} onChange={v => { setFilterPlataforma(v); setPage(1); }} />

          <MultiSelect label="Canal" options={canalOptions}
            value={filterCanal} onChange={v => { setFilterCanal(v); setPage(1); }} />

          <MultiSelect label="Tipo mensaje" options={tipoOptions}
            value={filterTipo} onChange={v => { setFilterTipo(v); setPage(1); }} />

          <MultiSelect label="Sender" options={senderOptions}
            value={filterSender} onChange={v => { setFilterSender(v); setPage(1); }} />

          {hasFilters && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] invisible select-none">·</span>
              <button onClick={clearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 rounded-lg text-xs text-red-400 font-medium transition-colors">
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            </div>
          )}
          <span className="ml-auto text-xs text-zinc-600 mb-2">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
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
                  <p className="text-zinc-500 text-sm">Preguntá sobre las comunicaciones.</p>
                  <p className="text-zinc-600 text-xs">Ej: "¿Qué canal tuvo más envíos en Argentina?"</p>
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
                placeholder="Preguntá sobre las comunicaciones..."
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

        {/* Gráficos evolutivos */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex flex-col gap-5">

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <LineChart
              title="Evolución de envíos por plataforma / canal"
              labels={chartPlatCanal.labels}
              datasets={chartPlatCanal.datasets}
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <LineChart
              title="Evolución de envíos por tipo de mensaje"
              labels={chartTipo.labels}
              datasets={chartTipo.datasets}
            />
          </div>
        </motion.div>

        {/* Tabla — todos los campos */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <DualScroll>
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-slate-900">
                <tr className="border-b border-slate-800">
                  {['Fecha', 'País', 'Plataforma', 'Proveedor', 'Canal', 'Tipo Mensaje', 'Sender', 'Total Envíos'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{fmtDate(r.fecha_envio)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.pais === 'Argentina' ? 'bg-blue-900/40 text-blue-400' : 'bg-amber-900/40 text-amber-400'}`}>
                        {r.pais === 'Argentina' ? 'ARG' : r.pais === 'Colombia' ? 'COL' : r.pais}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{r.plataforma || '—'}</td>
                    <td className="px-3 py-2.5 text-white text-xs whitespace-nowrap">{r.proveedor || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{r.canal || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{r.tipo_mensaje || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs whitespace-nowrap">{r.sender || '—'}</td>
                    <td className="px-3 py-2.5 text-white text-xs font-medium whitespace-nowrap text-right">{fmtNum(Number(r.total_envios) || 0)}</td>
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

      </>)}
    </div>
  );
}
