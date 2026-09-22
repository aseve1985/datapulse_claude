import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle, Loader2, ChevronDown } from 'lucide-react';
import { fetchCatalogoScores, fetchCarreraScores } from '../../services/api';
import { pivotGrid, filterGridByBanda, computeHeaderIndicators, UMBRALES, type HechoRow, type BandaCatalogo, type GridRow } from './carreraScoresHelpers';

const formatPct = (v: number | null) => v === null ? null : `${v.toFixed(1)}%`;
const formatMonto = (v: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
const formatMontoPorPais = (v: number, pais: string) => `${pais === 'ARG' ? '$' : 'COP'} ${Math.round(v).toLocaleString('es-AR')}`;

const BANDAS_COMPARATIVO = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

interface ComparativoColumna {
  scoreKey: string;
  nombre: string;
  segmento: string;
  grid: GridRow[];
}

export default function RiCarreraScoresSubmodule() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [bandas, setBandas] = useState<BandaCatalogo[]>([]);
  const [hechos, setHechos] = useState<HechoRow[]>([]);

  const [pais, setPais] = useState<string>('');
  const [segmento, setSegmento] = useState<string>('');
  const [scoreKey, setScoreKey] = useState<string>('');
  const [cepasSeleccionadas, setCepasSeleccionadas] = useState<string[]>([]);
  const [bandasSeleccionadas, setBandasSeleccionadas] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [catalogo, carrera] = await Promise.all([fetchCatalogoScores(), fetchCarreraScores()]);
        setScores(catalogo.scores);
        setBandas(catalogo.bandas);
        setHechos(carrera.hechos);
        if (catalogo.scores.length > 0) {
          setPais(catalogo.scores[0].pais);
          setSegmento(catalogo.scores[0].segmento);
          setScoreKey(catalogo.scores[0].score_key);
        }
      } catch (err: any) {
        setError(err.message || 'Error al cargar Carrera de Scores');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const paises = useMemo(() => [...new Set(scores.map(s => s.pais))], [scores]);
  const segmentos = useMemo(() => [...new Set(scores.filter(s => s.pais === pais).map(s => s.segmento))], [scores, pais]);
  const scoresDisponibles = useMemo(() => scores.filter(s => s.pais === pais && s.segmento === segmento), [scores, pais, segmento]);
  const cepasDisponibles = useMemo(() => {
    const set = new Set(hechos.filter(h => h.score_key === scoreKey).map(h => h.cepa));
    return [...set].sort();
  }, [hechos, scoreKey]);

  useEffect(() => {
    // Al cambiar de score (o cargar), volvemos a arrancar con solo la cepa más
    // reciente tildada — el usuario suma más cepas a mano si quiere.
    if (cepasDisponibles.length === 0) {
      if (cepasSeleccionadas.length !== 0) setCepasSeleccionadas([]);
    } else if (cepasSeleccionadas.some(c => !cepasDisponibles.includes(c)) || cepasSeleccionadas.length === 0) {
      setCepasSeleccionadas([cepasDisponibles[cepasDisponibles.length - 1]]);
    }
  }, [cepasDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

  const gridCompleto = useMemo(
    () => scoreKey && cepasSeleccionadas.length > 0 ? pivotGrid(hechos, bandas, scoreKey, cepasSeleccionadas) : [],
    [hechos, bandas, scoreKey, cepasSeleccionadas]
  );
  const bandasDisponibles = useMemo(() => gridCompleto.filter(r => !r.esTotal).map(r => r.banda), [gridCompleto]);

  useEffect(() => {
    // Al cambiar de score cambian las bandas posibles — arrancamos con todas tildadas.
    if (bandasDisponibles.length === 0) {
      if (bandasSeleccionadas.length !== 0) setBandasSeleccionadas([]);
    } else if (bandasSeleccionadas.some(b => !bandasDisponibles.includes(b)) || bandasSeleccionadas.length === 0) {
      setBandasSeleccionadas(bandasDisponibles);
    }
  }, [bandasDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoreActual = scores.find(s => s.score_key === scoreKey);
  const indicadores = useMemo(
    () => gridCompleto.length > 0 ? computeHeaderIndicators(gridCompleto, bandas, scoreKey, scoreActual?.lift_d1_d10 ? Number(scoreActual.lift_d1_d10) : null) : null,
    [gridCompleto, bandas, scoreKey, scoreActual]
  );
  const grid = useMemo(
    () => filterGridByBanda(gridCompleto, new Set(bandasSeleccionadas)),
    [gridCompleto, bandasSeleccionadas]
  );
  const totalRow = gridCompleto.find(r => r.esTotal);
  const sinDatos = cepasSeleccionadas.length === 0 || !totalRow || totalRow.qVendidos === 0;
  const sinBandasElegidas = !sinDatos && bandasSeleccionadas.length === 0;

  const comparativoARG = useMemo(() => {
    if (cepasSeleccionadas.length === 0) return [];
    return scores.filter(s => s.pais === 'ARG').map(s => ({
      scoreKey: s.score_key, nombre: s.nombre || s.score_key, segmento: s.segmento,
      grid: pivotGrid(hechos, bandas, s.score_key, cepasSeleccionadas),
    }));
  }, [scores, hechos, bandas, cepasSeleccionadas]);

  const comparativoCOL = useMemo(() => {
    if (cepasSeleccionadas.length === 0) return [];
    return scores.filter(s => s.pais === 'COL').map(s => ({
      scoreKey: s.score_key, nombre: s.nombre || s.score_key, segmento: s.segmento,
      grid: pivotGrid(hechos, bandas, s.score_key, cepasSeleccionadas),
    }));
  }, [scores, hechos, bandas, cepasSeleccionadas]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando Carrera de Scores...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" /> {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-lg font-bold text-white">Riesgos › Carrera de Scores</h2>
        <p className="text-zinc-500 text-sm mt-0.5">¿Cada score propio sigue ordenando el riesgo como prometió en su desarrollo?</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Selector label="País" value={pais} options={paises} onChange={(v) => {
          setPais(v);
          const nuevoSegmento = scores.find(s => s.pais === v)?.segmento ?? '';
          setSegmento(nuevoSegmento);
          setScoreKey(scores.find(s => s.pais === v && s.segmento === nuevoSegmento)?.score_key ?? '');
        }} />
        <Selector label="Segmento" value={segmento} options={segmentos} onChange={(v) => {
          setSegmento(v);
          setScoreKey(scores.find(s => s.pais === pais && s.segmento === v)?.score_key ?? '');
        }} />
        <Selector label="Score" value={scoreKey} options={scoresDisponibles.map(s => s.score_key)} onChange={setScoreKey} labelFor={(k) => scores.find(s => s.score_key === k)?.nombre || k} />
        <MultiSelectDropdown label="Cepa de desembolso" values={cepasSeleccionadas} options={[...cepasDisponibles].reverse()} onChange={setCepasSeleccionadas} labelFor={(c) => String(c).slice(0, 10)} />
        <MultiSelectDropdown label="Banda" values={bandasSeleccionadas} options={bandasDisponibles} onChange={setBandasSeleccionadas}
          labelFor={(b) => b === 'SIN_SCORE' ? 'SIN SCORE' : b === 'ERROR_NODO' ? 'ERROR NODO' : b === 'FUERA_DE_RANGO' ? 'FUERA DE RANGO' : `Banda ${b}`} />
      </div>

      {sinDatos ? (
        <div className="text-zinc-500 text-sm text-center py-12">
          {cepasSeleccionadas.length === 0 ? 'Elegí al menos una cepa de desembolso.' : 'Este score todavía no tiene datos para mostrar.'}
        </div>
      ) : sinBandasElegidas ? (
        <div className="text-zinc-500 text-sm text-center py-12">
          Elegí al menos una banda para mostrar.
        </div>
      ) : (
        <>
          {indicadores && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <IndicadorCard titulo="Spread observado vs esperado"
                valor={indicadores.spread !== null ? `${indicadores.spread.toFixed(2)}x` : 'volumen insuficiente'}
                sub={indicadores.spreadEsperado !== null ? `esperado (lift d1/d10): ${indicadores.spreadEsperado.toFixed(2)}x` : undefined}
                gris={indicadores.spread === null} />
              <IndicadorCard titulo="Inversiones"
                valor={String(indicadores.inversiones)}
                sub={indicadores.inversiones === 0 ? 'sin inversiones — esperado' : 'algún par de tramos consecutivos se invirtió'} />
              <IndicadorCard titulo="Cobertura" valor={`${indicadores.coberturaPct.toFixed(1)}%`} sub="Q con score / Q vendidos" />
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Banda</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Q vendidos</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Capital</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">K+I</th>
                  {UMBRALES.map(u => (
                    <th key={u} className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Mora {u}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {grid.map(row => (
                  <tr key={row.banda} className={row.esTotal ? 'bg-slate-800/60 font-bold' : 'hover:bg-slate-800/40'}>
                    <td className="px-4 py-3 text-xs text-zinc-200 whitespace-nowrap">
                      {row.label}{row.scoreRange && <span className="text-zinc-500"> ({row.scoreRange})</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-300 whitespace-nowrap">{row.qVendidos.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 text-xs text-blue-400 font-bold whitespace-nowrap">{formatMonto(row.capital)}</td>
                    <td className="px-4 py-3 text-xs text-blue-400 font-bold whitespace-nowrap">{formatMonto(row.capitalMasInteres)}</td>
                    {UMBRALES.map(u => {
                      const celda = row.celdas[u];
                      const pct = formatPct(celda.moraPct);
                      return (
                        <td key={u} className="px-4 py-3 text-xs whitespace-nowrap">
                          {pct === null ? (
                            <span className="text-zinc-600 italic">sin madurar</span>
                          ) : (
                            <span className="text-zinc-100 font-bold">{pct}</span>
                          )}
                          <div className="text-[9px] text-zinc-500">n {celda.nElegible.toLocaleString('es-AR')}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {cepasSeleccionadas.length > 0 && (
        <div className="flex flex-col gap-6">
          <ComparativoTable titulo="Comparativo de scores — ARG" columnas={comparativoARG} />
          <ComparativoTable titulo="Comparativo de scores — COL" columnas={comparativoCOL} />
        </div>
      )}
    </div>
  );
}

function ComparativoTable({ titulo, columnas }: { titulo: string; columnas: ComparativoColumna[] }) {
  if (columnas.length === 0) return null;
  const pais = titulo.includes('ARG') ? 'ARG' : 'COL';

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-white">{titulo}</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="text-left border-collapse">
          <thead className="bg-slate-800">
            <tr>
              <th rowSpan={2} className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap align-bottom border-r border-slate-700">Banda</th>
              {columnas.map(c => (
                <th key={c.scoreKey} colSpan={4} className="px-3 py-2 text-[10px] font-bold text-zinc-300 uppercase text-center whitespace-nowrap border-l border-slate-700">
                  {c.nombre} <span className="text-zinc-500 normal-case">({c.segmento})</span>
                </th>
              ))}
            </tr>
            <tr>
              {columnas.map(c => (
                <Fragment key={c.scoreKey}>
                  <th className="px-3 py-2 text-[9px] font-bold text-zinc-500 uppercase whitespace-nowrap border-l border-slate-700">Q vend.</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-zinc-500 uppercase whitespace-nowrap">Capital</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-zinc-500 uppercase whitespace-nowrap">K+I</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-zinc-500 uppercase whitespace-nowrap">Mora 30</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {[...BANDAS_COMPARATIVO, 'TOTAL'].map(banda => (
              <tr key={banda} className={banda === 'TOTAL' ? 'bg-slate-800/60 font-bold' : 'hover:bg-slate-800/40'}>
                <td className="px-4 py-2 text-xs text-zinc-200 whitespace-nowrap border-r border-slate-800">
                  {banda === 'TOTAL' ? 'Total' : `Banda ${banda}`}
                </td>
                {columnas.map(c => {
                  const row = c.grid.find(r => banda === 'TOTAL' ? r.esTotal : r.banda === banda);
                  const celda30 = row?.celdas[30];
                  const pct = celda30 ? formatPct(celda30.moraPct) : null;
                  return (
                    <Fragment key={c.scoreKey}>
                      <td className="px-3 py-2 text-xs text-zinc-300 whitespace-nowrap border-l border-slate-800">{(row?.qVendidos ?? 0).toLocaleString('es-AR')}</td>
                      <td className="px-3 py-2 text-xs text-blue-400 font-bold whitespace-nowrap">{formatMontoPorPais(row?.capital ?? 0, pais)}</td>
                      <td className="px-3 py-2 text-xs text-blue-400 font-bold whitespace-nowrap">{formatMontoPorPais(row?.capitalMasInteres ?? 0, pais)}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {pct === null ? <span className="text-zinc-600 italic">sin madurar</span> : <span className="text-zinc-100 font-bold">{pct}</span>}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Selector({ label, value, options, onChange, labelFor }: { label: string; value: string; options: string[]; onChange: (v: string) => void; labelFor?: (v: string) => string }) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full text-[10px] font-bold text-white bg-slate-950 hover:bg-slate-900 px-2 py-1.5 rounded-md transition-all focus:outline-none border border-slate-700">
        <option value="">— elegir —</option>
        {options.map(opt => <option key={opt} value={opt}>{labelFor ? labelFor(opt) : opt}</option>)}
      </select>
    </div>
  );
}

function MultiSelectDropdown({ label, values, options, onChange, labelFor }: {
  label: string; values: string[]; options: string[]; onChange: (v: string[]) => void; labelFor?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const todasTildadas = options.length > 0 && values.length === options.length;
  const toggleTodas = () => onChange(todasTildadas ? [] : options);
  const toggleUna = (opt: string) => onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);

  const resumen = options.length === 0 ? '— sin opciones —'
    : values.length === 0 ? '— elegir —'
    : todasTildadas ? 'Todas'
    : values.length === 1 ? (labelFor ? labelFor(values[0]) : values[0])
    : `${values.length} seleccionadas`;

  return (
    <div ref={ref} className="relative flex flex-col gap-2 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[10px] font-bold text-white bg-slate-950 hover:bg-slate-900 px-2 py-1.5 rounded-md transition-all focus:outline-none border border-slate-700">
        <span className="truncate">{resumen}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-20 bg-slate-950 border border-slate-700 rounded-md shadow-xl max-h-56 overflow-y-auto p-2 flex flex-col gap-1">
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase cursor-pointer select-none border-b border-slate-800 pb-1.5 mb-0.5">
            <input type="checkbox" checked={todasTildadas} onChange={toggleTodas} className="accent-blue-500" />
            Todas
          </label>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-1.5 text-[10px] font-bold text-white cursor-pointer select-none hover:bg-slate-900 px-1 py-1 rounded">
              <input type="checkbox" checked={values.includes(opt)} onChange={() => toggleUna(opt)} className="accent-blue-500" />
              {labelFor ? labelFor(opt) : opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function IndicadorCard({ titulo, valor, sub, gris }: { titulo: string; valor: string; sub?: string; gris?: boolean }) {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-zinc-400"><TrendingUp className="w-4 h-4" /><span className="text-sm font-medium">{titulo}</span></div>
      <h3 className={gris ? 'text-lg font-bold text-zinc-500' : 'text-2xl font-bold text-white'}>{valor}</h3>
      {sub && <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-wider">{sub}</p>}
    </div>
  );
}
