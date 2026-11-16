// src/components/submodules/BoardConversionRenovadoresSubmodule.tsx
// Directorio › Conversión de renovadores (crédito n → n+1). Primera versión: matriz paso × mes + detalle mensual.
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import DualScroll from '../ui/DualScroll';
import { fetchConversionRenovadores, refreshConversionRenovadores } from '../../services/api';
import {
  VENTANAS, MESES_OPCIONES, PASOS, UMBRAL_MADUREZ,
  mesesOrdenados, totalesPorMes, construirMatriz, detalleMensual, madurez, esMaduro, tasa,
  colorSemaforo, umbrales, fmtMes, fmtNum, fmtPct, etiquetaPaso,
  type FilaConversion, type Ventana, type Celda,
} from './conversionRenovadoresHelpers';

type Pais = 'COL' | 'ARG';

interface Datos {
  fecha_extraccion: string;
  cached_at: string;
  filas: FilaConversion[];
}

export default function BoardConversionRenovadoresSubmodule() {
  const [pais, setPais] = useState<Pais>('COL');
  const [meses, setMeses] = useState<number>(12);
  const [ventana, setVentana] = useState<Ventana>(5);

  const [datos, setDatos] = useState<Datos | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    fetchConversionRenovadores(pais, meses)
      .then(d => { if (!cancelado) setDatos(d); })
      .catch((err: any) => { if (!cancelado) setError(err.message || 'Error al cargar la conversión de renovadores'); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [pais, meses]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      setDatos(await refreshConversionRenovadores(pais, meses));
    } catch (err: any) {
      setError(err.message || 'Error al refrescar');
    } finally {
      setRefreshing(false);
    }
  };

  const filas = datos?.filas ?? [];
  const listaMeses = useMemo(() => mesesOrdenados(filas), [filas]);
  const totales = useMemo(() => totalesPorMes(filas, ventana), [filas, ventana]);
  const matriz = useMemo(() => construirMatriz(filas, ventana), [filas, ventana]);
  const detalle = useMemo(() => detalleMensual(filas, ventana), [filas, ventana]);
  const u = umbrales(ventana);

  if (loading && !datos) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-zinc-400 text-sm">Cargando conversión de renovadores...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5 overflow-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-lg font-bold text-white">Directorio › Conversión de renovadores</h2>
        <p className="text-zinc-500 text-sm mt-0.5">
          Qué proporción de los clientes que pagan su crédito <span className="text-zinc-300">n</span> toman el crédito <span className="text-zinc-300">n+1</span> tras la oferta de renovación.
        </p>
      </motion.div>

      {/* Filtros */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
        className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">País</span>
          <select value={pais} onChange={e => setPais(e.target.value as Pais)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
            <option value="COL">Colombia</option>
            <option value="ARG">Argentina</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Ventana</span>
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            {VENTANAS.map(v => (
              <button key={v} type="button" onClick={() => setVentana(v)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${ventana === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}`}>
                {v} días
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Rango</span>
          <select value={meses} onChange={e => setMeses(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
            {MESES_OPCIONES.map(m => <option key={m} value={m}>Últimos {m} meses</option>)}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {datos && (
            <span className="text-[11px] text-zinc-500" title={`Consultado al DWH: ${new Date(datos.cached_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`}>
              Datos al <span className="text-zinc-300 font-semibold">{datos.fecha_extraccion.split('-').reverse().join('/')}</span>
            </span>
          )}
          <button onClick={handleRefresh} disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-300 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
            {refreshing || loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Refrescar
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-2 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {datos && filas.length === 0 ? (
        <div className="text-zinc-500 text-sm text-center py-12">Sin datos para estos filtros.</div>
      ) : datos && (
        <>
          {/* Matriz paso × mes */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Conversión / ofertas a {ventana} días, por paso y mes de vencimiento</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Pasá el mouse sobre una celda para ver convertidos, ofertas y madurez.</p>
              </div>
              <Leyenda ventana={ventana} />
            </div>
            <DualScroll maxHeight="70vh">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    <th className="sticky left-0 z-20 bg-slate-900 px-3 py-3 text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Paso</th>
                    {listaMeses.map(mes => (
                      <th key={mes} className="px-2 py-3 text-center text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                        {fmtMes(mes)}
                        {!esMaduro(totales.get(mes)) && <span className="block text-[9px] font-semibold normal-case tracking-normal text-zinc-600">madurez {fmtPct(madurez(totales.get(mes)))}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PASOS.map(paso => {
                    const destacado = paso === 1;
                    return (
                      <tr key={paso} className={`border-b border-slate-800/50 ${destacado ? 'bg-blue-950/30' : ''}`}>
                        <td className={`sticky left-0 z-10 px-3 py-2 text-xs whitespace-nowrap ${destacado ? 'bg-blue-950 text-blue-300 font-bold' : 'bg-slate-900 text-zinc-300'}`}>
                          {etiquetaPaso(paso)}
                        </td>
                        {listaMeses.map(mes => (
                          <CeldaMatriz key={mes} celda={matriz.get(paso)?.get(mes)} total={totales.get(mes)}
                            ventana={ventana} titulo={`${etiquetaPaso(paso)} · ${fmtMes(mes)}`} destacado={destacado} />
                        ))}
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-800/60">
                    <td className="sticky left-0 z-10 bg-slate-800 px-3 py-2 text-xs font-bold text-white whitespace-nowrap">Total</td>
                    {listaMeses.map(mes => (
                      <CeldaMatriz key={mes} celda={totales.get(mes)} total={totales.get(mes)}
                        ventana={ventana} titulo={`Total · ${fmtMes(mes)}`} destacado />
                    ))}
                  </tr>
                </tbody>
              </table>
            </DualScroll>
          </motion.div>

          {/* Detalle mensual */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">Detalle mensual · ventana {ventana} días (todos los pasos)</h3>
            </div>
            <DualScroll maxHeight="60vh">
              <table className="w-full text-sm min-w-[820px]">
                <thead className="sticky top-0 z-10 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    {['Mes', 'Créditos paid', 'Ofertas', `Convirtieron (${ventana}d)`, 'Conv. / ofertas', 'Conv. / paid', '% paid con oferta', `Madurez ${ventana}d`].map((h, i) => (
                      <th key={h} className={`px-3 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detalle.map(d => (
                    <tr key={d.mes} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${d.maduro ? '' : 'text-zinc-500'}`}>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        <span className={d.maduro ? 'text-white' : ''}>{fmtMes(d.mes)}</span>
                        {!d.maduro && (
                          <span title={`Menos del ${fmtPct(UMBRAL_MADUREZ)} de las ofertas cumplieron la ventana de ${ventana} días. El valor todavía puede subir y queda fuera de las comparaciones.`}
                            className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700/60 text-zinc-400 cursor-help">inmaduro</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">{fmtNum(d.paid)}</td>
                      <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">{fmtNum(d.ofertas)}</td>
                      <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">{fmtNum(d.convertidos)}</td>
                      <td className={`px-3 py-2.5 text-xs text-right font-bold whitespace-nowrap ${d.maduro ? 'text-blue-400' : ''}`}>{fmtPct(d.convOfertas)}</td>
                      <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">{fmtPct(d.convPaid)}</td>
                      <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">{fmtPct(d.conOferta)}</td>
                      <td className="px-3 py-2.5 text-xs text-right whitespace-nowrap">{fmtPct(d.madurez)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DualScroll>
          </motion.div>

          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Paid: crédito cerrado con todas las cuotas cobradas. Mes: último vencimiento del crédito pagado.
            Convirtieron: desembolso del crédito n+1 desde el lead de renovación, dentro de los {ventana} días desde la primera oferta.
            Los totales se calculan como Σ convertidos / Σ ofertas. Meses con madurez menor a {fmtPct(UMBRAL_MADUREZ)} en gris
            (umbrales del semáforo a {ventana} días: rojo ≤ {fmtPct(u.rojo)}, amarillo {fmtPct(u.amarillo)}, verde ≥ {fmtPct(u.verde)}).
          </p>
        </>
      )}
    </div>
  );
}

function CeldaMatriz({ celda, total, ventana, titulo, destacado }: {
  celda: Celda | undefined; total: Celda | undefined; ventana: Ventana; titulo: string; destacado?: boolean;
}) {
  const pct = celda ? tasa(celda.conv, celda.ofertas) : null;
  const maduroMes = esMaduro(total);
  const tooltip = celda
    ? [
        titulo,
        `Convirtieron ${fmtNum(celda.conv)} de ${fmtNum(celda.ofertas)} ofertas (${fmtPct(pct)})`,
        `Créditos paid: ${fmtNum(celda.paid)}`,
        `Madurez ${ventana}d del mes: ${fmtPct(madurez(total))}`,
        ...(maduroMes ? [] : ['Mes inmaduro: fuera de las comparaciones']),
      ].join('\n')
    : `${titulo}\nSin créditos paid`;

  if (pct === null) {
    return <td title={tooltip} className="px-2 py-2 text-center text-xs text-zinc-700 whitespace-nowrap">—</td>;
  }
  if (!maduroMes) {
    return (
      <td title={tooltip} className="px-2 py-2 text-center text-xs text-zinc-500 bg-slate-800/40 whitespace-nowrap cursor-help">
        {fmtPct(pct)}
      </td>
    );
  }
  const [r, g, b] = colorSemaforo(pct, ventana);
  return (
    <td title={tooltip}
      style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, 0.28)` }}
      className={`px-2 py-2 text-center text-xs text-white whitespace-nowrap cursor-help ${destacado ? 'font-bold' : ''}`}>
      {fmtPct(pct)}
    </td>
  );
}

function Leyenda({ ventana }: { ventana: Ventana }) {
  const u = umbrales(ventana);
  const muestra = (pct: number) => {
    const [r, g, b] = colorSemaforo(pct, ventana);
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
  };
  return (
    <div className="flex items-center gap-3 text-[10px] text-zinc-400">
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: muestra(u.rojo) }} />≤ {fmtPct(u.rojo)}</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: muestra(u.amarillo) }} />{fmtPct(u.amarillo)}</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: muestra(u.verde) }} />≥ {fmtPct(u.verde)}</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-700" />Madurez &lt; {fmtPct(UMBRAL_MADUREZ)}</span>
    </div>
  );
}
