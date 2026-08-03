import { useEffect, useRef, useState, useCallback, useMemo, type CSSProperties, Fragment } from 'react';
import { Chart, registerables } from 'chart.js';
import { RefreshCcw, Loader2, AlertCircle, Sparkles, Send, Bot, User } from 'lucide-react';
import { generateInsights, chatWithData } from '../../services/gemini';

Chart.register(...registerables);

// ── Sheet row indices (0-based) ──────────────────────────────────────────────
const ROW_FECHAS        = 3;
const ROW_SALDO_INI     = 4;
const ROW_COBRANZAS     = 10;
const ROW_ORIGINACIONES = 11;
const ROW_PROVEEDORES   = 12;
const ROW_IMPUESTOS     = 14;  // actual "Impuestos" row (row 17 is "Total Gastos")
const ROW_TOTAL_GASTOS  = 17;  // authoritative total expenses
const ROW_FCO           = 19;  // Operating cash flow row
const ROW_SALDO_FIN     = 39;

// Working days per month (Mon–Fri, including Argentine holidays as counted in the sheet)
const WD = [22, 20, 22, 22, 21, 22, 23, 22, 22, 22, 21, 23];

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg:      '#060d1c',
  bgCard:  '#0c1528',
  bgCard2: '#111e35',
  border:  '#1a2845',
  border2: '#243558',
  txt:     '#e2e8f5',
  txt2:    '#7a90b0',
  txt3:    '#3d5070',
  greenL:  '#34d399',
  redL:    '#fb7185',
  amberL:  '#fcd34d',
  purpleL: '#a78bfa',
  blueL:   '#60a5fa',
  green:   '#10b981',
  amber:   '#f59e0b',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseSheetDate(val: string): Date | null {
  if (!val) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 55000) {
    const utcD = new Date(Math.round((num - 25569) * 86400 * 1000));
    // Use UTC calendar date to avoid timezone shift (e.g. UTC-3 would move April 1 → March 31)
    return new Date(utcD.getUTCFullYear(), utcD.getUTCMonth(), utcD.getUTCDate());
  }
  if (val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseSheetNum(val: string): number {
  if (!val || val === '') return 0;
  const n = parseFloat(String(val).replace(/[,\s]/g, '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Returns magnitude string WITHOUT $ sign (e.g. "1.2B", "93.4M", "300K")
function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (abs / 1e3).toFixed(0) + 'K';
  return abs.toFixed(0);
}

function fmtS(n: number): string {
  return (n >= 0 ? '+$' : '-$') + fmt(n);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface DayData {
  date:        Date;
  dateStr:     string;
  month:       number;
  day:         number;
  isActual:    boolean;
  saldoInicio: number;
  cobranzas:   number;
  originaciones: number;
  proveedores: number;
  impuestos:   number;
  totalGastos: number;
  saldoFinal:  number;
}

interface MonthlyData {
  index:          number;
  saldoInicio:    number;   // from first daily col of the month
  cobranzas:      number;   // from "Total" col
  originaciones:  number;   // from "Total" col
  proveedores:    number;   // from "Total" col
  impuestos:      number;   // from "Total" col
  totalEgresos:   number;   // from "Total" col (F18)
  fco:            number;   // from "Total" col (F20, NOT daily cols)
  saldoFinal:     number;   // from "Total" col
  cobranzasProy:  number;   // from "Proyectado" col (Section 2 denominator)
  origProy:       number;
  provProy:       number;
  impProy:        number;
  days:           DayData[];
  isPast:         boolean;
  isCurrent:      boolean;
  isFuture:       boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TesoreriaSubmodule({ userEmail }: { userEmail?: string }) {
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [allDays, setAllDays]             = useState<DayData[]>([]);
  const [mainRaw, setMainRaw]             = useState<string[][] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [clock, setClock]                 = useState(() => new Date());
  const [lastRefresh, setLastRefresh]     = useState<Date | null>(null);

  const chartCobRef  = useRef<HTMLCanvasElement>(null);
  const chartEgRef   = useRef<HTMLCanvasElement>(null);
  const chartSalRef  = useRef<HTMLCanvasElement>(null);
  const chartCobInst = useRef<Chart | null>(null);
  const chartEgInst  = useRef<Chart | null>(null);
  const chartSalInst = useRef<Chart | null>(null);

  // ── AI state ─────────────────────────────────────────────────────────────────
  const [insights,        setInsights]        = useState<any>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [chatMessages,    setChatMessages]    = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [chatInput,       setChatInput]       = useState('');
  const [chatLoading,     setChatLoading]     = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Live clock (updates every 30s)
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Parse main sheet rows → DayData[]
  const parseData = useCallback((main: string[][]) => {
    if (main.length <= ROW_SALDO_FIN) { setAllDays([]); return; }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dateRow      = main[ROW_FECHAS]        || [];
    const siRow        = main[ROW_SALDO_INI]     || [];
    const cobRow       = main[ROW_COBRANZAS]     || [];
    const origRow      = main[ROW_ORIGINACIONES] || [];
    const provRow      = main[ROW_PROVEEDORES]   || [];
    const impRow       = main[ROW_IMPUESTOS]     || [];
    const totalGastosRow = main[ROW_TOTAL_GASTOS] || [];
    const sfRow        = main[ROW_SALDO_FIN]     || [];

    const parsed: DayData[] = [];
    for (let c = 1; c < dateRow.length; c++) {
      const raw = dateRow[c];
      if (!raw) continue;
      const date = parseSheetDate(raw);
      if (!date || date.getFullYear() !== 2026) continue;
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      parsed.push({
        date,
        dateStr: `${date.getFullYear()}-${mm}-${dd}`,
        month:   date.getMonth(),
        day:     date.getDate(),
        isActual: date <= today,
        saldoInicio:   parseSheetNum(siRow[c]),
        cobranzas:     parseSheetNum(cobRow[c]),
        // Expense rows are stored as negative in the sheet — store as positive
        originaciones: Math.abs(parseSheetNum(origRow[c])),
        proveedores:   Math.abs(parseSheetNum(provRow[c])),
        impuestos:     Math.abs(parseSheetNum(impRow[c])),
        totalGastos:   Math.abs(parseSheetNum(totalGastosRow[c])),
        saldoFinal:    parseSheetNum(sfRow[c]),
      });
    }
    setAllDays(parsed);
    setMainRaw(main);
  }, []);

  const fetchData = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      if (force) await fetch('/api/tesoreria/refresh');
      const res = await fetch('/api/tesoreria');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      parseData(data.main);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [parseData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  // ── Monthly aggregates ────────────────────────────────────────────────────
  const monthlyData: MonthlyData[] = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const curM  = today.getMonth();

    // Detect "Total" and "Proyectado" column positions by scanning F4 (ROW_FECHAS).
    // Layout: …daily cols… | "Total Enero" | "Proyectado" | …more labels… | daily Feb… | …
    const monthTotalCols: number[] = new Array(12).fill(-1);
    const monthProyCols:  number[] = new Array(12).fill(-1);
    const firstDayCols:   number[] = new Array(12).fill(-1);

    if (mainRaw) {
      const dateRow = mainRaw[ROW_FECHAS] || [];
      let lastMonth = -1;
      for (let c = 0; c < dateRow.length; c++) {
        const raw = dateRow[c];
        if (!raw) continue;
        const d = parseSheetDate(raw);
        if (d && d.getFullYear() === 2026) {
          const m = d.getMonth();
          if (firstDayCols[m] === -1) firstDayCols[m] = c;
          lastMonth = m;
        } else if (lastMonth >= 0) {
          const s = String(raw).toUpperCase();
          if ((s.includes('TOTAL') || s === 'TOTALES') && monthTotalCols[lastMonth] === -1) {
            monthTotalCols[lastMonth] = c;
          } else if (s.includes('PROYECT') && monthProyCols[lastMonth] === -1) {
            monthProyCols[lastMonth] = c;
          }
        }
      }
    }

    const num = (row: number, col: number): number =>
      col >= 0 && mainRaw ? parseSheetNum(mainRaw[row]?.[col] ?? '') : 0;

    return Array.from({ length: 12 }, (_, m) => {
      const days = allDays.filter(d => d.month === m).sort((a, b) => a.date.getTime() - b.date.getTime());
      const tc   = monthTotalCols[m];
      const pc   = monthProyCols[m];
      const fc   = firstDayCols[m];

      // Monthly totals — authoritative source: "Total" column in 01. Proy 2026
      const saldoInicio   = fc >= 0 ? num(ROW_SALDO_INI, fc)           : (days[0]?.saldoInicio ?? 0);
      const cobranzas     = tc >= 0 ? num(ROW_COBRANZAS, tc)           : days.reduce((s, d) => s + d.cobranzas, 0);
      const originaciones = tc >= 0 ? Math.abs(num(ROW_ORIGINACIONES, tc)) : days.reduce((s, d) => s + d.originaciones, 0);
      const proveedores   = tc >= 0 ? Math.abs(num(ROW_PROVEEDORES, tc))   : days.reduce((s, d) => s + d.proveedores, 0);
      const impuestos     = tc >= 0 ? Math.abs(num(ROW_IMPUESTOS, tc))     : days.reduce((s, d) => s + d.impuestos, 0);
      const totalEgresos  = tc >= 0 ? Math.abs(num(ROW_TOTAL_GASTOS, tc))  : days.reduce((s, d) => s + d.totalGastos, 0);
      // F20 at daily cols = saldo acumulado (same as F40); use only the "Total" col value
      const fco           = tc >= 0 ? num(ROW_FCO, tc) : (cobranzas - totalEgresos);
      const saldoFinal    = tc >= 0 ? num(ROW_SALDO_FIN, tc) : (days[days.length - 1]?.saldoFinal ?? 0);

      // "Proyectado" column — denominator for Section 2 progress bars
      const cobranzasProy  = pc >= 0 ? num(ROW_COBRANZAS, pc)           : cobranzas;
      const origProy       = pc >= 0 ? Math.abs(num(ROW_ORIGINACIONES, pc)) : originaciones;
      const provProy       = pc >= 0 ? Math.abs(num(ROW_PROVEEDORES, pc))   : proveedores;
      const impProy        = pc >= 0 ? Math.abs(num(ROW_IMPUESTOS, pc))     : impuestos;

      return { index:m, saldoInicio, cobranzas, originaciones, proveedores, impuestos, totalEgresos, fco, saldoFinal, cobranzasProy, origProy, provProy, impProy, days, isPast:m<curM, isCurrent:m===curM, isFuture:m>curM };
    });
  }, [allDays, mainRaw]);

  // ── AI records & handlers ─────────────────────────────────────────────────
  const aiRecords = useMemo(() => monthlyData.map(m => ({
    mes:                  MN[m.index],
    estado:               m.isPast ? 'cerrado' : m.isCurrent ? 'en_curso' : 'proyectado',
    saldo_inicio:         m.saldoInicio,
    cobranzas:            m.cobranzas,
    cobranzas_presupuesto: m.cobranzasProy,
    originaciones:        m.originaciones,
    proveedores:          m.proveedores,
    impuestos:            m.impuestos,
    total_egresos:        m.totalEgresos,
    fco:                  m.fco,
    saldo_final:          m.saldoFinal,
  })), [monthlyData]);

  const fetchInsights = useCallback(async () => {
    if (!aiRecords.some(r => r.cobranzas > 0)) return;
    setInsightsLoading(true);
    try {
      const result = await generateInsights(aiRecords, { from: '2026-01-01', to: '2026-12-31' }, [], userEmail, 'tesoreria');
      setInsights(result);
    } finally {
      setInsightsLoading(false);
    }
  }, [aiRecords, userEmail]);

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs);
    setChatInput('');
    setChatLoading(true);
    try {
      const reply = await chatWithData(newMsgs, aiRecords, [], userEmail, 'tesoreria');
      setChatMessages([...newMsgs, { role: 'model' as const, content: reply }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, aiRecords, userEmail]);

  // ── Charts (rebuild when monthlyData or selectedMonth changes) ────────────
  useEffect(() => {
    if (!monthlyData.some(m => m.days.length > 0)) return;
    chartCobInst.current?.destroy();
    chartEgInst.current?.destroy();
    chartSalInst.current?.destroy();
    if (!chartCobRef.current || !chartEgRef.current || !chartSalRef.current) return;

    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const actBound = today.getMonth();
    const labels   = MS;

    const baseOpts: any = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#0c1528', borderColor: '#1a2845', borderWidth: 1, titleColor: '#7a90b0', bodyColor: '#e2e8f5' },
      },
      scales: {
        x: { ticks: { color: '#3d5070', font: { size: 10 } }, grid: { color: 'rgba(26,40,69,0.8)' } },
        y: { ticks: { color: '#3d5070', font: { size: 10 }, callback: (v: any) => `$${v.toFixed(0)}M` }, grid: { color: 'rgba(26,40,69,0.8)' } },
      },
    };

    // Chart 1: Cobranzas bar
    chartCobInst.current = new Chart(chartCobRef.current!, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data:            monthlyData.map(m => m.cobranzas / 1e6),
          backgroundColor: labels.map((_, i) => i <= actBound ? 'rgba(59,130,246,.85)' : 'rgba(59,130,246,.28)'),
          borderColor:     labels.map((_, i) => i === selectedMonth ? '#60a5fa' : 'transparent'),
          borderWidth:     labels.map((_, i) => i === selectedMonth ? 2 : 0),
          borderRadius: 5,
          borderSkipped: false,
        } as any],
      },
      options: { ...baseOpts, plugins: { ...baseOpts.plugins, tooltip: { ...baseOpts.plugins.tooltip, callbacks: { label: (c: any) => ` $${c.raw.toFixed(0)}M ARS` } } } },
    });

    // Chart 2: Egresos stacked
    chartEgInst.current = new Chart(chartEgRef.current!, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Originaciones',
            data: monthlyData.map(m => m.originaciones / 1e6),
            backgroundColor: labels.map((_, i) => i <= actBound ? 'rgba(244,63,94,.82)' : 'rgba(244,63,94,.25)'),
            borderRadius: 0, borderSkipped: false,
          },
          {
            label: 'Proveedores',
            data: monthlyData.map(m => m.proveedores / 1e6),
            backgroundColor: labels.map((_, i) => i <= actBound ? 'rgba(245,158,11,.82)' : 'rgba(245,158,11,.25)'),
            borderRadius: 0, borderSkipped: false,
          },
          {
            label: 'Impuestos',
            data: monthlyData.map(m => m.impuestos / 1e6),
            backgroundColor: labels.map((_, i) => i <= actBound ? 'rgba(139,92,246,.82)' : 'rgba(139,92,246,.25)'),
            borderRadius: [5, 5, 0, 0] as any, borderSkipped: false,
          },
        ],
      },
      options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: true, labels: { color: '#7a90b0', font: { size: 9 }, boxWidth: 9, padding: 8 } }, tooltip: { ...baseOpts.plugins.tooltip, callbacks: { label: (c: any) => ` ${c.dataset.label}: $${c.raw.toFixed(0)}M` } } }, scales: { ...baseOpts.scales, x: { ...baseOpts.scales.x, stacked: true }, y: { ...baseOpts.scales.y, stacked: true } } },
    });

    // Chart 3: Saldo al cierre (line)
    const sfActual = monthlyData.map((m, i) => i <= actBound ? m.saldoFinal / 1e6 : null);
    const sfBE     = monthlyData.map((m, i) => i >= actBound ? m.saldoFinal / 1e6 : null);
    chartSalInst.current = new Chart(chartSalRef.current!, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Saldo Final (Real)', data: sfActual, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.15)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#10b981', borderWidth: 2 },
          { label: 'Saldo Final (BE)',   data: sfBE,     borderColor: 'rgba(16,185,129,.5)', backgroundColor: 'transparent', fill: false, tension: 0.4, pointRadius: 3, borderDash: [5, 4], borderWidth: 1.5 },
          { label: 'Saldo Inicio',       data: monthlyData.map(m => m.saldoInicio / 1e6), borderColor: 'rgba(59,130,246,.35)', backgroundColor: 'transparent', fill: false, tension: 0.4, pointRadius: 2, borderDash: [2, 3], borderWidth: 1 },
        ] as any,
      },
      options: { ...baseOpts, plugins: { ...baseOpts.plugins, legend: { display: true, labels: { color: '#7a90b0', font: { size: 9 }, boxWidth: 9, padding: 8 } }, tooltip: { ...baseOpts.plugins.tooltip, callbacks: { label: (c: any) => ` ${c.dataset.label}: $${c.raw?.toFixed(1)}M` } } } },
    });

    return () => {
      chartCobInst.current?.destroy();
      chartEgInst.current?.destroy();
      chartSalInst.current?.destroy();
    };
  }, [monthlyData, selectedMonth]);

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '80px 0', background: C.bg }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Loader2 style={{ width: 32, height: 32, color: C.blueL }} className="animate-spin" />
        <p style={{ color: C.txt2, fontSize: 13 }}>Cargando datos de tesorería...</p>
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

  // ── Derived render values ─────────────────────────────────────────────────
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const todayM = today.getMonth();
  const todayD = today.getDate();
  const todayY = today.getFullYear();

  const D   = monthlyData;
  const sel = D[selectedMonth] ?? D[0];
  if (!sel) return null;

  const { isPast, isCurrent, isFuture } = sel;
  const wd = WD[selectedMonth];

  // FCO strip
  const varMes = selectedMonth > 0 && D[selectedMonth - 1]
    ? sel.saldoFinal - D[selectedMonth - 1].saldoFinal
    : sel.fco;

  // Status tag
  type TagCls = 'actual' | 'be' | 'mixed';
  const statusLabel = isPast ? 'ACTUAL' : isCurrent ? 'ACTUAL + BE' : 'PROYECTADO BE';
  const statusCls: TagCls = isPast ? 'actual' : isCurrent ? 'mixed' : 'be';
  const statusInfo = isPast
    ? `Datos reales cerrados · ${MN[selectedMonth]} 2026`
    : isCurrent
      ? `Días 1–${todayD} real · pendiente proyectado (BE)`
      : `Estimación Best Estimate · ${MN[selectedMonth]} 2026`;

  const tagStyle: Record<TagCls, CSSProperties> = {
    actual: { background: 'rgba(16,185,129,.12)', color: C.green,  border: '1px solid rgba(16,185,129,.25)' },
    be:     { background: 'rgba(245,158,11,.12)',  color: C.amber,  border: '1px solid rgba(245,158,11,.25)' },
    mixed:  { background: 'rgba(59,130,246,.12)',  color: C.blueL,  border: '1px solid rgba(59,130,246,.25)' },
  };

  // Section 1: daily KPIs
  let sec1Title: string, sec1Badge: string;
  let dInicio: number, dCob: number, dOrig: number, dProv: number, dImp: number, dFinal: number;

  if (isCurrent) {
    const todayStr   = `${todayY}-${String(todayM + 1).padStart(2,'0')}-${String(todayD).padStart(2,'0')}`;
    const todayEntry = sel.days.find(d => d.dateStr === todayStr) ?? sel.days.filter(d => d.isActual).at(-1) ?? sel.days[0];
    dInicio = todayEntry?.saldoInicio   ?? sel.saldoInicio;
    dCob    = todayEntry?.cobranzas     ?? 0;
    dOrig   = todayEntry?.originaciones ?? 0;
    dProv   = todayEntry?.proveedores   ?? 0;
    dImp    = todayEntry?.impuestos     ?? 0;
    dFinal  = todayEntry?.saldoFinal    ?? sel.saldoFinal;
    const dayLbl    = `${todayD} ${MS[todayM]} ${todayY}`;
    const isRealDay = todayEntry?.isActual ?? false;
    sec1Title = `Posición del Día · ${dayLbl}`;
    sec1Badge = isRealDay ? `DATO REAL · ${dayLbl}` : `PROYECCIÓN BE · ${dayLbl}`;
  } else if (isPast) {
    dInicio = sel.saldoInicio;
    dCob    = sel.cobranzas     / wd;
    dOrig   = sel.originaciones / wd;
    dProv   = sel.proveedores   / wd;
    dImp    = sel.impuestos     / wd;
    dFinal  = sel.saldoFinal;
    sec1Title = `Promedio Diario · ${MN[selectedMonth]} 2026`;
    sec1Badge = 'MES CERRADO · DATO REAL';
  } else {
    dInicio = sel.saldoInicio;
    dCob    = sel.cobranzas     / wd;
    dOrig   = sel.originaciones / wd;
    dProv   = sel.proveedores   / wd;
    dImp    = sel.impuestos     / wd;
    dFinal  = sel.saldoFinal;
    sec1Title = `Promedio Diario BE · ${MN[selectedMonth]} 2026`;
    sec1Badge = 'PROYECCIÓN BEST ESTIMATE';
  }

  const kpiTagStyle = isFuture
    ? { text: 'BE',     s: { background: 'rgba(245,158,11,.13)', color: C.amber } }
    : { text: 'ACTUAL', s: { background: 'rgba(16,185,129,.13)', color: C.green } };

  // Section 2: accumulated (numerator = actuals; denominator = Proyectado col per mapping doc)
  let acCob: number, acOrig: number, acProv: number, acImp: number, footerNote: string;
  if (isCurrent) {
    const actualDays = sel.days.filter(d => d.isActual);
    acCob  = actualDays.reduce((s, d) => s + d.cobranzas, 0);
    acOrig = actualDays.reduce((s, d) => s + d.originaciones, 0);
    acProv = actualDays.reduce((s, d) => s + d.proveedores, 0);
    acImp  = actualDays.reduce((s, d) => s + d.impuestos, 0);
    footerNote = `Acumulado real (1–${todayD} ${MS[todayM]})`;
  } else if (isPast) {
    acCob = sel.cobranzas; acOrig = sel.originaciones; acProv = sel.proveedores; acImp = sel.impuestos;
    footerNote = 'Mes cerrado · dato real';
  } else {
    acCob = 0; acOrig = 0; acProv = 0; acImp = 0;
    footerNote = 'Sin datos reales aún (proyectado)';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const card: CSSProperties = {
    background: C.bgCard,
    border:     `1px solid ${C.border}`,
    borderRadius: 12,
    position:   'relative',
    overflow:   'hidden',
  };
  const mono: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes teso-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .teso-kpi:hover { transform: translateY(-2px) !important; border-color: ${C.border2} !important; }
      `}</style>

      <div style={{ background: C.bg, minHeight: '100%', flex: 1, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: C.txt }}>

        {/* ── HEADER ── */}
        <div style={{ background: 'linear-gradient(135deg,#07102a 0%,#0c1a3a 100%)', borderBottom: `1px solid ${C.border}`, padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg,#3b82f6,#7c3aed)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff', flexShrink: 0 }}>G</div>
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>Dashboard de Tesorería</div>
              <div style={{ fontSize: 11, color: C.txt2, marginTop: 3 }}>Grupo Libgot · Anticipo · Argentina</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.txt2 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, animation: 'teso-pulse 2.2s ease-in-out infinite' }} />
              <span style={mono}>
                {clock.getDate()} {MS[clock.getMonth()]} {clock.getFullYear()} · {String(clock.getHours()).padStart(2,'0')}:{String(clock.getMinutes()).padStart(2,'0')}
              </span>
            </div>
            {lastRefresh && <span style={{ fontSize: 10, color: C.txt3 }}>Act. {lastRefresh.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</span>}
            <button onClick={() => fetchData(true)} style={{ padding: 6, background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.txt2, cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Actualizar">
              <RefreshCcw size={13} />
            </button>
          </div>
        </div>

        {/* ── CONTROLS ── */}
        <div style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>País</span>
            <select defaultValue="AR" style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              <option value="AR">🇦🇷 Argentina</option>
              <option value="CO" disabled>🇨🇴 Colombia (próximamente)</option>
            </select>
          </div>
          <div style={{ width: 1, height: 22, background: C.border }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Mes</span>
            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              {MN.map((mn, i) => <option key={i} value={i}>{mn} 2026</option>)}
            </select>
          </div>
          <div style={{ width: 1, height: 22, background: C.border }} />
          <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.4, ...tagStyle[statusCls] }}>{statusLabel}</span>
          <span style={{ fontSize: 11, color: C.txt3 }}>{statusInfo}</span>
        </div>

        {/* ── MAIN ── */}
        <div style={{ padding: '20px 24px', maxWidth: 1680, margin: '0 auto' }}>

          {/* FCO Summary Strip */}
          <div style={{ background: 'linear-gradient(135deg,rgba(16,185,129,.08),rgba(6,182,212,.05))', border: '1px solid rgba(16,185,129,.2)', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
            {[
              { lbl: 'Saldo Inicio Mes',    val: '$' + fmt(sel.saldoInicio),                pos: null },
              { lbl: 'Cobranzas Mes',       val: '$' + fmt(sel.cobranzas),                  pos: true },
              { lbl: 'Total Egresos',       val: '-$' + fmt(sel.totalEgresos),               pos: false },
              { lbl: 'FCO del Mes',         val: fmtS(sel.fco),                             pos: sel.fco >= 0 },
              { lbl: 'Saldo Cierre Mes',    val: '$' + fmt(sel.saldoFinal),                  pos: sel.saldoFinal >= 0 },
              { lbl: 'Var. vs Mes Ant.',    val: fmtS(varMes),                              pos: varMes >= 0 },
              { lbl: 'Generación Liquidez', val: sel.fco >= 0 ? '✓ Positivo' : '✗ Negativo', pos: sel.fco >= 0 },
            ].map((item, i, arr) => (
              <Fragment key={item.lbl}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{item.lbl}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, ...mono, color: item.pos === null ? C.blueL : item.pos ? C.greenL : C.redL }}>{item.val}</div>
                </div>
                {i < arr.length - 1 && <div style={{ width: 1, height: 32, background: 'rgba(16,185,129,.2)', flexShrink: 0 }} />}
              </Fragment>
            ))}
          </div>

          {/* Section 1: Posición del Día */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{sec1Title}</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: C.txt3 }}>{sec1Badge}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12 }}>
            {[
              { key:'inicio', lbl:'Saldo Inicio del Día', val: '$' + fmt(dInicio),  sub: 'Al inicio de la jornada',         grad: '#3b82f6,#60a5fa', color: C.blueL },
              { key:'cob',   lbl:'Cobranzas del Día',     val: '+$' + fmt(dCob),    sub: 'Ingresos operativos',              grad: '#10b981,#34d399', color: C.greenL },
              { key:'orig',  lbl:'Originaciones del Día', val: '-$' + fmt(dOrig),   sub: 'Desembolso créditos Anticipo',     grad: '#f43f5e,#fb7185', color: C.redL },
              { key:'prov',  lbl:'Proveedores del Día',   val: '-$' + fmt(dProv),   sub: 'Pagos a proveedores',              grad: '#f59e0b,#fcd34d', color: C.redL },
              { key:'imp',   lbl:'Impuestos del Día',     val: '-$' + fmt(dImp),    sub: 'Obligaciones fiscales',            grad: '#8b5cf6,#a78bfa', color: C.redL },
              { key:'sfin',  lbl:'Saldo Final del Día',   val: (dFinal >= 0 ? '$' : '-$') + fmt(dFinal), sub: `Cierre mes ${isFuture ? 'BE' : isCurrent ? 'proyectado' : 'real'}: $${fmt(sel.saldoFinal)}`, grad: '#06b6d4,#22d3ee', color: dFinal >= 0 ? C.greenL : C.redL },
            ].map(({ key, lbl, val, sub, grad, color }) => (
              <div key={key} className="teso-kpi" style={{ ...card, padding: '16px 16px 14px', cursor: 'default', transition: 'border-color .2s,transform .2s' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${grad})`, borderRadius: '12px 12px 0 0' }} />
                <div style={{ position: 'absolute', top: 11, right: 11, fontSize: 8.5, fontWeight: 700, padding: '2px 5px', borderRadius: 3, ...kpiTagStyle.s }}>{kpiTagStyle.text}</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 9 }}>{lbl}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1, marginBottom: 5, ...mono, color }}>{val}</div>
                <div style={{ fontSize: 10, color: C.txt3, lineHeight: 1.4 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Section 2: Acumulado del Mes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Acumulado del Mes · {MN[selectedMonth]} 2026</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              { lbl: 'Cobranzas del Mes',     ac: acCob,  tot: sel.cobranzasProy, grad: '#3b82f6,#60a5fa', pctColor: C.blueL },
              { lbl: 'Originaciones del Mes', ac: acOrig, tot: sel.origProy,      grad: '#f43f5e,#fb7185', pctColor: C.redL },
              { lbl: 'Proveedores del Mes',   ac: acProv, tot: sel.provProy,      grad: '#f59e0b,#fcd34d', pctColor: C.amberL },
              { lbl: 'Impuestos del Mes',     ac: acImp,  tot: sel.impProy,       grad: '#8b5cf6,#a78bfa', pctColor: C.purpleL },
            ].map(({ lbl, ac, tot, grad, pctColor }) => {
              const pct     = tot > 0 ? Math.min(ac / tot * 100, 100) : 0;
              const pending = tot - ac;
              return (
                <div key={lbl} style={{ ...card, padding: '18px 18px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{lbl}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, ...mono, color: pctColor }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, color: C.txt, lineHeight: 1, marginBottom: 3, ...mono }}>${fmt(ac)}</div>
                  <div style={{ fontSize: 10.5, color: C.txt3, marginBottom: 12 }}>de ${fmt(tot)} proyectado mensual</div>
                  <div style={{ background: C.border, height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg,${grad})`, width: `${pct}%`, transition: 'width .8s cubic-bezier(.4,0,.2,1)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.txt3 }}>
                    <span>{footerNote}</span>
                    <span>${fmt(pending)} pendiente</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section 3: Evolución Anual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Evolución Anual 2026</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2 }}>Evolución de Cobranzas</div>
                <div style={{ fontSize: 10, color: C.txt3 }}>Mensual 2026 · en millones ARS</div>
              </div>
              <div style={{ height: 195, position: 'relative' }}>
                <canvas ref={chartCobRef} />
              </div>
            </div>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2 }}>Egresos Operativos</div>
                <div style={{ fontSize: 10, color: C.txt3 }}>Orig + Prov + Imp · stacked</div>
              </div>
              <div style={{ height: 195, position: 'relative' }}>
                <canvas ref={chartEgRef} />
              </div>
            </div>
          </div>

          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2 }}>Saldo al Cierre del Mes</div>
              <div style={{ fontSize: 10, color: C.txt3 }}>Real (sólido) vs BE (punteado)</div>
            </div>
            <div style={{ height: 195, position: 'relative' }}>
              <canvas ref={chartSalRef} />
            </div>
          </div>

          {/* ── AI Section ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Inteligencia Artificial · Tesorería 2026</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 32 }}>

            {/* Insights panel */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles style={{ width: 15, height: 15, color: C.blueL }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>Análisis IA</span>
                </div>
                <button onClick={fetchInsights} disabled={insightsLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.txt2, fontSize: 11, fontWeight: 700, cursor: insightsLoading ? 'not-allowed' : 'pointer', opacity: insightsLoading ? 0.5 : 1 }}>
                  {insightsLoading ? <Loader2 style={{ width: 11, height: 11 }} className="animate-spin" /> : <RefreshCcw style={{ width: 11, height: 11 }} />}
                  Actualizar
                </button>
              </div>
              <div style={{ padding: 18, flex: 1, overflowY: 'auto' }}>
                {insightsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 0' }}>
                    <Loader2 style={{ width: 26, height: 26, color: C.blueL }} className="animate-spin" />
                    <p style={{ color: C.txt2, fontSize: 13 }}>Analizando datos de tesorería...</p>
                  </div>
                ) : insights ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ fontSize: 13, color: C.txt, lineHeight: 1.65 }}>{insights.summary}</p>
                    {insights.insights?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {insights.insights.map((ins: string, i: number) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: C.bgCard2, borderRadius: 8, padding: '10px 12px' }}>
                            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(59,130,246,.18)', color: C.blueL, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                            <p style={{ fontSize: 12, color: C.txt2, lineHeight: 1.55 }}>{ins}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {insights.recommendation && (
                      <div style={{ background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.18)', borderRadius: 8, padding: '12px 16px' }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: C.blueL, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Recomendación</p>
                        <p style={{ fontSize: 12, color: C.txt2, lineHeight: 1.55 }}>{insights.recommendation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', textAlign: 'center' }}>
                    <Sparkles style={{ width: 26, height: 26, color: C.txt3 }} />
                    <p style={{ color: C.txt2, fontSize: 13 }}>Hacé clic en "Actualizar" para generar el análisis.</p>
                    <p style={{ color: C.txt3, fontSize: 11 }}>El modelo analiza los 12 meses de tesorería proyectada.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chat panel */}
            <div style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: 440 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <Bot style={{ width: 15, height: 15, color: C.purpleL }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.txt }}>Chat con los datos</span>
              </div>
              <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
                {chatMessages.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, height: '100%', textAlign: 'center' }}>
                    <Bot style={{ width: 26, height: 26, color: C.txt3 }} />
                    <p style={{ color: C.txt2, fontSize: 13 }}>Preguntá sobre los datos de tesorería.</p>
                    <p style={{ color: C.txt3, fontSize: 11 }}>Ej: "¿En qué mes hay mayor FCO?"</p>
                  </div>
                ) : chatMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {msg.role === 'model' && <Bot style={{ width: 15, height: 15, color: C.purpleL, flexShrink: 0, marginTop: 2 }} />}
                    <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: msg.role === 'user' ? '#2563eb' : C.bgCard2, color: C.txt }}>
                      {msg.content}
                    </div>
                    {msg.role === 'user' && <User style={{ width: 15, height: 15, color: C.blueL, flexShrink: 0, marginTop: 2 }} />}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Bot style={{ width: 15, height: 15, color: C.purpleL, flexShrink: 0 }} />
                    <div style={{ background: C.bgCard2, borderRadius: 10, padding: '8px 12px' }}>
                      <Loader2 style={{ width: 13, height: 13, color: C.txt2 }} className="animate-spin" />
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Preguntá sobre los datos de tesorería..."
                  disabled={chatLoading}
                  style={{ flex: 1, background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: C.txt, outline: 'none' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  style={{ padding: 8, background: '#2563eb', borderRadius: 8, border: 'none', color: '#fff', cursor: !chatInput.trim() || chatLoading ? 'not-allowed' : 'pointer', opacity: !chatInput.trim() || chatLoading ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Send style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </>
  );
}
