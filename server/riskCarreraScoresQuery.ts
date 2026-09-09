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
