// src/components/submodules/MktCostosPorOrigenSubmodule.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import MultiSelect from '../ui/MultiSelect';
import { fetchCostosPorOrigenMensual } from '../../services/api';
import {
  aggregateKpis, buildTableRows, getDistinctOrigenes, getVariacionPct, mesesAtras, contarMeses, origenKey,
  type CostoOrigenRow, type Moneda,
} from './costosPorOrigenHelpers';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const PALETTE = ['#60a5fa', '#f59e0b', '#34d399', '#f87171', '#a78bfa', '#06b6d4', '#f97316', '#84cc16'];

const fmtMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`;
};

const formatMonto = (v: number, moneda: Moneda, pais: string) => {
  const redondeado = Math.round(v).toLocaleString('es-AR');
  if (moneda === 'usd') return `USD ${redondeado}`;
  return `${pais === 'ARG' ? '$' : 'COP'} ${redondeado}`;
};

const formatPct = (v: number | null) =>
  v === null ? '—' : `${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function defaultMesRange() {
  const hoy = new Date();
  const hasta = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
  const desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { desde, hasta };
}

type PaisFiltro = 'ARG' | 'COL' | 'AMBOS';

export default function MktCostosPorOrigenSubmodule() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<CostoOrigenRow[]>([]);

  const defaultRange = useMemo(defaultMesRange, []);
  const [pais, setPais] = useState<PaisFiltro>('ARG');
  const [mesDesde, setMesDesde] = useState(defaultRange.desde);
  const [mesHasta, setMesHasta] = useState(defaultRange.hasta);
  const [origenesSeleccionados, setOrigenesSeleccionados] = useState<string[]>([]);
  const [monedaUsuario, setMonedaUsuario] = useState<Moneda>('local');

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

  // Al cambiar de país arrancamos con todos los orígenes tildados.
  useEffect(() => {
    setOrigenesSeleccionados(origenesKeysDisponibles);
  }, [pais]); // eslint-disable-line react-hooks/exhaustive-deps

  const mesDesdeKey = `${mesDesde}-01`;
  const mesHastaKey = `${mesHasta}-01`;

  const rowsFiltrados = useMemo(() => {
    const seleccion = new Set(origenesSeleccionados);
    return rowsPais.filter(r =>
      r.mes >= mesDesdeKey && r.mes <= mesHastaKey && seleccion.has(origenKey(r.pais, r.origen))
    );
  }, [rowsPais, mesDesdeKey, mesHastaKey, origenesSeleccionados]);

  const kpis = useMemo(() => aggregateKpis(rowsFiltrados), [rowsFiltrados]);

  const rowsPeriodoAnterior = useMemo(() => {
    const nMeses = contarMeses(mesDesdeKey, mesHastaKey);
    const prevDesde = mesesAtras(mesDesdeKey, nMeses);
    const prevHasta = mesesAtras(mesHastaKey, nMeses);
    const seleccion = new Set(origenesSeleccionados);
    return rowsPais.filter(r =>
      r.mes >= prevDesde && r.mes <= prevHasta && seleccion.has(origenKey(r.pais, r.origen))
    );
  }, [rowsPais, mesDesdeKey, mesHastaKey, origenesSeleccionados]);

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

  const fechaCorte = useMemo(
    () => rowsFiltrados.reduce((max, r) => (r.fecha_corte > max ? r.fecha_corte : max), ''),
    [rowsFiltrados]
  );

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

  const subtotalesPorOrigen = useMemo(() => tableRows.filter(r => r.esSubtotal), [tableRows]);

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
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-lg font-bold text-white">Marketing › Costos por origen</h2>
        <p className="text-zinc-500 text-sm mt-0.5">Costo de adquisición del negocio nuevo, abierto por proveedor de originación.</p>
      </motion.div>

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

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Desde</span>
          <input type="month" value={mesDesde} onChange={e => setMesDesde(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Hasta</span>
          <input type="month" value={mesHasta} onChange={e => setMesHasta(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
        </div>

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
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-slate-900">
                <tr className="border-b border-slate-800">
                  {['Origen', 'Mes', 'Leads', 'Motor', 'Ofertas', 'Ventas', 'Costo operativo', 'Costo marketing', 'Costo total', 'CPL', 'CPM', 'CPO', 'CPV'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(r => (
                  <tr key={r.key} className={`border-b border-slate-800/50 ${r.esSubtotal || r.esTotal ? 'bg-slate-800/60 font-bold' : 'hover:bg-slate-800/30'} transition-colors`}>
                    <td className="px-3 py-2.5 text-white text-xs whitespace-nowrap">
                      {r.esSubtotal ? `Subtotal ${r.origen}` : r.origen}
                      {r.esEstimado && <Badge titulo="Estimado" tooltip="Los costos de este mes todavía no están cargados. Se usa el último mes disponible, prorrateado por días si es el mes en curso." color="amber" />}
                      {r.esCohorteAbierta && <Badge titulo="Cohorte abierta" tooltip="Hay leads de esta cohorte con menos de 30 días. CPM, CPO y CPV pueden bajar a medida que conviertan." color="blue" />}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{r.mes ? fmtMes(r.mes) : '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.leads.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.motor.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.ofertas.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.ventas.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{formatMonto(r.costoOperativo, monedaEfectiva, r.pais)}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{formatMonto(r.costoMarketing, monedaEfectiva, r.pais)}</td>
                    <td className="px-3 py-2.5 text-white text-xs font-bold text-right whitespace-nowrap">{formatMonto(r.costoTotal, monedaEfectiva, r.pais)}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.cpl === null ? '—' : formatMonto(r.cpl, monedaEfectiva, r.pais)}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.cpm === null ? '—' : formatMonto(r.cpm, monedaEfectiva, r.pais)}</td>
                    <td className="px-3 py-2.5 text-zinc-300 text-xs text-right whitespace-nowrap">{r.cpo === null ? '—' : formatMonto(r.cpo, monedaEfectiva, r.pais)}</td>
                    <td className="px-3 py-2.5 text-blue-400 text-xs font-bold text-right whitespace-nowrap">{r.cpv === null ? '—' : formatMonto(r.cpv, monedaEfectiva, r.pais)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

          <p className="text-zinc-600 text-[11px] text-center">
            Datos al {fechaCorte || '—'}. Mes = mes de creación del lead. Ventana de conversión: 30 días.
          </p>
        </>
      )}
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
