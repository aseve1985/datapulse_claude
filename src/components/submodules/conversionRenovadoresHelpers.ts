// src/components/submodules/conversionRenovadoresHelpers.ts
// Lógica pura del submódulo Directorio › Conversión de renovadores.
// Spec: docs/superpowers/specs/2026-11-13-conversion-renovadores.md (§3, §4.1, §4.3, §7)

export type Ventana = 5 | 10 | 20 | 30 | 60;
export const VENTANAS: Ventana[] = [5, 10, 20, 30, 60];
export const MESES_OPCIONES = [12, 18, 24] as const;
export const PASOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** Meses con madurez menor a esto se muestran en gris y quedan fuera de las comparaciones (spec §7.7). */
export const UMBRAL_MADUREZ = 0.95;

/** Una fila de la consulta maestra (Q1): mes de vencimiento × paso. */
export interface FilaConversion {
  mes_vto: string; // 'YYYY-MM'
  paso: number;    // 1..9, 10 = "10º o más"
  creditos_paid: number;
  ofertas: number;
  conv_5d: number; conv_10d: number; conv_20d: number; conv_30d: number; conv_60d: number;
  maduras_5d: number; maduras_10d: number; maduras_20d: number; maduras_30d: number; maduras_60d: number;
}

export interface Celda {
  paid: number;
  ofertas: number;
  conv: number;
  maduras: number;
}

const conv = (f: FilaConversion, v: Ventana) => f[`conv_${v}d` as const];
const maduras = (f: FilaConversion, v: Ventana) => f[`maduras_${v}d` as const];

const celdaVacia = (): Celda => ({ paid: 0, ofertas: 0, conv: 0, maduras: 0 });
const sumar = (c: Celda, f: FilaConversion, v: Ventana) => {
  c.paid += f.creditos_paid;
  c.ofertas += f.ofertas;
  c.conv += conv(f, v);
  c.maduras += maduras(f, v);
};

/** Cociente seguro: null si el denominador es 0. Siempre Σ numerador / Σ denominador (spec §4.1). */
export const tasa = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export function mesesOrdenados(filas: FilaConversion[]): string[] {
  return Array.from(new Set(filas.map(f => f.mes_vto))).sort();
}

/** Total del mes (todos los pasos) para una ventana. Su madurez es la que decide el gris (spec §6.1). */
export function totalesPorMes(filas: FilaConversion[], v: Ventana): Map<string, Celda> {
  const out = new Map<string, Celda>();
  for (const f of filas) {
    if (!out.has(f.mes_vto)) out.set(f.mes_vto, celdaVacia());
    sumar(out.get(f.mes_vto)!, f, v);
  }
  return out;
}

export const madurez = (c: Celda | undefined): number | null => (c ? tasa(c.maduras, c.ofertas) : null);
export const esMaduro = (c: Celda | undefined): boolean => {
  const m = madurez(c);
  return m !== null && m >= UMBRAL_MADUREZ;
};

/** Matriz paso × mes: celdas[paso][mes]. */
export function construirMatriz(filas: FilaConversion[], v: Ventana): Map<number, Map<string, Celda>> {
  const out = new Map<number, Map<string, Celda>>();
  for (const paso of PASOS) out.set(paso, new Map());
  for (const f of filas) {
    const fila = out.get(f.paso);
    if (!fila) continue;
    if (!fila.has(f.mes_vto)) fila.set(f.mes_vto, celdaVacia());
    sumar(fila.get(f.mes_vto)!, f, v);
  }
  return out;
}

export interface DetalleMes {
  mes: string;
  paid: number;
  ofertas: number;
  convertidos: number;
  convOfertas: number | null;
  convPaid: number | null;
  conOferta: number | null;
  madurez: number | null;
  maduro: boolean;
}

/** Detalle mensual (todos los pasos), en la ventana seleccionada. */
export function detalleMensual(filas: FilaConversion[], v: Ventana): DetalleMes[] {
  const totales = totalesPorMes(filas, v);
  return mesesOrdenados(filas).map(mes => {
    const c = totales.get(mes)!;
    return {
      mes,
      paid: c.paid,
      ofertas: c.ofertas,
      convertidos: c.conv,
      convOfertas: tasa(c.conv, c.ofertas),
      convPaid: tasa(c.conv, c.paid),
      conOferta: tasa(c.ofertas, c.paid),
      madurez: madurez(c),
      maduro: esMaduro(c),
    };
  });
}

// ── Semáforo (spec §4.3): escala continua rojo → amarillo → verde sobre conv./ofertas ──
export interface Umbrales { rojo: number; amarillo: number; verde: number }
export function umbrales(v: Ventana): Umbrales {
  return v === 5 ? { rojo: 0.5, amarillo: 0.6, verde: 0.72 } : { rojo: 0.5, amarillo: 0.65, verde: 0.85 };
}

// Mismos tonos que el semáforo de flujoFinancieroHelpers (rose-500 / amber-500 / emerald-500).
const ROJO: [number, number, number] = [244, 63, 94];
const AMARILLO: [number, number, number] = [245, 158, 11];
const VERDE: [number, number, number] = [16, 185, 129];

const mezclar = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t));

/** Color RGB del semáforo para una tasa (0..1). */
export function colorSemaforo(pct: number, v: Ventana): [number, number, number] {
  const u = umbrales(v);
  if (pct <= u.rojo) return ROJO;
  if (pct >= u.verde) return VERDE;
  if (pct <= u.amarillo) return mezclar(ROJO, AMARILLO, (pct - u.rojo) / (u.amarillo - u.rojo)) as [number, number, number];
  return mezclar(AMARILLO, VERDE, (pct - u.amarillo) / (u.verde - u.amarillo)) as [number, number, number];
}

// ── Formato (es-AR: 1.782 · 60,9%) ──
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const fmtMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_CORTOS[m - 1]}-${String(y).slice(2)}`;
};
export const fmtNum = (n: number) => n.toLocaleString('es-AR');
export const fmtPct = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const etiquetaPaso = (paso: number) => (paso >= 10 ? '10º o más → sig.' : `${paso}º → ${paso + 1}º`);
