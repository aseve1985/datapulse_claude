# Costos: Sub-módulo de Riesgos

## Resumen

Nuevo sub-módulo `ri-costos` ("Costos") dentro del módulo **Riesgos**, junto a "Analítico" y "Políticas de Riesgo". Muestra el gasto operativo mensual del área de Riesgo por proveedor/categoría/país (bureaus de crédito, plataformas de scoring y otros servicios), y lo cruza contra el volumen del funnel de originación (leads, ejecuciones del motor de riesgo, ofertas, ventas) para calcular costo unitario: **CPL** (costo por lead), **CPR** (costo por ejecución del motor de riesgo), **CPO** (costo por oferta) y **CPV** (costo por venta) — todo por mes, en USD y en moneda local.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Fuente de gasto | `platinum_ia.vw_gastos_multipais` (tiene monto real cargado; `gold.gastos_arg` trae todo en 0, no se usa) |
| Fuente de funnel | `auxiliary_tables.funnel_lead_{arg,col}`, `risk_{arg,col}.risk_engine_{arg,col}`, `gold.ventas_{arg,col}` |
| Combinación gasto + funnel | En Node/TypeScript (Enfoque A), no en SQL — la categorización de proveedores vive como lookup en código |
| Moneda de totales combinados AR+CO | Siempre USD (nunca se suma ARS+COP, regla del proyecto) |
| Moneda de totales por país individual | USD + moneda local (ARS para ARG, COP para COL) |
| Mes en curso | Funnel lo incluye; gasto lo excluye (tipo de cambio no cargado todavía) → CPL/CPR/CPO/CPV no se calculan para el mes en curso, se muestra solo el volumen con una nota aclaratoria |
| Cache | In-memory, 1h TTL, + endpoint `/refresh` (mismo patrón que Cartera Fideicomiso / RI-BCRA-Tasas) |
| Export a Excel | Fuera de alcance v1 |

---

## Arquitectura

### Backend (`server.ts`)

**Endpoint:**
```
GET /api/riesgo-costos
GET /api/riesgo-costos/refresh
```

1. Corre en paralelo (vía `redshiftPool`) la **query de gasto** y la **query de funnel** (ambas incluidas abajo, tal cual fueron provistas — no se modifican).
2. Categoriza cada fila de gasto usando la tabla de lookup (proveedor exacto → alias + categoría, ver abajo).
3. Agrupa el gasto por `(pais, mes)` sumando todos los proveedores → `gasto_total_usd`, `gasto_total_ars` (solo ARG), `gasto_total_cop` (solo COL).
4. Cruza `(pais, mes)` contra el funnel y calcula:
   - `cpl_usd = gasto_total_usd / cantidad_leads`, `cpl_local = gasto_total_{ars|cop} / cantidad_leads`
   - `cpr_usd = gasto_total_usd / cantidad_motor`, `cpr_local = ... / cantidad_motor`
   - `cpo_usd = gasto_total_usd / cantidad_ofertas`, `cpo_local = ... / cantidad_ofertas`
   - `cpv_usd = gasto_total_usd / cantidad_ventas_netas`, `cpv_local = ... / cantidad_ventas_netas`
   - Si `gasto_total` no existe para ese `(pais, mes)` (mes en curso), los 4 campos quedan `null` — el frontend los renderiza como "—" con nota, no como `0`.
5. Cache in-memory 1h (`riesgoCostosCache`), invalidable vía `/refresh`.
6. Devuelve: `{ detalleGasto: [...por proveedor/mes/pais], resumenMensual: [...por pais/mes con totales y CPL/CPR/CPO/CPV], cachedAt }`.

**Tabla de categorización (proveedor exacto → alias/categoría):**

| Proveedor (valor exacto en `vw_gastos_multipais`) | Alias | Categoría | País |
|---|---|---|---|
| `SERVICIO INTERACTIVO DE INFORMES SA` | UFLOW | Plataformas | ARG |
| `UFLOW LLC` | UFLOW | Plataformas | COL |
| `LABORATORIO DE INVESTIGACIÓN Y DESARROLLO S.A.` | NOSIS | Bureaus | ARG |
| `PEYPE DATOS ANALYTICS` | PEYPE | Bureaus | ARG |
| `SEON TECHNOLOGIES US INC. (prorrateado)` | SEON | Bureaus | ARG/COL (según columna `pais`) |
| `EXPERIAN COLOMBIA S.A.` | DATACREDITO | Bureaus | COL |
| `ZAJANA SAS` | MAREIGUA | Bureaus | COL |
| `EQUIFAX ARGENTINA S.A.` | VERAZ | Otros | ARG |

### Frontend

**Módulo Riesgos** (`LandingPage.tsx`): agregar a `submodules`:
```ts
{ id: 'ri-costos', title: 'Costos', description: 'Gasto operativo por proveedor/categoría y costo por lead, motor, oferta y venta — Argentina y Colombia.', color: 'bg-slate-700' }
```

**Componente** (`src/components/submodules/RiCostosSubmodule.tsx`):
1. Fetch a `/api/riesgo-costos` al montar (+ botón refresh).
2. Selector de país (AR / CO / Ambos) + rango de meses.
3. **KPI cards**: gasto total del último mes cerrado (USD + local si hay un país seleccionado), variación % vs. mes anterior, CPL/CPR/CPO/CPV del último mes cerrado.
4. **Gráfico de evolución de gasto mensual**, barras apiladas por categoría (Plataformas/Bureaus/Otros).
5. **Gráfico de evolución de CPL/CPR/CPO/CPV**, líneas por métrica.
6. **Tabla de detalle**: país, proveedor (con alias), categoría, mes, monto USD / ARS / COP.
7. Si "Ambos" países está seleccionado, los totales/gráficos de gasto y CPL/CPR/CPO/CPV se muestran solo en USD (nunca ARS+COP sumados); al filtrar a un país específico se puede ver también en moneda local.

**Routing** (`DashboardView.tsx`): agregar `activeSubmodule.id === 'ri-costos'` al bloque de sub-módulos.

---

## Queries SQL (provistas, sin modificar)

### Gasto (`platinum_ia.vw_gastos_multipais` + tipos de cambio)

```sql
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
ORDER BY pais, mes, proveedor;
```

### Funnel (leads / motor / ofertas / ventas)

```sql
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
ORDER BY pais, mes;
```

---

## Manejo de errores

- Si `redshiftPool` es `null` (env vars no configuradas): el endpoint devuelve 503 con mensaje claro (mismo patrón que Cartera Fideicomiso).
- Si alguna de las dos queries falla: 500 con el error logueado; el frontend muestra banner de error + botón "Reintentar".
- Si para un `(pais, mes)` hay funnel pero no gasto (mes en curso, o el mes no tiene gasto cargado todavía): CPL/CPR/CPO/CPV se devuelven `null`, el frontend los renderiza como "—" con un tooltip aclaratorio, nunca como `0` o `Infinity`.

---

## Testing

No hay test suite en el proyecto — validación manual: correr `npm run dev`, comparar los totales y CPL/CPR/CPO/CPV contra correr ambas queries directamente en el warehouse para 2-3 meses conocidos.

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `src/components/submodules/RiCostosSubmodule.tsx` | Crear |
| `src/components/LandingPage.tsx` | Modificar — agregar sub-módulo a Riesgos |
| `src/components/DashboardView.tsx` | Modificar — agregar routing del sub-módulo |
| `server.ts` | Modificar — agregar `/api/riesgo-costos`, `/api/riesgo-costos/refresh`, lookup de categorización, lógica de combinación |

---

## Fuera de alcance

- Export a Excel.
- Costo por consulta granular para proveedores que no sean SEON (no hay tablas de conteo de requests confirmadas para NOSIS/PEYPE/VERAZ/DATACREDITO/MAREIGUA).
- Alertas automáticas por gasto anómalo (se puede agregar en una iteración futura).
