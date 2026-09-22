import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchCatalogoScores, fetchCarreraScores } from '../../services/api';
import { pivotGrid, computeHeaderIndicators, UMBRALES, type HechoRow, type BandaCatalogo } from './carreraScoresHelpers';

const formatPct = (v: number | null) => v === null ? null : `${v.toFixed(1)}%`;
const formatMonto = (v: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export default function RiCarreraScoresSubmodule() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [bandas, setBandas] = useState<BandaCatalogo[]>([]);
  const [hechos, setHechos] = useState<HechoRow[]>([]);

  const [pais, setPais] = useState<string>('');
  const [segmento, setSegmento] = useState<string>('');
  const [scoreKey, setScoreKey] = useState<string>('');
  const [cepa, setCepa] = useState<string>('');

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
    if (cepasDisponibles.length === 0) {
      if (cepa !== '') setCepa('');
    } else if (!cepasDisponibles.includes(cepa)) {
      setCepa(cepasDisponibles[cepasDisponibles.length - 1]);
    }
  }, [cepasDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => scoreKey && cepa ? pivotGrid(hechos, bandas, scoreKey, cepa) : [], [hechos, bandas, scoreKey, cepa]);
  const scoreActual = scores.find(s => s.score_key === scoreKey);
  const indicadores = useMemo(
    () => grid.length > 0 ? computeHeaderIndicators(grid, bandas, scoreKey, scoreActual?.lift_d1_d10 ? Number(scoreActual.lift_d1_d10) : null) : null,
    [grid, bandas, scoreKey, scoreActual]
  );
  const totalRow = grid.find(r => r.esTotal);
  const sinDatos = !cepa || !totalRow || totalRow.qVendidos === 0;

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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Selector label="País" value={pais} options={paises} onChange={(v) => { setPais(v); setSegmento(''); setScoreKey(''); }} />
        <Selector label="Segmento" value={segmento} options={segmentos} onChange={(v) => { setSegmento(v); setScoreKey(''); }} />
        <Selector label="Score" value={scoreKey} options={scoresDisponibles.map(s => s.score_key)} onChange={setScoreKey} labelFor={(k) => scores.find(s => s.score_key === k)?.nombre || k} />
        <Selector label="Cepa de desembolso" value={cepa} options={cepasDisponibles} onChange={setCepa} labelFor={(c) => String(c).slice(0, 10)} />
      </div>

      {sinDatos ? (
        <div className="text-zinc-500 text-sm text-center py-12">
          Este score todavía no tiene datos para mostrar.
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

function IndicadorCard({ titulo, valor, sub, gris }: { titulo: string; valor: string; sub?: string; gris?: boolean }) {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-zinc-400"><TrendingUp className="w-4 h-4" /><span className="text-sm font-medium">{titulo}</span></div>
      <h3 className={gris ? 'text-lg font-bold text-zinc-500' : 'text-2xl font-bold text-white'}>{valor}</h3>
      {sub && <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-wider">{sub}</p>}
    </div>
  );
}
