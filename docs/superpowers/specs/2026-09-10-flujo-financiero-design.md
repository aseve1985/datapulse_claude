# Flujo Financiero: Sub-módulo de Finanzas

## Resumen

Nuevo sub-módulo dentro del módulo **Finanzas** que reemplaza al dashboard standalone `dashboard_tesoreria.html` / `flujo_financiero.html` (generado hoy por un pipeline Python externo — `build2.py`/`extract_daily.py` — a partir de Google Sheets). El submódulo vive dentro de DataPulse, con datos en vivo en lugar de una foto congelada. Cubre cashflow diario/mensual (AR y CO), detalle de proveedores, ratio originación/cobranza y objetivos de ventas. La **originación real** (hoy cargada a mano en la hoja de cashflow) pasa a leerse del DWH reusando el endpoint `/api/sales-s3` ya existente.

**Cambio de alcance (2026-09-23) respecto a la v1 de este spec:** se elimina por completo el mecanismo de snapshot congelado en S3 (`proy_snap_*.json`, escritura del 2do día hábil). Los valores "proyectado" para comparar contra lo real ahora se leen **de forma estática** desde una pestaña adicional de los mismos Google Sheets — `04. Proyecciones` — tanto para Argentina como para Colombia (antes la comparación proyectada solo existía para Argentina, vía el snapshot). No hay escritura a S3 en ningún punto de este submódulo.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Fuente cashflow/proveedores/objetivos (real) | Google Sheets en vivo (mismas 6 hojas que usa hoy el pipeline Python) |
| Fuente de originación real | Reusar `/api/sales-s3` (parquet `platinum_ia/ventas_multipais/ventas_platinum.parquet`), no una query nueva |
| Fuente de proyecciones (comparación "vs proyectado") | Pestaña `04. Proyecciones`, estática, dentro de los **mismos spreadsheets** de cashflow AR/CO (mismo Sheet ID, distinto gid) — sin persistencia propia, se lee directo en cada request |
| Librería de gráficos | `chart.js` del bundle npm (ya es dependencia del proyecto vía `TesoreriaSubmodule.tsx`), no el CDN que usaba el HTML |
| Encoding | Se corrige el mojibake del HTML original (UTF-8 mal doble-codificado) al portar el texto |
| Filtros de proveedores | Client-side, igual que el HTML original |
| Cache | In-memory con TTL, mismo patrón que Tesorería (+ endpoint `/refresh`) |
| Objetivos diarios de ventas (metas nuevos/renovadores/monto) | Quedan en Sheets — no forman parte de esta migración a DWH |
| Comparación "vs proyectado" | Simétrica AR/CO (antes solo existía para AR) |

---

## Arquitectura

### Backend (`server.ts`)

**Endpoint principal:**
```
GET /api/flujo-financiero
```
- Fetchea en paralelo **8 hojas** (6 de datos reales + 2 de proyecciones, ver mapeo abajo) usando los helpers ya existentes (`fetchRawSheetByGid` / `fetchRawSheetByPartialName`), extendidos para extraer **filas específicas** (no columnas, como hace Tesorería) alineadas contra la fila de fechas (fila 4, columna D en adelante — mismo layout en real y en proyectado).
- Reemplaza la fila de "originaciones" real del sheet de cashflow por la agregación diaria por país desde `/api/sales-s3` (mismo cache de 1h que ya usa el módulo Ventas). Las **originaciones proyectadas** sí se leen directo de `04. Proyecciones` (no hay reemplazo por DWH ahí, no existe un "objetivo real" con el que compararlo).
- Para Colombia, ingresos/egresos financieros reales se leen directo de las filas de **total** (fila 32 y fila 39) — no hace falta el detalle línea por línea (filas 28-31 y 33-38).
- Aplica los mismos filtros de proveedores que hoy hace el build Python: AR excluye `Social Plus S.A.` y solo incluye `aprobacion` en `['Si', 'pendiente']`; CO excluye `aprobacion === 'No'`.
- Cache in-memory, TTL 15 min (mismo orden de magnitud que otros endpoints financieros).
- Devuelve un JSON con la misma forma que las constantes del HTML original, más las series de proyección: `dailyAr`, `monthlyAr`, `proyeccionAr`, `dailyCo`, `monthlyCo`, `proyeccionCo`, `proveedoresAr`, `proveedoresCo`, `ventasAr`, `ventasCo`.

```
GET /api/flujo-financiero/refresh
```
- Invalida el cache in-memory, igual que `/api/tesoreria/refresh`.

**Sin snapshot, sin escritura a S3.** Este endpoint es de solo lectura — no persiste nada entre requests más allá del cache in-memory con TTL.

### Lógica de las 2 filas de KPI (frontend)

El dashboard tiene un selector de período (día / semana / mes) y dos filas de tarjetas con roles distintos — **no redundantes entre sí**:

- **Fila 1 ("Posición del Día" / "Posición de la Semana" / "Totales del Mes"):** valores del **período exacto seleccionado**. Tarjetas: Saldo Inicio, Cobranzas, Originaciones, Proveedores, Impuestos, Saldo Final, Ratio Orig/Cob. Cada tarjeta (salvo Saldo Inicio/Final y Ratio) muestra además el proyectado del **mismo período** (sumando esos mismos días en `04. Proyecciones`) y el delta real vs. proyectado. El Ratio proyectado se calcula (`originaciones_proy / cobranzas_proy` del período), no se lee de una fila propia — no existe fila de proyección para Saldo Inicio/Final ni para el Ratio en sí.
- **Fila 2 ("Resumen - [mes]"):** valores del **mes calendario completo** al que pertenece el período seleccionado, **sin importar el recorte de la Fila 1**. Ej.: si elegís Argentina, vista Semana, y la semana cae en mayo, la Fila 1 muestra esa semana puntual y la Fila 2 muestra mayo entero. Mantiene las mismas **5 tarjetas** que el HTML original — Ventas, Cobranzas, Proveedores, Impuestos, Ratio Orig/Cob — sin Saldo Inicio/Saldo Final (se decidió no agregarlas para no romper la referencia visual con la que el usuario ya está familiarizado). **Cobranzas, Proveedores, Impuestos y Ratio** comparan el real del mes completo contra el proyectado del mes completo (mismo mecanismo de suma de días que la Fila 1, solo cambia el rango). **Ventas es la excepción** — igual que en el HTML original, no compara contra `04. Proyecciones`: muestra la originación real del mes + el objetivo de ventas (Sheet "Objetivos diarios", nuevos/renovadores/monto), sin línea de "vs proyectado".
- Ambas filas usan **el mismo mecanismo de agregación** (sumar N días de la hoja real y N días de la hoja de proyecciones para el rango correspondiente) — la única diferencia es qué rango de fechas le pasás.
- Este comportamiento es ahora **idéntico para AR y CO** (en el HTML original la comparación proyectada de la Fila 1 solo existía para Argentina).

### Frontend

**Módulo Finanzas** (`LandingPage.tsx`): agregar a `submodules`:
```ts
{ id: 'flujo-financiero', title: 'Flujo Financiero', description: 'Cashflow diario/mensual, proveedores y ratio originación/cobranza — Argentina y Colombia.', color: 'bg-slate-800' }
```

**Componente** (`src/components/submodules/FlujoFinancieroSubmodule.tsx`): port a React del HTML original —
1. Fetch a `/api/flujo-financiero` al montar (+ botón refresh).
2. Mismo estado (país AR/CO, mes, vista mes/semana/día) manejado con `useState`, sin DOM manual (`document.getElementById`) — todo vía JSX/estado React.
3. Mismas secciones: las 2 filas de KPI (ver lógica arriba), tarjetas mensuales (incluida "Ventas" con originación real + objetivo), "Otros rubros" colapsable, gráfico de ratio (Chart.js vía `react-chartjs-2` o uso directo como en `TesoreriaSubmodule.tsx`), tabla de proveedores con filtros.
4. Misma paleta de colores y semáforo de ratio (AR: verde <62%, amarillo 62–64%, rojo ≥65% · CO: verde ≤66%, amarillo 67–68%, rojo ≥69%).

**Routing** (`DashboardView.tsx`): agregar `activeSubmodule.id === 'flujo-financiero'` al bloque de sub-módulos, pasando `userEmail` igual que `TesoreriaSubmodule` (mismo patrón, uso solo para logging — el control de acceso al módulo ya ocurre antes, a nivel de permisos de "Finanzas").

---

## Fuentes de datos (Google Sheets)

### Datos reales

| Dato | Sheet ID | Pestaña | Detalle |
|---|---|---|---|
| Cashflow AR | `1FPFod-4AEAZ6L7Qn622PyrDhXG-mROkQdbzadZUq2sM` | `01. Proy 2026` | Fila 4 = fechas; filas 5,11,12*,13,15,16,17,21,22,24,29,40 → saldoInicio/cobranzas/originaciones*/proveedores/impuestos/sueldos/gastosBanc/caucion/recuperoColombia/prestamos/devCaucion/saldoFinal. *Originaciones se reemplaza por `/api/sales-s3`. |
| Proveedores AR | `1yBWR2FRISRXPxGx2mvWeL_9Jt6MCOpeFJzeEemavAak` | `Fc pendientes de pago` | Cols A/B/C/D/G/I/J/P → sociedad/detalle/mes/diaPago/vencimiento/nombre/importe/aprobacion |
| Objetivos ventas AR | `1iMbRbXEHmT7eErcV5QdJhU5jIXke09Ugmun2tw0lZt4` | `Objetivos diarios` | Cols A/B/D/E/F → fecha/semana/nuevos/renovadores/monto |
| Cashflow CO | `1h979gF1KFAnuJbLd4Bz1OFTaJvTj8sLS6kQRcbj92c0` | `01. Proyeccion 2026` | Fila 4 = fechas; filas 5,18,19*,20,21,22,23,24,32,39,41,43 → saldoInicio/cobranzas/originaciones*/proveedores/tarjetas/impuestos/sueldos/gastosBanc/totalIngFin(fila 32, total del rango 28-31)/totalEgrFin(fila 39, total del rango 33-38)/freeCashflowFin/saldoFinal. |
| Proveedores CO | `1d2iPVtFwFH2DippOHPyUnYR0H3o-cZ7E` | `Liq. de pagos` | Cols B/C/D/E/H/I/J/O → sociedad/detalle/mes/diaPago/vencimiento/nombre/importe/aprobacion |
| Objetivos ventas CO | `1WT2gdVmWI5HzlvR3-01Iom55CYGChvCOlgEMLGR3Hjs` | `Objetivos diarios` | Misma estructura que AR |

### Proyecciones (estáticas, para comparación "vs proyectado")

| Dato | Sheet ID | Pestaña | Detalle |
|---|---|---|---|
| Proyecciones AR | `1FPFod-4AEAZ6L7Qn622PyrDhXG-mROkQdbzadZUq2sM` (mismo spreadsheet que cashflow AR) | `04. Proyecciones` | Fila 4 = fechas (col D en adelante, mismo layout que la hoja de reales); fila 11 = cobranzas, fila 12 = ventas/originaciones, fila 13 = proveedores, fila 15 = impuestos. Sin fila de saldoInicio/saldoFinal ni de ratio — el ratio proyectado se calcula. |
| Proyecciones CO | `1h979gF1KFAnuJbLd4Bz1OFTaJvTj8sLS6kQRcbj92c0` (mismo spreadsheet que cashflow CO) | `04. Proyecciones` | Fila 4 = fechas; fila 18 = cobranzas, fila 19 = ventas/originaciones, fila 20 = proveedores, fila 22 = impuestos. Mismas ausencias que AR (sin saldoInicio/Final/ratio propios). |

Todo — real y proyectado, ambos países — es **a nivel diario**; las agregaciones de semana/mes/año se hacen en el momento sumando los días del rango correspondiente, tanto para armar la Fila 1 como la Fila 2 del dashboard.

---

## Manejo de errores

- Si falla el fetch de alguna hoja (real o proyección): esa sección muestra banner de error + botón "Reintentar" (patrón ya usado en Tesorería), sin tumbar el resto del dashboard.
- Si falla específicamente el fetch de `04. Proyecciones` para un país: las tarjetas de ese país siguen mostrando el valor real, pero omiten la comparación "vs proyectado" (sin bloquear el dashboard).
- Si falla `/api/sales-s3`: la card de "Ventas" marca la originación real como "no disponible" en vez de bloquear todo el submódulo.

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `src/components/submodules/FlujoFinancieroSubmodule.tsx` | Crear |
| `src/components/LandingPage.tsx` | Modificar — agregar sub-módulo a Finanzas |
| `src/components/DashboardView.tsx` | Modificar — agregar routing del sub-módulo |
| `server.ts` | Modificar — agregar `/api/flujo-financiero`, `/api/flujo-financiero/refresh`, lógica de fetch por fila (real + proyecciones) |

---

## Fuera de alcance

- Migrar los objetivos diarios de ventas (metas) al DWH — quedan en Sheets.
- Deprecar el pipeline Python (`build2.py`/`extract_daily.py`) — puede seguir corriendo en paralelo hasta confirmar que el submódulo nuevo es confiable; no se toca en esta iteración.
- El registro `"nombre":"Claude"` en `PROVEEDORES` (Barsatex, abril 2026, $7.300.000) no se filtra en código — si es un error de carga corresponde corregirlo en la Sheet.
- Excel/export de este submódulo (no estaba en el HTML original; se puede agregar en una iteración futura si se pide).
- Editar valores de `04. Proyecciones` desde la app — es de solo lectura, la edición de proyecciones sigue siendo manual en la Sheet.
