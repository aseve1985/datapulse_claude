# Conversión de renovaciones — Notas para Argentina

**Complemento de** `2026-11-13-conversion-renovadores.md` (spec de Colombia). Este documento no la modifica: registra
qué cambia para Argentina y qué queda pendiente de validar.

| | |
|---|---|
| País | Argentina (ARG) |
| Fuente | Data Warehouse Libgot (Amazon Redshift) |
| Verificado | 13/11/2026, con `svv_columns` y conteos agregados (sin datos de clientes) |
| Implementado | Solo Q1 (consulta maestra), en `server/conversionRenovadoresQuery.ts` → `Q1_ARG` |
| Estado | **Pendiente de validación** con valores de control (§6) |

## 1. Resumen

La Q1 de la spec de COL se reutiliza para ARG con **cinco cambios**: cuatro nombres de tabla y el valor de `status`
del crédito pagado. Las columnas que usa la Q1 existen en ARG con el mismo nombre y el mismo tipo. Las diferencias
de estructura aparecen en Q2–Q5 (§5) y en el plazo de los créditos (§4).

## 2. Tablas equivalentes

| Uso | COL | ARG |
|---|---|---|
| Créditos y número de crédito | `core_col.loans_ranking_col` | `core_arg.loans_ranking_arg` |
| Vínculo crédito → lead de renovación | `core_col.loans_col` | `core_arg.loans_arg` |
| Ofertas por lead | `core_col.lead_offers_col` | `core_arg.lead_offers_arg` |
| Marca de renovación del lead | `core_col.leads_col` | `core_arg.leads_arg` |
| Venta, desembolso y precio | `gold.ventas_col` | `gold.ventas_arg` |

`core_arg.loans_ranking_arg` tiene las mismas 18 columnas que `core_col.loans_ranking_col`, con los mismos nombres
y tipos. Los joins de la spec (§5) se mantienen: `loan_id = id`, `next_lead_id = lead_id`.

**`core_arg.loans_ranking_arg_2`:** tiene la misma estructura y los mismos conteos por status, pero su fecha máxima
de desembolso de créditos con status `TRANSFERED` está un día atrasada respecto de `loans_ranking_arg`. Se usa
`loans_ranking_arg`. **Pendiente:** confirmar qué es `_2` (backup, prueba u otra cosa).

## 3. Valores de `status`

| | Crédito pagado | Otro status (significado a confirmar) |
|---|---|---|
| COL | `CLOSED` | `TRANSFERRED` |
| ARG | **`PAID`** | **`TRANSFERED`** (con una sola R) |

En toda `core_arg.loans_ranking_arg` solo existen `PAID` (162.437) y `TRANSFERED` (106.664); no hay `CLOSED` ni nulos (consulta del 13/11/2026, sin filtro de fechas).

Este es el cambio crítico. Si se usa `status = 'CLOSED'` en ARG, la consulta **no da error: devuelve cero filas**.

Definición de crédito paid para ARG: `status = 'PAID'` y `cuotas_no_cobradas_totales = 0`. Es la misma regla de
COL (§7.1 de la spec). Los `PAID` con cuotas impagas son ~0,3%, igual que en COL.

## 4. Diferencias de negocio que afectan la lectura

**Créditos a varias cuotas.** COL es prácticamente 100% a 1 cuota. En ARG, sobre los `PAID` con fecha de
desembolso en los últimos 24 meses (94.830 créditos):

| Plazo | Créditos | % |
|---|---|---|
| 1 cuota | 90.738 | 95,7% |
| 2 a 12 cuotas | 4.081 | 4,3% |
| 13 o más cuotas | 11 | 0,01% |

La regla §7.2 de la spec (mes = último vencimiento, como proxy de la fecha de pago) se cumple bien a 1 cuota. En
los créditos a varias cuotas (~4,3%), el mes asignado puede quedar varios meses después del pago real.

**Cancelaciones anticipadas.** En esa misma ventana, 762 `PAID` (~0,8%) tienen el último vencimiento en el futuro.
La Q1 filtra por `maximo_vencimiento ≤ hoy − 6`, así que esos créditos entran al reporte recién cuando llega su
último vencimiento.

**Cobertura observada** (12 meses de la Q1, `PAID`, vencimiento ≤ hoy − 6):
- Join con `loans_arg`: sin créditos huérfanos.
- Con `next_lead_id`: 99,9%.
- Con oferta en el lead de renovación: 96–99% por mes.

**Línea de negocio.** En los últimos 12 meses `gold.ventas_arg.negocio` tiene un solo valor (`BARSATEX`), así que
no hace falta filtrar por negocio. Si se suman otras líneas, revisar.

## 5. Diferencias para Q2–Q5 (todavía no implementadas)

| Consulta | Qué cambia en ARG |
|---|---|
| Q2, Q3 | `lead_offers_arg.max_amount` existe igual. `is_manual` es integer (en COL, varchar). No existen `discount` ni `min_amount`; se agrega `accepted`. |
| Q3, Q4 | `gold.ventas_arg` usa **`capital_total`** en lugar de `capital_credito`. |
| Q3, Q4 | TIR: además de `tasa_interes`, ARG tiene `tasa_interes_teorica` y `tasa_interes_teorica_con_cs`. Hay que definir cuál equivale a la "TIR con todos los costos" de COL. |
| Q4 | Las bandas de ticket (200k … 700k) están en COP y no sirven para ARS. Hay que definir bandas propias. |
| Q5 | Falta verificar si `platinum_ia.contexto_cambios_negocio` tiene filas con `pais = 'ARG'`. |
| Todas | Nunca mezclar montos ARS y COP en un mismo total. |

Otros cambios de nombre en `gold.ventas_arg` (no se usan en las consultas): `terms` → `term`;
`fecha_creacion_loan` es `date` (en COL es `timestamp`). `core_arg.leads_arg.is_renovation` es integer (en COL,
varchar).

## 6. Validación pendiente: valores de control

Hace falta que alguien los saque **de forma independiente** y con fecha de extracción. La tolerancia es ±0,2 pp,
igual que en COL.

| Control | Valor esperado |
|---|---|
| Un mes maduro (por ejemplo Ago-26), paso 1º→2º: paid / ofertas / conv 5d | _pendiente_ |
| Un mes reciente (por ejemplo Oct-26), paso 1º→2º, conv 5d | _pendiente_ |
| Total 5d de un período base | _pendiente_ |
| Total 10d / 20d / 30d / 60d del mismo período | _pendiente_ |
| Paso "10º o más", un mes | _pendiente_ |
| Fecha de extracción | _pendiente_ |

## 7. Decisiones pendientes

1. ¿`PAID` + `cuotas_no_cobradas_totales = 0` es el equivalente correcto de "crédito pagado"?
2. ¿Los créditos a varias cuotas (~4,3%) se incluyen con mes = último vencimiento, o se usa otra fecha (por
   ejemplo, la de `core_arg.loan_status_history_arg`)?
3. ¿Qué es `core_arg.loans_ranking_arg_2`?
4. Para Q3/Q4: ¿qué columna es la TIR? ¿Qué bandas de ticket se usan en ARS?
5. ¿Hay una fecha de quiebre base/post propia de ARG?
6. ¿El semáforo de §4.3 aplica a ARG o hace falta definir umbrales propios?
7. ¿Qué significa `TRANSFERED` y esos créditos (~40% de ARG) deberían contarse en la conversión?
