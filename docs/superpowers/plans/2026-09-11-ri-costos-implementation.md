# Costos (Riesgos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar el sub-módulo "Costos" (`ri-costos`) dentro de Riesgos: gasto operativo mensual del área por proveedor/categoría/país (Argentina y Colombia), cruzado contra el funnel de originación para calcular CPL/CPR/CPO/CPV en USD y moneda local.

**Architecture:** Un endpoint nuevo en `server.ts` (`GET /api/riesgo-costos`) corre en paralelo dos queries ya provistas contra Redshift (gasto por proveedor y funnel por país/mes), las combina en TypeScript (categorización de proveedores + cálculo de costo unitario), cachea el resultado 1h en memoria, y lo sirve a un componente React nuevo (`RiCostosSubmodule.tsx`) que se cuelga del módulo Riesgos existente.

**Tech Stack:** Express + `pg` (`redshiftPool`) en el backend, React + TypeScript + `chart.js` (ya es dependencia del proyecto, usado por `TesoreriaSubmodule.tsx`/`CarteraFideicomisoSubmodule.tsx`) + Tailwind en el frontend.

**Spec:** `docs/superpowers/specs/2026-09-11-ri-costos-design.md`

## Global Constraints

- **Sin test suite en el proyecto** (confirmado en `CLAUDE.md` — no hay Jest/Vitest configurado). La verificación de cada tarea es `npm run lint` (chequeo de tipos TypeScript) + verificación manual (`curl` al endpoint recién creado, o revisión visual con `npm run dev`), replicando cómo se construyeron Cartera Fideicomiso y Tesorería en este mismo repo. No se escriben archivos `*.test.ts`.
- Las dos queries SQL (gasto y funnel) están dadas completas más abajo y **no se modifican** — el filtro que excluye el mes en curso en la query de gasto se deja tal cual (decisión ya confirmada).
- Nunca sumar ARS + COP en un mismo total. La vista combinada "AMBOS" países solo muestra montos en USD.
- El costo unitario (CPL/CPR/CPO/CPV) para un `(país, mes)` sin gasto cargado (mes en curso) debe ser `null`, nunca `0` — el frontend lo renderiza como "—" o como hueco en el gráfico de líneas (`spanGaps: false`), nunca como un número.
- Gráficos con `chart.js` (no `recharts`) — es la librería que ya usan los sub-módulos de Riesgos/Finanzas en este repo, aunque `recharts` también esté en `package.json`.
- Paleta visual: tema oscuro Tailwind (`bg-slate-900`, `border-slate-700`/`border-slate-800`, `text-zinc-400`/`text-zinc-500`, acentos `text-blue-400`/`text-rose-400`/`text-emerald-400`) — mismo estilo que `RiBcraTasasSubmodule.tsx` y `AdmGastosProveedoresSubmodule.tsx`.
- El endpoint nuevo (`/api/riesgo-costos`) es independiente del ya existente `/api/gastos-proveedores` (que sirve `platinum_ia.vw_gastos_multipais` crudo, sin categorizar ni cruzar con funnel) — no se toca ese endpoint.

---

### Task 1: Backend — queries, categorización y endpoint `/api/riesgo-costos`

**Files:**
- Modify: `server.ts:2292` (insertar justo después del cierre del bloque `app.get('/api/ri-bcra-tasas/export', ...)` en la línea 2292, antes del comentario `// Catch-all for unhandled API routes` en la línea 2294)

**Interfaces:**
- Produces: `GET /api/riesgo-costos` → `{ detalleGasto: CostosGastoRowEnriched[], resumenMensual: CostosResumenMensual[], cachedAt: number }` y `GET /api/riesgo-costos/refresh` → `{ ok: true }`. Estos son los tipos exactos que el frontend (Task 2) espera consumir.

- [ ] **Step 1: Agregar el bloque completo en `server.ts`**

Insertar el siguiente bloque inmediatamente después de la línea 2292 (`});` que cierra `/api/ri-bcra-tasas/export`) y antes de la línea 2294 (`// Catch-all for unhandled API routes`):

```ts
  // ── Riesgos: Costos ──────────────────────────────────────────────────────────
  interface CostosGastoRow {
    pais: string;
    proveedor: string;
    mes: string; // 'YYYY-MM'
    monto_usd: number | null;
    monto_ars: number | null;
    monto_cop: number | null;
  }

  interface CostosGastoRowEnriched extends CostosGastoRow {
    alias: string;
    categoria: 'Plataformas' | 'Bureaus' | 'Otros';
  }

  interface CostosFunnelRow {
    pais: string;
    mes: string; // 'YYYY-MM'
    cantidad_leads: number;
    cantidad_motor: number;
    cantidad_ofertas: number;
    cantidad_ventas_netas: number;
  }

  interface CostosResumenMensual {
    pais: string;
    mes: string;
    gastoTotalUsd: number | null;
    gastoTotalLocal: number | null;
    cantidadLeads: number;
    cantidadMotor: number;
    cantidadOfertas: number;
    cantidadVentasNetas: number;
    cplUsd: number | null;
    cplLocal: number | null;
    cprUsd: number | null;
    cprLocal: number | null;
    cpoUsd: number | null;
    cpoLocal: number | null;
    cpvUsd: number | null;
    cpvLocal: number | null;
  }

  const COSTOS_PROVEEDOR_CATEGORIA: Record<string, { alias: string; categoria: 'Plataformas' | 'Bureaus' | 'Otros' }> = {
    'SERVICIO INTERACTIVO DE INFORMES SA': { alias: 'UFLOW', categoria: 'Plataformas' },
    'UFLOW LLC': { alias: 'UFLOW', categoria: 'Plataformas' },
    'LABORATORIO DE INVESTIGACIÓN Y DESARROLLO S.A.': { alias: 'NOSIS', categoria: 'Bureaus' },
    'PEYPE DATOS ANALYTICS': { alias: 'PEYPE', categoria: 'Bureaus' },
    'SEON TECHNOLOGIES US INC. (prorrateado)': { alias: 'SEON', categoria: 'Bureaus' },
    'EXPERIAN COLOMBIA S.A.': { alias: 'DATACREDITO', categoria: 'Bureaus' },
    'ZAJANA SAS': { alias: 'MAREIGUA', categoria: 'Bureaus' },
    'EQUIFAX ARGENTINA S.A.': { alias: 'VERAZ', categoria: 'Otros' },
  };

  const COSTOS_GASTO_QUERY = `
    WITH tc_arg AS (
        SELECT DATE_TRUNC('month', fecha)::date AS mes,
               mep_promedio AS tc_usd_ars
        FROM finance_arg.tipo_cambio_arg
    ),
    tc_col AS (
        SELECT DATE_TRUNC('month', fecha)::date AS mes,
               trm_promedio AS tc_usd_cop
        FROM finance_col.tipo_cambio_col
    ),
    directos AS (
        SELECT
            pais, proveedor,
            DATE_TRUNC('month', fecha_creacion)::date AS mes,
            moneda,
            SUM(monto_sin_impuesto) AS monto
        FROM platinum_ia.vw_gastos_multipais
        WHERE proveedor IN (
            'EQUIFAX ARGENTINA S.A.', 'LABORATORIO DE INVESTIGACIÓN Y DESARROLLO S.A.',
            'PEYPE DATOS ANALYTICS', 'SERVICIO INTERACTIVO DE INFORMES SA',
            'EXPERIAN COLOMBIA S.A.', 'UFLOW LLC', 'ZAJANA SAS'
        )
        AND DATE_TRUNC('month', fecha_creacion)::date < DATE_TRUNC('month', CURRENT_DATE)::date
        GROUP BY 1,2,3,4
    ),
    directos_convertidos AS (
        SELECT
            d.pais, d.proveedor, d.mes,
            CASE
                WHEN d.pais = 'ARG' THEN d.monto / NULLIF(ta.tc_usd_ars, 0)
                WHEN d.moneda = 'USD' THEN d.monto
                ELSE d.monto / NULLIF(tc.tc_usd_cop, 0)
            END AS monto_usd,
            CASE WHEN d.pais = 'ARG' THEN d.monto ELSE NULL END AS monto_ars,
            CASE
                WHEN d.pais = 'COL' AND d.moneda = 'COP' THEN d.monto
                WHEN d.pais = 'COL' AND d.moneda = 'USD' THEN d.monto * tc.tc_usd_cop
                ELSE NULL
            END AS monto_cop
        FROM directos d
        LEFT JOIN tc_arg ta ON d.pais = 'ARG' AND ta.mes = d.mes
        LEFT JOIN tc_col tc ON d.pais = 'COL' AND tc.mes = d.mes
    ),
    seon_total AS (
        SELECT DATE_TRUNC('month', fecha_creacion)::date AS mes,
               SUM(monto) AS monto_usd_total
        FROM platinum_ia.vw_gastos_multipais
        WHERE proveedor = 'SEON TECHNOLOGIES US INC.'
          AND DATE_TRUNC('month', fecha_creacion)::date < DATE_TRUNC('month', CURRENT_DATE)::date
        GROUP BY 1
    ),
    seon_consultas AS (
        SELECT
            COALESCE(a.mes, b.mes) AS mes,
            COALESCE(a.cantidad_arg, 0) AS cantidad_arg,
            COALESCE(b.cantidad_col, 0) AS cantidad_col
        FROM (
            SELECT DATE_TRUNC('month', created_at)::date AS mes, COUNT(*) AS cantidad_arg
            FROM risk_arg.seon_parsed_arg GROUP BY 1
        ) a
        FULL OUTER JOIN (
            SELECT DATE_TRUNC('month', created_at)::date AS mes, COUNT(*) AS cantidad_col
            FROM risk_col.seon_parsed_col GROUP BY 1
        ) b ON a.mes = b.mes
    ),
    seon_split AS (
        SELECT
            st.mes, st.monto_usd_total, sc.cantidad_arg, sc.cantidad_col,
            st.monto_usd_total * sc.cantidad_arg / NULLIF(sc.cantidad_arg + sc.cantidad_col, 0) AS seon_usd_arg,
            st.monto_usd_total * sc.cantidad_col / NULLIF(sc.cantidad_arg + sc.cantidad_col, 0) AS seon_usd_col
        FROM seon_total st
        LEFT JOIN seon_consultas sc ON sc.mes = st.mes
    ),
    seon_convertido AS (
        SELECT 'ARG' AS pais, 'SEON TECHNOLOGIES US INC. (prorrateado)' AS proveedor, s.mes,
               s.seon_usd_arg AS monto_usd, s.seon_usd_arg * ta.tc_usd_ars AS monto_ars, NULL::numeric AS monto_cop
        FROM seon_split s LEFT JOIN tc_arg ta ON ta.mes = s.mes
        UNION ALL
        SELECT 'COL', 'SEON TECHNOLOGIES US INC. (prorrateado)', s.mes,
               s.seon_usd_col, NULL::numeric, s.seon_usd_col * tc.tc_usd_cop
        FROM seon_split s LEFT JOIN tc_col tc ON tc.mes = s.mes
    )
    SELECT pais, proveedor, mes, ROUND(monto_usd, 0) AS monto_usd, ROUND(monto_ars, 0) AS monto_ars, ROUND(monto_cop, 0) AS monto_cop
    FROM directos_convertidos
    UNION ALL
    SELECT pais, proveedor, mes, ROUND(monto_usd, 0), ROUND(monto_ars, 0), ROUND(monto_cop, 0)
    FROM seon_convertido
    ORDER BY pais, mes, proveedor
  `;

  const COSTOS_FUNNEL_QUERY = `
    WITH leads_arg AS (
        SELECT DATE_TRUNC('month', fecha_lead)::date AS mes, COUNT(DISTINCT lead_id) AS cantidad_leads
        FROM auxiliary_tables.funnel_lead_arg WHERE is_renovation = 0 GROUP BY 1
    ),
    motor_arg AS (
        SELECT DATE_TRUNC('month', executiondate)::date AS mes, COUNT(DISTINCT executionid) AS cantidad_motor
        FROM risk_arg.risk_engine_arg WHERE tipo_cliente = 0 GROUP BY 1
    ),
    ofertas_arg AS (
        SELECT DATE_TRUNC('month', fecha_oferta)::date AS mes, COUNT(DISTINCT lead_id) AS cantidad_ofertas
        FROM auxiliary_tables.funnel_lead_arg WHERE is_renovation = 0 AND fecha_oferta IS NOT NULL GROUP BY 1
    ),
    ventas_arg AS (
        SELECT DATE_TRUNC('month', fecha_desembolso)::date AS mes, COUNT(DISTINCT loan_id) AS cantidad_ventas_netas
        FROM gold.ventas_arg WHERE flag_venta = 1 AND renovacion = 'NUEVO' GROUP BY 1
    ),
    funnel_arg AS (
        SELECT 'ARG' AS pais, COALESCE(l.mes, m.mes, o.mes, v.mes) AS mes,
               COALESCE(l.cantidad_leads, 0) AS cantidad_leads,
               COALESCE(m.cantidad_motor, 0) AS cantidad_motor,
               COALESCE(o.cantidad_ofertas, 0) AS cantidad_ofertas,
               COALESCE(v.cantidad_ventas_netas, 0) AS cantidad_ventas_netas
        FROM leads_arg l
        FULL OUTER JOIN motor_arg m ON m.mes = l.mes
        FULL OUTER JOIN ofertas_arg o ON o.mes = COALESCE(l.mes, m.mes)
        FULL OUTER JOIN ventas_arg v ON v.mes = COALESCE(l.mes, m.mes, o.mes)
    ),
    leads_col AS (
        SELECT DATE_TRUNC('month', fecha_lead)::date AS mes, COUNT(DISTINCT lead_id) AS cantidad_leads
        FROM auxiliary_tables.funnel_lead_col WHERE is_renovation = 'false' GROUP BY 1
    ),
    motor_col AS (
        SELECT DATE_TRUNC('month', executiondate::timestamp)::date AS mes, COUNT(DISTINCT executionid) AS cantidad_motor
        FROM risk_col.risk_engine_col WHERE tipo_cliente = 0 GROUP BY 1
    ),
    ofertas_col AS (
        SELECT DATE_TRUNC('month', fecha_oferta)::date AS mes, COUNT(DISTINCT lead_id) AS cantidad_ofertas
        FROM auxiliary_tables.funnel_lead_col WHERE is_renovation = 'false' AND fecha_oferta IS NOT NULL GROUP BY 1
    ),
    ventas_col AS (
        SELECT DATE_TRUNC('month', fecha_desembolso)::date AS mes, COUNT(DISTINCT loan_id) AS cantidad_ventas_netas
        FROM gold.ventas_col WHERE flag_venta = 1 AND renovacion = 'NUEVO' GROUP BY 1
    ),
    funnel_col AS (
        SELECT 'COL' AS pais, COALESCE(l.mes, m.mes, o.mes, v.mes) AS mes,
               COALESCE(l.cantidad_leads, 0) AS cantidad_leads,
               COALESCE(m.cantidad_motor, 0) AS cantidad_motor,
               COALESCE(o.cantidad_ofertas, 0) AS cantidad_ofertas,
               COALESCE(v.cantidad_ventas_netas, 0) AS cantidad_ventas_netas
        FROM leads_col l
        FULL OUTER JOIN motor_col m ON m.mes = l.mes
        FULL OUTER JOIN ofertas_col o ON o.mes = COALESCE(l.mes, m.mes)
        FULL OUTER JOIN ventas_col v ON v.mes = COALESCE(l.mes, m.mes, o.mes)
    )
    SELECT * FROM funnel_arg WHERE DATE_TRUNC('month', mes)::date BETWEEN '2025-08-01' AND DATE_TRUNC('month', CURRENT_DATE)::date
    UNION ALL
    SELECT * FROM funnel_col WHERE DATE_TRUNC('month', mes)::date BETWEEN '2025-08-01' AND DATE_TRUNC('month', CURRENT_DATE)::date
    ORDER BY pais, mes
  `;

  function costosToYearMonth(value: unknown): string {
    if (typeof value === 'string') return value.slice(0, 7);
    if (value instanceof Date) return value.toISOString().slice(0, 7);
    return String(value).slice(0, 7);
  }

  function enrichGastoRows(rows: CostosGastoRow[]): CostosGastoRowEnriched[] {
    return rows.map(r => {
      const meta = COSTOS_PROVEEDOR_CATEGORIA[r.proveedor];
      return { ...r, alias: meta?.alias ?? r.proveedor, categoria: meta?.categoria ?? 'Otros' };
    });
  }

  function buildResumenMensual(gastoRows: CostosGastoRow[], funnelRows: CostosFunnelRow[]): CostosResumenMensual[] {
    const gastoPorClave = new Map<string, { totalUsd: number; totalLocal: number }>();
    for (const row of gastoRows) {
      const clave = `${row.pais}|${row.mes}`;
      const acc = gastoPorClave.get(clave) ?? { totalUsd: 0, totalLocal: 0 };
      acc.totalUsd += row.monto_usd ?? 0;
      const local = row.pais === 'ARG' ? row.monto_ars : row.monto_cop;
      acc.totalLocal += local ?? 0;
      gastoPorClave.set(clave, acc);
    }

    const divide = (total: number | null, cantidad: number): number | null =>
      total === null || cantidad <= 0 ? null : +(total / cantidad).toFixed(2);

    return funnelRows
      .map(f => {
        const clave = `${f.pais}|${f.mes}`;
        const gasto = gastoPorClave.get(clave) ?? null;
        const gastoTotalUsd = gasto ? gasto.totalUsd : null;
        const gastoTotalLocal = gasto ? gasto.totalLocal : null;
        return {
          pais: f.pais,
          mes: f.mes,
          gastoTotalUsd,
          gastoTotalLocal,
          cantidadLeads: f.cantidad_leads,
          cantidadMotor: f.cantidad_motor,
          cantidadOfertas: f.cantidad_ofertas,
          cantidadVentasNetas: f.cantidad_ventas_netas,
          cplUsd: divide(gastoTotalUsd, f.cantidad_leads),
          cplLocal: divide(gastoTotalLocal, f.cantidad_leads),
          cprUsd: divide(gastoTotalUsd, f.cantidad_motor),
          cprLocal: divide(gastoTotalLocal, f.cantidad_motor),
          cpoUsd: divide(gastoTotalUsd, f.cantidad_ofertas),
          cpoLocal: divide(gastoTotalLocal, f.cantidad_ofertas),
          cpvUsd: divide(gastoTotalUsd, f.cantidad_ventas_netas),
          cpvLocal: divide(gastoTotalLocal, f.cantidad_ventas_netas),
        };
      })
      .sort((a, b) => (a.pais === b.pais ? a.mes.localeCompare(b.mes) : a.pais.localeCompare(b.pais)));
  }

  let costosCache: { detalleGasto: CostosGastoRowEnriched[]; resumenMensual: CostosResumenMensual[]; fetchedAt: number } | null = null;
  const COSTOS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

  async function loadCostosCache(): Promise<void> {
    if (costosCache && Date.now() - costosCache.fetchedAt < COSTOS_CACHE_TTL_MS) return;
    if (!redshiftPool) throw new Error('Redshift no configurado');
    console.log('[COSTOS] Querying Redshift...');
    const [gastoResult, funnelResult] = await Promise.all([
      redshiftPool.query(COSTOS_GASTO_QUERY),
      redshiftPool.query(COSTOS_FUNNEL_QUERY),
    ]);
    const toSafeRows = (rows: any[]) => JSON.parse(JSON.stringify(rows, (_k, v) => typeof v === 'bigint' ? Number(v) : v));

    const gastoRows: CostosGastoRow[] = toSafeRows(gastoResult.rows).map((r: any) => ({
      pais: r.pais,
      proveedor: r.proveedor,
      mes: costosToYearMonth(r.mes),
      monto_usd: r.monto_usd,
      monto_ars: r.monto_ars,
      monto_cop: r.monto_cop,
    }));
    const funnelRows: CostosFunnelRow[] = toSafeRows(funnelResult.rows).map((r: any) => ({
      pais: r.pais,
      mes: costosToYearMonth(r.mes),
      cantidad_leads: r.cantidad_leads,
      cantidad_motor: r.cantidad_motor,
      cantidad_ofertas: r.cantidad_ofertas,
      cantidad_ventas_netas: r.cantidad_ventas_netas,
    }));

    const detalleGasto = enrichGastoRows(gastoRows);
    const resumenMensual = buildResumenMensual(gastoRows, funnelRows);
    costosCache = { detalleGasto, resumenMensual, fetchedAt: Date.now() };
    console.log(`[COSTOS] Cached ${detalleGasto.length} filas de gasto, ${resumenMensual.length} filas de resumen`);
  }

  app.get('/api/riesgo-costos', async (_req, res) => {
    if (!redshiftPool) {
      return res.status(503).json({
        error: 'Conexión a Redshift no configurada',
        required_env: ['REDSHIFT_HOST', 'REDSHIFT_DATABASE', 'REDSHIFT_USER', 'REDSHIFT_PASSWORD'],
      });
    }
    try {
      await loadCostosCache();
      res.json({
        detalleGasto: costosCache!.detalleGasto,
        resumenMensual: costosCache!.resumenMensual,
        cachedAt: costosCache!.fetchedAt,
      });
    } catch (error: any) {
      console.error('[COSTOS] Error:', error);
      res.status(500).json({ error: 'Error al cargar datos de costos', details: error.message });
    }
  });

  app.get('/api/riesgo-costos/refresh', (_req, res) => {
    costosCache = null;
    res.json({ ok: true });
  });

```

- [ ] **Step 2: Verificar tipos**

Run: `npm run lint`
Expected: sin errores de TypeScript (el proyecto usa esto como type-check, no hay linter de estilo separado).

- [ ] **Step 3: Levantar el servidor y probar el endpoint**

Run: `npm run dev` (dejarlo corriendo en background)
Run: `curl -s http://localhost:3000/api/riesgo-costos | head -c 2000`
Expected: JSON con `detalleGasto` (array de filas con `pais`, `proveedor`, `alias`, `categoria`, `mes`, `monto_usd`, `monto_ars`, `monto_cop`) y `resumenMensual` (array con `pais`, `mes`, `gastoTotalUsd`, `cplUsd`, `cprUsd`, `cpoUsd`, `cpvUsd`, etc.). Si `REDSHIFT_HOST` no está configurado en el entorno local, se espera un 503 con `required_env` — en ese caso confirmar que el JSON de error tiene esa forma y seguir a la Task 2 (no bloqueante para el frontend, que maneja ese caso).
Run: `curl -s http://localhost:3000/api/riesgo-costos/refresh`
Expected: `{"ok":true}`

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "$(cat <<'EOF'
feat: add /api/riesgo-costos endpoint for Riesgos cost tracking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Frontend — `RiCostosSubmodule.tsx` (fetch, selector de país, KPI cards)

**Files:**
- Create: `src/components/submodules/RiCostosSubmodule.tsx`

**Interfaces:**
- Consumes: `GET /api/riesgo-costos` → `{ detalleGasto: GastoRow[], resumenMensual: ResumenMensual[], cachedAt: number }` (mismos campos que `CostosGastoRowEnriched`/`CostosResumenMensual` de Task 1, con nombres de campo idénticos).
- Produces: helpers `combineAmbos(rows: ResumenMensual[]): ResumenMensual[]`, `formatMesLabel(mes: string): string`, `fmtUsd(v: number | null): string`, `fmtLocal(v: number | null, pais: PaisFiltro): string` — usados también en Task 3 dentro del mismo archivo.

- [ ] **Step 1: Crear el archivo con el siguiente contenido completo**

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';

type Pais = 'ARG' | 'COL';
type PaisFiltro = Pais | 'AMBOS';
type Categoria = 'Plataformas' | 'Bureaus' | 'Otros';

interface GastoRow {
  pais: Pais;
  proveedor: string;
  mes: string;
  monto_usd: number | null;
  monto_ars: number | null;
  monto_cop: number | null;
  alias: string;
  categoria: Categoria;
}

interface ResumenMensual {
  pais: Pais | 'AMBOS';
  mes: string;
  gastoTotalUsd: number | null;
  gastoTotalLocal: number | null;
  cantidadLeads: number;
  cantidadMotor: number;
  cantidadOfertas: number;
  cantidadVentasNetas: number;
  cplUsd: number | null;
  cplLocal: number | null;
  cprUsd: number | null;
  cprLocal: number | null;
  cpoUsd: number | null;
  cpoLocal: number | null;
  cpvUsd: number | null;
  cpvLocal: number | null;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatMesLabel(mes: string): string {
  const [anio, mesNum] = mes.split('-').map(Number);
  return `${MESES_CORTOS[mesNum - 1]} '${String(anio).slice(2)}`;
}

function fmtUsd(v: number | null): string {
  if (v === null) return '—';
  return `USD ${Math.round(v).toLocaleString('es-AR')}`;
}

function fmtLocal(v: number | null, pais: PaisFiltro): string {
  if (v === null || pais === 'AMBOS') return '—';
  const prefix = pais === 'ARG' ? '$' : 'COP';
  return `${prefix} ${Math.round(v).toLocaleString('es-AR')}`;
}

function pctDelta(actual: number | null, anterior: number | null): number | null {
  if (actual === null || anterior === null || anterior === 0) return null;
  return +(((actual - anterior) / anterior) * 100).toFixed(1);
}

function combineAmbos(rows: ResumenMensual[]): ResumenMensual[] {
  const porMes = new Map<string, { gastoTotalUsd: number | null; leads: number; motor: number; ofertas: number; ventas: number }>();
  for (const r of rows) {
    const acc = porMes.get(r.mes) ?? { gastoTotalUsd: null, leads: 0, motor: 0, ofertas: 0, ventas: 0 };
    if (r.gastoTotalUsd !== null) acc.gastoTotalUsd = (acc.gastoTotalUsd ?? 0) + r.gastoTotalUsd;
    acc.leads += r.cantidadLeads;
    acc.motor += r.cantidadMotor;
    acc.ofertas += r.cantidadOfertas;
    acc.ventas += r.cantidadVentasNetas;
    porMes.set(r.mes, acc);
  }
  const divide = (total: number | null, cantidad: number): number | null =>
    total === null || cantidad <= 0 ? null : +(total / cantidad).toFixed(2);
  return [...porMes.entries()]
    .map(([mes, acc]) => ({
      pais: 'AMBOS' as const,
      mes,
      gastoTotalUsd: acc.gastoTotalUsd,
      gastoTotalLocal: null,
      cantidadLeads: acc.leads,
      cantidadMotor: acc.motor,
      cantidadOfertas: acc.ofertas,
      cantidadVentasNetas: acc.ventas,
      cplUsd: divide(acc.gastoTotalUsd, acc.leads),
      cplLocal: null,
      cprUsd: divide(acc.gastoTotalUsd, acc.motor),
      cprLocal: null,
      cpoUsd: divide(acc.gastoTotalUsd, acc.ofertas),
      cpoLocal: null,
      cpvUsd: divide(acc.gastoTotalUsd, acc.ventas),
      cpvLocal: null,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export default function RiCostosSubmodule() {
  const [detalleGasto, setDetalleGasto] = useState<GastoRow[]>([]);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paisFiltro, setPaisFiltro] = useState<PaisFiltro>('AMBOS');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/riesgo-costos');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetalleGasto(json.detalleGasto);
      setResumenMensual(json.resumenMensual);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    await fetch('/api/riesgo-costos/refresh');
    fetchData();
  };

  const resumenFiltrado = useMemo(() => {
    if (paisFiltro === 'AMBOS') return combineAmbos(resumenMensual);
    return resumenMensual.filter(r => r.pais === paisFiltro).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [resumenMensual, paisFiltro]);

  const detalleFiltrado = useMemo(() => {
    if (paisFiltro === 'AMBOS') return detalleGasto;
    return detalleGasto.filter(r => r.pais === paisFiltro);
  }, [detalleGasto, paisFiltro]);

  const ultimoCerrado = useMemo(() => {
    const cerrados = resumenFiltrado.filter(r => r.gastoTotalUsd !== null);
    return cerrados[cerrados.length - 1] ?? null;
  }, [resumenFiltrado]);

  const mesAnterior = useMemo(() => {
    if (!ultimoCerrado) return null;
    const cerrados = resumenFiltrado.filter(r => r.gastoTotalUsd !== null && r.mes < ultimoCerrado.mes);
    return cerrados[cerrados.length - 1] ?? null;
  }, [resumenFiltrado, ultimoCerrado]);

  const mesEnCurso = useMemo(
    () => resumenFiltrado.find(r => r.gastoTotalUsd === null) ?? null,
    [resumenFiltrado]
  );

  const deltaGasto = pctDelta(ultimoCerrado?.gastoTotalUsd ?? null, mesAnterior?.gastoTotalUsd ?? null);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
        <p className="text-zinc-400 text-sm font-semibold animate-pulse">Cargando costos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[50vh]">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <p className="text-zinc-400 text-sm">{error}</p>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-xl text-zinc-300 text-sm font-bold hover:bg-slate-700 transition-colors">
          <RefreshCcw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-base font-bold text-white">Costos</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Gasto operativo de Riesgo y costo por lead/motor/oferta/venta</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-700 overflow-hidden">
            {(['ARG', 'COL', 'AMBOS'] as PaisFiltro[]).map(p => (
              <button
                key={p}
                onClick={() => setPaisFiltro(p)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${paisFiltro === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-zinc-400 hover:bg-slate-700'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <button onClick={handleRefresh} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-zinc-400 transition-colors" title="Actualizar">
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gasto último mes cerrado</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.gastoTotalUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.gastoTotalLocal ?? null, paisFiltro)}</p>}
          {deltaGasto !== null && (
            <p className={`text-[10px] font-bold ${deltaGasto > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {deltaGasto > 0 ? '+' : ''}{deltaGasto}% vs. mes anterior
            </p>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPL (costo por lead)</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cplUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cplLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPR (costo por motor)</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cprUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cprLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPO (costo por oferta)</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cpoUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cpoLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CPV (costo por venta)</span>
          <p className="text-xl font-bold text-white">{fmtUsd(ultimoCerrado?.cpvUsd ?? null)}</p>
          {paisFiltro !== 'AMBOS' && <p className="text-xs text-zinc-500">{fmtLocal(ultimoCerrado?.cpvLocal ?? null, paisFiltro)}</p>}
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Último mes con costo</span>
          <p className="text-xl font-bold text-white">{ultimoCerrado ? formatMesLabel(ultimoCerrado.mes) : '—'}</p>
        </div>
        {mesEnCurso && (
          <div className="bg-slate-900 border border-dashed border-slate-700 rounded-xl p-4 flex flex-col gap-2 col-span-2 md:col-span-3 lg:col-span-6">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
              Mes en curso — {formatMesLabel(mesEnCurso.mes)} (sin costo cargado todavía)
            </span>
            <div className="flex gap-6 text-xs text-zinc-400 flex-wrap">
              <span>Leads: <strong className="text-white">{mesEnCurso.cantidadLeads.toLocaleString('es-AR')}</strong></span>
              <span>Motor: <strong className="text-white">{mesEnCurso.cantidadMotor.toLocaleString('es-AR')}</strong></span>
              <span>Ofertas: <strong className="text-white">{mesEnCurso.cantidadOfertas.toLocaleString('es-AR')}</strong></span>
              <span>Ventas: <strong className="text-white">{mesEnCurso.cantidadVentasNetas.toLocaleString('es-AR')}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificación visual manual**

Con `npm run dev` corriendo, agregar temporalmente el componente a cualquier ruta visible del dashboard (o esperar a la Task 4 de wiring, que lo cuelga del módulo real) y confirmar en el navegador: el header con el selector ARG/COL/AMBOS cambia el contenido, las 6 tarjetas de KPI muestran `—` si `redshiftPool` no está configurado localmente (loading → error visible con botón "Reintentar"), o números si sí lo está.

- [ ] **Step 4: Commit**

```bash
git add src/components/submodules/RiCostosSubmodule.tsx
git commit -m "$(cat <<'EOF'
feat: add RiCostosSubmodule skeleton with KPI cards

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Frontend — gráficos (Chart.js) y tabla de detalle

**Files:**
- Modify: `src/components/submodules/RiCostosSubmodule.tsx`

**Interfaces:**
- Consumes: `GastoRow`, `ResumenMensual`, `formatMesLabel`, `fmtUsd`, `fmtLocal` de Task 2 (mismo archivo).

- [ ] **Step 1: Agregar el import de `chart.js` y el registro de `registerables`**

En la parte superior del archivo, reemplazar:

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
```

por:

```tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);
```

- [ ] **Step 2: Agregar el helper de series de gasto por categoría**

Justo debajo de la función `combineAmbos` (Task 2), agregar:

```tsx
function buildGastoPorCategoriaSeries(detalle: GastoRow[]) {
  const meses = [...new Set(detalle.map(r => r.mes))].sort();
  const categorias: Categoria[] = ['Plataformas', 'Bureaus', 'Otros'];
  const series = categorias.map(categoria => ({
    categoria,
    data: meses.map(mes =>
      detalle.filter(r => r.mes === mes && r.categoria === categoria).reduce((s, r) => s + (r.monto_usd ?? 0), 0)
    ),
  }));
  return { meses, series };
}
```

- [ ] **Step 3: Agregar los refs, el memo de series y los dos `useEffect` de Chart.js**

Dentro del componente `RiCostosSubmodule`, justo después de la declaración de `const deltaGasto = ...` (Task 2), agregar:

```tsx
  const chartGastoRef = useRef<HTMLCanvasElement>(null);
  const chartGastoInst = useRef<Chart | null>(null);
  const chartCpRef = useRef<HTMLCanvasElement>(null);
  const chartCpInst = useRef<Chart | null>(null);

  const gastoPorCategoria = useMemo(() => buildGastoPorCategoriaSeries(detalleFiltrado), [detalleFiltrado]);

  useEffect(() => {
    if (!chartGastoRef.current) return;
    chartGastoInst.current?.destroy();
    const CATEGORIA_COLOR: Record<Categoria, string> = {
      Plataformas: 'rgba(59,130,246,.82)',
      Bureaus: 'rgba(245,158,11,.82)',
      Otros: 'rgba(139,92,246,.82)',
    };
    chartGastoInst.current = new Chart(chartGastoRef.current, {
      type: 'bar',
      data: {
        labels: gastoPorCategoria.meses.map(formatMesLabel),
        datasets: gastoPorCategoria.series.map(s => ({
          label: s.categoria,
          data: s.data,
          backgroundColor: CATEGORIA_COLOR[s.categoria],
          borderRadius: 4,
          borderSkipped: false,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: '#a1a1aa', font: { size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, titleColor: '#e2e8f5', bodyColor: '#a1a1aa',
            callbacks: { label: (c: any) => ` ${c.dataset.label}: USD ${Math.round(c.raw).toLocaleString('es-AR')}` },
          },
        },
        scales: {
          x: { stacked: true, ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: '#71717a', font: { size: 10 }, callback: (v: any) => `USD ${v}` }, grid: { color: 'rgba(51,65,85,.5)' } },
        },
      },
    });
    return () => { chartGastoInst.current?.destroy(); };
  }, [gastoPorCategoria]);

  useEffect(() => {
    if (!chartCpRef.current) return;
    chartCpInst.current?.destroy();
    const labels = resumenFiltrado.map(r => formatMesLabel(r.mes));
    chartCpInst.current = new Chart(chartCpRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'CPL', data: resumenFiltrado.map(r => r.cplUsd), borderColor: '#60a5fa', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
          { label: 'CPR', data: resumenFiltrado.map(r => r.cprUsd), borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
          { label: 'CPO', data: resumenFiltrado.map(r => r.cpoUsd), borderColor: '#a78bfa', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
          { label: 'CPV', data: resumenFiltrado.map(r => r.cpvUsd), borderColor: '#34d399', backgroundColor: 'transparent', tension: 0.3, spanGaps: false },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: '#a1a1aa', font: { size: 10 }, boxWidth: 10 } },
          tooltip: {
            backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, titleColor: '#e2e8f5', bodyColor: '#a1a1aa',
            callbacks: { label: (c: any) => c.raw === null ? ` ${c.dataset.label}: sin dato (mes en curso)` : ` ${c.dataset.label}: USD ${c.raw}` },
          },
        },
        scales: {
          x: { ticks: { color: '#71717a', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#71717a', font: { size: 10 }, callback: (v: any) => `USD ${v}` }, grid: { color: 'rgba(51,65,85,.5)' } },
        },
      },
    });
    return () => { chartCpInst.current?.destroy(); };
  }, [resumenFiltrado]);
```

- [ ] **Step 4: Agregar los gráficos y la tabla de detalle al JSX**

Justo antes del `</div>` de cierre final del componente (después del bloque de KPI cards de Task 2), agregar:

```tsx
      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Gasto mensual por categoría (USD)</h3>
          <div style={{ height: 260 }}><canvas ref={chartGastoRef} /></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">CPL / CPR / CPO / CPV (USD)</h3>
          <div style={{ height: 260 }}><canvas ref={chartCpRef} /></div>
        </div>
      </div>

      {/* Tabla de detalle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">País</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Proveedor</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Categoría</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Mes</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">USD</th>
              <th className="px-4 py-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider text-right">Local</th>
            </tr>
          </thead>
          <tbody>
            {detalleFiltrado
              .slice()
              .sort((a, b) => b.mes.localeCompare(a.mes) || a.pais.localeCompare(b.pais) || a.proveedor.localeCompare(b.proveedor))
              .map((r, i) => (
                <tr key={`${r.pais}-${r.proveedor}-${r.mes}-${i}`} className="border-t border-slate-800">
                  <td className="px-4 py-2 text-xs text-zinc-300">{r.pais}</td>
                  <td className="px-4 py-2 text-xs text-zinc-300">{r.alias}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{r.categoria}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">{formatMesLabel(r.mes)}</td>
                  <td className="px-4 py-2 text-xs text-zinc-300 text-right">{fmtUsd(r.monto_usd)}</td>
                  <td className="px-4 py-2 text-xs text-zinc-300 text-right">{fmtLocal(r.pais === 'ARG' ? r.monto_ars : r.monto_cop, r.pais)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
```

- [ ] **Step 5: Verificar tipos**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Verificación visual manual**

Con `npm run dev` corriendo y el componente montado (por Task 4, o temporalmente): confirmar que los dos gráficos renderizan sin quedar en blanco, que cambiar el selector de país re-dibuja ambos gráficos y la tabla, y que si hay un mes en curso sin costo, la línea de CPL/CPR/CPO/CPV tiene un hueco en ese punto (no cae a 0).

- [ ] **Step 7: Commit**

```bash
git add src/components/submodules/RiCostosSubmodule.tsx
git commit -m "$(cat <<'EOF'
feat: add cost charts and detail table to RiCostosSubmodule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wiring — registrar el sub-módulo en Riesgos

**Files:**
- Modify: `src/components/LandingPage.tsx:141-154`
- Modify: `src/components/DashboardView.tsx:42` (import) y el bloque de routing de sub-módulos (después de la rama `activeSubmodule.id === 'ri-asistente'`)

**Interfaces:**
- Consumes: `RiCostosSubmodule` (default export de Task 2/3), `id: 'ri-costos'`.

- [ ] **Step 1: Agregar el sub-módulo en `LandingPage.tsx`**

Ubicar el bloque del módulo `risks` (alrededor de la línea 141) y reemplazar:

```ts
    submodules: [
      {
        id: 'ri-analitico',
        title: 'Analítico',
        description: 'Dashboard analítico de cartera y comportamiento crediticio.',
        color: 'bg-slate-700'
      },
      {
        id: 'ri-asistente',
        title: 'Políticas de Riesgo',
        description: 'Políticas de riesgo, documentación y acceso a herramientas del área.',
        color: 'bg-slate-700'
      }
    ]
  },
```

por:

```ts
    submodules: [
      {
        id: 'ri-analitico',
        title: 'Analítico',
        description: 'Dashboard analítico de cartera y comportamiento crediticio.',
        color: 'bg-slate-700'
      },
      {
        id: 'ri-asistente',
        title: 'Políticas de Riesgo',
        description: 'Políticas de riesgo, documentación y acceso a herramientas del área.',
        color: 'bg-slate-700'
      },
      {
        id: 'ri-costos',
        title: 'Costos',
        description: 'Gasto operativo por proveedor/categoría y costo por lead, motor, oferta y venta — Argentina y Colombia.',
        color: 'bg-slate-700'
      }
    ]
  },
```

- [ ] **Step 2: Agregar el import en `DashboardView.tsx`**

Ubicar la línea `import RiAsistenteSubmodule from './submodules/RiAsistenteSubmodule';` (línea 42) y agregar justo debajo:

```ts
import RiCostosSubmodule from './submodules/RiCostosSubmodule';
```

- [ ] **Step 3: Agregar la rama de routing en `DashboardView.tsx`**

Ubicar el bloque de sub-módulos activos (busca `activeSubmodule.id === 'ri-asistente'`) y reemplazar:

```tsx
          ) : activeSubmodule.id === 'ri-asistente' ? (
            <RiAsistenteSubmodule />
          ) : activeSubmodule.id === 'bi-documentacion' ? (
```

por:

```tsx
          ) : activeSubmodule.id === 'ri-asistente' ? (
            <RiAsistenteSubmodule />
          ) : activeSubmodule.id === 'ri-costos' ? (
            <RiCostosSubmodule />
          ) : activeSubmodule.id === 'bi-documentacion' ? (
```

- [ ] **Step 4: Verificar tipos**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Verificación visual manual end-to-end**

Con `npm run dev` corriendo: entrar a Riesgos en el navegador, confirmar que aparece la tarjeta "Costos" junto a "Analítico" y "Políticas de Riesgo", hacer clic y confirmar que carga `RiCostosSubmodule` con datos reales (o el estado de error si Redshift no está configurado localmente).

- [ ] **Step 6: Commit**

```bash
git add src/components/LandingPage.tsx src/components/DashboardView.tsx
git commit -m "$(cat <<'EOF'
feat: wire up Costos submodule under Riesgos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
