# Carrera de Scores — Sub-módulo de Riesgos

**Date:** 2026-09-08
**Status:** Approved

## Resumen

Nuevo sub-módulo dentro del módulo **Riesgos** que responde una sola pregunta: cada score
propio de Libgot, ¿sigue ordenando el riesgo como prometió en su desarrollo? Muestra, por
país/segmento/score/cepa de desembolso, una grilla de 10 bandas (deciles agrupados en 5
tramos) con volumen y mora a 5/10/30/60/90 días contra la referencia esperada del catálogo.

**La especificación de negocio completa y cerrada vive en**
`C:\Users\aseverino\Desktop\score_propio_renovadores_col\prompt_modulo_carrera_scores.md`
— reglas de elegibilidad, cancelación (regla del 95%), bandeo con cortes fijos, la trampa de
las columnas `mora_*`/`mora_q_*` de `gold.mora_*`, joins por país, etiquetas de tramo, y los
7 chequeos de aceptación. Este documento **no la duplica**: describe cómo se construye en
DataPulse (arquitectura, contrato de datos, archivos). Ante cualquier duda de negocio, el
`.md` original manda.

---

## Decisiones de arquitectura

| Decisión | Elección | Por qué |
|---|---|---|
| Persistencia de la "tabla de hechos" | Query en vivo contra Redshift, cacheada ~24h en memoria del server | Mismo patrón que Marketing/UIF en `server.ts`. Las cepas relevantes son chicas (3.000-5.800 créditos c/u); no hace falta tabla materializada ni job externo para el volumen actual. Se puede migrar a tabla real + job programado (patrón DATAPULSE_SNAPSHOOT) si el volumen crece. |
| Ubicación | Tercer sub-módulo de Riesgos, junto a Analítico y Políticas de Riesgo | El placeholder de `RiAnaliticoSubmodule.tsx` queda como está; esto es una tarjeta nueva. |
| Entrada al módulo | Sin selector de rango de fechas — trae todo al montar | No hay backfill (el dato arranca vacío en ago-sep 2026) y el volumen total es chico. La "fecha" real (cepa de desembolso) es un filtro interno, no un rango a elegir antes de entrar. Mismo patrón que `TesoreriaSubmodule.tsx` (fetch propio en `useEffect` al montar, sin pasar por el flujo genérico de `DashboardView`). |
| Contrato de datos backend→frontend | Filas al grano exacto de la sección 6 del documento: `país·segmento·score_key·cepa·banda·umbral_dias` con sus métricas | No se manda registro-por-crédito (evita ~20k filas y lógica de agregación duplicada en el cliente). El pivoteo a grilla (bandas en filas, umbrales en columnas) es un transform mecánico del lado del cliente sobre un payload ya chico. |
| Catálogo de scores | Se lee de `gold.catalogo_scores_multipais` / `gold.catalogo_scores_bandas_multipais` en cada carga, nunca hardcodeado | Si mañana se agrega un score al catálogo, el módulo lo levanta solo (requisito explícito de la sección 3 del documento). |

## Acceso a datos verificado

Se confirmó acceso de lectura (sin bloqueos de permisos, a diferencia de lo que pasó con
`celu_ahora`) a: `gold.catalogo_scores_multipais`, `gold.catalogo_scores_bandas_multipais`,
`gold.mora_arg`, `gold.mora_col`, `risk_arg.risk_engine_arg`, `risk_col.risk_engine_col`,
`core_arg.loan_installments_arg`, `core_col.loan_installments_col`.

Columnas clave confirmadas:
- `core_{arg,col}.loan_installments_{arg,col}`: `loan_id`, `due_date`, `payment_date`,
  `cancelled`, `amount`, `term` — fuente de `fecha_vencimiento`/`fecha_pago` para el cálculo
  de `dias_mora` de la cuota 1.
- `gold.mora_{arg,col}`: una fila por cuota, incluye `clasificacion_pago_credito`,
  `capital_mas_interes`, `capital_mas_interes_paid` — fuente de la regla de cancelación del
  95% (no está en `core_*`).
- `risk_arg.risk_engine_arg`: sin `loan_id`/`customer_id`; join por `siisa_cuil` (o
  documento). `risk_col.risk_engine_col`: `lead_id` directo (Nuevos) y
  `polrenovadores_lead_id_libgot` (Renovadores).

---

## Arquitectura

### Backend (`server.ts`)

**`GET /api/risk/catalogo-scores`**
- `SELECT * FROM gold.catalogo_scores_multipais` + `SELECT * FROM gold.catalogo_scores_bandas_multipais`.
- Cache en memoria 24h (`catalogoScoresCache`), cambia poco.
- Devuelve `{ scores: [...], bandas: [...] }`.

**`GET /api/risk/carrera-scores`**
- Por cada fila de `gold.catalogo_scores_multipais`, construye dinámicamente (no hardcodea)
  una query parametrizada con sus campos: `tabla_score`, `campo_score`, `campo_error`,
  `centinela_error`, `mas_score_es_mejor`, y los `score_min`/`score_max` de sus bandas.
- Cada query resuelve por crédito (`flag_venta = 1`, cuota 1 como ancla):
  1. La pegada vigente (`executiondate <= fecha_desembolso + 1`, `ROW_NUMBER` último por
     país: `siisa_cuil`/documento en ARG, `lead_id` o `polrenovadores_lead_id_libgot` en COL).
  2. Limpieza del score (`NULLIF(REGEXP_SUBSTR(...), '')`, detección de cadena vacía vs
     centinela vs valor válido) y banda por los cortes fijos del catálogo (nunca `NTILE`).
  3. `dias_mora` con la fórmula del documento (CANCELADA por evidencia de monto, no por
     `fecha_pago`) y elegibilidad por umbral (`fecha_vencimiento_cuota_1 + N <= hoy`).
  4. Agrupa por banda (+ `SIN SCORE` + `ERROR NODO`) × cepa × umbral, calculando
     `q_vendidos`, `capital`, `capital_mas_interes`, `n_elegible`, `n_malos`, `mora_q`, `lift`
     (denominador = la cepa completa en ese mismo umbral) y `mora_q_esperada` (solo en
     umbral 30, del catálogo).
- Cache en memoria 24h (`carreraScoresCache`), sin filtros de fecha en el request.
- Devuelve `{ hechos: [...] }` con una fila por combinación del grano.

### Frontend

**`LandingPage.tsx`** — agregar a `submodules` del módulo `risks`:
```ts
{ id: 'ri-carrera-scores', title: 'Carrera de Scores', description: 'Seguimiento del poder de ordenamiento de los scores propios contra su performance esperada.', color: 'bg-slate-700' }
```

**`src/components/submodules/RiCarreraScoresSubmodule.tsx`** (nuevo, autocontenido):
1. Al montar, `fetch` a ambos endpoints en paralelo.
2. Selectores país/segmento/score/cepa (poblados desde el catálogo — el score disponible
   depende de país+segmento elegidos; ARG Nuevos puede tener 2 scores propios + el clásico
   de BI conviviendo).
3. Pivotea las filas de `hechos` filtradas por la selección actual en la grilla (10 bandas +
   `SIN SCORE` + `ERROR NODO` + `Total`, columnas `Q vendidos`/`Capital`/`K+I`/mora
   5·10·30·60·90 con `%` grande y `n` elegible chico debajo).
4. Indicadores de cabecera: spread observado vs `lift_d1_d10` esperado, inversiones (pares
   consecutivos de tramos al revés, calculado — no leído de un flag), cobertura.
5. Guardas visuales del documento: spread en gris si `n_elegible` por tramo < ~300; celda
   "sin madurar" (gris, no "0%") cuando `n_elegible = 0`; marca visual en cepas anteriores al
   `fecha_shadow` del score.

**`DashboardView.tsx`** — agregar el import y una rama
`activeSubmodule.id === 'ri-carrera-scores' ? <RiCarreraScoresSubmodule /> :` en el bloque de
routing de sub-módulos (mismo lugar que `ri-analitico`/`ri-asistente`).

### Permisos

Sin cambios en `MODULE_MAPPING` — hereda el gate del módulo `risks`. Un usuario con acceso
completo a Riesgos (`allowedSubmodules.risks === 'all'`) ve el sub-módulo automáticamente. Si
en el futuro se restringe por sub-módulo (como Callcenter → `["Operadores de Ventas"]`), la
fila de permisos debe decir exactamente `"Carrera de Scores"` (el `title`, no el `id`).

---

## Fuera de alcance (por ahora)

- Tabla materializada real en Redshift con refresco incremental — se difiere hasta que el
  volumen o la latencia de la query en vivo lo justifiquen.
- Comparación entre scores de distinto país/segmento — explícitamente prohibido por el
  documento de negocio.
- Exportar la grilla a Excel — no pedido; se puede agregar después con el mismo patrón que
  Cartera Fideicomiso si hace falta.

## Testing

Sin suite de tests en el repo. Antes de conectar la UI, correr contra Redshift los 7
chequeos de aceptación de la sección 8 del documento de negocio (reconciliación con
`gold.mora_*` en una cepa madura, monotonía de `n_elegible` y `n_malos` por umbral, fila
`ERROR NODO` en cero, `Total` reconciliado con `gold.ventas_*`, orden correcto del clásico de
BI, ninguna cepa con `n_elegible > 0` en mora-90 sin haber madurado). Después, `npm run lint`
y verificación visual en navegador de la grilla con datos reales.
