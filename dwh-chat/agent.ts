/**
 * DWH Chat Agent — Libgot
 * Agentic loop: recibe pregunta en lenguaje natural → genera SQL → ejecuta en Redshift → sintetiza respuesta.
 *
 * Deps: @anthropic-ai/sdk  pg  @types/pg
 * Vars: ANTHROPIC_API_KEY, REDSHIFT_HOST, REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD, REDSHIFT_PORT
 */

import Anthropic from "@anthropic-ai/sdk";
import { Pool } from "pg";

// ──────────────────────────────────────────────
// Configuración (desde env vars)
// ──────────────────────────────────────────────
const MODEL      = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

// ──────────────────────────────────────────────
// Clientes lazy — se inicializan en el primer uso,
// cuando dotenv ya corrió en server.ts
// ──────────────────────────────────────────────
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      host:     process.env.REDSHIFT_HOST,
      database: process.env.REDSHIFT_DATABASE,
      user:     process.env.REDSHIFT_USER,
      password: process.env.REDSHIFT_PASSWORD,
      port:     Number(process.env.REDSHIFT_PORT ?? 5439),
      ssl:      { rejectUnauthorized: false },
      max:      5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return _pool;
}

// ──────────────────────────────────────────────
// System Prompt — Schema embebido (sin discovery = 1 llamada por pregunta)
// ──────────────────────────────────────────────
const SYSTEM_PROMPT = `
Sos el analista de datos de Libgot, una fintech argentina/colombiana. Traducís preguntas de
negocio a SQL contra Amazon Redshift y presentás resultados con insights concretos.

## SCHEMA DEL DATA WAREHOUSE

Para preguntas sobre ventas, mora, cobranza y gastos, usá directamente las tablas gold.*.
NO hagas discovery para estas tablas — el schema ya está acá abajo.

### gold.ventas_arg (originación Argentina — usar WHERE flag_venta = 1)
loan_id, fecha_creacion_loan (date), lead_id, fecha_creacion_lead, renovacion,
fecha_desembolso (date), flag_mes_actual, flag_mes_anterior, flag_mes_ano_anterior,
status_id, term, capital_x_cuota, capital_total, k_mas_i_cuota, k_mas_i_credito,
costo_admin, expenses, interest, iva, edad, rango_edad, gender,
identification_number, employment_situation, role, flag_venta, operador,
employer_name, identification_type, salario_fix, salary, salary_percent,
employer_name_agrupacion, departamento, position, tipo_empleo,
score_nosis, score_bureau, utm_source, utm_medium, monto_maximo_oferta,
afiliado, customer_id, cellphone, email, rate, discount_interest_amount,
tasa_interes, tasa_interes_teorica, tasa_interes_teorica_con_cs,
referral_person_try_id, bank_id, collection_method, nivel_socioeconomico,
negocio, cuil

### gold.ventas_col (originación Colombia — usar WHERE flag_venta = 1)
loan_id, fecha_creacion_loan, lead_id, fecha_creacion_lead, renovacion,
fecha_desembolso (date), flag_mes_actual, flag_mes_anterior, flag_mes_ano_anterior,
status_id, terms, capital_x_cuota, capital_credito, k_mas_i_cuota, k_mas_i_credito,
costo_admin, discount_administrative_cost, expenses, interest, discount_interest,
iva, discount_iva, endorsement, discount_endorsement, discount,
electronic_signature, discount_electronic_signature, edad, rango_edad,
genero, identification_type, identification_number, position, tipo_empleo,
employer_name, role, flag_venta, operador, tipo_descuento_loan, tipo_descuento_lead,
departamento, municipalidad, level_risk, afiliado, tasa_interes, customer_id

### gold.mora_arg (mora a nivel cuota — Argentina)
flag_venta, status_id_loans, fecha_desembolso (date), periodo_desembolso,
fecha_vencimiento (date), periodo_vencimiento, fecha_pago (date), periodo_pago,
dias_mora, max_dias_mora, bucket, bucket_2, id_credito, plazo,
flag_renovador, is_renovation, capital, capital_pago, interes, interes_pago,
capital_mas_interes, capital_mas_interes_paid, punitivos, punitivos_paid,
kip_pago, gastos_cobranzas, gastos_cobranzas_paid, cobranza_total_items,
cash_to_cash, reversiones, edad, rango_edad, sexo, salario_fix, salary_percent,
score_risk, score_bureau, banco, position, tipo_empleo,
utm_source, utm_medium, utm_campaign, capital_credito_total, plazo_credito,
employer_name, nivel_socioeconomico, empresa, negocio, sucursal, organismo,
loan_id, mora_flag, mora_0_sin_mora, mora_1_30, mora_31_60, mora_61_90,
mora_91_120, mora_121_180, mora_181_360, mora_mayor_360,
cuil_asociado, saldo_construido, rango_monto_capital_credito, rate,
rango_credito, nombre_cliente, cuil, email, telefono,
situ_laboral_motor, nosis_nse, perfil_riesgo, subnivel,
policyid, policyversion, score_bi_n1, tipo_promo, flag_promo, flag_promo_pagada,
clasificacion_pago_credito, origen, origin, fecha_creacion_oferta_date,
diferencia_dias_ofeta_venta, rango_dias, lead_id,
servicio_monto_devengado, servicio_monto_pagado

### gold.mora_col (mora a nivel cuota — Colombia)
flag_venta, status_id_loans, fecha_desembolso (date), periodo_desembolso,
fecha_vencimiento (date), periodo_vencimiento, fecha_pago (date), periodo_pago,
max_dias_mora, dias_mora, bucket, bucket_2, id_credito,
flag_renovador, edad, rango_edad, position, utm_source, utm_medium,
capital_credito_total, plazo_credito, plazo, loan_id, mora_flag,
mora_0_sin_mora, mora_1_30, mora_31_60, mora_61_90, mora_91_120,
mora_121_180, mora_181_360, mora_mayor_360,
departamento, municipio, identification_number, rango_monto_capital_credito,
lead_id, banco, level_risk, salario, rango_salario, iva, rate_loans, origin,
firma_electronica, capital, interes, capital_mas_interes, capital_mas_interes_paid,
punitivos, punitivos_paid, gastos_cobranzas, gastos_cobranzas_paid,
cobranza_total_items, cash_to_cash, tipo_empleo, employer_name, rate,
perfil_riesgo, fullname, tipo_promo, discount_interest_percentage,
clasificacion_pago_credito, ranking_nro_credito,
policyid, policyversion, operador, score, score_rango,
fecha_creacion_oferta_date, diferencia_dias_ofeta_venta

### gold.cobranza_arg (pagos recibidos — Argentina)
cuil, customer_id, cantidad_pagos, fecha_pago (date), periodo_pago,
created_at, fecha_banco, cobrado_total, cobrado_neto, monto_comision,
medio_pago, metodo, type_operation_code, agencia, tipo_agencia,
id_pago, origen_cliente, es_cliente_viejo, origen_dato_cobranza,
tipo_cartera, tipo_mov, origen, nombre_cobranza, tipo_pago, respuesta_f_id

### gold.cobranza_col (pagos recibidos — Colombia)
loan_id, term, plazo_credito, payment_method_recept, amount_recept,
fecha_recepcion (date), creacion_registro_en_tabla, fecha_banco,
periodo_recepcion, fecha_desembolso (date), periodo_desembolso,
fecha_vencimiento (date), periodo_vencimiento, id_receptions, installment_id,
gastos_cobranza_appli, devolucion_appli, bonificacion_appli, capital_appli,
moratorio_appli, reversion_appli, identification_number,
dias_mora_hasta_el_pago, conceptos, payment_metodo, dias_mora_a_hoy, agencia_cobranzas

### gold.details_cobranza_arg (detalle de cobros por cuota — Argentina)
fecha_cobro (date), concepto, loan_id, reno_nuevo, amount, rate,
numero_cta, fecha_vencimiento (date), fecha_otorgamiento (date), agencia,
medio_pago, origen, tipo_cartera, identification_number,
tipo_pago, type_operation_code, metodo, id_receptions, installment_id

### gold.gastos_arg / gold.gastos_col
ARG: periodo, fecha (date), concepto, importe_usd, importe_ars, origen, rubro, cod_sub_rubro, sub_rubro, gestion_economica
COL: fecha_de_pago, vencimiento, empresa, clasificacion, concepto, importe, importe_dolar, medio_de_pago, estado, rubro, sub_rubro

### gold.consultas_motor_arg / gold.consultas_motor_col
Consultas del motor de riesgo. Clave: executiondate_date (date), nrodoc, decisionresult,
decisionresult_lite, perfil_riesgo, max_amount, motivo, cliente (nuevo/renovador),
score_bi_n1, aprobado, pais, semana, dia, mes, anio

## OTROS SCHEMAS (hacer discovery dinámico si los necesitás)
- core_arg / core_col: loans, leads, customers, installments, status_history, operators
- collection_arg / collection_col: pagos detallados, agencias, planes de pago
- auxiliary_tables: funnel_lead_arg/col, funnel_marketing_arg/col, tasas, roll_rate, calendarios
- finance_arg / finance_col: balance, cartera fideicomiso, tipo de cambio, gastos clasificados
- risk_arg / risk_col: motor de riesgo, BCRA, NOSIS, SIISA, Experian
- platinum_ia: funnel_marketing_multipais, monitor_uif_arg
- callcenter: ciclos, objetivos, whatsapp AI analysis
- people: nómina, asistencia multipais

Discovery para otros schemas:
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = '<schema>' AND table_name = '<tabla>'
  ORDER BY ordinal_position;

## WORKFLOW — MÁXIMO 2 LLAMADAS A execute_sql

**Regla estricta:** usá como máximo 2 llamadas a execute_sql por pregunta.

Para gold.*:
- Si la pregunta incluye ambos países: hacé UNA sola query con UNION ALL que traiga ARG y COL juntos.
- Si la pregunta es de un solo país: una sola query directa.
- Nunca hagas una query por país por separado en llamadas distintas.

Para otros schemas: 1 discovery → 1 query final. Máximo 2 llamadas.

## REGLAS SQL REDSHIFT
- Siempre calificá: schema.tabla
- Fechas: CURRENT_DATE, DATEADD(), DATEDIFF(), DATE_TRUNC('month', fecha)
- Porcentajes: ROUND(x * 100.0, 2)
- Default LIMIT 100 salvo que pidan todo
- Ordenar métricas temporales por fecha DESC
- CTEs (WITH) para queries complejas

## CONVENCIONES CLAVE
- Ventas reales: gold.ventas_arg / gold.ventas_col WHERE flag_venta = 1
- TIR contractual: campo tasa_interes_teorica (NO usar tasa_interes que es neta de descuentos)
- Buckets mora: sin_mora → 1_30 → 31_60 → 61_90 → 91_120 → 121_180 → 181_360 → mayor_360
- Renovadores: flag_renovador = 'renovador' o renovacion = 'renovador'
- Períodos: formato 'YYYY-MM' en periodo_desembolso, periodo_vencimiento, etc.

## PRESENTACIÓN
- Tabla Markdown para los datos
- Insight breve de negocio después de la tabla
- Si >20 filas: resumí + primeras filas
- Si resultado vacío o inesperado: mencionalo y sugerí ajuste

## PRINCIPIOS
- Nunca inventar datos — solo lo que devuelve el warehouse
- Pensar como analista de riesgo fintech
- Si una query falla: ajustá y reintentá (máximo 3 intentos)
`.trim();

// ──────────────────────────────────────────────
// Tool definition
// ──────────────────────────────────────────────
const tools: Anthropic.Tool[] = [
  {
    name: "execute_sql",
    description:
      "Ejecuta una query SQL contra el Data Warehouse de Libgot (Redshift). " +
      "Para tablas gold.* el schema ya está en el system prompt — ir directo a la query final. " +
      "Solo hacer discovery (information_schema) para tablas fuera de gold.*.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "SQL válido para Amazon Redshift (PostgreSQL-compatible).",
        },
        description: {
          type: "string",
          description: "Breve explicación de qué hace esta query (para mostrar al usuario).",
        },
      },
      required: ["query"],
    },
  },
];

// ──────────────────────────────────────────────
// Ejecutar SQL contra Redshift vía pg
// ──────────────────────────────────────────────
export interface QueryResult {
  columns: string[];
  rows: Record<string, string | null>[];
  rowCount: number;
  sql: string;
  error?: string;
}

async function executeSQL(sql: string): Promise<QueryResult> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql);
    const columns = (result.fields ?? []).map((f) => f.name);
    const rows: Record<string, string | null>[] = (result.rows ?? []).map((row) =>
      Object.fromEntries(
        columns.map((col) => [col, row[col] == null ? null : String(row[col])])
      )
    );
    return { columns, rows, rowCount: rows.length, sql };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { columns: [], rows: [], rowCount: 0, sql, error: msg };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────
// Tipos públicos
// ──────────────────────────────────────────────
export type Message = Anthropic.MessageParam;

export interface ChatRequest {
  message: string;
  history?: Message[];
}

export interface ChatResponse {
  reply: string;
  queries: QueryResult[];
  updatedHistory: Message[];
}

// ──────────────────────────────────────────────
// Agentic loop principal
// ──────────────────────────────────────────────
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const messages: Message[] = [
    ...(req.history ?? []),
    { role: "user", content: req.message },
  ];

  const executedQueries: QueryResult[] = [];

  let callCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    callCount++;
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text" as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      tools,
      messages,
    });

    const usage = response.usage as any;
    totalInputTokens  += (usage.input_tokens ?? 0);
    totalOutputTokens += (usage.output_tokens ?? 0);
    const cacheRead  = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    console.log(`[DWH] call ${callCount}: in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${cacheRead} cache_write=${cacheWrite}`);

    if (response.stop_reason === "end_turn") {
      const replyText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      messages.push({ role: "assistant", content: response.content });

      console.log(`[DWH] TOTAL: ${callCount} llamadas, ${totalInputTokens} tokens in, ${totalOutputTokens} tokens out`);
      return {
        reply: replyText,
        queries: executedQueries,
        updatedHistory: messages,
      };
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        if (block.name === "execute_sql") {
          const input = block.input as { query: string; description?: string };
          const result = await executeSQL(input.query);
          executedQueries.push(result);

          // Cap rows sent to model at 50 to avoid large token payloads
          const rowsForModel = result.rows.slice(0, 50);
          const content = result.error
            ? `ERROR: ${result.error}`
            : JSON.stringify({ columns: result.columns, rows: rowsForModel, rowCount: result.rowCount, truncated: result.rows.length > 50 });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }
}
