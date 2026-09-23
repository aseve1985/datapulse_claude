// src/components/submodules/FlujoFinancieroSubmodule.tsx
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { RefreshCcw, Loader2, AlertCircle } from 'lucide-react';
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
          </>
        )}
      </div>
    </div>
  );
}
