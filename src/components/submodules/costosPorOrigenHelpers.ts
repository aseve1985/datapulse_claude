// src/components/submodules/costosPorOrigenHelpers.ts
// Funciones puras de agregación para el submódulo Marketing › Costos por origen.
// Fuente: marketing.cac_proveedor_mensual (grano país × mes de cohorte × origen).
//
// Regla crítica (spec §4): los KPIs (CPL/CPM/CPO/CPV) nunca se promedian al agregar
// más de una fila — siempre se recalculan como SUM(costo_total)/SUM(denominador).
// Para USD, cada fila se convierte con su propio tipo_cambio_usd antes de sumar,
// porque el tipo de cambio cambia mes a mes.

export interface CostoOrigenRow {
  pais: string;
  mes: string; // normalizado a 'YYYY-MM-DD' al cargar
  origen: string;
  tipo_origen: string;
  moneda_local: string;
  cantidad_leads: number;
  cantidad_leads_otp: number;
  cantidad_motor: number;
  cantidad_ofertas: number;
  cantidad_ventas: number;
  capital_vendido: number;
  tipo_cambio_usd: number;
  costo_operativo_pool_pais: number;
  costo_operativo_por_lead: number;
  costo_operativo: number;
  costo_marketing: number;
  costo_total: number;
  cpl: number | null;
  cpm: number | null;
  cpo: number | null;
  cpv: number | null;
  cpl_usd: number | null;
  cpm_usd: number | null;
  cpo_usd: number | null;
  cpv_usd: number | null;
  conv_lead_motor: number | null;
  conv_motor_oferta: number | null;
  conv_oferta_venta: number | null;
  conv_lead_venta: number | null;
  mes_costo_referencia: string;
  factor_prorrateo: number;
  es_costo_estimado: boolean;
  es_cohorte_abierta: boolean;
  fecha_corte: string;
  updated_at: string;
}

export type Moneda = 'local' | 'usd';

export interface OrigenCatalogo {
  pais: string;
  origen: string;
  tipoOrigen: string;
}

export interface KpiAgregado {
  leads: number;
  motor: number;
  ofertas: number;
  ventas: number;
  costoTotal: number;
  costoTotalUsd: number;
  cpl: number | null;
  cpm: number | null;
  cpo: number | null;
  cpv: number | null;
  cplUsd: number | null;
  cpmUsd: number | null;
  cpoUsd: number | null;
  cpvUsd: number | null;
  convLeadMotor: number | null;
  convMotorOferta: number | null;
  convOfertaVenta: number | null;
  convLeadVenta: number | null;
  esEstimado: boolean;
  esCohorteAbierta: boolean;
}

export const safeDiv = (num: number, den: number): number | null => (den > 0 ? num / den : null);
const pctDe = (num: number, den: number): number | null => { const r = safeDiv(num, den); return r === null ? null : r * 100; };

const sumField = (rows: CostoOrigenRow[], field: keyof CostoOrigenRow): number =>
  rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

// Convierte fila por fila a USD con su propio tipo_cambio_usd antes de sumar.
export const sumUsd = (rows: CostoOrigenRow[], field: keyof CostoOrigenRow): number =>
  rows.reduce((s, r) => s + (r.tipo_cambio_usd > 0 ? (Number(r[field]) || 0) / r.tipo_cambio_usd : 0), 0);

export function aggregateKpis(rows: CostoOrigenRow[]): KpiAgregado {
  const leads = sumField(rows, 'cantidad_leads');
  const motor = sumField(rows, 'cantidad_motor');
  const ofertas = sumField(rows, 'cantidad_ofertas');
  const ventas = sumField(rows, 'cantidad_ventas');
  const costoTotal = sumField(rows, 'costo_total');
  const costoTotalUsd = sumUsd(rows, 'costo_total');

  return {
    leads, motor, ofertas, ventas, costoTotal, costoTotalUsd,
    cpl: safeDiv(costoTotal, leads), cpm: safeDiv(costoTotal, motor), cpo: safeDiv(costoTotal, ofertas), cpv: safeDiv(costoTotal, ventas),
    cplUsd: safeDiv(costoTotalUsd, leads), cpmUsd: safeDiv(costoTotalUsd, motor), cpoUsd: safeDiv(costoTotalUsd, ofertas), cpvUsd: safeDiv(costoTotalUsd, ventas),
    convLeadMotor: safeDiv(motor, leads), convMotorOferta: safeDiv(ofertas, motor), convOfertaVenta: safeDiv(ventas, ofertas), convLeadVenta: safeDiv(ventas, leads),
    esEstimado: rows.some(r => r.es_costo_estimado),
    esCohorteAbierta: rows.some(r => r.es_cohorte_abierta),
  };
}

export function getDistinctOrigenes(rows: CostoOrigenRow[]): OrigenCatalogo[] {
  const map = new Map<string, OrigenCatalogo>();
  for (const r of rows) {
    const key = `${r.pais}|${r.origen}`;
    if (!map.has(key)) map.set(key, { pais: r.pais, origen: r.origen, tipoOrigen: r.tipo_origen });
  }
  return [...map.values()].sort((a, b) =>
    a.pais.localeCompare(b.pais) || a.tipoOrigen.localeCompare(b.tipoOrigen) || a.origen.localeCompare(b.origen)
  );
}

export const origenKey = (pais: string, origen: string): string => `${pais}|${origen}`;

export interface TablaFila {
  key: string;
  pais: string;
  origen: string;
  mes: string | null; // null en filas de total
  esTotal: boolean;
  leads: number;
  motor: number;
  ofertas: number;
  ventas: number;
  capitalVendido: number;
  costoOperativo: number;
  costoMarketing: number;
  costoTotal: number;
  pctCostoOperativo: number | null; // costoOperativo / capitalVendido, en %
  pctCostoMarketing: number | null;
  pctCostoTotal: number | null;
  cpl: number | null;
  cpm: number | null;
  cpo: number | null;
  cpv: number | null;
  esEstimado: boolean;
  esCohorteAbierta: boolean;
}

// Filas de detalle origen × mes + total(es) por país (o un único total en USD si
// se está consolidando más de un país — nunca se suma ARS+COP).
export function buildTableRows(rows: CostoOrigenRow[], moneda: Moneda): TablaFila[] {
  const out: TablaFila[] = [];

  for (const r of [...rows].sort((a, b) => a.origen.localeCompare(b.origen) || a.mes.localeCompare(b.mes))) {
    const capitalVendido = moneda === 'usd' ? sumUsd([r], 'capital_vendido') : r.capital_vendido;
    const costoOperativo = moneda === 'usd' ? sumUsd([r], 'costo_operativo') : r.costo_operativo;
    const costoMarketing = moneda === 'usd' ? sumUsd([r], 'costo_marketing') : r.costo_marketing;
    const costoTotal = moneda === 'usd' ? sumUsd([r], 'costo_total') : r.costo_total;
    out.push({
      key: `${origenKey(r.pais, r.origen)}|${r.mes}`, pais: r.pais, origen: r.origen, mes: r.mes, esTotal: false,
      leads: r.cantidad_leads, motor: r.cantidad_motor, ofertas: r.cantidad_ofertas, ventas: r.cantidad_ventas,
      capitalVendido, costoOperativo, costoMarketing, costoTotal,
      pctCostoOperativo: pctDe(costoOperativo, capitalVendido),
      pctCostoMarketing: pctDe(costoMarketing, capitalVendido),
      pctCostoTotal: pctDe(costoTotal, capitalVendido),
      cpl: moneda === 'usd' ? r.cpl_usd : r.cpl,
      cpm: moneda === 'usd' ? r.cpm_usd : r.cpm,
      cpo: moneda === 'usd' ? r.cpo_usd : r.cpo,
      cpv: moneda === 'usd' ? r.cpv_usd : r.cpv,
      esEstimado: r.es_costo_estimado, esCohorteAbierta: r.es_cohorte_abierta,
    });
  }

  if (moneda === 'usd') {
    const agg = aggregateKpis(rows);
    const capitalVendido = sumUsd(rows, 'capital_vendido');
    const costoOperativo = sumUsd(rows, 'costo_operativo');
    const costoMarketing = sumUsd(rows, 'costo_marketing');
    out.push({
      key: 'total', pais: '—', origen: 'TOTAL', mes: null, esTotal: true,
      leads: agg.leads, motor: agg.motor, ofertas: agg.ofertas, ventas: agg.ventas,
      capitalVendido, costoOperativo, costoMarketing, costoTotal: agg.costoTotalUsd,
      pctCostoOperativo: pctDe(costoOperativo, capitalVendido),
      pctCostoMarketing: pctDe(costoMarketing, capitalVendido),
      pctCostoTotal: pctDe(agg.costoTotalUsd, capitalVendido),
      cpl: agg.cplUsd, cpm: agg.cpmUsd, cpo: agg.cpoUsd, cpv: agg.cpvUsd,
      esEstimado: agg.esEstimado, esCohorteAbierta: agg.esCohorteAbierta,
    });
  } else {
    for (const pais of [...new Set(rows.map(r => r.pais))].sort()) {
      const paisRows = rows.filter(r => r.pais === pais);
      const agg = aggregateKpis(paisRows);
      const capitalVendido = sumField(paisRows, 'capital_vendido');
      const costoOperativo = sumField(paisRows, 'costo_operativo');
      const costoMarketing = sumField(paisRows, 'costo_marketing');
      out.push({
        key: `total|${pais}`, pais, origen: 'TOTAL', mes: null, esTotal: true,
        leads: agg.leads, motor: agg.motor, ofertas: agg.ofertas, ventas: agg.ventas,
        capitalVendido, costoOperativo, costoMarketing, costoTotal: agg.costoTotal,
        pctCostoOperativo: pctDe(costoOperativo, capitalVendido),
        pctCostoMarketing: pctDe(costoMarketing, capitalVendido),
        pctCostoTotal: pctDe(agg.costoTotal, capitalVendido),
        cpl: agg.cpl, cpm: agg.cpm, cpo: agg.cpo, cpv: agg.cpv,
        esEstimado: agg.esEstimado, esCohorteAbierta: agg.esCohorteAbierta,
      });
    }
  }

  return out;
}

// Agregado por origen (sin desglose mensual) — usado por el gráfico de
// composición del costo, que ya no tiene una fila de subtotal propia en la tabla.
export function aggregateByOrigen(rows: CostoOrigenRow[], moneda: Moneda): TablaFila[] {
  const porOrigen = new Map<string, CostoOrigenRow[]>();
  for (const r of rows) {
    const key = origenKey(r.pais, r.origen);
    if (!porOrigen.has(key)) porOrigen.set(key, []);
    porOrigen.get(key)!.push(r);
  }

  return [...porOrigen.keys()].sort().map(key => {
    const origenRows = porOrigen.get(key)!;
    const [pais, origen] = key.split('|');
    const agg = aggregateKpis(origenRows);
    const capitalVendido = moneda === 'usd' ? sumUsd(origenRows, 'capital_vendido') : sumField(origenRows, 'capital_vendido');
    const costoOperativo = moneda === 'usd' ? sumUsd(origenRows, 'costo_operativo') : sumField(origenRows, 'costo_operativo');
    const costoMarketing = moneda === 'usd' ? sumUsd(origenRows, 'costo_marketing') : sumField(origenRows, 'costo_marketing');
    const costoTotal = moneda === 'usd' ? agg.costoTotalUsd : agg.costoTotal;
    return {
      key, pais, origen, mes: null, esTotal: false,
      leads: agg.leads, motor: agg.motor, ofertas: agg.ofertas, ventas: agg.ventas,
      capitalVendido, costoOperativo, costoMarketing, costoTotal,
      pctCostoOperativo: pctDe(costoOperativo, capitalVendido),
      pctCostoMarketing: pctDe(costoMarketing, capitalVendido),
      pctCostoTotal: pctDe(costoTotal, capitalVendido),
      cpl: moneda === 'usd' ? agg.cplUsd : agg.cpl,
      cpm: moneda === 'usd' ? agg.cpmUsd : agg.cpm,
      cpo: moneda === 'usd' ? agg.cpoUsd : agg.cpo,
      cpv: moneda === 'usd' ? agg.cpvUsd : agg.cpv,
      esEstimado: agg.esEstimado, esCohorteAbierta: agg.esCohorteAbierta,
    };
  });
}

export type SortBy = 'origen' | 'mes' | 'cpl' | 'cpm' | 'cpo' | 'cpv';

// Ordena solo las filas de detalle — las filas de Total quedan siempre al pie.
// Los nulos (denominador en 0) se mandan al final, cualquiera sea el criterio.
export function sortTableRows(rows: TablaFila[], sortBy: SortBy): TablaFila[] {
  const detalle = rows.filter(r => !r.esTotal);
  const totales = rows.filter(r => r.esTotal);

  const cmp = (a: TablaFila, b: TablaFila): number => {
    if (sortBy === 'origen') return a.origen.localeCompare(b.origen) || (a.mes ?? '').localeCompare(b.mes ?? '');
    if (sortBy === 'mes') return (a.mes ?? '').localeCompare(b.mes ?? '') || a.origen.localeCompare(b.origen);
    const av = a[sortBy];
    const bv = b[sortBy];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  };

  return [...detalle.sort(cmp), ...totales];
}

// Desplaza un mes ('YYYY-MM-DD', primer día de mes) n meses hacia atrás.
export function mesesAtras(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 10);
}

// Cantidad de meses de calendario entre dos 'YYYY-MM-DD' (inclusive).
export function contarMeses(desde: string, hasta: string): number {
  const [y1, m1] = desde.split('-').map(Number);
  const [y2, m2] = hasta.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

// n meses consecutivos ('YYYY-MM-DD', primer día de mes) arrancando en `desde`.
// Sirve para construir el "período anterior" cuando la selección de meses no es
// necesariamente un rango contiguo (ej. un árbol año/mes con checks sueltos).
export function generarRangoMeses(desde: string, n: number): string[] {
  const [y, m] = desde.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10));
}

export function getVariacionPct(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}
