// src/components/submodules/FlujoFinancieroSubmodule.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { RefreshCcw, Loader2, AlertCircle } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import {
  ROWS_AR_REAL, ROWS_AR_PROY, ROWS_CO_REAL, ROWS_CO_PROY,
  parseDailyReal, parseDailyProy, parseProveedoresAr, parseProveedoresCo, parseVentasObjetivo,
  weeksInMonth, daysInMonth, getKpiPeriodo, getVentasPeriodo, fmt, fmtLocal, rcT,
  type DiaFlujo, type DiaProyeccion, type ProveedorRow, type VentasObjetivoRow, type Pais, type Semana,
} from './flujoFinancieroHelpers';

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const C = {
  bg: '#060d1c', bgCard: '#0c1528', bgCard2: '#111e35', border: '#1a2845', border2: '#243558',
  txt: '#e2e8f5', txt2: '#7a90b0', txt3: '#3d5070',
  greenL: '#34d399', redL: '#fb7185', amberL: '#fcd34d', blueL: '#60a5fa', green: '#10b981', amber: '#f59e0b',
};

type Vista = 'mes' | 'semana' | 'dia';

interface PaisData {
  real: DiaFlujo[];
  proy: DiaProyeccion[];
  proveedores: ProveedorRow[];
  ventas: VentasObjetivoRow[];
}

export default function FlujoFinancieroSubmodule() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataAr, setDataAr] = useState<PaisData | null>(null);
  const [dataCo, setDataCo] = useState<PaisData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [pais, setPais] = useState<Pais>('AR');
  const [selMonth, setSelMonth] = useState(new Date().getMonth());
  const [vista, setVista] = useState<Vista>('mes');
  const [selWeekIdx, setSelWeekIdx] = useState(0);
  const [selDay, setSelDay] = useState<string>('');

  const fetchData = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      if (force) await fetch('/api/flujo-financiero/refresh');
      const res = await fetch('/api/flujo-financiero');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setDataAr({
        real: parseDailyReal(json.ar.real, ROWS_AR_REAL, json.ar.originaciones),
        proy: parseDailyProy(json.ar.proy, ROWS_AR_PROY),
        proveedores: parseProveedoresAr(json.ar.proveedores),
        ventas: parseVentasObjetivo(json.ar.ventas),
      });
      setDataCo({
        real: parseDailyReal(json.co.real, ROWS_CO_REAL, json.co.originaciones),
        proy: parseDailyProy(json.co.proy, ROWS_CO_PROY),
        proveedores: parseProveedoresCo(json.co.proveedores),
        ventas: parseVentasObjetivo(json.co.ventas),
      });
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activo = pais === 'AR' ? dataAr : dataCo;

  const semanas: Semana[] = useMemo(() => weeksInMonth(2026, selMonth), [selMonth]);
  const dias: string[] = useMemo(() => daysInMonth(2026, selMonth), [selMonth]);

  useEffect(() => { setSelWeekIdx(0); }, [selMonth]);
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
  const ventasMes = useMemo(
    () => activo ? getVentasPeriodo(activo.ventas, rangoMes.start, rangoMes.end) : null,
    [activo, rangoMes]
  );

  const ratiosPorMes = useMemo(() => {
    if (!activo) return [];
    return Array.from({ length: 12 }, (_, m) => {
      const diasDelMes = daysInMonth(2026, m);
      const k = getKpiPeriodo(activo.real, activo.proy, diasDelMes[0], diasDelMes[diasDelMes.length - 1]);
      return { mes: m, ratio: k.ratio };
    });
  }, [activo]);

  const chartRatioRef = useRef<HTMLCanvasElement>(null);
  const chartRatioInst = useRef<Chart | null>(null);

  useEffect(() => {
    chartRatioInst.current?.destroy();
    if (!chartRatioRef.current || ratiosPorMes.length === 0) return;

    const MS_CORTAS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const colorPorRatio = (r: number) => {
      const est = rcT(r, pais);
      return est.cls === 'sem-red' ? '#f43f5e' : est.cls === 'sem-yellow' ? '#f59e0b' : '#10b981';
    };

    chartRatioInst.current = new Chart(chartRatioRef.current, {
      type: 'bar',
      data: {
        labels: MS_CORTAS,
        datasets: [{
          data: ratiosPorMes.map(r => r.ratio),
          backgroundColor: ratiosPorMes.map(r => colorPorRatio(r.ratio)),
          borderColor: ratiosPorMes.map((_, i) => i === selMonth ? '#fff' : 'transparent'),
          borderWidth: ratiosPorMes.map((_, i) => i === selMonth ? 2 : 0),
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
  }, [ratiosPorMes, selMonth, pais]);

  if (loading) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '80px 0', background: C.bg }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Loader2 style={{ width: 32, height: 32, color: C.blueL }} className="animate-spin" />
        <p style={{ color: C.txt2, fontSize: 13 }}>Cargando datos de flujo financiero...</p>
      </div>
    </div>
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

  const card: CSSProperties = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, position: 'relative', overflow: 'hidden' };
  const mono: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

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
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Mes</span>
          <select value={selMonth} onChange={e => setSelMonth(parseInt(e.target.value))} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {MN.map((mn, i) => <option key={i} value={i}>{mn} 2026</option>)}
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
        {!activo || !kpiPeriodo || !kpiMes ? (
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {([
                { lbl: 'Saldo Inicio', val: kpiPeriodo.saldoInicio, proy: null, isEgreso: false },
                { lbl: 'Cobranzas', val: kpiPeriodo.cobranzas, proy: kpiPeriodo.proy?.cobranzas ?? null, isEgreso: false },
                { lbl: 'Originaciones', val: -kpiPeriodo.originaciones, proy: kpiPeriodo.proy?.originaciones ?? null, isEgreso: true },
                { lbl: 'Proveedores', val: -kpiPeriodo.proveedores, proy: kpiPeriodo.proy?.proveedores ?? null, isEgreso: true },
                { lbl: 'Impuestos', val: -kpiPeriodo.impuestos, proy: kpiPeriodo.proy?.impuestos ?? null, isEgreso: true },
                { lbl: 'Saldo Final', val: kpiPeriodo.saldoFinal, proy: null, isEgreso: false },
              ] as const).map(c => {
                const proyVal = c.proy === null ? null : (c.isEgreso ? -c.proy : c.proy);
                const delta = proyVal === null ? null : Math.abs(c.val) - Math.abs(proyVal);
                const bueno = delta === null ? null : (c.isEgreso ? delta < 0 : delta > 0);
                return (
                  <div key={c.lbl} style={{ ...card, padding: '14px 16px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 9 }}>{c.lbl}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -1, lineHeight: 1, marginBottom: 5, ...mono, color: c.val < 0 ? C.redL : C.txt }}>{fmt(c.val)}</div>
                    <div style={{ fontSize: 11, color: C.txt3 }}>{fmtLocal(c.val, pais)}</div>
                    {proyVal !== null && Math.abs(delta ?? 0) >= 1 && (
                      <>
                        <div style={{ fontSize: 10, color: C.txt3, fontStyle: 'italic', marginTop: 6 }}>Proy: <strong style={{ color: C.txt2 }}>{fmt(proyVal)}</strong></div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: bueno ? C.greenL : C.redL }}>
                          {(delta ?? 0) > 0 ? '+' : ''}{fmt(delta ?? 0)} vs proy
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {(() => {
                const ratioEstado = rcT(kpiPeriodo.ratio, pais);
                const color = ratioEstado.cls === 'sem-red' ? C.redL : ratioEstado.cls === 'sem-yellow' ? C.amberL : C.greenL;
                return (
                  <div style={{ ...card, padding: '14px 16px', borderColor: ratioEstado.alerta ? 'rgba(244,63,94,.4)' : C.border }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 9 }}>Ratio Orig/Cob</div>
                    <div style={{ fontSize: 20, fontWeight: 800, ...mono, color }}>{kpiPeriodo.ratio.toFixed(1)}%</div>
                    <div style={{ fontSize: 10, color: C.txt3, marginTop: 4 }}>Orig {fmt(kpiPeriodo.originaciones)} / Cob {fmt(kpiPeriodo.cobranzas)}</div>
                    {kpiPeriodo.proy && (
                      <div style={{ fontSize: 10, color: C.txt3, fontStyle: 'italic', marginTop: 6 }}>Proy: <strong style={{ color: C.txt2 }}>{kpiPeriodo.proy.ratio.toFixed(1)}%</strong></div>
                    )}
                    {ratioEstado.alerta && <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700, color: C.redL }}>ALERTA</div>}
                  </div>
                );
              })()}
            </div>

            {/* Fila 2: resumen del mes calendario completo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                Resumen - {MN[selMonth]} 2026
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              {/* Ventas: excepción — compara contra objetivo, no contra proyección de cashflow */}
              <div style={{ ...card, padding: '16px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2, marginBottom: 10 }}>Ventas</div>
                <div style={{ fontSize: 22, fontWeight: 800, ...mono, marginBottom: 6 }}>{fmt(kpiMes.originaciones)}</div>
                <div style={{ fontSize: 11, color: C.txt3, marginBottom: 10 }}>{fmtLocal(kpiMes.originaciones, pais)}</div>
                {ventasMes ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3, marginBottom: 6 }}>
                      <span>Obj. ventas</span><span>{fmtLocal(ventasMes.monto, pais)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{ventasMes.nuevos.toLocaleString('es-AR')}</div>
                        <div style={{ fontSize: 9, color: C.txt3, textTransform: 'uppercase' }}>Nuevos</div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{ventasMes.renovadores.toLocaleString('es-AR')}</div>
                        <div style={{ fontSize: 9, color: C.txt3, textTransform: 'uppercase' }}>Renovadores</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 10.5, color: C.amberL, fontStyle: 'italic' }}>Sin objetivo para este período</div>
                )}
              </div>

              {([
                { lbl: 'Cobranzas', val: kpiMes.cobranzas, proy: kpiMes.proy?.cobranzas ?? null },
                { lbl: 'Proveedores', val: kpiMes.proveedores, proy: kpiMes.proy?.proveedores ?? null },
                { lbl: 'Impuestos', val: kpiMes.impuestos, proy: kpiMes.proy?.impuestos ?? null },
              ] as const).map(c => {
                const pct = c.proy && c.proy > 0 ? (c.val / c.proy) * 100 : null;
                return (
                  <div key={c.lbl} style={{ ...card, padding: '16px 18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2, marginBottom: 10 }}>{c.lbl}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, ...mono, marginBottom: 8 }}>{fmt(c.val)}</div>
                    {c.proy !== null && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3, marginBottom: 4 }}>
                          <span>vs proyectado mes</span>
                          <span style={{ fontWeight: 700, color: pct !== null && pct > 100 ? C.redL : C.txt2 }}>{pct !== null ? pct.toFixed(1) + '%' : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3 }}>
                          <span>Proyectado</span><span>{fmt(c.proy)}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {(() => {
                const ratioEstado = rcT(kpiMes.ratio, pais);
                const color = ratioEstado.cls === 'sem-red' ? C.redL : ratioEstado.cls === 'sem-yellow' ? C.amberL : C.greenL;
                return (
                  <div style={{ ...card, padding: '16px 18px', borderColor: ratioEstado.alerta ? 'rgba(244,63,94,.4)' : C.border }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2, marginBottom: 10 }}>Ratio Orig/Cob</div>
                    <div style={{ fontSize: 22, fontWeight: 800, ...mono, color, marginBottom: 8 }}>{kpiMes.ratio.toFixed(1)}%</div>
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

            {/* Otros rubros del mes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Otros Rubros · {MN[selMonth]} 2026</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <OtrosRubros pais={pais} real={activo.real} start={rangoMes.start} end={rangoMes.end} card={card} mono={mono} />

            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2 }}>Evolución del Ratio Orig/Cob</div>
                <div style={{ fontSize: 10, color: C.txt3 }}>Mensual 2026 · {pais === 'AR' ? 'Argentina' : 'Colombia'}</div>
              </div>
              <div style={{ height: 195, position: 'relative' }}>
                <canvas ref={chartRatioRef} />
              </div>
            </div>
          </>
        )}
      </div>
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
