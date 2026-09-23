// src/components/submodules/flujoFinancieroHelpers.ts

export type Pais = 'AR' | 'CO';

export const ANIO = 2026;

export interface RowMap {
  fechas: number;
  saldoInicio?: number;
  cobranzas: number;
  originaciones: number;
  proveedores: number;
  impuestos: number;
  sueldos?: number;
  gastosBanc?: number;
  caucion?: number;
  recuperoColombia?: number;
  prestamos?: number;
  devCaucion?: number;
  tarjetas?: number;
  totalIngFin?: number;
  totalEgrFin?: number;
  freeCashflowFin?: number;
  saldoFinal?: number;
}

// 0-indexed: fila del spec menos 1
export const ROWS_AR_REAL: RowMap = {
  fechas: 3, saldoInicio: 4, cobranzas: 10, originaciones: 11, proveedores: 12,
  impuestos: 14, sueldos: 15, gastosBanc: 16, caucion: 20, recuperoColombia: 21,
  prestamos: 23, devCaucion: 28, saldoFinal: 39,
};

export const ROWS_AR_PROY: RowMap = {
  fechas: 3, cobranzas: 10, originaciones: 11, proveedores: 12, impuestos: 14,
};

export const ROWS_CO_REAL: RowMap = {
  fechas: 3, saldoInicio: 4, cobranzas: 17, originaciones: 18, proveedores: 19,
  tarjetas: 20, impuestos: 21, sueldos: 22, gastosBanc: 23,
  totalIngFin: 31, totalEgrFin: 38, freeCashflowFin: 40, saldoFinal: 42,
};

export const ROWS_CO_PROY: RowMap = {
  fechas: 3, cobranzas: 17, originaciones: 18, proveedores: 19, impuestos: 21,
};

export function parseSheetDate(val: string): Date | null {
  if (!val) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 55000) {
    const utcD = new Date(Math.round((num - 25569) * 86400 * 1000));
    return new Date(utcD.getUTCFullYear(), utcD.getUTCMonth(), utcD.getUTCDate());
  }
  if (val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  // Handle YYYY-MM-DD format (ISO date strings) as local time
  if (val.includes('-') && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const parts = val.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  // Un string puramente numérico que no cayó en el rango de serial de Sheets no es una
  // fecha (p.ej. un día de mes suelto como "5" o "31") — el fallback genérico new Date()
  // de abajo lo interpretaría de forma ambigua/incorrecta (new Date("5") → 01/05/2001),
  // así que se descarta antes de llegar ahí.
  if (!isNaN(num) && val.trim() !== '') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// Las celdas de fecha vienen de Sheets como serial numérico crudo (valueRenderOption:
// 'UNFORMATTED_VALUE'), p.ej. "46023" en vez de una fecha legible. Reusa la detección
// de serial que ya tiene parseSheetDate (num > 40000 && num < 55000) para no duplicarla;
// valores no-fecha (texto, o números chicos como día del mes) se devuelven sin tocar.
export function formatSheetCell(val: string): string {
  const fecha = parseSheetDate(val);
  if (fecha && !isNaN(fecha.getTime())) {
    const dd = String(fecha.getDate()).padStart(2, '0');
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}`;
  }
  return val;
}

export function parseSheetNum(val: string): number {
  if (!val || val === '') return 0;
  const n = parseFloat(String(val).replace(/[,\s]/g, '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DiaFlujo {
  dateStr: string; // YYYY-MM-DD
  month: number;   // 0-11
  day: number;
  saldoInicio: number;
  cobranzas: number;
  originaciones: number; // siempre viene de /api/sales-s3, nunca de la fila del sheet
  proveedores: number;
  impuestos: number;
  sueldos: number;
  gastosBanc: number;
  caucion: number;
  recuperoColombia: number;
  prestamos: number;
  devCaucion: number;
  tarjetas: number;
  totalIngFin: number;
  totalEgrFin: number;
  freeCashflowFin: number;
  saldoFinal: number;
}

export function parseDailyReal(rows: string[][], map: RowMap, originacionesPorDia: Record<string, number>): DiaFlujo[] {
  const dateRow = rows[map.fechas] || [];
  const get = (rowIdx: number | undefined, col: number): number =>
    rowIdx === undefined ? 0 : Math.abs(parseSheetNum(rows[rowIdx]?.[col] ?? ''));
  const getSigned = (rowIdx: number | undefined, col: number): number =>
    rowIdx === undefined ? 0 : parseSheetNum(rows[rowIdx]?.[col] ?? '');

  const out: DiaFlujo[] = [];
  for (let c = 1; c < dateRow.length; c++) {
    const date = parseSheetDate(dateRow[c]);
    if (!date || date.getFullYear() !== ANIO) continue;
    const dateStr = toDateStr(date);
    out.push({
      dateStr, month: date.getMonth(), day: date.getDate(),
      saldoInicio: getSigned(map.saldoInicio, c),
      cobranzas: get(map.cobranzas, c),
      originaciones: originacionesPorDia[dateStr] ?? 0,
      proveedores: get(map.proveedores, c),
      impuestos: get(map.impuestos, c),
      sueldos: get(map.sueldos, c),
      gastosBanc: get(map.gastosBanc, c),
      caucion: get(map.caucion, c),
      recuperoColombia: get(map.recuperoColombia, c),
      prestamos: get(map.prestamos, c),
      devCaucion: get(map.devCaucion, c),
      tarjetas: get(map.tarjetas, c),
      totalIngFin: get(map.totalIngFin, c),
      totalEgrFin: get(map.totalEgrFin, c),
      freeCashflowFin: getSigned(map.freeCashflowFin, c),
      saldoFinal: getSigned(map.saldoFinal, c),
    });
  }
  return out;
}

export interface DiaProyeccion {
  dateStr: string;
  cobranzas: number;
  originaciones: number;
  proveedores: number;
  impuestos: number;
}

export function parseDailyProy(rows: string[][], map: RowMap): DiaProyeccion[] {
  const dateRow = rows[map.fechas] || [];
  const get = (rowIdx: number | undefined, col: number): number =>
    rowIdx === undefined ? 0 : Math.abs(parseSheetNum(rows[rowIdx]?.[col] ?? ''));

  const out: DiaProyeccion[] = [];
  for (let c = 1; c < dateRow.length; c++) {
    const date = parseSheetDate(dateRow[c]);
    if (!date || date.getFullYear() !== ANIO) continue;
    out.push({
      dateStr: toDateStr(date),
      cobranzas: get(map.cobranzas, c),
      originaciones: get(map.originaciones, c),
      proveedores: get(map.proveedores, c),
      impuestos: get(map.impuestos, c),
    });
  }
  return out;
}

// ===== Range aggregation and KPI period builder =====

type CampoReal = keyof Omit<DiaFlujo, 'dateStr' | 'month' | 'day'>;
type CampoProy = keyof Omit<DiaProyeccion, 'dateStr'>;

export function sumRangeReal(dias: DiaFlujo[], campo: CampoReal, start: string, end: string): number {
  return dias.filter(d => d.dateStr >= start && d.dateStr <= end).reduce((s, d) => s + (d[campo] as number), 0);
}

export function sumRangeProy(dias: DiaProyeccion[], campo: CampoProy, start: string, end: string): number {
  return dias.filter(d => d.dateStr >= start && d.dateStr <= end).reduce((s, d) => s + (d[campo] as number), 0);
}

export function valorEnDia(dias: DiaFlujo[], campo: CampoReal, dateStr: string): number {
  const exacto = dias.find(x => x.dateStr === dateStr);
  if (exacto) return exacto[campo] as number;
  // Sin fila exacta para esa fecha (ej. fin de semana sin columna en el sheet) —
  // el saldo no se mueve sin actividad registrada, así que se toma el último
  // día disponible anterior o igual a la fecha buscada.
  const anteriores = dias.filter(x => x.dateStr <= dateStr).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const ultimo = anteriores[anteriores.length - 1];
  if (!ultimo) return 0;
  // saldoInicio de un día sin columna propia no es el saldoInicio del último día
  // disponible (eso predata toda la actividad de ese día) — el valor correcto es
  // el saldoFinal (cierre) de ese último día, que es la apertura del día buscado.
  const campoFallback: CampoReal = campo === 'saldoInicio' ? 'saldoFinal' : campo;
  return ultimo[campoFallback] as number;
}

export interface KpiPeriodo {
  saldoInicio: number;
  cobranzas: number;
  originaciones: number;
  proveedores: number;
  impuestos: number;
  saldoFinal: number;
  ratio: number;
  proy: { cobranzas: number; originaciones: number; proveedores: number; impuestos: number; ratio: number } | null;
}

// Usada tanto para la Fila 1 (start=end=día, o el rango de la semana/mes elegido) como
// para la Fila 2 (siempre start/end = primer/último día del mes calendario completo).
export function getKpiPeriodo(diasReal: DiaFlujo[], diasProy: DiaProyeccion[], start: string, end: string): KpiPeriodo {
  const cobranzas = sumRangeReal(diasReal, 'cobranzas', start, end);
  const originaciones = sumRangeReal(diasReal, 'originaciones', start, end);
  const proveedores = sumRangeReal(diasReal, 'proveedores', start, end);
  const impuestos = sumRangeReal(diasReal, 'impuestos', start, end);
  const saldoInicio = valorEnDia(diasReal, 'saldoInicio', start);
  const saldoFinal = valorEnDia(diasReal, 'saldoFinal', end);
  const ratio = cobranzas > 0 ? (originaciones / cobranzas) * 100 : 0;

  const hayProy = diasProy.some(d => d.dateStr >= start && d.dateStr <= end);
  const pCobranzas = sumRangeProy(diasProy, 'cobranzas', start, end);
  const pOriginaciones = sumRangeProy(diasProy, 'originaciones', start, end);

  return {
    saldoInicio, cobranzas, originaciones, proveedores, impuestos, saldoFinal, ratio,
    proy: hayProy ? {
      cobranzas: pCobranzas,
      originaciones: pOriginaciones,
      proveedores: sumRangeProy(diasProy, 'proveedores', start, end),
      impuestos: sumRangeProy(diasProy, 'impuestos', start, end),
      ratio: pCobranzas > 0 ? (pOriginaciones / pCobranzas) * 100 : 0,
    } : null,
  };
}

// ===== Weeks/days, formatting, and semáforo =====

const MS_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface Semana { start: string; end: string; label: string; }

export function weeksInMonth(year: number, month: number): Semana[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const back = first.getDay() === 6 ? 0 : (first.getDay() + 1);
  let ws = new Date(first); ws.setDate(ws.getDate() - back);
  const out: Semana[] = [];
  while (ws <= last) {
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const fd = (d: Date) => `${d.getDate()} ${MS_CORTO[d.getMonth()]}`;
    out.push({ start: toDateStr(ws), end: toDateStr(we), label: `${fd(ws)} - ${fd(we)}` });
    const n = new Date(ws); n.setDate(n.getDate() + 7); ws = n;
  }
  return out;
}

export function daysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => toDateStr(new Date(year, month, i + 1)));
}

export function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (abs / 1e3).toFixed(0) + 'K';
  return abs.toFixed(0);
}

export function fmtLocal(v: number, pais: Pais): string {
  const prefix = pais === 'AR' ? '$' : 'COP';
  return `${prefix} ${Math.round(v).toLocaleString('es-AR')}`;
}

export interface RatioEstado { cls: 'sem-green' | 'sem-yellow' | 'sem-red'; alerta: boolean; }

export function rcT(ratio: number, pais: Pais): RatioEstado {
  const hi = pais === 'CO' ? 69 : 65;
  const mid = pais === 'CO' ? 67 : 62;
  if (ratio >= hi) return { cls: 'sem-red', alerta: true };
  if (ratio >= mid) return { cls: 'sem-yellow', alerta: false };
  return { cls: 'sem-green', alerta: false };
}

// ===== Proveedores parsers =====

export interface ProveedorRow {
  sociedad: string; detalle: string; mes: string; diaPago: string;
  vencimiento: string; nombre: string; importe: number; aprobacion: string;
}

export function parseProveedoresAr(rows: string[][]): ProveedorRow[] {
  const out: ProveedorRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[8]) continue; // sin nombre → descartar
    const sociedad = (row[0] ?? '').trim();
    if (sociedad === 'Social Plus S.A.') continue;
    const aprobacion = (row[15] ?? '').trim();
    if (aprobacion !== 'Si' && aprobacion !== 'pendiente') continue;
    out.push({
      sociedad, detalle: row[1] ?? '', mes: row[2] ?? '', diaPago: row[3] ?? '',
      vencimiento: row[6] ?? '', nombre: row[8] ?? '', importe: parseSheetNum(row[9] ?? ''), aprobacion,
    });
  }
  return out;
}

export function parseProveedoresCo(rows: string[][]): ProveedorRow[] {
  const out: ProveedorRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[8]) continue;
    const aprobacion = (row[14] ?? '').trim();
    if (aprobacion === 'No') continue;
    out.push({
      sociedad: row[1] ?? '', detalle: row[2] ?? '', mes: row[3] ?? '', diaPago: row[4] ?? '',
      vencimiento: row[7] ?? '', nombre: row[8] ?? '', importe: parseSheetNum(row[9] ?? ''), aprobacion,
    });
  }
  return out;
}
