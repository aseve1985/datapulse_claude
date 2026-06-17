# Cartera ARG – Fideicomiso: Sub-módulo de Finanzas

## Resumen

Nuevo sub-módulo dentro del módulo **Finanzas** que visualiza la cartera del fideicomiso argentino y permite exportar un Excel completo con formato. La data proviene de la tabla `finance_arg.cartera_fideicomiso_sumarizada_arg` en Redshift.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Layout UI | Option A: una sola página con scroll vertical |
| Período mostrado en UI | Último período disponible (auto-seleccionado) |
| Gráficos en UI | Los 5 del Python (recharts) |
| Excel export | Bien formateado, sin gráficos embebidos, todos los períodos |
| Generación Excel | ExcelJS server-side |
| Cache | 1 hora en memoria (igual que otros endpoints) |

---

## Arquitectura

### Backend (`server.ts`)

**Endpoint de datos:**
```
GET /api/cartera-fideicomiso
```
- Ejecuta la query SQL contra Redshift usando el `redshiftPool` existente.
- Cache de 1 hora en memoria (`carteraFideicomisoCache`).
- Devuelve todos los registros: `{ records: [...], cachedAt: ISO }`.
- Query: `SELECT * FROM finance_arg.cartera_fideicomiso_sumarizada_arg ORDER BY periodo DESC, fecha_desembolso_periodo ASC, tipo_cliente ASC`

**Endpoint de exportación:**
```
GET /api/cartera-fideicomiso/export
```
- Reutiliza el mismo cache de datos.
- Genera el Excel en memoria con ExcelJS y lo devuelve con header `Content-Disposition: attachment`.
- MIME: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

### Frontend

**Módulo Finanzas** (`LandingPage.tsx`): agregar `submodules` array con un ítem:
```ts
{ id: 'cartera-fideicomiso-arg', label: 'Cartera ARG – Fideicomiso', icon: Building2 }
```

**Componente** (`src/components/submodules/CarteraFideicomisoSubmodule.tsx`): componente React auto-contenido que:
1. Hace fetch a `/api/cartera-fideicomiso` al montarse.
2. Calcula el período foto (último período con más de un registro).
3. Renderiza el layout.
4. Disparar descarga vía `window.location` a `/api/cartera-fideicomiso/export`.

**Routing** (`DashboardView.tsx`): agregar `activeSubmodule.id === 'cartera-fideicomiso-arg'` al bloque de sub-módulos.

---

## UI – Layout (Option A)

```
┌──────────────────────────────────────────────────────────────────┐
│ Cartera ARG · Fideicomiso    Período foto: 2026-04  [⬇ Excel]   │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ K Originado │ K Pago Total│ K Precancel.│ Saldo Vig.  │%Pg/Orig │
├─────────────┴─────────────┴─────────────┴─────────────┴─────────┤
│ [Donut: Distribución Saldo por Bucket]  [Bar: Orig vs Saldo]    │
├──────────────────────────────────────────────────────────────────┤
│ [Stacked Bar: Composición del Saldo por Cosecha]                 │
├──────────────────────────────────────────────────────────────────┤
│ [Line: % Mora 1+ sobre Originado por Cosecha]                    │
├──────────────────────────────────────────────────────────────────┤
│ [Bar: Evolución Mensual de Originación]                          │
├──────────────────────────────────────────────────────────────────┤
│ Tabla: todas las cosechas del período foto (scroll horizontal)   │
│ Cosecha · Tipo · K Orig · K Saldo · %Cur · %Mora1+ · %Mora>90  │
└──────────────────────────────────────────────────────────────────┘
```

### KPI Cards (6 cards)
| Card | Valor | Color acento |
|---|---|---|
| K Originado Hist. | `$XXXm` | amber |
| K Pago Total | `$XXXm` | green |
| K Precancelado | `$XXXm` | blue |
| Saldo Vigente | `$XXXm` | teal |
| % Pagado/Orig | `XX.X%` | navy |
| % Saldo/Orig | `XX.X%` | navy |

### Gráficos (recharts)
1. **Donut** — `PieChart` con `innerRadius`. Leyenda a la derecha con `$XM` por bucket.
2. **Clustered Bar** — `BarChart` con dos `Bar` (Originado azul, Saldo teal). Top 15 cosechas.
3. **Stacked Bar** — `BarChart` con 4 `Bar` apiladas (Current / 1-30d / 31-90d / +90d), eje Y en %.
4. **Line** — `LineChart` con `Area` fill, eje Y en %. % Mora 1+ = (saldo - current) / originado.
5. **Bar** — `BarChart` simple de originación mensual.

Los 5 gráficos usan la misma paleta que el Python: verde (`#22C55E`), amarillo (`#F59E0B`), naranja (`#F97316`), rojo (`#DC2626`), azul (`#1F4E78`), teal (`#13A8A8`).

### Tabla de cosechas
- Columnas: `fecha_desembolso_periodo`, `tipo_cliente`, `k_originado`, `k_saldo_total`, `a_current`, `b_bucket_1_30`, `c_bucket_31_60`, `d_bucket_61_90`, `e_bucket_91_120`, `f_bucket_mas_120`, `%_current`, `%_mora_1+`, `%_mora_gt90`.
- Columnas de monto en formato `$X,XXX,XXX`.
- Columnas de % con 1 decimal.
- Scroll horizontal sincronizado (mismo patrón que BuscadorPagosSubmodule).

---

## Excel exportado (ExcelJS)

### Hoja "Insights Cartera" (período foto)
1. **Header** — título con fondo navy, fecha de generación.
2. **6 KPI cards** — dos filas: label con fondo de color + valor en grande.
3. **Tabla Distribución de Buckets** — columnas: Bucket / Saldo ($M) / % sobre Saldo / % sobre Originado. Fila TOTAL con fondo navy.
4. **Indicadores de Calidad** — filas con fondo de color según semáforo (verde/amarillo/rojo): % Current, % Mora 1+, % Mora <90d, % Mora >90d, % Mora +120d.
5. **Top 5 Cosechas por Saldo Vigente** — tabla con 6 columnas, encabezados con fondo según sección.
6. **Top 3 Cosechas con Mayor Bucket +120d** — tabla con fondo rojo claro.

### Hojas por período histórico (ej: `2026-04`, `2026-03`, ...)
Cada hoja tiene 3 tablas apiladas con 3 filas de separación entre ellas:
- **TOTAL CARTERA** (suma NUEVO + RENOVADOR por cosecha) — fondo title navy `#0B2545`
- **NEGOCIO NUEVO** — fondo title azul `#1F4E78`
- **NEGOCIO RENOVADOR** — fondo title teal `#13A8A8`

Cada tabla incluye:
- Columnas de montos (`#,##0`) + columnas `%_` sobre K Originado (`0.00%`)
- Columnas `%_mora_lt90` y `%_mora_gt90` con fondo naranja claro / rojo claro
- Fila TOTAL con fondo navy y texto blanco

### Dependencia
`exceljs` — agregar a `package.json`. No reemplaza `xlsx` (que sigue usándose en otros módulos).

---

## Manejo de errores

- Si `redshiftPool` es null (env vars no configuradas): el endpoint devuelve 503 con mensaje claro.
- Si la query falla: 500 con el error logueado.
- En el frontend: banner de error con icono + mensaje, botón "Reintentar".
- Si no hay datos: estado vacío con mensaje descriptivo.

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `src/components/submodules/CarteraFideicomisoSubmodule.tsx` | Crear |
| `src/components/LandingPage.tsx` | Modificar — agregar sub-módulos a Finanzas |
| `src/components/DashboardView.tsx` | Modificar — agregar routing del sub-módulo |
| `server.ts` | Modificar — agregar 2 endpoints |
| `package.json` | Modificar — agregar `exceljs` |

---

## Fuera de alcance

- Selección de período en la UI (siempre muestra el último).
- Gráficos embebidos en el Excel.
- Filtros en la tabla web.
- Otros sub-módulos de Finanzas (se agregarán en iteraciones futuras).
