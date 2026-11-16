// server/conversionRenovadoresQuery.ts
// Conversión de renovadores (crédito n -> n+1). Spec: docs/superpowers/specs/2026-11-13-conversion-renovadores.md (§6.1, Q1)
// Solo lectura: un único SELECT dentro de una transacción READ ONLY, con statement_timeout.
import type { Pool } from 'pg';

export type PaisConversion = 'COL' | 'ARG';
export const VENTANAS = [5, 10, 20, 30, 60] as const;
export const MESES_PERMITIDOS = [12, 18, 24] as const;
export const MESES_DEFAULT = 12;
/** Se excluyen créditos con vencimiento en los últimos N días para que la ventana de 5d esté completa (spec §7.6). */
export const DIAS_EXCLUSION = 6;
const STATEMENT_TIMEOUT_MS = 180_000;

/** Error de validación de parámetros: el endpoint lo traduce a HTTP 400. */
export class ParamError extends Error {}

// Q1 de la spec, con dos cambios:
//  - fecha_desde dinámica: primer día del mes, (meses - 1) meses atrás  ->  $1 = meses (int, whitelist)
//  - dias_exclusion como parámetro                                       ->  $2 = DIAS_EXCLUSION (int)
//  - o / s restringidos a los leads de renovación de `paid` (mismo resultado, menos lectura)
const Q1_COL = `
WITH paid AS (
  SELECT r.loan_id,
         r.ranking_nro_credito AS n,
         r.maximo_vencimiento  AS vto,
         l.next_lead_id
  FROM core_col.loans_ranking_col r
  JOIN core_col.loans_col l ON l.id = r.loan_id
  WHERE r.status = 'CLOSED'
    AND r.cuotas_no_cobradas_totales = 0
    AND r.maximo_vencimiento BETWEEN DATEADD(month, -($1::int - 1), DATE_TRUNC('month', CURRENT_DATE))::date
                                 AND DATEADD(day, -$2::int, CURRENT_DATE)::date
),
o AS (   -- primera oferta de cada lead de renovación
  SELECT lead_id, MIN(created_at)::date AS f
  FROM core_col.lead_offers_col
  WHERE lead_id IN (SELECT next_lead_id FROM paid WHERE next_lead_id IS NOT NULL)
  GROUP BY lead_id
),
s AS (   -- primer desembolso de cada lead de renovación
  SELECT lead_id, MIN(fecha_desembolso) AS fd
  FROM gold.ventas_col
  WHERE flag_venta = 1
    AND lead_id IN (SELECT next_lead_id FROM paid WHERE next_lead_id IS NOT NULL)
  GROUP BY lead_id
)
SELECT
  TO_CHAR(p.vto, 'YYYY-MM')                                AS mes_vto,
  CASE WHEN p.n >= 10 THEN 10 ELSE p.n END                 AS paso,
  COUNT(*)                                                 AS creditos_paid,
  SUM(CASE WHEN o.lead_id IS NOT NULL THEN 1 ELSE 0 END)   AS ofertas,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day,  5, o.f) THEN 1 ELSE 0 END) AS conv_5d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 10, o.f) THEN 1 ELSE 0 END) AS conv_10d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 20, o.f) THEN 1 ELSE 0 END) AS conv_20d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 30, o.f) THEN 1 ELSE 0 END) AS conv_30d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 60, o.f) THEN 1 ELSE 0 END) AS conv_60d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day,  5, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_5d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 10, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_10d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 20, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_20d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 30, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_30d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 60, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_60d
FROM paid p
LEFT JOIN o ON o.lead_id = p.next_lead_id
LEFT JOIN s ON s.lead_id = p.next_lead_id
GROUP BY 1, 2
ORDER BY 1, 2
`;

// Q1 para Argentina: mismo SQL que Q1_COL. Solo cambian las tablas (core_arg.*_arg, gold.ventas_arg) y el status
// del crédito pagado ('PAID' en ARG; COL usa 'CLOSED'). Las columnas que usa Q1 tienen el mismo nombre y tipo en
// ambos países (verificado en svv_columns el 2026-11-13).
// Ver docs/superpowers/specs/2026-11-13-conversion-renovadores-arg.md
const Q1_ARG = `
WITH paid AS (
  SELECT r.loan_id,
         r.ranking_nro_credito AS n,
         r.maximo_vencimiento  AS vto,
         l.next_lead_id
  FROM core_arg.loans_ranking_arg r
  JOIN core_arg.loans_arg l ON l.id = r.loan_id
  WHERE r.status = 'PAID'
    AND r.cuotas_no_cobradas_totales = 0
    AND r.maximo_vencimiento BETWEEN DATEADD(month, -($1::int - 1), DATE_TRUNC('month', CURRENT_DATE))::date
                                 AND DATEADD(day, -$2::int, CURRENT_DATE)::date
),
o AS (   -- primera oferta de cada lead de renovación
  SELECT lead_id, MIN(created_at)::date AS f
  FROM core_arg.lead_offers_arg
  WHERE lead_id IN (SELECT next_lead_id FROM paid WHERE next_lead_id IS NOT NULL)
  GROUP BY lead_id
),
s AS (   -- primer desembolso de cada lead de renovación
  SELECT lead_id, MIN(fecha_desembolso) AS fd
  FROM gold.ventas_arg
  WHERE flag_venta = 1
    AND lead_id IN (SELECT next_lead_id FROM paid WHERE next_lead_id IS NOT NULL)
  GROUP BY lead_id
)
SELECT
  TO_CHAR(p.vto, 'YYYY-MM')                                AS mes_vto,
  CASE WHEN p.n >= 10 THEN 10 ELSE p.n END                 AS paso,
  COUNT(*)                                                 AS creditos_paid,
  SUM(CASE WHEN o.lead_id IS NOT NULL THEN 1 ELSE 0 END)   AS ofertas,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day,  5, o.f) THEN 1 ELSE 0 END) AS conv_5d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 10, o.f) THEN 1 ELSE 0 END) AS conv_10d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 20, o.f) THEN 1 ELSE 0 END) AS conv_20d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 30, o.f) THEN 1 ELSE 0 END) AS conv_30d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND s.fd <= DATEADD(day, 60, o.f) THEN 1 ELSE 0 END) AS conv_60d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day,  5, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_5d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 10, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_10d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 20, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_20d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 30, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_30d,
  SUM(CASE WHEN o.lead_id IS NOT NULL AND DATEADD(day, 60, o.f) < CURRENT_DATE THEN 1 ELSE 0 END) AS maduras_60d
FROM paid p
LEFT JOIN o ON o.lead_id = p.next_lead_id
LEFT JOIN s ON s.lead_id = p.next_lead_id
GROUP BY 1, 2
ORDER BY 1, 2
`;

interface PaisConfig {
  /** SQL de la consulta maestra; recibe $1 = meses, $2 = dias_exclusion. */
  q1: string;
}

/** Registro cerrado de países. Cada país tiene su propia constante de SQL (Q1_COL no se modificó al sumar ARG). */
export const PAISES: Record<PaisConversion, PaisConfig | null> = {
  COL: { q1: Q1_COL },
  ARG: { q1: Q1_ARG },
};

export function parsePais(v: unknown): PaisConversion {
  const pais = String(v ?? 'COL').toUpperCase();
  if (pais !== 'COL' && pais !== 'ARG') throw new ParamError(`País no válido: "${pais}"`);
  if (!PAISES[pais]) throw new ParamError(`País aún no disponible: ${pais}`);
  return pais;
}

export function parseMeses(v: unknown): number {
  if (v === undefined || v === null || v === '') return MESES_DEFAULT;
  const n = Number(v);
  if (!(MESES_PERMITIDOS as readonly number[]).includes(n)) {
    throw new ParamError(`meses debe ser uno de ${MESES_PERMITIDOS.join(', ')}`);
  }
  return n;
}

export interface FilaConversion {
  mes_vto: string; // 'YYYY-MM'
  paso: number;    // 1..9, 10 = "10º o más"
  creditos_paid: number;
  ofertas: number;
  conv_5d: number; conv_10d: number; conv_20d: number; conv_30d: number; conv_60d: number;
  maduras_5d: number; maduras_10d: number; maduras_20d: number; maduras_30d: number; maduras_60d: number;
}

export interface ResultadoConversion {
  pais: PaisConversion;
  meses: number;
  fecha_extraccion: string; // CURRENT_DATE de Redshift, 'YYYY-MM-DD'
  filas: FilaConversion[];
}

const NUMERIC_FIELDS: (keyof FilaConversion)[] = [
  'paso', 'creditos_paid', 'ofertas',
  'conv_5d', 'conv_10d', 'conv_20d', 'conv_30d', 'conv_60d',
  'maduras_5d', 'maduras_10d', 'maduras_20d', 'maduras_30d', 'maduras_60d',
];

export async function runConversionRenovadores(
  pool: Pool, pais: PaisConversion, meses: number,
): Promise<ResultadoConversion> {
  const config = PAISES[pais];
  if (!config) throw new ParamError(`País aún no disponible: ${pais}`);

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout TO ${STATEMENT_TIMEOUT_MS}`); // constante numérica, no input
    await client.query('BEGIN READ ONLY');
    const hoy = await client.query(`SELECT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS hoy`);
    const result = await client.query(config.q1, [meses, DIAS_EXCLUSION]);
    await client.query('ROLLBACK');

    const filas = result.rows.map((r: any) => {
      const out: any = { mes_vto: String(r.mes_vto) };
      for (const f of NUMERIC_FIELDS) out[f] = r[f] == null ? 0 : Number(r[f]); // bigint/numeric llegan como string
      return out as FilaConversion;
    });
    return { pais, meses, fecha_extraccion: hoy.rows[0].hoy, filas };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.query('RESET statement_timeout').catch(() => {});
    client.release();
  }
}
