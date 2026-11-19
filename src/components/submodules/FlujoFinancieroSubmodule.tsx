// src/components/submodules/FlujoFinancieroSubmodule.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RefreshCcw, Loader2, AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Bot, User, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Chart, registerables } from 'chart.js';
import { chatWithData } from '../../services/gemini';
Chart.register(...registerables);
import {
  ROWS_AR_REAL, ROWS_AR_PROY, ROWS_CO_REAL, ROWS_CO_PROY,
  parseDailyReal, parseDailyProy, parseProveedoresAr, parseProveedoresCo, parseSheetDate, parseVencimientoEstricto,
  weeksInMonth, daysInMonth, getKpiPeriodo, sumRangeReal, fmt, fmtLocal, rcT, formatSheetCell, toDateStr,
  type DiaFlujo, type DiaProyeccion, type ProveedorRow, type Pais, type Semana,
} from './flujoFinancieroHelpers';
import PageLoader from '../PageLoader';

type MetricaDia = 'cobranzas' | 'originaciones' | 'proveedores' | 'impuestos';
const METRICA_DIA_LABELS: Record<MetricaDia, string> = {
  cobranzas: 'Cobranzas', originaciones: 'Ventas', proveedores: 'Proveedores', impuestos: 'Impuestos',
};

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Claves especiales del filtro Vencimiento para filas que no tienen una fecha
// utilizable: vacías, o texto cargado a mano que `parseSheetDate` no puede
// interpretar con certeza (ej. "Vier 13/02", "mar 03/feb" — día/mes mezclados).
const VENC_VACIO = '__vacio__';
const VENC_INVALIDO = '__invalido__';

// Etiquetas amigables por fuente para el aviso de datos parciales — nunca se muestra
// el `message` crudo del error (puede traer identificadores internos de la service
// account de Google), solo esta etiqueta derivada de la clave `fuente`.
const FUENTE_LABELS: Record<string, string> = {
  arReal: 'Cashflow Argentina',
  arProy: 'Proyecciones Argentina',
  arProveedores: 'Proveedores Argentina',
  coReal: 'Cashflow Colombia',
  coProy: 'Proyecciones Colombia',
  coProveedores: 'Proveedores Colombia',
  arOriginaciones: 'Originaciones (S3) Argentina',
  coOriginaciones: 'Originaciones (S3) Colombia',
};

const C = {
  bg: '#060d1c', bgCard: '#0c1528', bgCard2: '#111e35', border: '#1a2845', border2: '#243558',
  txt: '#e2e8f5', txt2: '#7a90b0', txt3: '#3d5070',
  greenL: '#34d399', redL: '#fb7185', amberL: '#fcd34d', blueL: '#60a5fa', green: '#10b981', amber: '#f59e0b',
};

const card: CSSProperties = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, position: 'relative', overflow: 'hidden' };
const mono: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

// Tarjeta estandarizada: real (verde), proyectado (azul), gap absoluto (rojo), % de gap
// (naranja) — mismo juego de campos en Fila 1 y Fila 2, siempre con la misma estructura
// (el caller pasa val=0 cuando el día todavía no transcurrió, en vez de ocultar campos,
// para que la tarjeta no cambie de tamaño/forma al cambiar de fecha).
function MetricCard({ label, val, proyVal, pais, compact }: {
  label: string; val: number; proyVal: number | null; pais: Pais; compact?: boolean;
}) {
  const gap = proyVal !== null ? Math.abs(val) - Math.abs(proyVal) : null;
  const pct = proyVal !== null && Math.abs(proyVal) > 0 ? (Math.abs(val) / Math.abs(proyVal)) * 100 : null;
  const sign = val < 0 ? '-' : '';

  return (
    <div style={{ ...card, padding: compact ? '14px 16px' : '16px 18px' }}>
      <div style={{ fontSize: compact ? 9.5 : 12, fontWeight: 700, color: C.txt2, textTransform: compact ? 'uppercase' : undefined, letterSpacing: compact ? 0.5 : undefined, marginBottom: compact ? 9 : 10 }}>{label}</div>
      <div style={{ fontSize: compact ? 20 : 22, fontWeight: 800, letterSpacing: -1, ...mono, color: C.txt, marginBottom: 5 }}>{sign}{fmt(val)}</div>
      <div style={{ fontSize: 11, ...mono, color: C.txt3 }}>{fmtLocal(val, pais)}</div>
      {proyVal !== null && (
        <>
          <div style={{ fontSize: 10.5, color: C.blueL, marginTop: 6 }}>Proy: <strong>{fmt(proyVal)}</strong></div>
          {gap !== null && (
            <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: C.redL }}>{gap > 0 ? '+' : ''}{fmt(gap)} gap</div>
          )}
          {pct !== null && (
            <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 2, color: C.amberL }}>{pct.toFixed(1)}%</div>
          )}
        </>
      )}
    </div>
  );
}

type Vista = 'mes' | 'semana' | 'dia';

interface PaisData {
  real: DiaFlujo[];
  proy: DiaProyeccion[];
  proveedores: ProveedorRow[];
}

const PROV_PAGE_SIZE = 25;

export default function FlujoFinancieroSubmodule({ userEmail }: { userEmail?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataAr, setDataAr] = useState<PaisData | null>(null);
  const [dataCo, setDataCo] = useState<PaisData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [errores, setErrores] = useState<{ fuente: string; message: string }[]>([]);

  const [pais, setPais] = useState<Pais>('AR');
  const [selYear, setSelYear] = useState(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(new Date().getMonth());
  const [vista, setVista] = useState<Vista>('mes');
  const [selWeekIdx, setSelWeekIdx] = useState(0);
  const [selDay, setSelDay] = useState<string>('');

  const [provBusqueda, setProvBusqueda] = useState('');
  const [provSociedad, setProvSociedad] = useState('');
  const [provAprobacion, setProvAprobacion] = useState('');
  const [provTipo, setProvTipo] = useState('');
  const [provMes, setProvMes] = useState('');
  const [provVencExcluidos, setProvVencExcluidos] = useState<Set<string>>(new Set());
  const [provPage, setProvPage] = useState(0);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [chartGran, setChartGran] = useState<Vista>('mes');
  const [tablaMetrica, setTablaMetrica] = useState<MetricaDia>('cobranzas');

  // Opciones del selector de Año — año actual ± 1. Las Originaciones (S3) se piden al
  // backend para el rango del año elegido; los Sheets de Cashflow/Proyecciones se
  // devuelven completos y se filtran acá, así que un año sin columnas simplemente
  // queda sin datos (ver el fallback "Sin datos para ..." más abajo).
  const aniosDisponibles = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      if (force) await fetch(`/api/flujo-financiero/refresh?anio=${selYear}`);
      const res = await fetch(`/api/flujo-financiero?anio=${selYear}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setDataAr({
        real: parseDailyReal(json.ar.real, ROWS_AR_REAL, json.ar.originaciones, selYear),
        proy: parseDailyProy(json.ar.proy, ROWS_AR_PROY, selYear),
        proveedores: parseProveedoresAr(json.ar.proveedores),
      });
      setDataCo({
        real: parseDailyReal(json.co.real, ROWS_CO_REAL, json.co.originaciones, selYear),
        proy: parseDailyProy(json.co.proy, ROWS_CO_PROY, selYear),
        proveedores: parseProveedoresCo(json.co.proveedores),
      });
      setErrores(json.errores ?? []);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [selYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activo = pais === 'AR' ? dataAr : dataCo;

  const semanas: Semana[] = useMemo(() => weeksInMonth(selYear, selMonth), [selYear, selMonth]);
  const dias: string[] = useMemo(() => daysInMonth(selYear, selMonth), [selYear, selMonth]);

  useEffect(() => { setSelWeekIdx(0); }, [selMonth]);
  // Los valores de sociedad/tipo/vencimiento son específicos de cada país — al cambiar
  // de país se limpian para no dejar un filtro seleccionado que no existe en el otro
  // dataset y termine mostrando la tabla vacía sin que se note por qué.
  useEffect(() => { setProvSociedad(''); setProvTipo(''); setProvMes(''); setProvVencExcluidos(new Set()); }, [pais]);
  useEffect(() => { if (dias.length > 0) setSelDay(d => dias.includes(d) ? d : dias[0]); }, [dias]);

  // Rango de la Fila 1 según la vista elegida
  const rangoPeriodo = useMemo((): { start: string; end: string } => {
    if (vista === 'dia') return { start: selDay, end: selDay };
    if (vista === 'semana') {
      const w = semanas[selWeekIdx] ?? semanas[0];
      return w ? { start: w.start, end: w.end } : { start: dias[0], end: dias[0] };
    }
    return { start: dias[0], end: dias[dias.length - 1] };
  }, [vista, selDay, selWeekIdx, semanas, dias]);

  // Rango del mes completo para la Fila 2 (siempre el mes, sin importar la vista)
  const rangoMes = useMemo(() => ({ start: dias[0], end: dias[dias.length - 1] }), [dias]);

  const kpiPeriodo = useMemo(
    () => activo ? getKpiPeriodo(activo.real, activo.proy, rangoPeriodo.start, rangoPeriodo.end) : null,
    [activo, rangoPeriodo]
  );
  const kpiMes = useMemo(
    () => activo ? getKpiPeriodo(activo.real, activo.proy, rangoMes.start, rangoMes.end) : null,
    [activo, rangoMes]
  );
  // El gráfico de evolución tiene su propio selector de agrupación (chartGran),
  // independiente de la Vista de arriba — igual que Proveedores, no queremos que
  // dependa de un control ajeno al gráfico. "mes" muestra los 12 meses del año,
  // "semana" las semanas del mes elegido arriba, "día" los días del mes elegido.
  const MS_CORTAS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const ratiosChart = useMemo(() => {
    if (!activo) return [] as { label: string; ratio: number }[];
    if (chartGran === 'semana') {
      return semanas.map(w => ({ label: w.label, ratio: getKpiPeriodo(activo.real, activo.proy, w.start, w.end).ratio }));
    }
    if (chartGran === 'dia') {
      return dias.map(d => {
        const dt = new Date(d + 'T12:00:00');
        return { label: `${dt.getDate()}`, ratio: getKpiPeriodo(activo.real, activo.proy, d, d).ratio };
      });
    }
    return Array.from({ length: 12 }, (_, m) => {
      const diasDelMes = daysInMonth(selYear, m);
      return { label: MS_CORTAS[m], ratio: getKpiPeriodo(activo.real, activo.proy, diasDelMes[0], diasDelMes[diasDelMes.length - 1]).ratio };
    });
  }, [activo, chartGran, semanas, dias, selYear]);

  const indiceResaltado = chartGran === 'semana' ? selWeekIdx : chartGran === 'dia' ? dias.indexOf(selDay) : selMonth;

  // Vista Día = hoy o un día futuro: todavía no hay real cargado para esa fecha, así
  // que las tarjetas con proyección muestran solo el proyectado (Saldo Inicio/Final
  // quedan exentas: son un saldo "arrastrado" del último día real disponible, no un
  // dato inventado del día elegido).
  const hoyStr = useMemo(() => toDateStr(new Date()), []);
  const ocultarRealDia = vista === 'dia' && selDay !== '' && selDay >= hoyStr;

  // Cobranza real del mes en curso: se cuenta solo hasta AYER (el día de hoy todavía no
  // cerró y los días futuros traen estimaciones cargadas en el sheet). Aplica únicamente
  // a la tarjeta de Cobranzas de "Totales del Mes" y de "Resumen"; proyectado, gap, ratio
  // y el resto de los KPIs siguen usando el mes completo.
  const esMesEnCurso = selYear === new Date().getFullYear() && selMonth === new Date().getMonth();
  const cobranzaRealMes = useMemo(() => {
    if (!activo || !kpiMes) return 0;
    if (!esMesEnCurso) return kpiMes.cobranzas;
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
    return sumRangeReal(activo.real, 'cobranzas', rangoMes.start, toDateStr(ayer));
  }, [activo, kpiMes, esMesEnCurso, rangoMes]);

  // Proveedores tiene su propio set de filtros, independiente del selector "Mes" de
  // arriba (que solo gobierna las Filas 1/2, Otros Rubros y el gráfico) — igual que en
  // el HTML original, donde el panel de Proveedores filtraba por sus propios controles.
  const proveedoresPais = activo?.proveedores ?? [];

  // El filtro "Mes" de Proveedores apunta al campo `mes` de cada fila (no a
  // `vencimiento`, que es una fecha puntual de pago) — se agrupa por año-mes para
  // que el dropdown liste meses, no cientos de fechas exactas.
  const mesKeyDe = useCallback((mesRaw: string): string | null => {
    const fecha = parseSheetDate(mesRaw);
    return fecha ? `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}` : null;
  }, []);

  const proveedoresFiltrados = useMemo(() => {
    const q = provBusqueda.trim().toLowerCase();
    return proveedoresPais.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) && !p.detalle.toLowerCase().includes(q)) return false;
      if (provSociedad && p.sociedad !== provSociedad) return false;
      if (provAprobacion && p.aprobacion !== provAprobacion) return false;
      if (provTipo && p.detalle !== provTipo) return false;
      if (provMes && mesKeyDe(p.mes) !== provMes) return false;
      if (provVencExcluidos.size > 0) {
        const raw = (p.vencimiento ?? '').trim();
        if (raw === '') {
          if (provVencExcluidos.has(VENC_VACIO)) return false;
        } else {
          const fechaVenc = parseVencimientoEstricto(p.vencimiento);
          const key = fechaVenc ? toDateStr(fechaVenc) : VENC_INVALIDO;
          if (provVencExcluidos.has(key)) return false;
        }
      }
      return true;
    });
  }, [proveedoresPais, provBusqueda, provSociedad, provAprobacion, provTipo, provMes, mesKeyDe, provVencExcluidos]);

  // Árbol Mes > Día para el filtro "Vencimiento" — se arma a partir de `p.vencimiento`
  // (fecha puntual de pago), no de `p.mes`. Además de los meses reales, se cuentan
  // aparte las filas vacías y las que traen texto no parseable (cargado a mano,
  // ej. "Vier 13/02"), para poder incluirlas/excluirlas como ítems propios.
  const vencimientoInfo = useMemo(() => {
    const porMes = new Map<string, { label: string; dias: Map<string, string> }>();
    let vacioCount = 0, invalidoCount = 0;
    for (const p of proveedoresPais) {
      const raw = (p.vencimiento ?? '').trim();
      if (raw === '') { vacioCount++; continue; }
      const fecha = parseVencimientoEstricto(p.vencimiento);
      if (!fecha) { invalidoCount++; continue; }
      const monthKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      const dayKey = toDateStr(fecha);
      if (!porMes.has(monthKey)) porMes.set(monthKey, { label: `${MN[fecha.getMonth()]} ${fecha.getFullYear()}`, dias: new Map() });
      porMes.get(monthKey)!.dias.set(dayKey, String(fecha.getDate()).padStart(2, '0'));
    }
    const meses = [...porMes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, { label, dias }]) => ({
        monthKey,
        label,
        dias: [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([dayKey, dayLabel]) => ({ dayKey, dayLabel })),
      }));
    return { meses, vacioCount, invalidoCount };
  }, [proveedoresPais]);

  const sociedadesDisponibles = useMemo(
    () => [...new Set(proveedoresPais.map(p => p.sociedad).filter(s => s.trim() !== ''))].sort(),
    [proveedoresPais]
  );
  const tiposDisponibles = useMemo(
    () => [...new Set(proveedoresPais.map(p => p.detalle).filter(s => s.trim() !== ''))].sort(),
    [proveedoresPais]
  );
  const mesesProveedorDisponibles = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const p of proveedoresPais) {
      const key = mesKeyDe(p.mes);
      if (!key || vistos.has(key)) continue;
      const fecha = parseSheetDate(p.mes)!;
      vistos.set(key, `${MN[fecha.getMonth()]} ${fecha.getFullYear()}`);
    }
    return [...vistos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [proveedoresPais, mesKeyDe]);

  // Resumen y fila de total: siempre sobre TODAS las filas filtradas, no solo la página visible.
  const provResumen = useMemo(() => {
    const porEstado = (estado: string) => {
      const filas = proveedoresFiltrados.filter(p => p.aprobacion === estado);
      return { facturas: filas.length, importe: filas.reduce((s, p) => s + p.importe, 0) };
    };
    return {
      facturas: proveedoresFiltrados.length,
      proveedores: new Set(proveedoresFiltrados.map(p => p.nombre.trim().toLowerCase())).size,
      importe: proveedoresFiltrados.reduce((s, p) => s + p.importe, 0),
      pagado: porEstado('Si'),
      pendiente: porEstado('pendiente'),
    };
  }, [proveedoresFiltrados]);

  const provTotalPages = Math.max(1, Math.ceil(proveedoresFiltrados.length / PROV_PAGE_SIZE));
  // Cualquier cambio de filtro (o de país) vuelve a la página 1, para no quedar parado en
  // una página que ya no existe con el nuevo resultado.
  useEffect(() => { setProvPage(0); }, [proveedoresFiltrados]);
  const paginaActual = Math.min(provPage, provTotalPages - 1);
  const proveedoresPagina = proveedoresFiltrados.slice(paginaActual * PROV_PAGE_SIZE, (paginaActual + 1) * PROV_PAGE_SIZE);

  // ── Chat con los datos ───────────────────────────────────────────────────────
  // Se le pasa el cashflow diario del año del país activo (real + proyectado por día),
  // que el digest de gemini.ts agrega por mes. Proveedores va como resumen en los
  // filtros activos, para no mezclar dos granos distintos en el mismo dataset.
  const chatRows = useMemo(() => {
    if (!activo) return [] as Record<string, unknown>[];
    const proyPorFecha = new Map(activo.proy.map(d => [d.dateStr, d]));
    return activo.real.map(d => {
      const p = proyPorFecha.get(d.dateStr);
      return {
        fecha: d.dateStr,
        pais: pais === 'AR' ? 'ARG' : 'COL',
        moneda: pais === 'AR' ? 'ARS' : 'COP',
        cobranzas_real: d.cobranzas,
        cobranzas_proy: p?.cobranzas ?? null,
        originaciones_real: d.originaciones,
        originaciones_proy: p?.originaciones ?? null,
        proveedores_real: d.proveedores,
        proveedores_proy: p?.proveedores ?? null,
        impuestos_real: d.impuestos,
        impuestos_proy: p?.impuestos ?? null,
        devoluciones_real: d.devoluciones,
        saldo_inicio: d.saldoInicio,
        saldo_final: d.saldoFinal,
      };
    });
  }, [activo, pais]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading || chatRows.length === 0) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);
    try {
      const activeFilters = [
        { field: 'país', values: [pais === 'AR' ? 'Argentina (ARS)' : 'Colombia (COP)'] },
        { field: 'año', values: [String(selYear)] },
        { field: 'mes seleccionado en pantalla', values: [`${MN[selMonth]} ${selYear}`] },
        { field: 'vista', values: [vista === 'dia' ? `día ${selDay}` : vista === 'semana' ? `semana ${semanas[selWeekIdx]?.label ?? ''}` : 'mes'] },
        {
          field: 'resumen proveedores (con los filtros de la tabla)',
          values: [
            `${provResumen.facturas} facturas de ${provResumen.proveedores} proveedores, total ${fmtLocal(provResumen.importe, pais)}`,
            `Pagado: ${provResumen.pagado.facturas} facturas, ${fmtLocal(provResumen.pagado.importe, pais)}`,
            `Pendiente: ${provResumen.pendiente.facturas} facturas, ${fmtLocal(provResumen.pendiente.importe, pais)}`,
          ],
        },
      ];
      const reply = await chatWithData(newMsgs, chatRows, activeFilters, userEmail, 'flujo-financiero');
      setChatMessages([...newMsgs, { role: 'model' as const, content: reply }]);
    } catch (err: any) {
      setChatMessages([...newMsgs, { role: 'model' as const, content: `Hubo un error al procesar tu pregunta: ${err.message || err}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const chartRatioRef = useRef<HTMLCanvasElement>(null);
  const chartRatioInst = useRef<Chart | null>(null);

  useEffect(() => {
    chartRatioInst.current?.destroy();
    if (!chartRatioRef.current || ratiosChart.length === 0) return;

    const colorPorRatio = (r: number) => {
      const est = rcT(r, pais);
      return est.cls === 'sem-red' ? '#f43f5e' : est.cls === 'sem-yellow' ? '#f59e0b' : '#10b981';
    };

    chartRatioInst.current = new Chart(chartRatioRef.current, {
      type: 'bar',
      data: {
        labels: ratiosChart.map(r => r.label),
        datasets: [{
          data: ratiosChart.map(r => r.ratio),
          backgroundColor: ratiosChart.map(r => colorPorRatio(r.ratio)),
          borderColor: ratiosChart.map((_, i) => i === indiceResaltado ? '#fff' : 'transparent'),
          borderWidth: ratiosChart.map((_, i) => i === indiceResaltado ? 2 : 0),
          borderRadius: 5,
        } as any],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c: any) => ` ${c.raw.toFixed(1)}%` } },
        },
        scales: {
          x: { ticks: { color: C.txt3, font: { size: 10 } }, grid: { color: 'rgba(26,40,69,0.8)' } },
          y: { ticks: { color: C.txt3, font: { size: 10 }, callback: (v: any) => `${v}%` }, grid: { color: 'rgba(26,40,69,0.8)' } },
        },
      },
    });

    return () => { chartRatioInst.current?.destroy(); };
  }, [ratiosChart, indiceResaltado, pais]);

  if (loading) return (
    <PageLoader message="Cargando datos de flujo financiero..." />
  );

  if (error) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '80px 0', background: C.bg }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 320, textAlign: 'center' }}>
        <AlertCircle style={{ width: 40, height: 40, color: C.redL }} />
        <p style={{ color: C.txt, fontWeight: 700 }}>Error al cargar datos</p>
        <p style={{ color: C.txt2, fontSize: 13 }}>{error}</p>
        <button onClick={() => fetchData(true)} style={{ padding: '8px 16px', background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 8, color: C.blueL, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCcw size={14} /> Reintentar
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: '100%', flex: 1, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: C.txt }}>
      {/* ── HEADER ── */}
      <div style={{ background: 'linear-gradient(135deg,#07102a 0%,#0c1a3a 100%)', borderBottom: `1px solid ${C.border}`, padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg,#3b82f6,#7c3aed)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff', flexShrink: 0 }}>G</div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>Flujo Financiero</div>
            <div style={{ fontSize: 11, color: C.txt2, marginTop: 3 }}>Grupo Libgot · Anticipo · {pais === 'AR' ? 'Argentina' : 'Colombia'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefresh && <span style={{ fontSize: 10, color: C.txt3 }}>Act. {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => fetchData(true)} style={{ padding: 6, background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.txt2, cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Actualizar">
            <RefreshCcw size={13} />
          </button>
        </div>
      </div>

      {/* ── CONTROLS ── */}
      <div style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>País</span>
          <select value={pais} onChange={e => setPais(e.target.value as Pais)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            <option value="AR">🇦🇷 Argentina</option>
            <option value="CO">🇨🇴 Colombia</option>
          </select>
        </div>
        <div style={{ width: 1, height: 22, background: C.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Año</span>
          <select value={selYear} onChange={e => setSelYear(parseInt(e.target.value))} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {aniosDisponibles.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 22, background: C.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Mes</span>
          <select value={selMonth} onChange={e => setSelMonth(parseInt(e.target.value))} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {MN.map((mn, i) => <option key={i} value={i}>{mn} {selYear}</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 22, background: C.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Vista</span>
          <select value={vista} onChange={e => setVista(e.target.value as Vista)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            <option value="mes">Mes</option>
            <option value="semana">Semana</option>
            <option value="dia">Día</option>
          </select>
        </div>
        {vista === 'semana' && (
          <select value={selWeekIdx} onChange={e => setSelWeekIdx(parseInt(e.target.value))} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {semanas.map((w, i) => <option key={i} value={i}>{w.label}</option>)}
          </select>
        )}
        {vista === 'dia' && (
          <select value={selDay} onChange={e => setSelDay(e.target.value)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {dias.map(d => {
              const dt = new Date(d + 'T12:00:00');
              return <option key={d} value={d}>{dt.getDate()} {MN[dt.getMonth()].slice(0, 3)}</option>;
            })}
          </select>
        )}
      </div>

      {/* ── MAIN ── */}
      <div style={{ padding: '20px 24px', maxWidth: 1680, margin: '0 auto' }}>
        {errores.length > 0 && (
          <div style={{ ...card, borderColor: 'rgba(252,211,77,.4)', background: 'rgba(252,211,77,.06)', padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertCircle style={{ width: 18, height: 18, color: C.amberL, flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: C.txt2, lineHeight: 1.5 }}>
              <strong style={{ color: C.amberL }}>No se pudieron cargar:</strong>{' '}
              {errores.map(e => FUENTE_LABELS[e.fuente] ?? e.fuente).join(', ')}
              . Mostrando datos parciales.
            </div>
          </div>
        )}
        {!activo || !kpiPeriodo || !kpiMes || activo.real.length === 0 ? (
          <p style={{ color: C.txt2, fontSize: 13 }}>Sin datos para {pais === 'AR' ? 'Argentina' : 'Colombia'}.</p>
        ) : (
          <>
            {/* Fila 1: posición del período elegido */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                {vista === 'dia' ? 'Posición del Día' : vista === 'semana' ? 'Posición de la Semana' : 'Totales del Mes'}
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
              {([
                { lbl: 'Saldo Inicio', val: kpiPeriodo.saldoInicio, proy: null, isEgreso: false, exento: true },
                { lbl: 'Cobranzas', val: vista === 'mes' ? cobranzaRealMes : kpiPeriodo.cobranzas, proy: kpiPeriodo.proy?.cobranzas ?? null, isEgreso: false, exento: false },
                // Sin proyección en el sheet: solo el real del período elegido.
                { lbl: 'Devoluciones', val: kpiPeriodo.devoluciones, proy: null, isEgreso: false, exento: false },
                { lbl: 'Originaciones', val: -kpiPeriodo.originaciones, proy: kpiPeriodo.proy?.originaciones ?? null, isEgreso: true, exento: false },
                { lbl: 'Proveedores', val: -kpiPeriodo.proveedores, proy: kpiPeriodo.proy?.proveedores ?? null, isEgreso: true, exento: false },
                { lbl: 'Impuestos', val: -kpiPeriodo.impuestos, proy: kpiPeriodo.proy?.impuestos ?? null, isEgreso: true, exento: false },
                { lbl: 'Saldo Final', val: kpiPeriodo.saldoFinal, proy: null, isEgreso: false, exento: true },
              ] as const).map(c => {
                const proyVal = c.proy === null ? null : (c.isEgreso ? -c.proy : c.proy);
                const valMostrado = (!c.exento && ocultarRealDia) ? 0 : c.val;
                return (
                  <MetricCard key={c.lbl} label={c.lbl} val={valMostrado} proyVal={proyVal} pais={pais} compact />
                );
              })}
              {(() => {
                const ratioMostrado = ocultarRealDia ? 0 : kpiPeriodo.ratio;
                const ratioEstado = rcT(ratioMostrado, pais);
                const color = ratioEstado.cls === 'sem-red' ? C.redL : ratioEstado.cls === 'sem-yellow' ? C.amberL : C.greenL;
                const gapPts = kpiPeriodo.proy ? ratioMostrado - kpiPeriodo.proy.ratio : null;
                return (
                  <div style={{ ...card, padding: '14px 16px', borderColor: ratioEstado.alerta ? 'rgba(244,63,94,.4)' : C.border }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 9 }}>Ratio Orig/Cob</div>
                    <div style={{ fontSize: 20, fontWeight: 800, ...mono, color }}>{ratioMostrado.toFixed(1)}%</div>
                    <div style={{ fontSize: 10, color: C.txt3, marginTop: 4 }}>Orig {fmt(ocultarRealDia ? 0 : kpiPeriodo.originaciones)} / Cob {fmt(ocultarRealDia ? 0 : kpiPeriodo.cobranzas)}</div>
                    {kpiPeriodo.proy && (
                      <div style={{ fontSize: 10, color: C.blueL, marginTop: 6 }}>Proy: <strong>{kpiPeriodo.proy.ratio.toFixed(1)}%</strong></div>
                    )}
                    {gapPts !== null && (
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: C.redL }}>{gapPts > 0 ? '+' : ''}{gapPts.toFixed(1)} pp</div>
                    )}
                    {ratioEstado.alerta && <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700, color: C.redL }}>ALERTA</div>}
                  </div>
                );
              })()}
            </div>

            {/* Fila 2: resumen del mes calendario completo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                Resumen - {MN[selMonth]} {selYear}
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              {([
                { lbl: 'Ventas', val: kpiMes.originaciones, proy: kpiMes.proy?.originaciones ?? null },
                { lbl: 'Cobranzas', val: cobranzaRealMes, proy: kpiMes.proy?.cobranzas ?? null },
                { lbl: 'Proveedores', val: kpiMes.proveedores, proy: kpiMes.proy?.proveedores ?? null },
                { lbl: 'Impuestos', val: kpiMes.impuestos, proy: kpiMes.proy?.impuestos ?? null },
              ] as const).map(c => (
                <MetricCard key={c.lbl} label={c.lbl} val={c.val} proyVal={c.proy} pais={pais} />
              ))}

              {(() => {
                const ratioEstado = rcT(kpiMes.ratio, pais);
                const color = ratioEstado.cls === 'sem-red' ? C.redL : ratioEstado.cls === 'sem-yellow' ? C.amberL : C.greenL;
                const gapPts = kpiMes.proy ? kpiMes.ratio - kpiMes.proy.ratio : null;
                return (
                  <div style={{ ...card, padding: '16px 18px', borderColor: ratioEstado.alerta ? 'rgba(244,63,94,.4)' : C.border }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2, marginBottom: 10 }}>Ratio Orig/Cob</div>
                    <div style={{ fontSize: 22, fontWeight: 800, ...mono, color, marginBottom: 8 }}>{kpiMes.ratio.toFixed(1)}%</div>
                    {kpiMes.proy && (
                      <div style={{ fontSize: 10.5, color: C.blueL, marginBottom: 4 }}>Proy: <strong>{kpiMes.proy.ratio.toFixed(1)}%</strong></div>
                    )}
                    {gapPts !== null && (
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.redL, marginBottom: 4 }}>{gapPts > 0 ? '+' : ''}{gapPts.toFixed(1)} pp</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3, marginBottom: 4 }}>
                      <span>Período seleccionado</span><span>{kpiPeriodo.ratio.toFixed(1)}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3 }}>
                      <span>Objetivo</span><span>&lt; {pais === 'AR' ? '62' : '67'}%</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Evolución diaria del mes: real/proy/gap/% día a día para una métrica elegible */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                Evolución Diaria · {MN[selMonth]} {selYear}
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <select value={tablaMetrica} onChange={e => setTablaMetrica(e.target.value as MetricaDia)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                {(Object.keys(METRICA_DIA_LABELS) as MetricaDia[]).map(m => <option key={m} value={m}>{METRICA_DIA_LABELS[m]}</option>)}
              </select>
            </div>
            <EvolucionDiariaTabla real={activo.real} proy={activo.proy} dias={dias} metrica={tablaMetrica} pais={pais} />

            {/* Otros rubros del mes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Otros Rubros · {MN[selMonth]} {selYear}</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <OtrosRubros pais={pais} real={activo.real} start={rangoMes.start} end={rangoMes.end} card={card} mono={mono} />

            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2 }}>Evolución del Ratio Orig/Cob</div>
                  <div style={{ fontSize: 10, color: C.txt3 }}>
                    {chartGran === 'dia' ? `Diario · ${MN[selMonth]} ${selYear}` : chartGran === 'semana' ? `Semanal · ${MN[selMonth]} ${selYear}` : `Mensual ${selYear}`} · {pais === 'AR' ? 'Argentina' : 'Colombia'}
                  </div>
                </div>
                <select value={chartGran} onChange={e => setChartGran(e.target.value as Vista)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
                  <option value="mes">Mes</option>
                  <option value="semana">Semana</option>
                  <option value="dia">Día</option>
                </select>
              </div>
              <div style={{ height: 195, position: 'relative' }}>
                <canvas ref={chartRatioRef} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Proveedores</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontSize: 11, color: C.txt3 }}>{proveedoresFiltrados.length} de {proveedoresPais.length}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                type="text" placeholder="🔍 Buscar por nombre o impuesto..." value={provBusqueda}
                onChange={e => setProvBusqueda(e.target.value)}
                style={{ flex: '1 1 220px', background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}
              />
              <select value={provAprobacion} onChange={e => setProvAprobacion(e.target.value)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
                <option value="">Todos los estados</option>
                <option value="Si">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
              <select value={provTipo} onChange={e => setProvTipo(e.target.value)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
                <option value="">Todos los tipos</option>
                {tiposDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={provSociedad} onChange={e => setProvSociedad(e.target.value)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
                <option value="">Sociedad: todas</option>
                {sociedadesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={provMes} onChange={e => setProvMes(e.target.value)} title="Filtrar por mes" style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
                <option value="">Mes: todos</option>
                {mesesProveedorDisponibles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <VencimientoFilter info={vencimientoInfo} excluidos={provVencExcluidos} onChange={setProvVencExcluidos} />
            </div>

            {/* Resumen de lo filtrado en la tabla de abajo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 12 }}>
              {([
                { lbl: 'Proveedores', main: provResumen.proveedores.toLocaleString('es-AR'), sub: `${provResumen.facturas.toLocaleString('es-AR')} facturas`, color: C.txt },
                { lbl: 'Total', main: fmt(provResumen.importe), sub: fmtLocal(provResumen.importe, pais), color: C.txt },
                { lbl: 'Pagado', main: fmt(provResumen.pagado.importe), sub: `${fmtLocal(provResumen.pagado.importe, pais)} · ${provResumen.pagado.facturas} fact.`, color: C.greenL },
                { lbl: 'Pendiente', main: fmt(provResumen.pendiente.importe), sub: `${fmtLocal(provResumen.pendiente.importe, pais)} · ${provResumen.pendiente.facturas} fact.`, color: C.amberL },
              ]).map(c => (
                <div key={c.lbl} style={{ ...card, padding: '12px 16px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 }}>{c.lbl}</div>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.8, ...mono, color: c.color, marginBottom: 4 }}>{c.main}</div>
                  <div style={{ fontSize: 10.5, ...mono, color: C.txt3 }}>{c.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bgCard2 }}>
                    {['Sociedad', 'Detalle', 'Mes', 'Día pago', 'Vencimiento', 'Nombre', 'Importe', 'Estado'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.txt3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proveedoresPagina.map((p, i) => (
                    <tr key={paginaActual * PROV_PAGE_SIZE + i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{p.sociedad}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{p.detalle}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{formatSheetCell(p.mes)}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{formatSheetCell(p.diaPago)}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{formatSheetCell(p.vencimiento)}</td>
                      <td style={{ padding: '7px 14px', color: C.txt }}>{p.nombre}</td>
                      <td style={{ padding: '7px 14px', ...mono, color: C.txt, fontWeight: 700 }}>{fmtLocal(p.importe, pais)}</td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, color: p.aprobacion === 'Si' ? C.greenL : C.amberL, background: p.aprobacion === 'Si' ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.12)' }}>
                          {p.aprobacion === 'Si' ? 'Pagado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {proveedoresFiltrados.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: C.txt3 }}>Sin resultados para estos filtros.</td></tr>
                  )}
                </tbody>
                {proveedoresFiltrados.length > 0 && (
                  <tfoot>
                    <tr style={{ background: C.bgCard2, borderTop: `2px solid ${C.border2}` }}>
                      <td colSpan={6} style={{ padding: '9px 14px', color: C.txt, fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                        Total seleccionado · {provResumen.facturas.toLocaleString('es-AR')} facturas
                      </td>
                      <td style={{ padding: '9px 14px', ...mono, color: C.txt, fontWeight: 800 }}>{fmtLocal(provResumen.importe, pais)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {proveedoresFiltrados.length > PROV_PAGE_SIZE && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 32, fontSize: 11, color: C.txt3, flexWrap: 'wrap' }}>
                <span>
                  Mostrando {(paginaActual * PROV_PAGE_SIZE + 1).toLocaleString('es-AR')}–{Math.min((paginaActual + 1) * PROV_PAGE_SIZE, proveedoresFiltrados.length).toLocaleString('es-AR')} de {proveedoresFiltrados.length.toLocaleString('es-AR')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {([
                    { key: 'first', label: '«', target: 0, disabled: paginaActual === 0 },
                    { key: 'prev', label: <ChevronLeft size={13} />, target: paginaActual - 1, disabled: paginaActual === 0 },
                  ]).map(b => (
                    <button key={b.key} type="button" disabled={b.disabled} onClick={() => setProvPage(b.target)}
                      style={{ minWidth: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 6, color: C.txt2, cursor: b.disabled ? 'default' : 'pointer', opacity: b.disabled ? 0.4 : 1 }}>
                      {b.label}
                    </button>
                  ))}
                  <span style={{ padding: '0 8px', color: C.txt2 }}>Página {paginaActual + 1} de {provTotalPages}</span>
                  {([
                    { key: 'next', label: <ChevronRight size={13} />, target: paginaActual + 1, disabled: paginaActual >= provTotalPages - 1 },
                    { key: 'last', label: '»', target: provTotalPages - 1, disabled: paginaActual >= provTotalPages - 1 },
                  ]).map(b => (
                    <button key={b.key} type="button" disabled={b.disabled} onClick={() => setProvPage(b.target)}
                      style={{ minWidth: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 6, color: C.txt2, cursor: b.disabled ? 'default' : 'pointer', opacity: b.disabled ? 0.4 : 1 }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {proveedoresFiltrados.length <= PROV_PAGE_SIZE && <div style={{ marginBottom: 32 }} />}

            {/* Chat con los datos */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 440, marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <Bot size={16} style={{ color: '#a78bfa' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>Chat con los datos</span>
                <span style={{ fontSize: 10.5, color: C.txt3 }}>· Cashflow {selYear} {pais === 'AR' ? 'Argentina' : 'Colombia'}</span>
              </div>
              <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                {chatMessages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, height: '100%', textAlign: 'center' }}>
                    <Bot size={28} style={{ color: C.txt3 }} />
                    <p style={{ color: C.txt2, fontSize: 13 }}>Preguntá sobre el flujo financiero.</p>
                    <p style={{ color: C.txt3, fontSize: 11 }}>Ej: "¿En qué mes la cobranza quedó más lejos de lo proyectado?"</p>
                  </div>
                ) : chatMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'model' && <Bot size={18} style={{ color: '#a78bfa', flexShrink: 0, marginTop: 2 }} />}
                    <div className={msg.role === 'model' ? 'markdown-body prose prose-sm prose-invert max-w-none' : undefined}
                      style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 12, fontSize: 12, lineHeight: 1.55, whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined, background: msg.role === 'user' ? '#2563eb' : C.bgCard2, color: msg.role === 'user' ? '#fff' : C.txt }}>
                      {msg.role === 'model' ? <ReactMarkdown>{msg.content}</ReactMarkdown> : msg.content}
                    </div>
                    {msg.role === 'user' && <User size={18} style={{ color: C.blueL, flexShrink: 0, marginTop: 2 }} />}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Bot size={18} style={{ color: '#a78bfa', flexShrink: 0 }} />
                    <div style={{ background: C.bgCard2, borderRadius: 12, padding: '8px 12px' }}>
                      <Loader2 size={14} style={{ color: C.txt2 }} className="animate-spin" />
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
                <input type="text" value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Preguntá sobre cobranzas, originaciones, proveedores..."
                  disabled={chatRows.length === 0 || chatLoading}
                  style={{ flex: 1, background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '8px 12px', borderRadius: 10, fontSize: 12, outline: 'none', opacity: chatRows.length === 0 || chatLoading ? 0.5 : 1 }} />
                <button type="button" onClick={handleSendMessage}
                  disabled={!chatInput.trim() || chatLoading || chatRows.length === 0}
                  style={{ padding: 8, background: '#2563eb', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: !chatInput.trim() || chatLoading || chatRows.length === 0 ? 0.4 : 1 }}>
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Filtro jerárquico Mes > Día para la fecha de Vencimiento de Proveedores. El estado
// es el conjunto de días EXCLUIDOS (claves YYYY-MM-DD): vacío = sin filtro (todo
// tildado). Tildar/destildar un mes aplica cascada a todos sus días.
function VencimientoFilter({ info, excluidos, onChange }: {
  info: { meses: { monthKey: string; label: string; dias: { dayKey: string; dayLabel: string }[] }[]; vacioCount: number; invalidoCount: number };
  excluidos: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { meses: tree, vacioCount, invalidoCount } = info;
  const [open, setOpen] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const todasLasClaves = useMemo(() => {
    const claves = tree.flatMap(m => m.dias.map(d => d.dayKey));
    if (vacioCount > 0) claves.push(VENC_VACIO);
    if (invalidoCount > 0) claves.push(VENC_INVALIDO);
    return claves;
  }, [tree, vacioCount, invalidoCount]);
  const todasTildadas = excluidos.size === 0;

  const toggleTodas = () => onChange(todasTildadas ? new Set(todasLasClaves) : new Set());

  const toggleMes = (m: typeof tree[number]) => {
    const excluidasDelMes = m.dias.filter(d => excluidos.has(d.dayKey)).length;
    const next = new Set(excluidos);
    if (excluidasDelMes === m.dias.length) m.dias.forEach(d => next.delete(d.dayKey));
    else m.dias.forEach(d => next.add(d.dayKey));
    onChange(next);
  };

  const toggleDia = (dayKey: string) => {
    const next = new Set(excluidos);
    if (next.has(dayKey)) next.delete(dayKey); else next.add(dayKey);
    onChange(next);
  };

  const toggleExpand = (monthKey: string) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey); else next.add(monthKey);
      return next;
    });
  };

  const resumen = todasTildadas ? 'Vencimiento: todos' : `Vencimiento (${excluidos.size} excl.)`;
  const selectStyle: CSSProperties = { background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ ...selectStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        {resumen}
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20, minWidth: 220, maxHeight: 280, overflowY: 'auto', background: C.bgCard, border: `1px solid ${C.border2}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', padding: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', padding: '4px 6px', borderBottom: `1px solid ${C.border}`, marginBottom: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={todasTildadas} onChange={toggleTodas} />
            Todos
          </label>
          {vacioCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.txt2, padding: '3px 6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={!excluidos.has(VENC_VACIO)} onChange={() => toggleDia(VENC_VACIO)} />
              Vacío ({vacioCount})
            </label>
          )}
          {invalidoCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.txt2, padding: '3px 6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={!excluidos.has(VENC_INVALIDO)} onChange={() => toggleDia(VENC_INVALIDO)} />
              Sin formato ({invalidoCount})
            </label>
          )}
          {tree.length === 0 && vacioCount === 0 && invalidoCount === 0 && (
            <div style={{ fontSize: 11, color: C.txt3, padding: '6px' }}>Sin fechas de vencimiento</div>
          )}
          {tree.map(m => {
            const excluidasDelMes = m.dias.filter(d => excluidos.has(d.dayKey)).length;
            const mesChecked = excluidasDelMes === 0;
            const mesIndeterminate = excluidasDelMes > 0 && excluidasDelMes < m.dias.length;
            const mesExpandido = expandidos.has(m.monthKey);
            return (
              <div key={m.monthKey}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
                  <input
                    type="checkbox" checked={mesChecked}
                    ref={el => { if (el) el.indeterminate = mesIndeterminate; }}
                    onChange={() => toggleMes(m)}
                  />
                  <span
                    onClick={() => toggleExpand(m.monthKey)}
                    style={{ flex: 1, fontSize: 12, color: C.txt, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    {m.label}
                    <ChevronDown size={12} style={{ color: C.txt3, transform: mesExpandido ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
                  </span>
                </div>
                {mesExpandido && (
                  <div style={{ paddingLeft: 22 }}>
                    {m.dias.map(d => (
                      <label key={d.dayKey} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.txt2, padding: '3px 6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!excluidos.has(d.dayKey)} onChange={() => toggleDia(d.dayKey)} />
                        {d.dayLabel}
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

// Evolución día a día del mes elegido para una sola métrica (Cobranzas/Ventas/
// Proveedores/Impuestos) — real, proyectado, gap absoluto y % de gap por día.
function EvolucionDiariaTabla({ real, proy, dias, metrica, pais }: {
  real: DiaFlujo[]; proy: DiaProyeccion[]; dias: string[]; metrica: MetricaDia; pais: Pais;
}) {
  const realPorFecha = useMemo(() => new Map(real.map(d => [d.dateStr, d])), [real]);
  const proyPorFecha = useMemo(() => new Map(proy.map(d => [d.dateStr, d])), [proy]);

  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.bgCard2 }}>
            {['Día', 'Real', 'Proyectado', 'Gap', '%'].map(h => (
              <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Día' ? 'left' : 'right', color: C.txt3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dias.map(d => {
            const dt = new Date(d + 'T12:00:00');
            // Ya vienen normalizados a positivo desde los helpers; no se aplica Math.abs
            // para que una reversa del día (ej. cobranza negativa) se vea como tal.
            const r = realPorFecha.get(d)?.[metrica] ?? 0;
            const pAbs = proyPorFecha.get(d)?.[metrica] ?? null;
            const gap = pAbs !== null ? r - pAbs : null;
            const pct = pAbs !== null && pAbs > 0 ? (r / pAbs) * 100 : null;
            return (
              <tr key={d} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '7px 14px', color: C.txt2 }}>{dt.getDate()} {MN[dt.getMonth()].slice(0, 3)}</td>
                <td style={{ padding: '7px 14px', textAlign: 'right', ...mono, color: C.txt, fontWeight: 700 }}>{fmtLocal(r, pais)}</td>
                <td style={{ padding: '7px 14px', textAlign: 'right', ...mono, color: C.blueL }}>{pAbs !== null ? fmtLocal(pAbs, pais) : '—'}</td>
                <td style={{ padding: '7px 14px', textAlign: 'right', ...mono, color: C.redL }}>{gap !== null ? `${gap > 0 ? '+' : ''}${fmtLocal(gap, pais)}` : '—'}</td>
                <td style={{ padding: '7px 14px', textAlign: 'right', ...mono, color: C.amberL, fontWeight: 600 }}>{pct !== null ? `${pct.toFixed(1)}%` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OtrosRubros({ pais, real, start, end, card, mono }: {
  pais: Pais; real: DiaFlujo[]; start: string; end: string; card: CSSProperties; mono: CSSProperties;
}) {
  const sum = (campo: keyof Omit<DiaFlujo, 'dateStr' | 'month' | 'day'>) =>
    real.filter(d => d.dateStr >= start && d.dateStr <= end).reduce((s, d) => s + (d[campo] as number), 0);

  const filas = pais === 'AR'
    ? [
        { lbl: 'Sueldos', val: sum('sueldos') },
        { lbl: 'Gastos Bancarios', val: sum('gastosBanc') },
        { lbl: 'Caución', val: sum('caucion') },
        { lbl: 'Recupero Colombia', val: sum('recuperoColombia') },
        { lbl: 'Préstamos', val: sum('prestamos') },
        { lbl: 'Devolución Caución', val: sum('devCaucion') },
      ]
    : [
        { lbl: 'Sueldos', val: sum('sueldos') },
        { lbl: 'Gastos Bancarios', val: sum('gastosBanc') },
        { lbl: 'Tarjetas de Crédito', val: sum('tarjetas') },
        { lbl: 'Total Ingresos Financieros', val: sum('totalIngFin') },
        { lbl: 'Total Egresos Financieros', val: sum('totalEgrFin') },
        { lbl: 'Free Cashflow Financiero', val: sum('freeCashflowFin') },
      ];

  return (
    <div style={{ ...card, padding: 0, marginBottom: 12 }}>
      {filas.map((f, i) => (
        <div key={f.lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderBottom: i < filas.length - 1 ? `1px solid ${C.border}` : 'none' }}>
          <span style={{ fontSize: 12, color: C.txt2 }}>{f.lbl}</span>
          <span style={{ fontSize: 12, fontWeight: 700, ...mono, color: f.val < 0 ? C.redL : C.txt }}>{fmt(f.val)}</span>
        </div>
      ))}
    </div>
  );
}
