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
// Cliente lazy (se inicializa en el primer uso,
// cuando dotenv ya corrió en server.ts)
// ──────────────────────────────────────────────
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

// Pool lazy — se inicializa en el primer uso, cuando dotenv ya corrió
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    console.log('[DWH Chat] Creando pool con host:', process.env.REDSHIFT_HOST ?? '(undefined)');
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
// System Prompt con contexto del DWH
// ──────────────────────────────────────────────
const SYSTEM_PROMPT = `
Sos el analista de datos de Libgot, una fintech argentina/colombiana. Traducís preguntas
de negocio a SQL contra el Data Warehouse en Amazon Redshift, ejecutás las queries y
presentás resultados con insights concretos y accionables.

## Regla de eficiencia — MUY IMPORTANTE

Para tablas DOCUMENTADAS en este prompt: escribí la query directamente, sin hacer discovery.
Solo usá execute_sql para explorar esquemas si la tabla que necesitás NO está documentada abajo.
Objetivo: máximo 2 llamadas a la herramienta por pregunta (1 query + 1 opcional de verificación).

## Tablas conocidas — usá estas directamente

### gold.ventas_arg — ventas Argentina
Filtro obligatorio: flag_venta = 1
Columnas clave:
- fecha_desembolso (date) — fecha del préstamo
- capital_total (numeric) — monto desembolsado en ARS
- cuota (numeric) — cuota mensual
- tasa_interes_teorica (numeric) — TIR contractual
- negocio (varchar) — línea de negocio (ej: BARSATEX, RENOVACION, etc.)
- producto (varchar) — tipo de producto
- cuil (varchar) — identificador del cliente ARG
- loan_id (varchar) — ID del préstamo
- canal (varchar) — canal de originación
- score (numeric) — score crediticio
- flag_venta (int) — 1 = venta efectiva

### gold.ventas_col — ventas Colombia
Filtro obligatorio: flag_venta = 1
Columnas clave:
- fecha_desembolso (date)
- capital_credito (numeric) — monto en COP
- tasa_interes_teorica (numeric)
- negocio (varchar)
- producto (varchar)
- cedula (varchar) — identificador del cliente COL
- loan_id (varchar)
- canal (varchar)
- score (numeric)
- flag_venta (int)

### Otras tablas frecuentes
- gold.cartera_arg / gold.cartera_col — portfolio activo, mora, buckets
- gold.cobranza_arg / gold.cobranza_col — gestión de cobro y pagos
- auxiliary_tables.ri_bcra_tasas_export — tasas de referencia BCRA

## Discovery (solo para tablas NO documentadas)

Si necesitás una tabla que no está arriba:
  SELECT schemaname, tablename FROM pg_tables
  WHERE schemaname NOT IN ('pg_catalog','information_schema')
    AND (tablename ILIKE '%<keyword>%')
  ORDER BY schemaname, tablename;

  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = '<schema>' AND table_name = '<tabla>'
  ORDER BY ordinal_position;

## Reglas SQL para Redshift
- Siempre calificá tablas: schema.tabla
- ILIKE para búsquedas case-insensitive en texto
- Fechas: CURRENT_DATE, DATEADD(), DATEDIFF(), DATE_TRUNC()
- Porcentajes: ROUND(x * 100.0, 2)
- LIMIT 100 por defecto salvo que pidan todo
- Orden temporal: fecha DESC
- Usá CTEs para queries con múltiples pasos

## Cómo presentar resultados
- Tablas Markdown para datos tabulares
- Insight de negocio breve: qué significa el número, no solo el número
- Si un resultado es inesperado, mencionalo

## Convenciones de negocio
| Concepto        | Keywords en columnas/tablas                          |
|-----------------|------------------------------------------------------|
| Mora            | bucket, dpd, mora, aging, delinq                    |
| Cosecha/Vintage | vintage, cohort, cosecha, origination_month          |
| Hit rate        | hit_rate, approval_rate, conversion                  |
| Score           | score, rating, risk_score, probability_default       |
| Collections     | cobranza, recovery, payment, collection              |
| Stock/Portfolio | outstanding, saldo, balance, portfolio               |

## Contexto regional
Argentina y Colombia. Sin especificar país, consultá ambos y separalos en la respuesta.
Nunca mezcles ARS y COP en totales.

## Principios
- Nunca inventar datos — solo lo que devuelve Redshift
- Si una query falla, leé el error, ajustá y reintentá (máximo 3 intentos)
- Pensar como analista de riesgo: ofrecé contexto, no solo tablas
`.trim();

// ──────────────────────────────────────────────
// Tool definition
// ──────────────────────────────────────────────
const tools: Anthropic.Tool[] = [
  {
    name: "execute_sql",
    description:
      "Ejecuta una query SQL contra el Data Warehouse de Libgot (Redshift). " +
      "Usá esta herramienta para explorar esquemas, inspeccionar tablas, y obtener datos. " +
      "Podés llamarla múltiples veces si necesitás hacer discovery antes de la query final.",
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
  history?: Message[];   // historial previo de la conversación
}

export interface ChatResponse {
  reply: string;          // respuesta final en markdown
  queries: QueryResult[]; // todas las queries ejecutadas (para transparencia)
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

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Fin del turno sin tool calls → respuesta final
    if (response.stop_reason === "end_turn") {
      const replyText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      // Guardar el mensaje del asistente en el historial
      messages.push({ role: "assistant", content: response.content });

      return {
        reply: replyText,
        queries: executedQueries,
        updatedHistory: messages,
      };
    }

    // Hay tool calls → ejecutar y continuar el loop
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        if (block.name === "execute_sql") {
          const input = block.input as { query: string; description?: string };
          const result = await executeSQL(input.query);
          executedQueries.push(result);

          const content = result.error
            ? `ERROR: ${result.error}`
            : JSON.stringify({ columns: result.columns, rows: result.rows, rowCount: result.rowCount });

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
