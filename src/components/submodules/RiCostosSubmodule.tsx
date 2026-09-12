import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, RefreshCcw, Filter } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import MultiSelect from '../ui/MultiSelect';

Chart.register(...registerables);

type Moneda = 'usd' | 'local';

type Pais = 'ARG' | 'COL';
type PaisFiltro = Pais | 'AMBOS';
type Categoria = 'Plataformas' | 'Bureaus' | 'Otros';

interface GastoRow {
  pais: Pais;
  proveedor: string;
  mes: string;
  monto_usd: number | null;
  monto_ars: number | null;
  monto_cop: number | null;
  alias: string;
  categoria: Categoria;
}

interface ResumenMensual {
  pais: Pais | 'AMBOS';
  mes: string;
  gastoTotalUsd: number | null;
  gastoTotalLocal: number | null;
  cantidadLeads: number;
  cantidadMotor: number;
  cantidadOfertas: number;
  cantidadVentasNetas: number;
  cplUsd: number | null;
  cplLocal: number | null;
  cprUsd: number | null;
  cprLocal: number | null;
  cpoUsd: number | null;
  cpoLocal: number | null;
  cpvUsd: number | null;
  cpvLocal: number | null;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatMesLabel(mes: string): string {
  const [anio, mesNum] = mes.split('-').map(Number);
  return `${MESES_CORTOS[mesNum - 1]} '${String(anio).slice(2)}`;
}

function fmtUsd(v: number | null): string {
  if (v === null) return '—';
  return `USD ${Math.round(v).toLocaleString('es-AR')}`;
}

// Unit-cost values (CPL/CPR/CPO/CPV) are small fractional USD amounts — rounding
// them to whole dollars turns them all into a misleading "USD 0". Keep more
// decimal precision for these instead of using fmtUsd.
function fmtUsdUnit(v: number | null): string {
  if (v === null) return '—';
  return `USD ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function fmtLocal(v: number | null, pais: PaisFiltro): string {
  if (v === null || pais === 'AMBOS') return '—';
  const prefix = pais === 'ARG' ? '$' : 'COP';
  return `${prefix} ${Math.round(v).toLocaleString('es-AR')}`;
}

function pctDelta(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || anterior === 0) return null;
  return +(((actual - anterior) / anterior) * 100).toFixed(1);
}

function combineAmbos(rows: ResumenMensual[]): ResumenMensual[] {
  const porMes = new Map<string, { gastoTotalUsd: number; anyNull: boolean; leads: number; motor: number; ofertas: number; ventas: number }>();
  for (const r of rows) {
    const acc = porMes.get(r.mes) ?? { gastoTotalUsd: 0, anyNull: false, leads: 0, motor: 0, ofertas: 0, ventas: 0 };
    if (r.gastoTotalUsd === null) acc.anyNull = true;
    else acc.gastoTotalUsd += r.gastoTotalUsd;
    acc.leads += r.cantidadLeads;
    acc.motor += r.cantidadMotor;
    acc.ofertas += r.cantidadOfertas;
    acc.ventas += r.cantidadVentasNetas;
    porMes.set(r.mes, acc);
  }
  // Higher precision (4 decimals) to avoid manufacturing a misleading "0" for
  // real small unit-cost values — mirrors server.ts's buildResumenMensual divide().
  const divide = (total: number | null, cantidad: number): number | null =>
    total === null || cantidad <= 0 ? null : +(total / cantidad).toFixed(4);
  return [...porMes.entries()]
    .map(([mes, acc]) => {
      // If ANY contributing country-row for this month had gastoTotalUsd === null
      // (e.g. one country's gasto tracking hadn't started yet that month), the
      // combined total must be null too — never a partial/understated sum.
      const gastoTotalUsd = acc.anyNull ? null : acc.gastoTotalUsd;
      return {
        pais: 'AMBOS' as const,
        mes,
        gastoTotalUsd,
        gastoTotalLocal: null,
        cantidadLeads: acc.leads,
        cantidadMotor: acc.motor,
        cantidadOfertas: acc.ofertas,
        cantidadVentasNetas: acc.ventas,
        cplUsd: divide(gastoTotalUsd, acc.leads),
        cplLocal: null,
        cprUsd: divide(gastoTotalUsd, acc.motor),
        cprLocal: null,
        cpoUsd: divide(gastoTotalUsd, acc.ofertas),
        cpoLocal: null,
        cpvUsd: divide(gastoTotalUsd, acc.ventas),
        cpvLocal: null,
      };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

function totalesPorMes(meses: string[], series: Array<{ data: number[] }>): number[] {
  return meses.map((_, i) => series.reduce((s, ser) => s + ser.data[i], 0));
}

function buildGastoPorCategoriaSeries(detalle: GastoRow[]) {
  const meses = [...new Set(detalle.map(r => r.mes))].sort();
  const categorias: Categoria[] = ['Plataformas', 'Bureaus', 'Otros'];
  const series = categorias.map(categoria => ({
    categoria,
    data: meses.map(mes =>
      detalle.filter(r => r.mes === mes && r.categoria === categoria).reduce((s, r) => s + (r.monto_usd ?? 0), 0)
    ),
  }));
  return { meses, series, totales: totalesPorMes(meses, series) };
}

const PROVEEDOR_COLORS = [
  'rgba(59,130,246,.82)', 'rgba(245,158,11,.82)', 'rgba(139,92,246,.82)',
  'rgba(52,211,153,.82)', 'rgba(244,63,94,.82)', 'rgba(56,189,248,.82)',
  'rgba(251,146,60,.82)', 'rgba(217,70,239,.82)',
];

function buildGastoPorProveedorSeries(detalle: GastoRow[]) {
  const meses = [...new Set(detalle.map(r => r.mes))].sort();
  const proveedores = [...new Set(detalle.map(r => r.alias))].sort();
  const series = proveedores.map((proveedor, i) => ({
    proveedor,
    color: PROVEEDOR_COLORS[i % PROVEEDOR_COLORS.length],
    data: meses.map(mes =>
      detalle.filter(r => r.mes === mes && r.alias === proveedor).reduce((s, r) => s + (r.monto_usd ?? 0), 0)
    ),
  }));
  return { meses, series, totales: totalesPorMes(meses, series) };
}

// Draws the stack's total above each bar group — a local (per-chart) Chart.js
// plugin instead of an external datalabels dependency. Assumes all-non-negative
// stacked values, so the last dataset drawn is always the topmost segment.
function totalLabelPlugin(totales: number[]) {
  return {
    id: 'totalLabel',
    afterDatasetsDraw(chart: Chart) {
      const lastDatasetIndex = chart.data.datasets.length - 1;
      if (lastDatasetIndex < 0) return;
      const meta = chart.getDatasetMeta(lastDatasetIndex);
      if (!meta?.data) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 10px sans-serif';
      ctx.fillStyle = '#e2e8f5';
      ctx.textAlign = 'center';
      meta.data.forEach((bar: any, index: number) => {
        const total = totales[index];
        if (!total) return;
        ctx.fillText(`USD ${Math.round(total).toLocaleString('es-AR')}`, bar.x, bar.y - 6);
      });
      ctx.restore();
    },
  };
}

export default function RiCostosSubmodule() {
  const [detalleGasto, setDetalleGasto] = useState<GastoRow[]>([]);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paisFiltro, setPaisFiltro] = useState<PaisFiltro>('AMBOS');
  const [filtroCategoria, setFiltroCategoria] = useState<string[]>([]);
  const [filtroProveedor, setFiltroProveedor] = useState<string[]>([]);
  const [filtroMes, setFiltroMes] = useState<string[]>([]);
  const [moneda, setMoneda] = useState<Moneda>('usd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/riesgo-costos');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetalleGasto(json.detalleGasto);
      setResumenMensual(json.resumenMensual);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    await fetch('/api/riesgo-costos/refresh');
    fetchData();
  };

  const resumenFiltrado = useMemo(() => {
    if (paisFiltro === 'AMBOS') return combineAmbos(resumenMensual);
    return resumenMensual.filter(r => r.pais === paisFiltro).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [resumenMensual, paisFiltro]);

  const detalleFiltrado = useMemo(() => {
    if (paisFiltro === 'AMBOS') return detalleGasto;
    return detalleGasto.filter(r => r.pais === paisFiltro);
  }, [detalleGasto, paisFiltro]);

  const categoriaOptions: Categoria[] = ['Plataformas', 'Bureaus', 'Otros'];

  const proveedorOptions = useMemo(
    () => [...new Set(detalleFiltrado.map(r => r.alias))].sort(),
    [detalleFiltrado]
  );

  const mesOptions = useMemo(
    () => [...new Set(resumenFiltrado.map(r => r.mes))].sort(),
    [resumenFiltrado]
  );

  const mesOptionLabels = useMemo(
    () => Object.fromEntries(mesOptions.map(m => [m, formatMesLabel(m)])),
    [mesOptions]
  );

  // Categoría/proveedor/mes narrow the category/provider charts and the detail
  // table (all desegregable by provider). CPL/CPR/CPO/CPV are totals-based —
  // only "mes" applies to those (see resumenFiltradoConMes below).
  const detalleFiltradoConFiltros = useMemo(() => {
    return detalleFiltrado.filter(r =>
      (filtroCategoria.length === 0 || filtroCategoria.includes(r.categoria)) &&
      (filtroProveedor.length === 0 || filtroProveedor.includes(r.alias)) &&
      (filtroMes.length === 0 || filtroMes.includes(r.mes))
    );
  }, [detalleFiltrado, filtroCategoria, filtroProveedor, filtroMes]);

  const resumenFiltradoConMes = useMemo(() => {
    if (filtroMes.length === 0) return resumenFiltrado;
    return resumenFiltrado.filter(r => filtroMes.includes(r.mes));
  }, [resumenFiltrado, filtroMes]);

  const ultimoCerrado = useMemo(() => {
    const cerrados = resumenFiltrado.filter(r => r.gastoTotalUsd !== null);
    return cerrados[cerrados.length - 1] ?? null;
  }, [resumenFiltrado]);

  const mesAnterior = useMemo(() => {
    if (!ultimoCerrado) return null;
    const cerrados = resumenFiltrado.filter(r => r.gastoTotalUsd !== null && r.mes < ultimoCerrado.mes);
    return cerrados[cerrados.length - 1] ?? null;
  }, [resumenFiltrado, ultimoCerrado]);

  const mesEnCurso = useMemo(() => {
    const sinCosto = resumenFiltrado.filter(r => r.gastoTotalUsd === null);
    return sinCosto.length > 0 ? sinCosto[sinCosto.length - 1] : null;
  }, [resumenFiltrado]);

  const deltaGasto = pctDelta(ultimoCerrado?.gastoTotalUsd ?? null, mesAnterior?.gastoTotalUsd ?? null);

  const chartGastoRef = useRef<HTMLCanvasElement>(null);
  const chartGastoInst = useRef<Chart | null>(null);
  const chartCpRef = useRef<HTMLCanvasElement>(null);
  const chartCpInst = useRef<Chart | null>(null);
  const chartProveedorRef = useRef<HTMLCanvasElement>(null);
  const chartProveedorInst = useRef<Chart | null>(null);

  const gastoPorCategoria = useMemo(() => buildGastoPorCategoriaSeries(detalleFiltradoConFiltros), [detalleFiltradoConFiltros]);
  const gastoPorProveedor = useMemo(() => buildGastoPorProveedorSeries(detalleFiltradoConFiltros), [detalleFiltradoConFiltros]);

  useEffect(() => {
    if (!chartGastoRef.current) return;
    chartGastoInst.current?.destroy();
    const CATEGORIA_COLOR: Record<Categoria, string> = {
      Plataformas: 'rgba(59,130,246,.82)',
      Bureaus: 'rgba(245,158,11,.82)',
      Otros: 'rgba(139,92,246,.82)',
    };
    chartGastoInst.current = new Chart(chartGastoRef.current, {
      type: 'bar',
      data: {
        labels: gastoPorCategoria.meses.map(formatMesLabel),
        datasets: gastoPorCategoria.series.map(s => ({
          label: s.categoria,
          data: s.data,
          backgroundColor: CATEGORIA_COLOR[s.categoria],
          borderRadius: 4,
          borderSkipped: false,
        })),
      },
      plugins: [totalLabelPlugin(gastoPorCategoria.totales)],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: true, labels: { color: '#a1a1aa', font: { size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, titleColor: '#e2e8f5', bodyColor: '#a1a1aa',
            callbacks: { label: (c: any) => ` ${c.dataset.label}: USD ${Math.round(c.raw).toLocaleString('es-AR')}` },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: '#71717a', font: { size: 10 }, callback: (v: any) => `USD ${v}` }, grid: { color: 'rgba(51,65,85,.5)' } },
        },
      },
    });
    return () => { chartGastoInst.current?.destroy(); };
  }, [gastoPorCategoria]);

  useEffect(() => {
    if (!chartProveedorRef.current) return;
    chartProveedorInst.current?.destroy();
    chartProveedorInst.current = new Chart(chartProveedorRef.current, {
      type: 'bar',
      data: {
        labels: gastoPorProveedor.meses.map(formatMesLabel),
        datasets: gastoPorProveedor.series.map(s => ({
          label: s.proveedor,
          data: s.data,
          backgroundColor: s.color,
          borderRadius: 4,
          borderSkipped: false,
        })),
      },
      plugins: [totalLabelPlugin(gastoPorProveedor.totales)],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: true, labels: { color: '#a1a1aa', font: { size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, titleColor: '#e2e8f5', bodyColor: '#a1a1aa',
            callbacks: { label: (c: any) => ` ${c.dataset.label}: USD ${Math.round(c.raw).toLocaleString('es-AR')}` },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: '#71717a', font: { size: 10 }, callback: (v: any) => `USD ${v}` }, grid: { color: 'rgba(51,65,85,.5)' } },
        },
      },
    });
    return () => { chartProveedorInst.current?.destroy(); };
  }, [gastoPorProveedor]);

  useEffect(() => {
    if (!chartCpRef.current) return;
    chartCpInst.current?.destroy();
    const labels = resumenFiltradoConMes.map(r => formatMesLabel(r.mes));
    chartCpInst.current = new Chart(chartCpRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'CPL', data: resumenFiltradoConMes.map(r => r.cplUsd), borderColor: '#60a5fa', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
          { label: 'CPR', data: resumenFiltradoConMes.map(r => r.cprUsd), borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
          { label: 'CPO', data: resumenFiltradoConMes.map(r => r.cpoUsd), borderColor: '#a78bfa', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
          { label: 'CPV', data: resumenFiltradoConMes.map(r => r.cpvUsd), borderColor: '#34d399', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: '#a1a1aa', font: { size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, titleColor: '#e2e8f5', bodyColor: '#a1a1aa',
            callbacks: { label: (c: any) => c.raw === null ? ` ${c.dataset.label}: sin dato (mes en curso)` : ` ${c.dataset.label}: ${fmtUsdUnit(c.raw)}` },
          },
        },
        scales: {
          x: { ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#71717a', font: { size: 10 }, callback: (v: any) => `USD ${Number(v).toFixed(2)}` }, grid: { color: 'rgba(51,65,85,.5)' } },
        },
      },
    });
    return () => { chartCpInst.current?.destroy(); };
  }, [resumenFiltradoConMes]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
        <p className="text-zinc-400 text-sm font-semibold animate-pulse">Cargando costos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <p className="text-zinc-400 text-sm">{error}</p>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-xl text-zinc-300 text-sm font-bold hover:bg-slate-700 transition-colors">
          <RefreshCcw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-base font-bold text-white">Costos</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Gasto operativo de Riesgo y costo por lead/motor/oferta/venta</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-700 overflow-hidden">
            {(['ARG', 'COL', 'AMBOS'] as PaisFiltro[]).map(p => (
              <button
                key={p}
                onClick={() => setPaisFiltro(p)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${paisFiltro === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={handleRefresh} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-zinc-400 transition-colors" title="Actualizar">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gasto último mes cerrado</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.gastoTotalUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.gastoTotalLocal ?? null, paisFiltro)}</p>}
          {deltaGasto !== null && (
            <p className={`text-[10px] font-bold ${deltaGasto > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {deltaGasto > 0 ? '+' : ''}{deltaGasto}% vs. mes anterior
            </p>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPL (costo por lead)</span>
          <p className="text-xl font-bold text-white">{fmtUsdUnit(ultimoCerrado?.cplUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cplLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPR (costo por motor)</span>
          <p className="text-xl font-bold text-white">{fmtUsdUnit(ultimoCerrado?.cprUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cprLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPO (costo por oferta)</span>
          <p className="text-xl font-bold text-white">{fmtUsdUnit(ultimoCerrado?.cpoUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cpoLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPV (costo por venta)</span>
          <p className="text-xl font-bold text-white">{fmtUsdUnit(ultimoCerrado?.cpvUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cpvLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Último mes con costo</span>
          <p className="text-xl font-bold text-white">{ultimoCerrado ? formatMesLabel(ultimoCerrado.mes) : '—'}</p>
        </div>
        {mesEnCurso && (
          <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-4 flex flex-col gap-2 col-span-2 md:col-span-3 lg:col-span-6">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
              Mes en curso — {formatMesLabel(mesEnCurso.mes)} (sin costo cargado todavía)
            </span>
            <div className="flex gap-6 text-xs text-zinc-400 flex-wrap">
              <span>Leads: <strong className="text-white">{mesEnCurso.cantidadLeads.toLocaleString('es-AR')}</strong></span>
              <span>Motor: <strong className="text-white">{mesEnCurso.cantidadMotor.toLocaleString('es-AR')}</strong></span>
              <span>Ofertas: <strong className="text-white">{mesEnCurso.cantidadOfertas.toLocaleString('es-AR')}</strong></span>
              <span>Ventas: <strong className="text-white">{mesEnCurso.cantidadVentasNetas.toLocaleString('es-AR')}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end gap-4">
        <Filter className="w-3.5 h-3.5 text-zinc-600 shrink-0 mb-2" />
        <MultiSelect label="Categoría" options={categoriaOptions} value={filtroCategoria} onChange={setFiltroCategoria} />
        <MultiSelect label="Proveedor" options={proveedorOptions} value={filtroProveedor} onChange={setFiltroProveedor} />
        <MultiSelect label="Mes" options={mesOptions} value={filtroMes} onChange={setFiltroMes} optionLabels={mesOptionLabels} />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Moneda</span>
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            {(['usd', 'local'] as Moneda[]).map(m => (
              <button
                key={m}
                onClick={() => setMoneda(m)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${moneda === m ? 'bg-blue-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}`}
              >
                {m === 'usd' ? 'USD' : 'Local'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Gasto mensual por categoría (USD)</h3>
          <div style={{ height: 260 }}><canvas ref={chartGastoRef} /></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">CPL / CPR / CPO / CPV (USD)</h3>
          <div style={{ height: 260 }}><canvas ref={chartCpRef} /></div>
        </div>
      </div>

      {/* Tabla CPL/CPR/CPO/CPV por mes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-4 pt-4">CPL / CPR / CPO / CPV por mes ({moneda === 'usd' ? 'USD' : 'moneda local'})</h3>
        <table className="w-full text-left border-collapse mt-3">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Mes</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">CPL</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">CPR</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">CPO</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">CPV</th>
            </tr>
          </thead>
          <tbody>
            {resumenFiltradoConMes
              .slice()
              .sort((a, b) => b.mes.localeCompare(a.mes))
              .map(r => {
                const val = (usd: number | null, local: number | null) =>
                  moneda === 'usd' ? fmtUsdUnit(usd) : fmtLocal(local, paisFiltro);
                return (
                  <tr key={r.mes} className="border-t border-slate-800">
                    <td className="px-4 py-2 text-xs text-zinc-300">{formatMesLabel(r.mes)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-300 text-right">{val(r.cplUsd, r.cplLocal)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-300 text-right">{val(r.cprUsd, r.cprLocal)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-300 text-right">{val(r.cpoUsd, r.cpoLocal)}</td>
                    <td className="px-4 py-2 text-xs text-zinc-300 text-right">{val(r.cpvUsd, r.cpvLocal)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Gráfico de gasto por proveedor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Gasto mensual por proveedor (USD)</h3>
        <div style={{ height: 280 }}><canvas ref={chartProveedorRef} /></div>
      </div>

      {/* Tabla de detalle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">País</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Proveedor</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Categoría</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Mes</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">USD</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Local</th>
            </tr>
          </thead>
          <tbody>
            {detalleFiltradoConFiltros
              .slice()
              .sort((a, b) => b.mes.localeCompare(a.mes) || a.pais.localeCompare(b.pais) || a.proveedor.localeCompare(b.proveedor))
              .map((r, i) => (
                <tr key={`${r.pais}-${r.proveedor}-${r.mes}-${i}`} className="border-t border-slate-800">
                  <td className="px-4 py-2 text-xs text-zinc-300">{r.pais}</td>
                  <td className="px-4 py-2 text-xs text-zinc-300">{r.alias}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{r.categoria}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{formatMesLabel(r.mes)}</td>
                  <td className="px-4 py-2 text-xs text-zinc-300 text-right">{fmtUsd(r.monto_usd)}</td>
                  <td className="px-4 py-2 text-xs text-zinc-300 text-right">{fmtLocal(r.pais === 'ARG' ? r.monto_ars : r.monto_cop, r.pais)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
