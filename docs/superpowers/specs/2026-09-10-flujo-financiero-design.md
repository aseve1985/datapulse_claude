# Flujo Financiero: Sub-módulo de Finanzas

## Resumen

Nuevo sub-módulo dentro del módulo **Finanzas** que reemplaza al dashboard standalone `dashboard_tesoreria.html` (generado hoy por un pipeline Python externo — `build2.py`/`extract_daily.py` — a partir de Google Sheets). El submódulo vive dentro de DataPulse, con datos en vivo en lugar de una foto congelada. Cubre cashflow diario/mensual (AR y CO), detalle de proveedores, ratio originación/cobranza y objetivos de ventas. La **originación real** (hoy cargada a mano en la hoja de cashflow) pasa a leerse del DWH reusando el endpoint `/api/sales-s3` ya existente.

---

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Fuente cashflow/proveedores/objetivos | Google Sheets en vivo (mismas 6 hojas que usa hoy el pipeline Python) |
| Fuente de originación real | Reusar `/api/sales-s3` (parquet `platinum_ia/ventas_multipais/ventas_platinum.parquet`), no una query nueva |
| Persistencia del snapshot proyectado | S3, bucket `data-lake-libgot-externos`, prefijo `datapulse_app/flujo_financiero/` (namespace propio de la app, separado de `platinum_ia/` que es de pipelines externos) |
| Librería de gráficos | `chart.js` del bundle npm (ya es dependencia del proyecto vía `TesoreriaSubmodule.tsx`), no el CDN que usaba el HTML |
| Encoding | Se corrige el mojibake del HTML original (UTF-8 mal doble-codificado) al portar el texto |
| Filtros de proveedores | Client-side, igual que el HTML original |
| Cache | In-memory con TTL, mismo patrón que Tesorería (+ endpoint `/refresh`) |
| Objetivos diarios de ventas (metas nuevos/renovadores/monto) | Quedan en Sheets — no forman parte de esta migración a DWH |

---

## Arquitectura

### Backend (`server.ts`)

**Endpoint principal:**
```
GET /api/flujo-financiero
```
- Fetchea en paralelo las 6 hojas (ver mapeo abajo) usando los helpers ya existentes (`fetchRawSheetByGid` / `fetchRawSheetByPartialName`), extendidos para extraer **filas específicas** (no columnas, como hace Tesorería) alineadas contra la fila de fechas.
- Reemplaza la fila de "originaciones" del sheet de cashflow por la agregación diaria por país desde `/api/sales-s3` (mismo cache de 1h que ya usa el módulo Ventas).
- Aplica los mismos filtros de proveedores que hoy hace el build Python: AR excluye `Social Plus S.A.` y solo incluye `aprobacion` en `['Si', 'pendiente']`; CO excluye `aprobacion === 'No'`.
- Cache in-memory, TTL 15 min (mismo orden de magnitud que otros endpoints financieros).
- Devuelve un JSON con la misma forma que las constantes del HTML original (`dailyAr`, `monthlyAr`, `dailyCo`, `monthlyCo`, `proveedoresAr`, `proveedoresCo`, `ventasAr`, `ventasCo`) para minimizar el riesgo al portar la lógica de render.

```
GET /api/flujo-financiero/refresh
```
- Invalida el cache in-memory, igual que `/api/tesoreria/refresh`.

**Snapshot proyectado (freeze del 2do día hábil):**
- Al servir `/api/flujo-financiero`, si hoy es el 2do día hábil del mes (lunes–viernes, sin calendario de feriados en v1) y todavía no existe un snapshot para `{país}-{año-mes}` en S3, el servidor captura los valores vivos de ese momento para el mes en curso y los escribe a:
  - `s3://data-lake-libgot-externos/datapulse_app/flujo_financiero/proy_snap_AR_<YYYY-MM>.json`
  - `s3://data-lake-libgot-externos/datapulse_app/flujo_financiero/proy_snap_CO_<YYYY-MM>.json`
- Esta es la **primera escritura a S3** que hace la app (hoy solo lee) — se usa `PutObjectCommand` del mismo `S3Client` ya importado.
- Si existe un snapshot para el mes activo, se lee y se mezcla con los datos vivos para calcular los deltas "real vs. proyectado" en las tarjetas KPI (misma lógica que `PROY_SNAP` en el HTML original).

### Frontend

**Módulo Finanzas** (`LandingPage.tsx`): agregar a `submodules`:
```ts
{ id: 'flujo-financiero', title: 'Flujo Financiero', description: 'Cashflow diario/mensual, proveedores y ratio originación/cobranza — Argentina y Colombia.', color: 'bg-slate-800' }
```

**Componente** (`src/components/submodules/FlujoFinancieroSubmodule.tsx`): port a React del HTML original —
1. Fetch a `/api/flujo-financiero` al montar (+ botón refresh).
2. Mismo estado (país AR/CO, mes, vista mes/semana/día) manejado con `useState`, sin DOM manual (`document.getElementById`) — todo vía JSX/estado React.
3. Mismas secciones: tiras de KPI, tarjetas mensuales (incluida "Ventas" con originación real + objetivo), "Otros rubros" colapsable, gráfico de ratio (Chart.js vía `react-chartjs-2` o uso directo como en `TesoreriaSubmodule.tsx`), tabla de proveedores con filtros.
4. Misma paleta de colores y semáforo de ratio (AR: verde <62%, amarillo 62–64%, rojo ≥65% · CO: verde ≤66%, amarillo 67–68%, rojo ≥69%).

**Routing** (`DashboardView.tsx`): agregar `activeSubmodule.id === 'flujo-financiero'` al bloque de sub-módulos, pasando `userEmail` igual que `TesoreriaSubmodule` (mismo patrón, uso solo para logging — el control de acceso al módulo ya ocurre antes, a nivel de permisos de "Finanzas").

---

## Fuentes de datos (Google Sheets)

| Dato | Sheet ID | Pestaña | Detalle |
|---|---|---|---|
| Cashflow AR | `1FPFod-4AEAZ6L7Qn622PyrDhXG-mROkQdbzadZUq2sM` | `01. Proy 2026` | Fila 4 = fechas; filas 5,11,12*,13,15,16,17,21,22,24,29,40 → saldoInicio/cobranzas/originaciones*/proveedores/impuestos/sueldos/gastosBanc/caucion/recuperoColombia/prestamos/devCaucion/saldoFinal. *Originaciones se reemplaza por `/api/sales-s3`. |
| Proveedores AR | `1yBWR2FRISRXPxGx2mvWeL_9Jt6MCOpeFJzeEemavAak` | `Fc pendientes de pago` | Cols A/B/C/D/G/I/J/P → sociedad/detalle/mes/diaPago/vencimiento/nombre/importe/aprobacion |
| Objetivos ventas AR | `1iMbRbXEHmT7eErcV5QdJhU5jIXke09Ugmun2tw0lZt4` | `Objetivos diarios` | Cols A/B/D/E/F → fecha/semana/nuevos/renovadores/monto |
| Cashflow CO | `1h979gF1KFAnuJbLd4Bz1OFTaJvTj8sLS6kQRcbj92c0` | `01. Proyeccion 2026` | Fila 4 = fechas; filas 5,18,19*,20,21,22,23,24,28-32,33-39,41,43 → saldoInicio/cobranzas/originaciones*/proveedores/tarjetas/impuestos/sueldos/gastosBanc/totalIngFin/totalEgrFin/freeCashflowFin/saldoFinal |
| Proveedores CO | `1d2iPVtFwFH2DippOHPyUnYR0H3o-cZ7E` | `Liq. de pagos` | Cols B/C/D/E/H/I/J/O → sociedad/detalle/mes/diaPago/vencimiento/nombre/importe/aprobacion |
| Objetivos ventas CO | `1WT2gdVmWI5HzlvR3-01Iom55CYGChvCOlgEMLGR3Hjs` | `Objetivos diarios` | Misma estructura que AR |

---

## Manejo de errores

- Si falla el fetch de alguna hoja: esa sección muestra banner de error + botón "Reintentar" (patrón ya usado en Tesorería), sin tumbar el resto del dashboard.
- Si falla `/api/sales-s3`: la card de "Ventas" marca la originación real como "no disponible" en vez de bloquear todo el submódulo.
- Si falla la escritura del snapshot a S3 (permisos, red): se loguea el error pero no bloquea la respuesta del endpoint — simplemente ese mes no tendrá freeze hasta el próximo intento.

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `src/components/submodules/FlujoFinancieroSubmodule.tsx` | Crear |
| `src/components/LandingPage.tsx` | Modificar — agregar sub-módulo a Finanzas |
| `src/components/DashboardView.tsx` | Modificar — agregar routing del sub-módulo |
| `server.ts` | Modificar — agregar `/api/flujo-financiero`, `/api/flujo-financiero/refresh`, lógica de fetch por fila, escritura de snapshot a S3 |

---

## Fuera de alcance

- Calendario de feriados argentinos/colombianos para el cálculo de "2do día hábil" (v1 usa lunes–viernes simple).
- Migrar los objetivos diarios de ventas (metas) al DWH — quedan en Sheets.
- Deprecar el pipeline Python (`build2.py`/`extract_daily.py`) — puede seguir corriendo en paralelo hasta confirmar que el submódulo nuevo es confiable; no se toca en esta iteración.
- El registro `"nombre":"Claude"` en `PROVEEDORES` (Barsatex, abril 2026, $7.300.000) no se filtra en código — si es un error de carga corresponde corregirlo en la Sheet.
- Excel/export de este submódulo (no estaba en el HTML original; se puede agregar en una iteración futura si se pide).
