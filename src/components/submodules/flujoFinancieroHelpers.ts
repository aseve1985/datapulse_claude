// src/components/submodules/flujoFinancieroHelpers.ts

export type Pais = 'AR' | 'CO';

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
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
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
    if (!date || date.getFullYear() !== 2026) continue;
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
      freeCashflowFin: get(map.freeCashflowFin, c),
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
    if (!date || date.getFullYear() !== 2026) continue;
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
