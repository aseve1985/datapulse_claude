# Carrera de Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Carrera de Scores" sub-módulo under Riesgos that shows, per país/segmento/score/cepa de desembolso, a decile-banded grid of volume and mora at 5/10/30/60/90 days against the catalog's expected performance.

**Architecture:** Two new read-only endpoints in `server.ts` (catálogo + fact rows, both cached 24h in memory — no new infra), a country-specific SQL query builder module that reads score metadata from `gold.catalogo_scores_multipais`/`gold.catalogo_scores_bandas_multipais` at request time (nothing hardcoded), and a self-contained React submodule that fetches both endpoints once and pivots client-side into the grid.

**Tech Stack:** Express + `pg` (existing `redshiftPool` in `server.ts`), React + TypeScript, Tailwind (dark navy DataPulse style). No test framework exists in this repo — "tests" in this plan are (a) concrete SQL assertions run directly against Redshift via the same Postgres wire protocol the app uses, and (b) `npm run lint` (`tsc --noEmit`) + manual/Playwright browser verification for the frontend.

**Spec:** `docs/superpowers/specs/2026-09-08-carrera-de-scores-design.md` (architecture) and `C:\Users\aseverino\Desktop\score_propio_renovadores_col\prompt_modulo_carrera_scores.md` (business rules — authoritative for anything this plan doesn't spell out).

## Global Constraints

- Población: `gold.mora_{arg,col}` ya viene filtrado a `flag_venta = 1` (verificado empíricamente — no hace falta filtrar de nuevo).
- Ancla cuota 1: `ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY fecha_vencimiento ASC) = 1` sobre `gold.mora_{arg,col}` (validado contra `core_{arg,col}.loan_installments_*` con `term = 1`: 99.999% de coincidencia en ambos países).
- Umbrales fijos: 5, 10, 30, 60, 90 días.
- Bandeo: SIEMPRE por `score_min`/`score_max` de `gold.catalogo_scores_bandas_multipais` vía `BETWEEN` — nunca `NTILE` ni cortes hardcodeados en el código.
- `centinela_error`, `campo_score`, `tabla_score`, `multiplicador_score` se leen de `gold.catalogo_scores_multipais` en cada request — no hardcodear valores por `score_key`.
- Cancelación (regla del 95%): `clasificacion_pago_credito = 'CREDITO VENCIDO PAGO TOTAL' OR capital_mas_interes_paid >= 0.95 * capital_mas_interes`.
- `SIN SCORE` y `ERROR NODO` son filas separadas, nunca combinadas.
- Nombres de identificadores SQL interpolados dinámicamente (`campo_score`) deben validarse contra `^[a-z_][a-z0-9_]*$` antes de interpolar — nunca interpolar texto libre del catálogo sin validar.

---

## File Structure

- **Create** `server/riskCarreraScoresQuery.ts` — query builder puro (sin dependencias de Express), exporta `getScoreColumnType()` y `buildCarreraScoresQuery()`.
- **Modify** `server.ts` — dos endpoints nuevos (`/api/risk/catalogo-scores`, `/api/risk/carrera-scores`) que usan el módulo de arriba.
- **Create** `src/components/submodules/carreraScoresHelpers.ts` — tipos y helpers puros de pivot/indicadores (sin JSX, sin fetch).
- **Create** `src/components/submodules/RiCarreraScoresSubmodule.tsx` — componente autocontenido (fetch, selectores, pivot, grilla, indicadores).
- **Modify** `src/services/api.ts` — `fetchCatalogoScores()`, `fetchCarreraScores()`.
- **Modify** `src/components/LandingPage.tsx` — agregar submodule a `risks.submodules`.
- **Modify** `src/components/DashboardView.tsx` — import + rama de routing para `ri-carrera-scores`.

---

### Task 1: Query builder — tipo de columna y validación de identificadores

**Files:**
- Create: `server/riskCarreraScoresQuery.ts`

**Interfaces:**
- Produces: `getScoreColumnType(pool: Pool, tablaScore: string, campoScore: string): Promise<string>`, `assertSafeIdentifier(name: string, label: string): void`, `ALLOWED_TABLAS: Set<string>`

- [ ] **Step 1: Crear el archivo con la validación de identificadores y el lookup de tipo de columna**

```ts
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
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores (el archivo no se importa todavía desde ningún lado, pero debe tipar bien standalone).

- [ ] **Step 3: Validar `getScoreColumnType` contra Redshift real**

Ejecutar manualmente (vía el mismo `redshiftPool` que usa `server.ts`, o con el MCP de Redshift disponible en esta sesión) esta verificación equivalente:

```sql
SELECT data_type FROM information_schema.columns
WHERE table_schema = 'risk_arg' AND table_name = 'risk_engine_arg' AND column_name = 'score_bi_n1';
-- Esperado: 'double precision'

SELECT data_type FROM information_schema.columns
WHERE table_schema = 'risk_arg' AND table_name = 'risk_engine_arg' AND column_name = 'score_quick_bi_v1';
-- Esperado: 'character varying'
```

- [ ] **Step 4: Commit**

```bash
git add server/riskCarreraScoresQuery.ts
git commit -m "feat: add score column type lookup + identifier validation for Carrera de Scores"
```

---

### Task 2: Query builder — construcción de la query de hechos por score (ARG y COL)

**Files:**
- Modify: `server/riskCarreraScoresQuery.ts`

**Interfaces:**
- Consumes: `isNumericColumnType()` de Task 1
- Produces: `CatalogoScoreRow` (interface), `buildCarreraScoresQuery(row: CatalogoScoreRow, columnDataType: string): { sql: string; params: any[] }`

- [ ] **Step 1: Agregar el tipo `CatalogoScoreRow` y los fragmentos de limpieza de score**

```ts
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
      scoreFinalSql: `CASE WHEN score_raw IS NOT NULL AND score_raw <> $2::numeric THEN score_raw * $3 END`,
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
      THEN NULLIF(REGEXP_SUBSTR(BTRIM(score_raw::text), '^[1-9][0-9]*$'), '')::numeric * $3
    END`,
  };
}
```

- [ ] **Step 2: Agregar el cuerpo común (CTEs compartidas por ambos países) y `buildCarreraScoresQuery`**

```ts
const UMBRALES_SQL = `CROSS JOIN (VALUES (5),(10),(30),(60),(90)) AS umbral(dias)`;

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

  const isNumeric = isNumericColumnType(columnDataType);
  const { estadoScoreSql, scoreFinalSql } = scoreCleaningFragments(isNumeric);
  const flagRenovador = row.segmento === 'NUEVOS' ? 'NUEVO' : 'RENOVADOR';
  const params = [flagRenovador, row.centinela_error, Number(row.multiplicador_score), row.score_key];

  if (row.pais === 'ARG') {
    const sql = `
      WITH cuota1 AS (
        SELECT loan_id, cuil, flag_renovador, fecha_desembolso, fecha_vencimiento, fecha_pago,
               clasificacion_pago_credito, capital, capital_mas_interes, capital_mas_interes_paid,
               ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY fecha_vencimiento ASC) AS rn
        FROM gold.mora_arg
      ),
      base AS (
        SELECT loan_id, cuil, fecha_desembolso, fecha_vencimiento, fecha_pago,
               clasificacion_pago_credito, capital, capital_mas_interes, capital_mas_interes_paid
        FROM cuota1
        WHERE rn = 1 AND flag_renovador = $1
      ),
      pegada AS (
        SELECT b.loan_id, r.${row.campo_score} AS score_raw,
               ROW_NUMBER() OVER (PARTITION BY b.loan_id ORDER BY r.executiondate DESC) AS rn
        FROM base b
        JOIN risk_arg.risk_engine_arg r
          ON r.siisa_cuil = b.cuil
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
  const joinCondition = row.segmento === 'NUEVOS'
    ? `r.lead_id = b.lead_id`
    : `r.polrenovadores_lead_id_libgot ~ '^[0-9]+$' AND r.polrenovadores_lead_id_libgot::int = b.lead_id`;

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
        ON ${joinCondition}
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
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Ejecutar la query ARG generada directamente contra Redshift, para `arg_nuevos_v1`**

Tomar el SQL que devuelve `buildCarreraScoresQuery` para esta fila (simulada) y correrlo tal cual contra Redshift:

```ts
{
  score_key: 'arg_nuevos_v1', pais: 'ARG', segmento: 'NUEVOS',
  tabla_score: 'risk_arg.risk_engine_arg', campo_score: 'score_quick_bi_v1',
  centinela_error: '-1', multiplicador_score: '1.000000'
}
```

Verificar en el resultado:
- Existe una fila con `banda = 'ERROR_NODO'` y, si existen filas con `banda = 'ERROR_NODO'`, que su `n_malos` sea consistente (no verificar cero acá todavía — eso es el chequeo de aceptación de Task 4, esto solo confirma que la query corre y devuelve filas con esa forma).
- `n_elegible` de `umbral_dias = 5` es mayor o igual a `n_elegible` de `umbral_dias = 90` para la misma `banda`/`cepa` (chequeo básico de monotonía).

- [ ] **Step 5: Ejecutar la query COL generada para `col_nuevos_v1` (segmento NUEVOS) y `col_renov_v1` (segmento RENOVADORES)**

Mismo procedimiento que el Step 4, confirmando que ambas ramas de `joinCondition` ejecutan sin error de cast (la condición `~ '^[0-9]+$'` antes del `::int` es la que evita que un `polrenovadores_lead_id_libgot` no numérico rompa la query).

- [ ] **Step 6: Commit**

```bash
git add server/riskCarreraScoresQuery.ts
git commit -m "feat: add per-score fact query builder for ARG and COL (Carrera de Scores)"
```

---

### Task 3: Endpoints en `server.ts`

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: `getScoreColumnType`, `buildCarreraScoresQuery`, `CatalogoScoreRow` de `server/riskCarreraScoresQuery.ts`
- Produces: `GET /api/risk/catalogo-scores` → `{ scores: any[], bandas: any[] }`; `GET /api/risk/carrera-scores` → `{ hechos: any[] }`

- [ ] **Step 1: Importar el query builder al tope de `server.ts`**

```ts
import { getScoreColumnType, buildCarreraScoresQuery, type CatalogoScoreRow } from './server/riskCarreraScoresQuery';
```

- [ ] **Step 2: Agregar el endpoint de catálogo**

Ubicar en `server.ts` el bloque que empieza con `// ── UIF Endpoints ──` (contiene
`const redshiftPool = (...)` seguido de `app.get("/api/uif/records", ...)`). Insertar el
código de este step **inmediatamente después del cierre de ese `app.get("/api/uif/records", ...)`**
(así queda después de que `redshiftPool` ya fue declarado):

```ts
let catalogoScoresCache: { scores: any[]; bandas: any[]; fetchedAt: number } | null = null;
const CATALOGO_SCORES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

app.get('/api/risk/catalogo-scores', async (req, res) => {
  if (!redshiftPool) {
    return res.status(503).json({
      error: 'Conexión a Redshift no configurada',
      required_env: ['REDSHIFT_HOST', 'REDSHIFT_DATABASE', 'REDSHIFT_USER', 'REDSHIFT_PASSWORD'],
    });
  }
  const now = Date.now();
  if (catalogoScoresCache && now - catalogoScoresCache.fetchedAt <= CATALOGO_SCORES_CACHE_TTL_MS) {
    return res.json({ scores: catalogoScoresCache.scores, bandas: catalogoScoresCache.bandas });
  }
  try {
    const [scoresResult, bandasResult] = await Promise.all([
      redshiftPool.query('SELECT * FROM gold.catalogo_scores_multipais ORDER BY pais, segmento, score_key'),
      redshiftPool.query('SELECT * FROM gold.catalogo_scores_bandas_multipais ORDER BY score_key, decil'),
    ]);
    const scores = JSON.parse(JSON.stringify(scoresResult.rows, (_k, v) => typeof v === 'bigint' ? Number(v) : v));
    const bandas = JSON.parse(JSON.stringify(bandasResult.rows, (_k, v) => typeof v === 'bigint' ? Number(v) : v));
    catalogoScoresCache = { scores, bandas, fetchedAt: now };
    res.json({ scores, bandas });
  } catch (error: any) {
    console.error('[CarreraScores] Error cargando catálogo:', error);
    res.status(500).json({ error: 'Error al cargar el catálogo de scores', details: error.message });
  }
});
```

- [ ] **Step 3: Agregar el endpoint de hechos**

```ts
let carreraScoresCache: { hechos: any[]; fetchedAt: number } | null = null;
const CARRERA_SCORES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

app.get('/api/risk/carrera-scores', async (req, res) => {
  if (!redshiftPool) {
    return res.status(503).json({
      error: 'Conexión a Redshift no configurada',
      required_env: ['REDSHIFT_HOST', 'REDSHIFT_DATABASE', 'REDSHIFT_USER', 'REDSHIFT_PASSWORD'],
    });
  }
  const now = Date.now();
  if (carreraScoresCache && now - carreraScoresCache.fetchedAt <= CARRERA_SCORES_CACHE_TTL_MS) {
    return res.json({ hechos: carreraScoresCache.hechos });
  }
  try {
    const catalogResult = await redshiftPool.query('SELECT * FROM gold.catalogo_scores_multipais');
    const scoreRows = catalogResult.rows as CatalogoScoreRow[];

    const perScoreResults = await Promise.all(scoreRows.map(async (row) => {
      const columnType = await getScoreColumnType(redshiftPool!, row.tabla_score, row.campo_score);
      const { sql, params } = buildCarreraScoresQuery(row, columnType);
      const result = await redshiftPool!.query(sql, params);
      return result.rows.map((r: any) => ({
        score_key: row.score_key,
        pais: row.pais,
        segmento: row.segmento,
        cepa: r.cepa,
        banda: r.banda,
        umbral_dias: Number(r.umbral_dias),
        q_vendidos: Number(r.q_vendidos),
        capital: Number(r.capital) || 0,
        capital_mas_interes: Number(r.capital_mas_interes) || 0,
        n_elegible: Number(r.n_elegible),
        n_malos: Number(r.n_malos),
      }));
    }));

    const hechos = perScoreResults.flat();
    carreraScoresCache = { hechos, fetchedAt: now };
    console.log(`[CarreraScores] Calculadas ${hechos.length} filas de hechos para ${scoreRows.length} scores`);
    res.json({ hechos });
  } catch (error: any) {
    console.error('[CarreraScores] Error calculando hechos:', error);
    res.status(500).json({ error: 'Error al calcular la carrera de scores', details: error.message });
  }
});
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Levantar el server y probar ambos endpoints**

```bash
npm run dev
```

En otra terminal:
```bash
curl -s http://localhost:3000/api/risk/catalogo-scores | head -c 300
curl -s http://localhost:3000/api/risk/carrera-scores | head -c 300
```

Expected: ambos devuelven JSON con `scores`/`bandas` y `hechos` respectivamente, sin error 500. El segundo puede tardar unos segundos (6 queries a Redshift en la primera carga, sin cache).

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/risk/catalogo-scores and /api/risk/carrera-scores endpoints"
```

---

### Task 4: Validación de aceptación contra el documento de negocio

**Files:** ninguno (solo queries de verificación — no se escribe código en este task)

- [ ] **Step 1: Chequeo — mora global reconstruida coincide con `gold.mora_arg`/`gold.mora_col`**

Elegir una cepa madura (con al menos ~119 días desde el desembolso, para que mora-90 ya haya
tenido tiempo de manifestarse) y un score con `estado = 'PRODUCCION'` o el `score_key` que se
esté validando. Comparar:

```sql
-- (A) Reconstruido: sumar n_malos/n_elegible de umbral_dias=30 en TODAS las bandas
-- (incluyendo SIN_SCORE y ERROR_NODO) para ese score_key/cepa, desde el resultado de
-- buildCarreraScoresQuery.

-- (B) Referencia — mora agregada directo de gold.mora_arg para la misma cepa, aplicando
-- la MISMA regla de elegibilidad y cancelación (no las columnas mora_30/mora_q_30, que son
-- de cobranza — ver advertencia de la sección 2 del documento de negocio):
WITH cuota1 AS (
  SELECT loan_id, fecha_desembolso, fecha_vencimiento, fecha_pago,
         clasificacion_pago_credito, capital_mas_interes, capital_mas_interes_paid,
         ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY fecha_vencimiento ASC) AS rn
  FROM gold.mora_arg
),
base AS (
  SELECT * FROM cuota1 WHERE rn = 1
    AND DATE_TRUNC('month', fecha_desembolso) = '<cepa>'::date
),
calc AS (
  SELECT *,
    (clasificacion_pago_credito = 'CREDITO VENCIDO PAGO TOTAL'
     OR capital_mas_interes_paid >= 0.95 * capital_mas_interes) AS cancelada
  FROM base
),
dias AS (
  SELECT *, CASE WHEN cancelada THEN (fecha_pago - fecha_vencimiento)
                 ELSE (CURRENT_DATE - fecha_vencimiento) END AS dias_mora
  FROM calc
)
SELECT
  SUM(CASE WHEN (fecha_vencimiento + 30) <= CURRENT_DATE THEN 1 ELSE 0 END) AS n_elegible_30,
  SUM(CASE WHEN (fecha_vencimiento + 30) <= CURRENT_DATE AND dias_mora >= 30 THEN 1 ELSE 0 END) AS n_malos_30
FROM dias;
```

(A) y (B) deben coincidir exactamente para el `n_elegible`/`n_malos` global de esa cepa (sumando
todas las bandas de (A)), ya que (B) es la misma lógica sin bandear. Si no coinciden, el bug está
en el bandeo o en el join con el catálogo, no en la lógica de mora.

- [ ] **Step 2: Chequeo — fila ERROR NODO da cero**

```sql
-- Contra el resultado real de /api/risk/carrera-scores (o corriendo buildCarreraScoresQuery
-- para cada score_key y revisando las filas con banda = 'ERROR_NODO'):
-- para cada score_key, SUM(n_malos) WHERE banda = 'ERROR_NODO' debe ser 0 en todo umbral.
```
Si da distinto de cero, revisar el `centinela_error` de ese score en el catálogo — puede ser un
valor con espacios o formato distinto al esperado.

- [ ] **Step 3: Chequeo — monotonía de `n_elegible` y `n_malos` por banda/cepa**

Para cada `(score_key, cepa, banda)`, confirmar `n_elegible(5) >= n_elegible(10) >= n_elegible(30)
>= n_elegible(60) >= n_elegible(90)` y lo mismo para `n_malos`. Si se invierte, la condición de
elegibilidad (`fecha_vencimiento + umbral <= CURRENT_DATE`) está mal aplicada.

- [ ] **Step 4: Chequeo — ninguna cepa con `n_elegible > 0` en mora-90 sin madurar**

```sql
-- Para cada fila con umbral_dias = 90 y n_elegible > 0, confirmar que corresponde a una cepa
-- cuyo mes de desembolso es anterior a (CURRENT_DATE - 90 días) menos el promedio de 29 días
-- hasta el vencimiento de cuota 1 (ver sección 2 del documento de negocio).
```

- [ ] **Step 5: Chequeo — reconciliación de `Q vendidos`**

Para un score/cepa/segmento dado, sumar `q_vendidos` de las 10 bandas + `SIN_SCORE` + `ERROR_NODO`
(en cualquier `umbral_dias`, ya que `q_vendidos` no varía por umbral) y comparar contra:

```sql
SELECT COUNT(*) FROM gold.ventas_arg
WHERE flag_venta = 1 AND DATE_TRUNC('month', fecha_desembolso) = '<cepa>'::date;
```

(o `gold.ventas_col` para COL). Deben coincidir. Si no coinciden, revisar que el filtro
`flag_renovador` esté capturando el mismo universo que `flag_venta = 1` en `gold.ventas_*`.

- [ ] **Step 6: Chequeo — el clásico de BI ordena en el sentido correcto**

Para `arg_bi_clasico_n1` en `umbral_dias = 30`, confirmar que `mora_q` (n_malos/n_elegible) crece
de la banda `1` a la banda `10` (dado que ya está invertido en el catálogo — se verificó durante
el diseño que `bad_rate` crece 0.17→0.30 por decil). Si sale al revés, el `multiplicador_score` o
el join de bandeo tiene un signo invertido.

- [ ] **Step 7: Documentar resultados**

Si algún chequeo falla, no seguir a Task 5 — ajustar `buildCarreraScoresQuery` en Task 2 y
volver a correr este Task 4 completo.

---

### Task 5: Frontend — funciones de fetch

**Files:**
- Modify: `src/services/api.ts`

**Interfaces:**
- Produces: `fetchCatalogoScores(): Promise<{ scores: any[]; bandas: any[] }>`, `fetchCarreraScores(): Promise<{ hechos: any[] }>`

- [ ] **Step 1: Agregar ambas funciones al final de `api.ts`**

```ts
export async function fetchCatalogoScores(): Promise<{ scores: any[]; bandas: any[] }> {
  const response = await fetch('/api/risk/catalogo-scores', { headers: { 'accept': 'application/json' } });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchCarreraScores(): Promise<{ hechos: any[] }> {
  const response = await fetch('/api/risk/carrera-scores', { headers: { 'accept': 'application/json' } });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.details || errorData.error || `HTTP ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/services/api.ts
git commit -m "feat: add fetchCatalogoScores/fetchCarreraScores client functions"
```

---

### Task 6: Frontend — lógica de pivot (helpers puros, sin JSX)

**Files:**
- Create: `src/components/submodules/carreraScoresHelpers.ts`

**Interfaces:**
- Consumes: shape de `hechos` (Task 3) y `bandas`/`scores` (Task 3)
- Produces: `HechoRow`, `BandaCatalogo`, `GridRow`, `GridCell`, `HeaderIndicators` (types), `UMBRALES`, `BANDA_ORDER`, `pivotGrid()`, `computeHeaderIndicators()`

- [ ] **Step 1: Definir tipos y la tabla de tramos**

```ts
// src/components/submodules/carreraScoresHelpers.ts
export interface HechoRow {
  score_key: string;
  pais: string;
  segmento: string;
  cepa: string;
  banda: string; // '1'..'10' | 'SIN_SCORE' | 'ERROR_NODO'
  umbral_dias: number;
  q_vendidos: number;
  capital: number;
  capital_mas_interes: number;
  n_elegible: number;
  n_malos: number;
}

export interface BandaCatalogo {
  score_key: string;
  decil: number;
  score_min: number;
  score_max: number;
  bad_rate: number;
  lift: number;
  tramo_5: string;
}

export const UMBRALES = [5, 10, 30, 60, 90] as const;
export const BANDA_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'SIN_SCORE', 'ERROR_NODO'];

export interface GridCell {
  moraPct: number | null; // null = sin madurar (n_elegible === 0)
  nElegible: number;
}

export interface GridRow {
  banda: string;
  label: string;
  scoreRange: string | null; // null para SIN_SCORE/ERROR_NODO
  qVendidos: number;
  capital: number;
  capitalMasInteres: number;
  celdas: Record<number, GridCell>; // key = umbral_dias
  esTotal?: boolean;
}
```

- [ ] **Step 2: Implementar `pivotGrid`**

```ts
export function pivotGrid(
  hechos: HechoRow[],
  bandas: BandaCatalogo[],
  scoreKey: string,
  cepa: string
): GridRow[] {
  const filtrados = hechos.filter(h => h.score_key === scoreKey && h.cepa === cepa);
  const bandasDelScore = new Map(bandas.filter(b => b.score_key === scoreKey).map(b => [String(b.decil), b]));

  const rows: GridRow[] = BANDA_ORDER.map(banda => {
    const filasBanda = filtrados.filter(h => h.banda === banda);
    const catalogoBanda = bandasDelScore.get(banda);
    const qVendidos = filasBanda[0]?.q_vendidos ?? 0;
    const capital = filasBanda[0]?.capital ?? 0;
    const capitalMasInteres = filasBanda[0]?.capital_mas_interes ?? 0;

    const celdas: Record<number, GridCell> = {};
    UMBRALES.forEach(umbral => {
      const fila = filasBanda.find(h => h.umbral_dias === umbral);
      const nElegible = fila?.n_elegible ?? 0;
      const nMalos = fila?.n_malos ?? 0;
      celdas[umbral] = { nElegible, moraPct: nElegible > 0 ? (nMalos / nElegible) * 100 : null };
    });

    const label = banda === 'SIN_SCORE' ? 'SIN SCORE'
      : banda === 'ERROR_NODO' ? 'ERROR NODO (-1)'
      : `${banda} · ${catalogoBanda?.tramo_5 ?? ''}`;
    const scoreRange = catalogoBanda ? `${catalogoBanda.score_min}-${catalogoBanda.score_max}` : null;

    return { banda, label, scoreRange, qVendidos, capital, capitalMasInteres, celdas };
  });

  const total: GridRow = {
    banda: 'TOTAL', label: 'Total', scoreRange: null, esTotal: true,
    qVendidos: rows.reduce((acc, r) => acc + r.qVendidos, 0),
    capital: rows.reduce((acc, r) => acc + r.capital, 0),
    capitalMasInteres: rows.reduce((acc, r) => acc + r.capitalMasInteres, 0),
    celdas: Object.fromEntries(UMBRALES.map(umbral => {
      const nElegible = rows.reduce((acc, r) => acc + r.celdas[umbral].nElegible, 0);
      const nMalos = rows.reduce((acc, r) => acc + (r.celdas[umbral].moraPct !== null
        ? Math.round((r.celdas[umbral].moraPct! / 100) * r.celdas[umbral].nElegible) : 0), 0);
      return [umbral, { nElegible, moraPct: nElegible > 0 ? (nMalos / nElegible) * 100 : null }];
    })),
  };

  return [...rows, total];
}
```

- [ ] **Step 3: Implementar `computeHeaderIndicators` (spread/inversiones/cobertura a nivel tramo)**

```ts
export interface HeaderIndicators {
  spread: number | null; // null = volumen insuficiente
  spreadEsperado: number | null;
  inversiones: number;
  coberturaPct: number;
}

const TRAMOS_ORDEN = ['1 MUY BUENO', '2 BUENO', '3 MEDIO', '4 MALO', '5 MUY MALO'];
const MIN_N_PARA_SPREAD = 300;

export function computeHeaderIndicators(
  grid: GridRow[],
  bandas: BandaCatalogo[],
  scoreKey: string,
  liftD1D10Esperado: number | null
): HeaderIndicators {
  const bandasDelScore = new Map(bandas.filter(b => b.score_key === scoreKey).map(b => [String(b.decil), b]));

  const porTramo = new Map<string, { nElegible: number; nMalos: number }>();
  grid.filter(r => !r.esTotal && r.banda !== 'SIN_SCORE' && r.banda !== 'ERROR_NODO').forEach(r => {
    const tramo = bandasDelScore.get(r.banda)?.tramo_5;
    if (!tramo) return;
    const celda30 = r.celdas[30];
    const acc = porTramo.get(tramo) ?? { nElegible: 0, nMalos: 0 };
    acc.nElegible += celda30.nElegible;
    acc.nMalos += celda30.moraPct !== null ? Math.round((celda30.moraPct / 100) * celda30.nElegible) : 0;
    porTramo.set(tramo, acc);
  });

  const moraPorTramo = TRAMOS_ORDEN.map(t => {
    const v = porTramo.get(t);
    return v && v.nElegible > 0 ? v.nMalos / v.nElegible : null;
  });

  const nPorTramo = TRAMOS_ORDEN.map(t => porTramo.get(t)?.nElegible ?? 0);
  const volumenSuficiente = nPorTramo.every(n => n >= MIN_N_PARA_SPREAD);

  const valores = moraPorTramo.filter((m): m is number => m !== null);
  const spread = volumenSuficiente && valores.length === 5 && Math.min(...valores) > 0
    ? Math.max(...valores) / Math.min(...valores)
    : null;

  let inversiones = 0;
  for (let i = 0; i < moraPorTramo.length - 1; i++) {
    const a = moraPorTramo[i];
    const b = moraPorTramo[i + 1];
    if (a !== null && b !== null && b < a) inversiones++;
  }

  const totalRow = grid.find(r => r.esTotal)!;
  const sinScoreRow = grid.find(r => r.banda === 'SIN_SCORE')!;
  const qConScore = totalRow.qVendidos - sinScoreRow.qVendidos;
  const coberturaPct = totalRow.qVendidos > 0 ? (qConScore / totalRow.qVendidos) * 100 : 0;

  return { spread, spreadEsperado: liftD1D10Esperado, inversiones, coberturaPct };
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/submodules/carreraScoresHelpers.ts
git commit -m "feat: add pivot and header-indicator helpers for Carrera de Scores"
```

---

### Task 7: Frontend — componente `RiCarreraScoresSubmodule.tsx`

**Files:**
- Create: `src/components/submodules/RiCarreraScoresSubmodule.tsx`

**Interfaces:**
- Consumes: `fetchCatalogoScores`, `fetchCarreraScores` (Task 5); `pivotGrid`, `computeHeaderIndicators`, `HechoRow`, `BandaCatalogo`, `UMBRALES` (Task 6)

- [ ] **Step 1: Crear el componente completo**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';
import { fetchCatalogoScores, fetchCarreraScores } from '../../services/api';
import { pivotGrid, computeHeaderIndicators, UMBRALES, type HechoRow, type BandaCatalogo } from './carreraScoresHelpers';

const formatPct = (v: number | null) => v === null ? null : `${v.toFixed(1)}%`;
const formatMonto = (v: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export default function RiCarreraScoresSubmodule() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [bandas, setBandas] = useState<BandaCatalogo[]>([]);
  const [hechos, setHechos] = useState<HechoRow[]>([]);

  const [pais, setPais] = useState<string>('');
  const [segmento, setSegmento] = useState<string>('');
  const [scoreKey, setScoreKey] = useState<string>('');
  const [cepa, setCepa] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const [catalogo, carrera] = await Promise.all([fetchCatalogoScores(), fetchCarreraScores()]);
        setScores(catalogo.scores);
        setBandas(catalogo.bandas);
        setHechos(carrera.hechos);
        if (catalogo.scores.length > 0) {
          setPais(catalogo.scores[0].pais);
          setSegmento(catalogo.scores[0].segmento);
          setScoreKey(catalogo.scores[0].score_key);
        }
      } catch (err: any) {
        setError(err.message || 'Error al cargar Carrera de Scores');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const paises = useMemo(() => [...new Set(scores.map(s => s.pais))], [scores]);
  const segmentos = useMemo(() => [...new Set(scores.filter(s => s.pais === pais).map(s => s.segmento))], [scores, pais]);
  const scoresDisponibles = useMemo(() => scores.filter(s => s.pais === pais && s.segmento === segmento), [scores, pais, segmento]);
  const cepasDisponibles = useMemo(() => {
    const set = new Set(hechos.filter(h => h.score_key === scoreKey).map(h => h.cepa));
    return [...set].sort();
  }, [hechos, scoreKey]);

  useEffect(() => { if (cepasDisponibles.length > 0 && !cepasDisponibles.includes(cepa)) setCepa(cepasDisponibles[cepasDisponibles.length - 1]); }, [cepasDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => scoreKey && cepa ? pivotGrid(hechos, bandas, scoreKey, cepa) : [], [hechos, bandas, scoreKey, cepa]);
  const scoreActual = scores.find(s => s.score_key === scoreKey);
  const indicadores = useMemo(
    () => grid.length > 0 ? computeHeaderIndicators(grid, bandas, scoreKey, scoreActual?.lift_d1_d10 ? Number(scoreActual.lift_d1_d10) : null) : null,
    [grid, bandas, scoreKey, scoreActual]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando Carrera de Scores...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-rose-400">
        <AlertTriangle className="w-5 h-5" /> {error}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-lg font-bold text-white">Riesgos › Carrera de Scores</h2>
        <p className="text-zinc-500 text-sm mt-0.5">¿Cada score propio sigue ordenando el riesgo como prometió en su desarrollo?</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Selector label="País" value={pais} options={paises} onChange={(v) => { setPais(v); setSegmento(''); setScoreKey(''); }} />
        <Selector label="Segmento" value={segmento} options={segmentos} onChange={(v) => { setSegmento(v); setScoreKey(''); }} />
        <Selector label="Score" value={scoreKey} options={scoresDisponibles.map(s => s.score_key)} onChange={setScoreKey} labelFor={(k) => scores.find(s => s.score_key === k)?.nombre || k} />
        <Selector label="Cepa de desembolso" value={cepa} options={cepasDisponibles} onChange={setCepa} />
      </div>

      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <IndicadorCard titulo="Spread observado vs esperado"
            valor={indicadores.spread !== null ? `${indicadores.spread.toFixed(2)}x` : 'volumen insuficiente'}
            sub={indicadores.spreadEsperado !== null ? `esperado (lift d1/d10): ${indicadores.spreadEsperado.toFixed(2)}x` : undefined}
            gris={indicadores.spread === null} />
          <IndicadorCard titulo="Inversiones"
            valor={String(indicadores.inversiones)}
            sub={indicadores.inversiones === 0 ? 'sin inversiones — esperado' : 'algún par de tramos consecutivos se invirtió'} />
          <IndicadorCard titulo="Cobertura" valor={`${indicadores.coberturaPct.toFixed(1)}%`} sub="Q con score / Q vendidos" />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Banda</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Q vendidos</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Capital</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">K+I</th>
              {UMBRALES.map(u => (
                <th key={u} className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase whitespace-nowrap">Mora {u}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {grid.map(row => (
              <tr key={row.banda} className={row.esTotal ? 'bg-slate-800/60 font-bold' : 'hover:bg-slate-800/40'}>
                <td className="px-4 py-3 text-xs text-zinc-200 whitespace-nowrap">
                  {row.label}{row.scoreRange && <span className="text-zinc-500"> ({row.scoreRange})</span>}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-300 whitespace-nowrap">{row.qVendidos.toLocaleString('es-AR')}</td>
                <td className="px-4 py-3 text-xs text-blue-400 font-bold whitespace-nowrap">{formatMonto(row.capital)}</td>
                <td className="px-4 py-3 text-xs text-blue-400 font-bold whitespace-nowrap">{formatMonto(row.capitalMasInteres)}</td>
                {UMBRALES.map(u => {
                  const celda = row.celdas[u];
                  const pct = formatPct(celda.moraPct);
                  return (
                    <td key={u} className="px-4 py-3 text-xs whitespace-nowrap">
                      {pct === null ? (
                        <span className="text-zinc-600 italic">sin madurar</span>
                      ) : (
                        <span className="text-zinc-100 font-bold">{pct}</span>
                      )}
                      <div className="text-[9px] text-zinc-500">n {celda.nElegible.toLocaleString('es-AR')}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Selector({ label, value, options, onChange, labelFor }: { label: string; value: string; options: string[]; onChange: (v: string) => void; labelFor?: (v: string) => string }) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-slate-800/50 rounded-xl border border-slate-700">
      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full text-[10px] font-bold text-white bg-slate-950 hover:bg-slate-900 px-2 py-1.5 rounded-md transition-all focus:outline-none border border-slate-700">
        <option value="">— elegir —</option>
        {options.map(opt => <option key={opt} value={opt}>{labelFor ? labelFor(opt) : opt}</option>)}
      </select>
    </div>
  );
}

function IndicadorCard({ titulo, valor, sub, gris }: { titulo: string; valor: string; sub?: string; gris?: boolean }) {
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-zinc-400"><TrendingUp className="w-4 h-4" /><span className="text-sm font-medium">{titulo}</span></div>
      <h3 className={gris ? 'text-lg font-bold text-zinc-500' : 'text-2xl font-bold text-white'}>{valor}</h3>
      {sub && <p className="text-[10px] text-zinc-500 mt-1 uppercase font-bold tracking-wider">{sub}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/submodules/RiCarreraScoresSubmodule.tsx
git commit -m "feat: add RiCarreraScoresSubmodule grid component"
```

---

### Task 8: Wiring — menú y routing

**Files:**
- Modify: `src/components/LandingPage.tsx`
- Modify: `src/components/DashboardView.tsx`

- [ ] **Step 1: Agregar el submodule a `risks` en `LandingPage.tsx`**

Buscar el bloque `id: 'risks'` con su array `submodules: [...]` (contiene `ri-analitico` y
`ri-asistente`) y agregar:

```ts
{
  id: 'ri-carrera-scores',
  title: 'Carrera de Scores',
  description: 'Seguimiento del poder de ordenamiento de los scores propios contra su performance esperada.',
  color: 'bg-slate-700'
},
```

- [ ] **Step 2: Importar el componente en `DashboardView.tsx`**

Cerca de los otros imports de `./submodules/*`:

```ts
import RiCarreraScoresSubmodule from './submodules/RiCarreraScoresSubmodule';
```

- [ ] **Step 3: Agregar la rama de routing**

Junto a `activeSubmodule.id === 'ri-analitico'` / `'ri-asistente'`:

```tsx
) : activeSubmodule.id === 'ri-carrera-scores' ? (
  <RiCarreraScoresSubmodule />
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/LandingPage.tsx src/components/DashboardView.tsx
git commit -m "feat: wire Carrera de Scores submodule into Riesgos menu and routing"
```

---

### Task 9: Verificación end-to-end

**Files:** ninguno

- [ ] **Step 1: Levantar el dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navegar con Playwright (o manualmente) a Riesgos › Carrera de Scores**

Confirmar: la tarjeta aparece en Riesgos, el submodule carga sin errores de consola, los 4
selectores se pueblan, la grilla muestra 12 filas (10 bandas + SIN SCORE + ERROR NODO) más
Total, con `%` y `n` en cada celda, y `$` con punto de miles en Capital/K+I.

- [ ] **Step 3: Cambiar de país/segmento/score/cepa y confirmar que la grilla se repivotea sin volver a pegarle al backend**

(No debe haber una nueva request de red a `/api/risk/carrera-scores` al cambiar los selectores —
todo el filtrado ocurre sobre el payload ya cargado.)

- [ ] **Step 4: Confirmar visualmente celdas "sin madurar" en gris itálica, distintas de un `0.0%`**

- [ ] **Step 5: `npm run lint` final**

Expected: sin errores en todo el proyecto.
