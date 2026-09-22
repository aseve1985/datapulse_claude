// server/riskCarreraScoresQuery.ts
import type { Pool } from 'pg';

export const ALLOWED_TABLAS = new Set(['risk_arg.risk_engine_arg', 'risk_col.risk_engine_col']);
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

export function assertSafeIdentifier(name: string, label: string): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Identificador inválido para ${label}: "${name}"`);
  }
}

export async function getScoreColumnType(pool: Pool, tablaScore: string, campoScore: string): Promise<string> {
  if (!ALLOWED_TABLAS.has(tablaScore)) {
    throw new Error(`tabla_score no permitida: "${tablaScore}"`);
  }
  assertSafeIdentifier(campoScore, 'campo_score');
  const [schema, table] = tablaScore.split('.');
  const result = await pool.query(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, campoScore]
  );
  if (result.rows.length === 0) {
    throw new Error(`Columna no encontrada: ${tablaScore}.${campoScore}`);
  }
  return result.rows[0].data_type as string;
}

const NUMERIC_TYPES = new Set(['double precision', 'numeric', 'integer', 'real', 'bigint', 'smallint']);

export function isNumericColumnType(dataType: string): boolean {
  return NUMERIC_TYPES.has(dataType);
}

export interface CatalogoScoreRow {
  score_key: string;
  pais: 'ARG' | 'COL';
  segmento: 'NUEVOS' | 'RENOVADORES';
  tabla_score: string;
  campo_score: string;
  centinela_error: string;
  multiplicador_score: string; // numeric vuelve como string desde pg
}

function scoreCleaningFragments(isNumeric: boolean): { estadoScoreSql: string; scoreFinalSql: string } {
  if (isNumeric) {
    return {
      estadoScoreSql: `CASE
        WHEN score_raw IS NULL THEN 'SIN_SCORE'
        WHEN score_raw = $2::numeric THEN 'ERROR_NODO'
        ELSE 'VALIDO'
      END`,
      scoreFinalSql: `CASE WHEN score_raw IS NOT NULL AND score_raw <> $2::numeric THEN ROUND(score_raw * $3) END`,
    };
  }
  return {
    estadoScoreSql: `CASE
      WHEN score_raw IS NULL OR BTRIM(score_raw::text) = '' THEN 'SIN_SCORE'
      WHEN BTRIM(score_raw::text) = $2 THEN 'ERROR_NODO'
      WHEN NULLIF(REGEXP_SUBSTR(BTRIM(score_raw::text), '^[1-9][0-9]*$'), '') IS NOT NULL THEN 'VALIDO'
      ELSE 'ERROR_NODO'
    END`,
    scoreFinalSql: `CASE
      WHEN score_raw IS NOT NULL AND BTRIM(score_raw::text) <> '' AND BTRIM(score_raw::text) <> $2
       AND NULLIF(REGEXP_SUBSTR(BTRIM(score_raw::text), '^[1-9][0-9]*$'), '') IS NOT NULL
      THEN ROUND(NULLIF(REGEXP_SUBSTR(BTRIM(score_raw::text), '^[1-9][0-9]*$'), '')::numeric * $3)
    END`,
  };
}

// NOTA: se usa UNION ALL en lugar de "VALUES (5),(10),..." como tabla derivada porque
// este cluster de Redshift rechaza esa sintaxis de VALUES multi-fila con un error de
// parseo (verificado empíricamente contra el DWH real durante Task 2). UNION ALL es
// equivalente y sí es soportado.
const UMBRALES_SQL = `CROSS JOIN (
  SELECT 5 AS dias UNION ALL SELECT 10 UNION ALL SELECT 30 UNION ALL SELECT 60 UNION ALL SELECT 90
) AS umbral`;

const AGG_SELECT_SQL = `
  DATE_TRUNC('month', fecha_desembolso)::date AS cepa,
  COALESCE(decil::text, estado_score) AS banda,
  umbral.dias AS umbral_dias,
  COUNT(*) AS q_vendidos,
  SUM(capital) AS capital,
  SUM(capital_mas_interes) AS capital_mas_interes,
  SUM(CASE WHEN (fecha_vencimiento + umbral.dias) <= CURRENT_DATE THEN 1 ELSE 0 END) AS n_elegible,
  SUM(CASE WHEN (fecha_vencimiento + umbral.dias) <= CURRENT_DATE AND dias_mora >= umbral.dias THEN 1 ELSE 0 END) AS n_malos
`;

const CANCELADO_DIAS_BANDA_SQL = (bindScoreKey: string) => `
  cancelado AS (
    SELECT *, (clasificacion_pago_credito = 'CREDITO VENCIDO PAGO TOTAL'
               OR capital_mas_interes_paid >= 0.95 * capital_mas_interes) AS cancelada
    FROM estado
  ),
  dias AS (
    SELECT *, CASE WHEN cancelada THEN (fecha_pago - fecha_vencimiento)
                   ELSE (CURRENT_DATE - fecha_vencimiento) END AS dias_mora
    FROM cancelado
  ),
  banda AS (
    SELECT d.*, bnd.decil
    FROM dias d
    LEFT JOIN gold.catalogo_scores_bandas_multipais bnd
      ON bnd.score_key = ${bindScoreKey} AND d.estado_score = 'VALIDO'
     AND d.score_final BETWEEN bnd.score_min AND bnd.score_max
  )
`;

export function buildCarreraScoresQuery(
  row: CatalogoScoreRow,
  columnDataType: string
): { sql: string; params: any[] } {
  if (!ALLOWED_TABLAS.has(row.tabla_score)) {
    throw new Error(`tabla_score no permitida: "${row.tabla_score}"`);
  }
  assertSafeIdentifier(row.campo_score, 'campo_score');

  if (row.pais !== 'ARG' && row.pais !== 'COL') {
    throw new Error(`país no soportado en Carrera de Scores: "${row.pais}" (score_key=${row.score_key})`);
  }
  if (row.segmento !== 'NUEVOS' && row.segmento !== 'RENOVADORES') {
    throw new Error(`segmento no soportado en Carrera de Scores: "${row.segmento}" (score_key=${row.score_key})`);
  }

  const multiplicador = Number(row.multiplicador_score);
  if (!Number.isFinite(multiplicador)) {
    throw new Error(`multiplicador_score inválido para ${row.score_key}: "${row.multiplicador_score}"`);
  }

  const isNumeric = isNumericColumnType(columnDataType);
  const { estadoScoreSql, scoreFinalSql } = scoreCleaningFragments(isNumeric);
  const flagRenovador = row.segmento === 'NUEVOS' ? 'NUEVO' : 'RENOVADOR';
  const params = [flagRenovador, row.centinela_error, multiplicador, row.score_key];

  if (row.pais === 'ARG') {
    const sql = `
      WITH cuota1 AS (
        SELECT loan_id, flag_renovador, fecha_desembolso, fecha_vencimiento, fecha_pago,
               clasificacion_pago_credito, capital, capital_mas_interes, capital_mas_interes_paid,
               ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY fecha_vencimiento ASC) AS rn
        FROM gold.mora_arg
      ),
      ventas AS (
        SELECT loan_id, identification_number FROM gold.ventas_arg WHERE flag_venta = 1
      ),
      base AS (
        SELECT c.loan_id, v.identification_number, c.fecha_desembolso, c.fecha_vencimiento, c.fecha_pago,
               c.clasificacion_pago_credito, c.capital, c.capital_mas_interes, c.capital_mas_interes_paid
        FROM cuota1 c
        JOIN ventas v ON v.loan_id = c.loan_id
        WHERE c.rn = 1 AND c.flag_renovador = $1
      ),
      pegada AS (
        SELECT b.loan_id, r.${row.campo_score} AS score_raw,
               ROW_NUMBER() OVER (PARTITION BY b.loan_id ORDER BY r.executiondate DESC) AS rn
        FROM base b
        JOIN risk_arg.risk_engine_arg r
          ON r.nrodoc = b.identification_number
         AND r.executiondate <= (b.fecha_desembolso + INTERVAL '1 day')
      ),
      credito AS (
        SELECT b.*, p.score_raw FROM base b LEFT JOIN pegada p ON p.loan_id = b.loan_id AND p.rn = 1
      ),
      estado AS (
        SELECT *, ${estadoScoreSql} AS estado_score, ${scoreFinalSql} AS score_final
        FROM credito
      ),
      ${CANCELADO_DIAS_BANDA_SQL('$4')}
      SELECT ${AGG_SELECT_SQL}
      FROM banda
      ${UMBRALES_SQL}
      GROUP BY 1, 2, 3
      ORDER BY 1, 3, 2
    `;
    return { sql, params };
  }

  // COL
  // NOTA: el join siempre es por r.lead_id = b.lead_id, sin importar el segmento.
  // Se verificó empíricamente que polrenovadores_lead_id_libgot (usado antes para
  // RENOVADORES) matchea solo 36/84.450 (0,04%) de los créditos RENOVADOR, mientras
  // que lead_id directo matchea 84.386/84.450 (99,9%) sobre los MISMOS créditos.
  const sql = `
    WITH cuota1 AS (
      SELECT loan_id, lead_id, flag_renovador, fecha_desembolso, fecha_vencimiento, fecha_pago,
             clasificacion_pago_credito, capital, capital_mas_interes, capital_mas_interes_paid,
             ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY fecha_vencimiento ASC) AS rn
      FROM gold.mora_col
    ),
    base AS (
      SELECT loan_id, lead_id, fecha_desembolso, fecha_vencimiento, fecha_pago,
             clasificacion_pago_credito, capital, capital_mas_interes, capital_mas_interes_paid
      FROM cuota1
      WHERE rn = 1 AND flag_renovador = $1
    ),
    pegada AS (
      SELECT b.loan_id, r.${row.campo_score} AS score_raw,
             ROW_NUMBER() OVER (PARTITION BY b.loan_id ORDER BY r.executiondate::timestamp DESC) AS rn
      FROM base b
      JOIN risk_col.risk_engine_col r
        ON r.lead_id = b.lead_id
       AND r.executiondate::timestamp <= (b.fecha_desembolso + INTERVAL '1 day')
    ),
    credito AS (
      SELECT b.*, p.score_raw FROM base b LEFT JOIN pegada p ON p.loan_id = b.loan_id AND p.rn = 1
    ),
    estado AS (
      SELECT *, ${estadoScoreSql} AS estado_score, ${scoreFinalSql} AS score_final
      FROM credito
    ),
    ${CANCELADO_DIAS_BANDA_SQL('$4')}
    SELECT ${AGG_SELECT_SQL}
    FROM banda
    ${UMBRALES_SQL}
    GROUP BY 1, 2, 3
    ORDER BY 1, 3, 2
  `;
  return { sql, params };
}
