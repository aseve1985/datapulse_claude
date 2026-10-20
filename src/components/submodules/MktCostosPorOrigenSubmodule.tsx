// src/components/submodules/MktCostosPorOrigenSubmodule.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Download, ChevronDown, Bot, User, Send, HelpCircle, X } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import * as XLSX from 'xlsx';
import MultiSelect from '../ui/MultiSelect';
import DualScroll from '../ui/DualScroll';
import { fetchCostosPorOrigenMensual } from '../../services/api';
import { chatWithData } from '../../services/gemini';
import {
  aggregateKpis, aggregateByOrigen, buildTableRows, sortTableRows, getDistinctOrigenes, getVariacionPct,
  mesesAtras, generarRangoMeses, origenKey,
  type CostoOrigenRow, type Moneda, type SortBy,
} from './costosPorOrigenHelpers';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const PALETTE = ['#60a5fa', '#f59e0b', '#34d399', '#f87171', '#a78bfa', '#06b6d4', '#f97316', '#84cc16'];

const fmtMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`;
};

// USD lleva 2 decimales — los montos de marketing en dólares son chicos y el
// redondeo a entero se come la sensibilidad que importa para comparar orígenes.
const formatMonto = (v: number, moneda: Moneda, pais: string) => {
  if (moneda === 'usd') return `USD ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const redondeado = Math.round(v).toLocaleString('es-AR');
  return `${pais === 'ARG' ? '$' : 'COP'} ${redondeado}`;
};

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'origen', label: 'Origen' },
  { value: 'mes', label: 'Mes' },
  { value: 'cpl', label: 'CPL' },
  { value: 'cpm', label: 'CPM' },
  { value: 'cpo', label: 'CPO' },
  { value: 'cpv', label: 'CPV' },
];

const formatPct = (v: number | null) =>
  v === null ? '—' : `${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

type PaisFiltro = 'ARG' | 'COL' | 'AMBOS';

interface Props { userEmail?: string; }

export default function MktCostosPorOrigenSubmodule({ userEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<CostoOrigenRow[]>([]);

  const [pais, setPais] = useState<PaisFiltro>('ARG');
  const [mesesSeleccionados, setMesesSeleccionados] = useState<string[]>([]); // 'YYYY-MM'
  const [origenesSeleccionados, setOrigenesSeleccionados] = useState<string[]>([]);
  const [monedaUsuario, setMonedaUsuario] = useState<Moneda>('local');
  const [sortBy, setSortBy] = useState<SortBy>('origen');

  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [showGlosario, setShowGlosario] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { rows } = await fetchCostosPorOrigenMensual();
        setAllRows(rows.map((r: any) => ({ ...r, mes: String(r.mes).slice(0, 10), fecha_corte: String(r.fecha_corte).slice(0, 10) })));
      } catch (err: any) {
        setError(err.message || 'Error al cargar Costos por origen');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const monedaEfectiva: Moneda = pais === 'AMBOS' ? 'usd' : monedaUsuario;

  const rowsPais = useMemo(
    () => (pais === 'AMBOS' ? allRows : allRows.filter(r => r.pais === pais)),
    [allRows, pais]
  );
  const origenesDisponibles = useMemo(() => getDistinctOrigenes(rowsPais), [rowsPais]);
  const origenesKeysDisponibles = useMemo(() => origenesDisponibles.map(o => origenKey(o.pais, o.origen)), [origenesDisponibles]);

  // Meses disponibles ('YYYY-MM') para el país elegido, agrupados en árbol Año → Mes.
  const mesesDisponibles = useMemo(
    () => [...new Set(rowsPais.map(r => r.mes.slice(0, 7)))].sort(),
    [rowsPais]
  );
  const arbolMeses = useMemo(() => {
    const porAnio = new Map<string, string[]>();
    for (const m of mesesDisponibles) {
      const anio = m.slice(0, 4);
      if (!porAnio.has(anio)) porAnio.set(anio, []);
      porAnio.get(anio)!.push(m);
    }
    return [...porAnio.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([anio, meses]) => ({ anio, meses }));
  }, [mesesDisponibles]);

  // Arrancamos con todos los orígenes disponibles tildados, y los reseteamos al
  // cambiar de país. Depender de `origenesKeysDisponibles` (no solo de `pais`) es
  // clave: en el primer render los datos todavía no llegaron del backend y esta
  // lista está vacía, así que el efecto tiene que volver a correr cuando se puebla
  // — si dependiera solo de `pais` quedaba pisado en [] para siempre hasta que el
  // usuario tocara el filtro de país de nuevo.
  useEffect(() => {
    if (origenesKeysDisponibles.length === 0) {
      if (origenesSeleccionados.length !== 0) setOrigenesSeleccionados([]);
    } else if (origenesSeleccionados.some(k => !origenesKeysDisponibles.includes(k)) || origenesSeleccionados.length === 0) {
      setOrigenesSeleccionados(origenesKeysDisponibles);
    }
  }, [origenesKeysDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mismo patrón que arriba: arrancamos (y reseteamos al cambiar de país) con los
  // últimos 6 meses disponibles tildados.
  useEffect(() => {
    if (mesesDisponibles.length === 0) {
      if (mesesSeleccionados.length !== 0) setMesesSeleccionados([]);
    } else if (mesesSeleccionados.some(m => !mesesDisponibles.includes(m)) || mesesSeleccionados.length === 0) {
      setMesesSeleccionados(mesesDisponibles.slice(-6));
    }
  }, [mesesDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

  const mesesSeleccionadosOrdenados = useMemo(() => [...mesesSeleccionados].sort(), [mesesSeleccionados]);

  const rowsFiltrados = useMemo(() => {
    const seleccionOrigen = new Set(origenesSeleccionados);
    const seleccionMeses = new Set(mesesSeleccionadosOrdenados.map(m => `${m}-01`));
    return rowsPais.filter(r => seleccionMeses.has(r.mes) && seleccionOrigen.has(origenKey(r.pais, r.origen)));
  }, [rowsPais, mesesSeleccionadosOrdenados, origenesSeleccionados]);

  const kpis = useMemo(() => aggregateKpis(rowsFiltrados), [rowsFiltrados]);

  // Período anterior: el mismo N° de meses, terminando justo antes del mes
  // seleccionado más temprano. Si la selección no es contigua (ej. tildaron solo
  // Enero y Agosto), igual define un período anterior consistente y de igual largo.
  const rowsPeriodoAnterior = useMemo(() => {
    if (mesesSeleccionadosOrdenados.length === 0) return [];
    const n = mesesSeleccionadosOrdenados.length;
    const earliest = `${mesesSeleccionadosOrdenados[0]}-01`;
    const prevMeses = new Set(generarRangoMeses(mesesAtras(earliest, n), n));
    const seleccionOrigen = new Set(origenesSeleccionados);
    return rowsPais.filter(r => prevMeses.has(r.mes) && seleccionOrigen.has(origenKey(r.pais, r.origen)));
  }, [rowsPais, mesesSeleccionadosOrdenados, origenesSeleccionados]);

  const kpisAnterior = useMemo(() => aggregateKpis(rowsPeriodoAnterior), [rowsPeriodoAnterior]);

  const cplActual = monedaEfectiva === 'usd' ? kpis.cplUsd : kpis.cpl;
  const cmActual = monedaEfectiva === 'usd' ? kpis.cpmUsd : kpis.cpm;
  const cpoActual = monedaEfectiva === 'usd' ? kpis.cpoUsd : kpis.cpo;
  const cpvActual = monedaEfectiva === 'usd' ? kpis.cpvUsd : kpis.cpv;
  const cplAnterior = monedaEfectiva === 'usd' ? kpisAnterior.cplUsd : kpisAnterior.cpl;
  const cmAnterior = monedaEfectiva === 'usd' ? kpisAnterior.cpmUsd : kpisAnterior.cpm;
  const cpoAnterior = monedaEfectiva === 'usd' ? kpisAnterior.cpoUsd : kpisAnterior.cpo;
  const cpvAnterior = monedaEfectiva === 'usd' ? kpisAnterior.cpvUsd : kpisAnterior.cpv;

  const tableRows = useMemo(() => buildTableRows(rowsFiltrados, monedaEfectiva), [rowsFiltrados, monedaEfectiva]);
  const tableRowsOrdenadas = useMemo(() => sortTableRows(tableRows, sortBy), [tableRows, sortBy]);

  const fechaCorte = useMemo(
    () => rowsFiltrados.reduce((max, r) => (r.fecha_corte > max ? r.fecha_corte : max), ''),
    [rowsFiltrados]
  );

  // ── Exportar ──────────────────────────────────────────────────────────────────

  const filasExport = useMemo(() => tableRowsOrdenadas.map(r => ({
    País: r.pais,
    Origen: r.origen,
    Mes: r.mes ? fmtMes(r.mes) : '',
    Leads: r.leads,
    Motor: r.motor,
    Ofertas: r.ofertas,
    Ventas: r.ventas,
    'Capital desembolsado': r.capitalVendido,
    'Costo operativo': r.costoOperativo,
    'Costo marketing': r.costoMarketing,
    'Costo total': r.costoTotal,
    CPL: r.cpl,
    CPM: r.cpm,
    CPO: r.cpo,
    CPV: r.cpv,
    '% Costo operativo / Capital': r.pctCostoOperativo,
    '% Costo marketing / Capital': r.pctCostoMarketing,
    '% Costo total / Capital': r.pctCostoTotal,
  })), [tableRowsOrdenadas]);

  const nombreArchivoExport = `costos_origen_${pais.toLowerCase()}_${mesesSeleccionadosOrdenados[0] ?? 'na'}_${mesesSeleccionadosOrdenados[mesesSeleccionadosOrdenados.length - 1] ?? 'na'}`;

  const handleExportExcel = () => {
    if (filasExport.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(filasExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Costos por origen');
    XLSX.writeFile(wb, `${nombreArchivoExport}.xlsx`);
  };

  const handleExportCSV = () => {
    if (filasExport.length === 0) return;
    const headers = Object.keys(filasExport[0]).join(',');
    const rows = filasExport
      .map(row => Object.values(row).map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nombreArchivoExport}.csv`;
    link.click();
  };

  // ── Chat con los datos ───────────────────────────────────────────────────────

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading || rowsFiltrados.length === 0) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);
    try {
      const activeFilters = [
        { field: 'país', values: [pais] },
        { field: 'origen', values: origenesEnSeleccion.map(etiquetaOrigen) },
        { field: 'moneda', values: [monedaEfectiva] },
      ];
      const reply = await chatWithData(newMsgs, rowsFiltrados, activeFilters, userEmail, 'marketing-costos-origen');
      setChatMessages([...newMsgs, { role: 'model' as const, content: reply }]);
    } catch (err: any) {
      setChatMessages([...newMsgs, { role: 'model' as const, content: `Hubo un error al procesar tu pregunta: ${err.message || err}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── Datos para gráficos ──────────────────────────────────────────────────────

  const origenesEnSeleccion = useMemo(
    () => origenesDisponibles.filter(o => origenesSeleccionados.includes(origenKey(o.pais, o.origen))),
    [origenesDisponibles, origenesSeleccionados]
  );

  const mesesOrdenados = useMemo(
    () => [...new Set(rowsFiltrados.map(r => r.mes))].sort(),
    [rowsFiltrados]
  );

  const etiquetaOrigen = (o: { pais: string; origen: string }) => (pais === 'AMBOS' ? `${o.origen} (${o.pais})` : o.origen);

  // ── Gráfico 1: Evolución del CPV por origen (línea, punteada en cohortes abiertas)

  const cpvChartRef = useRef<HTMLCanvasElement>(null);
  const cpvChartInst = useRef<Chart | null>(null);

  useEffect(() => {
    cpvChartInst.current?.destroy();
    if (!cpvChartRef.current || mesesOrdenados.length === 0 || origenesEnSeleccion.length === 0) return;

    const datasets = origenesEnSeleccion.map((o, i) => {
      const porMes = new Map(
        rowsFiltrados.filter(r => r.pais === o.pais && r.origen === o.origen).map(r => [r.mes, r])
      );
      const data = mesesOrdenados.map(m => {
        const r = porMes.get(m);
        if (!r) return null;
        return monedaEfectiva === 'usd' ? r.cpv_usd : r.cpv;
      });
      const abiertas = mesesOrdenados.map(m => porMes.get(m)?.es_cohorte_abierta ?? false);
      const color = PALETTE[i % PALETTE.length];
      return {
        label: etiquetaOrigen(o),
        data,
        borderColor: color,
        backgroundColor: color + '22',
        pointBackgroundColor: color,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.25,
        spanGaps: true,
        segment: {
          borderDash: (ctx: any) => (abiertas[ctx.p1DataIndex] ? [6, 4] : undefined),
        },
      };
    });

    cpvChartInst.current = new Chart(cpvChartRef.current, {
      type: 'line',
      data: { labels: mesesOrdenados.map(fmtMes), datasets: datasets as any },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12, padding: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y === null ? '—' : formatMonto(ctx.parsed.y, monedaEfectiva, pais === 'AMBOS' ? 'ARG' : pais)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      },
    });

    return () => { cpvChartInst.current?.destroy(); };
  }, [mesesOrdenados, origenesEnSeleccion, rowsFiltrados, monedaEfectiva, pais]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gráfico 2: Composición del costo (operativo vs. marketing) por origen ────

  const composicionChartRef = useRef<HTMLCanvasElement>(null);
  const composicionChartInst = useRef<Chart | null>(null);

  const subtotalesPorOrigen = useMemo(() => aggregateByOrigen(rowsFiltrados, monedaEfectiva), [rowsFiltrados, monedaEfectiva]);

  useEffect(() => {
    composicionChartInst.current?.destroy();
    if (!composicionChartRef.current || subtotalesPorOrigen.length === 0) return;

    composicionChartInst.current = new Chart(composicionChartRef.current, {
      type: 'bar',
      data: {
        labels: subtotalesPorOrigen.map(r => (pais === 'AMBOS' ? `${r.origen} (${r.pais})` : r.origen)),
        datasets: [
          { label: 'Costo operativo', data: subtotalesPorOrigen.map(r => r.costoOperativo), backgroundColor: '#60a5fa', stack: 'costo' },
          { label: 'Costo marketing', data: subtotalesPorOrigen.map(r => r.costoMarketing), backgroundColor: '#f59e0b', stack: 'costo' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12, padding: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${formatMonto(Number(ctx.parsed.y) || 0, monedaEfectiva, pais === 'AMBOS' ? 'ARG' : pais)}`,
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      },
    });

    return () => { composicionChartInst.current?.destroy(); };
  }, [subtotalesPorOrigen, monedaEfectiva, pais]);

  // ── Gráfico 3: Funnel de conversión por origen ───────────────────────────────

  const funnelChartRef = useRef<HTMLCanvasElement>(null);
  const funnelChartInst = useRef<Chart | null>(null);

  useEffect(() => {
    funnelChartInst.current?.destroy();
    if (!funnelChartRef.current || origenesEnSeleccion.length === 0) return;

    const datasets = origenesEnSeleccion.map((o, i) => {
      const origenRows = rowsFiltrados.filter(r => r.pais === o.pais && r.origen === o.origen);
      const agg = aggregateKpis(origenRows);
      const color = PALETTE[i % PALETTE.length];
      return {
        label: etiquetaOrigen(o),
        data: [
          agg.convLeadMotor === null ? null : agg.convLeadMotor * 100,
          agg.convMotorOferta === null ? null : agg.convMotorOferta * 100,
          agg.convOfertaVenta === null ? null : agg.convOfertaVenta * 100,
        ],
        backgroundColor: color,
      };
    });

    funnelChartInst.current = new Chart(funnelChartRef.current, {
      type: 'bar',
      data: { labels: ['Lead → Motor', 'Motor → Oferta', 'Oferta → Venta'], datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y === null ? 'sin datos' : `${Number(ctx.parsed.y).toFixed(1)}%`}` } },
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#6b7280', font: { size: 10 }, callback: v => `${v}%` }, grid: { color: 'rgba(255,255,255,0.06)' } },
        },
      },
    });

    return () => { funnelChartInst.current?.destroy(); };
  }, [origenesEnSeleccion, rowsFiltrados]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-zinc-400 text-sm">Cargando Costos por origen...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-rose-400">
        <AlertCircle className="w-5 h-5" /> {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Marketing › Costos por origen</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Costo de adquisición del negocio nuevo, abierto por proveedor de originación.</p>
        </div>
        <button onClick={() => setShowGlosario(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors shrink-0">
          <HelpCircle className="w-3.5 h-3.5" /> Glosario
        </button>
      </motion.div>

      {showGlosario && <GlosarioModal onClose={() => setShowGlosario(false)} />}

      {/* Filtros */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
        className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">País</span>
          <select value={pais} onChange={e => setPais(e.target.value as PaisFiltro)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
            <option value="ARG">Argentina</option>
            <option value="COL">Colombia</option>
            <option value="AMBOS">Ambos (USD)</option>
          </select>
        </div>

        <MesJerarquicoFilter arbol={arbolMeses} seleccionados={mesesSeleccionados} onChange={setMesesSeleccionados} />

        <MultiSelect
          label="Origen"
          options={origenesKeysDisponibles}
          value={origenesSeleccionados}
          onChange={setOrigenesSeleccionados}
          optionLabels={Object.fromEntries(origenesDisponibles.map(o => [origenKey(o.pais, o.origen), etiquetaOrigen(o)]))}
        />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Moneda</span>
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            <button type="button" disabled={pais === 'AMBOS'} onClick={() => setMonedaUsuario('local')}
              className={`px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${monedaEfectiva === 'local' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}`}>
              Local
            </button>
            <button type="button" disabled={pais === 'AMBOS'} onClick={() => setMonedaUsuario('usd')}
              className={`px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${monedaEfectiva === 'usd' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}`}>
              USD
            </button>
          </div>
        </div>
      </motion.div>

      {rowsFiltrados.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-12">Sin datos para estos filtros.</div>
      ) : (
        <>
          {/* Cards KPI */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard titulo="CPL — Costo por lead" valor={cplActual} anterior={cplAnterior}
              moneda={monedaEfectiva} pais={pais === 'AMBOS' ? 'ARG' : pais}
              esEstimado={kpis.esEstimado} esCohorteAbierta={kpis.esCohorteAbierta} />
            <KpiCard titulo="CPM — Costo por pegada de motor" valor={cmActual} anterior={cmAnterior}
              moneda={monedaEfectiva} pais={pais === 'AMBOS' ? 'ARG' : pais}
              esEstimado={kpis.esEstimado} esCohorteAbierta={kpis.esCohorteAbierta} />
            <KpiCard titulo="CPO — Costo por oferta" valor={cpoActual} anterior={cpoAnterior}
              moneda={monedaEfectiva} pais={pais === 'AMBOS' ? 'ARG' : pais}
              esEstimado={kpis.esEstimado} esCohorteAbierta={kpis.esCohorteAbierta} />
            <KpiCard titulo="CPV — Costo por venta" valor={cpvActual} anterior={cpvAnterior}
              moneda={monedaEfectiva} pais={pais === 'AMBOS' ? 'ARG' : pais}
              esEstimado={kpis.esEstimado} esCohorteAbierta={kpis.esCohorteAbierta} />
          </motion.div>

          {/* Tabla principal */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Ordenar por</span>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-zinc-300 hover:bg-slate-700 transition-colors">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
                <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-500 transition-colors shadow-lg shadow-blue-900/20">
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              </div>
            </div>
            <DualScroll maxHeight="60vh">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="sticky top-0 z-10 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    {['País', 'Origen', 'Mes', 'Leads', 'Motor', 'Ofertas', 'Ventas', 'Capital desembolsado', 'Costo operativo', 'Costo marketing', 'Costo total', 'CPL', 'CPM', 'CPO', 'CPV', '% Operativo/Capital', '% Marketing/Capital', '% Total/Capital'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRowsOrdenadas.map(r => (
                    <tr key={r.key} className={`border-b border-slate-800/50 ${r.esTotal ? 'bg-slate-800/60 font-bold' : 'hover:bg-slate-800/30'} transition-colors`}>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.pais === 'ARG' ? 'bg-blue-900/40 text-blue-400' : r.pais === 'COL' ? 'bg-amber-900/40 text-amber-400' : 'bg-slate-700/60 text-zinc-400'}`}>
                          {r.pais}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-white text-xs whitespace-nowrap">
                        {r.origen}
                        {r.esEstimado && <Badge titulo="Estimado" tooltip="Los costos de este mes todavía no están cargados. Se usa el último mes disponible, prorrateado por días si es el mes en curso." color="amber" />}
                        {r.esCohorteAbierta && <Badge titulo="Cohorte abierta" tooltip="Hay leads de esta cohorte con menos de 30 días. CPM, CPO y CPV pueden bajar a medida que conviertan." color="blue" />}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{r.mes ? fmtMes(r.mes) : '—'}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.leads.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.motor.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.ofertas.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.ventas.toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{formatMonto(r.capitalVendido, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{formatMonto(r.costoOperativo, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{formatMonto(r.costoMarketing, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-white text-xs font-bold text-right whitespace-nowrap">{formatMonto(r.costoTotal, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.cpl === null ? '—' : formatMonto(r.cpl, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.cpm === null ? '—' : formatMonto(r.cpm, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.cpo === null ? '—' : formatMonto(r.cpo, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-blue-400 text-xs font-bold text-right whitespace-nowrap">{r.cpv === null ? '—' : formatMonto(r.cpv, monedaEfectiva, r.pais)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{formatPct(r.pctCostoOperativo)}</td>
                      <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{formatPct(r.pctCostoMarketing)}</td>
                      <td className="px-3 py-2.5 text-white text-xs font-bold text-right whitespace-nowrap">{formatPct(r.pctCostoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DualScroll>
          </motion.div>

          {/* Gráficos */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="flex flex-col gap-5">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-bold text-white">Evolución del CPV por origen</span>
              </div>
              <div style={{ height: Math.max(220, origenesEnSeleccion.length * 24 + 140) }}>
                <canvas ref={cpvChartRef} />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-bold text-white">Composición del costo por origen</span>
              </div>
              <div style={{ height: 260 }}>
                <canvas ref={composicionChartRef} />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-bold text-white">Funnel por origen</span>
              </div>
              <div style={{ height: 260 }}>
                <canvas ref={funnelChartRef} />
              </div>
            </div>
          </motion.div>

          {/* Chat con los datos */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden" style={{ height: 440 }}>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800 shrink-0">
              <Bot className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-bold text-white">Chat con los datos</span>
            </div>
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 h-full py-8 text-center">
                  <Bot className="w-7 h-7 text-zinc-700" />
                  <p className="text-zinc-500 text-sm">Preguntá sobre los costos por origen.</p>
                  <p className="text-zinc-600 text-xs">Ej: "¿Qué origen tiene el CPV más bajo este período?"</p>
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
                placeholder="Preguntá sobre los costos por origen..."
                disabled={rowsFiltrados.length === 0 || chatLoading}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-blue-500 transition-colors disabled:opacity-50" />
              <button onClick={handleSendMessage}
                disabled={!chatInput.trim() || chatLoading || rowsFiltrados.length === 0}
                className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

          <p className="text-zinc-600 text-[11px] text-center">
            Datos al {fechaCorte || '—'}. Mes = mes de creación del lead. Ventana de conversión: 30 días.
          </p>
        </>
      )}
    </div>
  );
}

// Filtro de meses en árbol Año → Mes, con checks para elegir uno, varios o todos
// (como una jerarquía de Power BI). Reemplaza el rango Desde/Hasta — la selección
// no necesita ser contigua.
function MesJerarquicoFilter({ arbol, seleccionados, onChange }: {
  arbol: { anio: string; meses: string[] }[]; seleccionados: string[]; onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Por default mostramos todos los años expandidos — el rango de datos es chico
  // (suele ser un año o dos), así que no vale la pena arrancar todo colapsado.
  useEffect(() => { setExpandidos(new Set(arbol.map(a => a.anio))); }, [arbol]);

  const todosLosMeses = useMemo(() => arbol.flatMap(a => a.meses), [arbol]);
  const todosTildados = todosLosMeses.length > 0 && seleccionados.length === todosLosMeses.length;
  const toggleTodos = () => onChange(todosTildados ? [] : todosLosMeses);

  const toggleAnio = (anio: { anio: string; meses: string[] }) => {
    const tildadosDelAnio = anio.meses.filter(m => seleccionados.includes(m)).length;
    const set = new Set(seleccionados);
    if (tildadosDelAnio === anio.meses.length) anio.meses.forEach(m => set.delete(m));
    else anio.meses.forEach(m => set.add(m));
    onChange([...set]);
  };

  const toggleMes = (mes: string) => {
    onChange(seleccionados.includes(mes) ? seleccionados.filter(m => m !== mes) : [...seleccionados, mes]);
  };

  const toggleExpand = (anio: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(anio)) next.delete(anio); else next.add(anio);
      return next;
    });
  };

  const resumen = todosLosMeses.length === 0 ? '— sin datos —'
    : todosTildados ? 'Todos'
    : seleccionados.length === 1 ? fmtMes(`${seleccionados[0]}-01`)
    : `${seleccionados.length} meses`;

  return (
    <div ref={ref} className="relative flex flex-col gap-1">
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Meses</span>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between gap-2 bg-slate-800 border rounded-lg px-2 py-1.5 text-xs min-w-[150px] focus:outline-none transition-colors ${open ? 'border-indigo-500' : 'border-slate-700 hover:border-slate-600'}`}>
        <span className="truncate text-white">{resumen}</span>
        <ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-72 overflow-y-auto p-2">
          <label className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-700 mb-1 cursor-pointer">
            <input type="checkbox" checked={todosTildados} onChange={toggleTodos} className="accent-indigo-500 w-3.5 h-3.5" />
            <span className="text-xs font-bold text-zinc-300">Todos</span>
          </label>
          {arbol.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-zinc-500 italic">Sin meses disponibles</p>
          ) : arbol.map(a => {
            const tildadosDelAnio = a.meses.filter(m => seleccionados.includes(m)).length;
            const anioChecked = tildadosDelAnio === a.meses.length;
            const anioIndeterminate = tildadosDelAnio > 0 && tildadosDelAnio < a.meses.length;
            const expandido = expandidos.has(a.anio);
            return (
              <div key={a.anio}>
                <div className="flex items-center gap-2 px-2 py-1">
                  <input type="checkbox" checked={anioChecked}
                    ref={el => { if (el) el.indeterminate = anioIndeterminate; }}
                    onChange={() => toggleAnio(a)} className="accent-indigo-500 w-3.5 h-3.5" />
                  <span onClick={() => toggleExpand(a.anio)}
                    className="flex-1 flex items-center justify-between text-xs text-white cursor-pointer select-none">
                    {a.anio}
                    <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${expandido ? '' : '-rotate-90'}`} />
                  </span>
                </div>
                {expandido && (
                  <div className="pl-6 flex flex-col">
                    {a.meses.map(m => (
                      <label key={m} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-700 rounded cursor-pointer">
                        <input type="checkbox" checked={seleccionados.includes(m)} onChange={() => toggleMes(m)} className="accent-indigo-500 w-3.5 h-3.5" />
                        <span className="text-xs text-zinc-200">{fmtMes(`${m}-01`)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const GLOSARIO: { termino: string; definicion: string }[] = [
  { termino: 'CPL — Costo por lead', definicion: 'Costo total de adquisición del origen ÷ cantidad de leads nuevos de la cohorte.' },
  { termino: 'CPM — Costo por pegada de motor', definicion: 'Costo total ÷ leads que llegaron a motor (scoring) dentro de la ventana de 30 días.' },
  { termino: 'CPO — Costo por oferta', definicion: 'Costo total ÷ leads con oferta generada dentro de la ventana de 30 días.' },
  { termino: 'CPV — Costo por venta', definicion: 'Costo total ÷ ventas concretadas dentro de la ventana de 30 días.' },
  { termino: 'Costo operativo', definicion: 'Porción del pool de costos del país (Otorgamiento y Conversión, Bureau y Scoring, Equipo Comercial) asignada a este origen según su cantidad de leads.' },
  { termino: 'Costo marketing', definicion: 'Costo de marketing propio del origen: para RESTO es el presupuesto completo de Marketing y Publicidad; para un proveedor es su tarifa pactada (fija o variable).' },
  { termino: '% Operativo / Marketing / Total sobre Capital', definicion: 'Cada costo expresado como porcentaje del capital desembolsado en las ventas de ese origen y período — mide qué tan caro es el origen en relación a lo que efectivamente colocó.' },
  { termino: 'Capital desembolsado', definicion: 'Monto de capital de las ventas concretadas por ese origen dentro de la ventana de conversión.' },
  { termino: 'Origen', definicion: 'Proveedor que originó el lead (ej. CREDITILIA, WITME, IKIWI, AL PRESTAMO) o RESTO, que agrupa todo lo que no tiene tarifa de proveedor particular.' },
  { termino: 'Mes', definicion: 'Mes de creación del lead (cohorte) — no el mes en que se concretó la venta.' },
  { termino: 'Ventana de conversión', definicion: '30 días desde la creación del lead: motor, oferta y venta solo cuentan si ocurren dentro de ese plazo.' },
  { termino: 'Badge "Estimado"', definicion: 'El mes todavía no tenía costos CAC cargados — se replicó el último mes disponible, prorrateado por días transcurridos si es el mes en curso.' },
  { termino: 'Badge "Cohorte abierta"', definicion: 'La cohorte tiene leads con menos de 30 días: CPM, CPO y CPV todavía pueden bajar a medida que conviertan.' },
];

function GlosarioModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <span className="text-sm font-bold text-white">Glosario — Costos por origen</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          {GLOSARIO.map(g => (
            <div key={g.termino}>
              <p className="text-xs font-bold text-blue-400">{g.termino}</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{g.definicion}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ titulo, tooltip, color }: { titulo: string; tooltip: string; color: 'amber' | 'blue' }) {
  const cls = color === 'amber' ? 'bg-amber-900/40 text-amber-400 border-amber-700/50' : 'bg-blue-900/40 text-blue-400 border-blue-700/50';
  return (
    <span title={tooltip} className={`ml-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md border ${cls} cursor-help`}>
      {titulo}
    </span>
  );
}

function KpiCard({ titulo, valor, anterior, moneda, pais, esEstimado, esCohorteAbierta }: {
  titulo: string; valor: number | null; anterior: number | null; moneda: Moneda; pais: string;
  esEstimado: boolean; esCohorteAbierta: boolean;
}) {
  const variacion = getVariacionPct(valor, anterior);
  const subeEsMalo = true; // un CPL/CPM/CPO/CPV más alto es peor (mayor costo de adquisición)
  const Icono = variacion === null ? Minus : variacion > 0 ? TrendingUp : TrendingDown;
  const colorVariacion = variacion === null ? 'text-zinc-500' : (variacion > 0) === subeEsMalo ? 'text-rose-400' : 'text-emerald-400';

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{titulo}</span>
      </div>
      <p className="text-2xl font-bold text-white">{valor === null ? '—' : formatMonto(valor, moneda, pais)}</p>
      <div className="flex items-center gap-1.5">
        <Icono className={`w-3 h-3 ${colorVariacion}`} />
        <span className={`text-xs font-bold ${colorVariacion}`}>{variacion === null ? 'sin período anterior' : `${variacion > 0 ? '+' : ''}${variacion.toFixed(1)}%`}</span>
      </div>
      {(esEstimado || esCohorteAbierta) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {esEstimado && <Badge titulo="Estimado" tooltip="Los costos de este mes todavía no están cargados. Se usa el último mes disponible, prorrateado por días si es el mes en curso." color="amber" />}
          {esCohorteAbierta && <Badge titulo="Cohorte abierta" tooltip="Hay leads de esta cohorte con menos de 30 días. CPM, CPO y CPV pueden bajar a medida que conviertan." color="blue" />}
        </div>
      )}
    </div>
  );
}
