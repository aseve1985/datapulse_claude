import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';

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
  const porMes = new Map<string, { gastoTotalUsd: number | null; leads: number; motor: number; ofertas: number; ventas: number }>();
  for (const r of rows) {
    const acc = porMes.get(r.mes) ?? { gastoTotalUsd: null, leads: 0, motor: 0, ofertas: 0, ventas: 0 };
    if (r.gastoTotalUsd !== null) acc.gastoTotalUsd = (acc.gastoTotalUsd ?? 0) + r.gastoTotalUsd;
    acc.leads += r.cantidadLeads;
    acc.motor += r.cantidadMotor;
    acc.ofertas += r.cantidadOfertas;
    acc.ventas += r.cantidadVentasNetas;
    porMes.set(r.mes, acc);
  }
  const divide = (total: number | null, cantidad: number): number | null =>
    total === null || cantidad <= 0 ? null : +(total / cantidad).toFixed(2);
  return [...porMes.entries()]
    .map(([mes, acc]) => ({
      pais: 'AMBOS' as const,
      mes,
      gastoTotalUsd: acc.gastoTotalUsd,
      gastoTotalLocal: null,
      cantidadLeads: acc.leads,
      cantidadMotor: acc.motor,
      cantidadOfertas: acc.ofertas,
      cantidadVentasNetas: acc.ventas,
      cplUsd: divide(acc.gastoTotalUsd, acc.leads),
      cplLocal: null,
      cprUsd: divide(acc.gastoTotalUsd, acc.motor),
      cprLocal: null,
      cpoUsd: divide(acc.gastoTotalUsd, acc.ofertas),
      cpoLocal: null,
      cpvUsd: divide(acc.gastoTotalUsd, acc.ventas),
      cpvLocal: null,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export default function RiCostosSubmodule() {
  const [detalleGasto, setDetalleGasto] = useState<GastoRow[]>([]);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paisFiltro, setPaisFiltro] = useState<PaisFiltro>('AMBOS');

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

  const ultimoCerrado = useMemo(() => {
    const cerrados = resumenFiltrado.filter(r => r.gastoTotalUsd !== null);
    return cerrados[cerrados.length - 1] ?? null;
  }, [resumenFiltrado]);

  const mesAnterior = useMemo(() => {
    if (!ultimoCerrado) return null;
    const cerrados = resumenFiltrado.filter(r => r.gastoTotalUsd !== null && r.mes < ultimoCerrado.mes);
    return cerrados[cerrados.length - 1] ?? null;
  }, [resumenFiltrado, ultimoCerrado]);

  const mesEnCurso = useMemo(
    () => resumenFiltrado.find(r => r.gastoTotalUsd === null) ?? null,
    [resumenFiltrado]
  );

  const deltaGasto = pctDelta(ultimoCerrado?.gastoTotalUsd ?? null, mesAnterior?.gastoTotalUsd ?? null);

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
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cplUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cplLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPR (costo por motor)</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cprUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cprLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPO (costo por oferta)</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cpoUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cpoLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPV (costo por venta)</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cpvUsd ?? null)}</p>
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
    </div>
  );
}
