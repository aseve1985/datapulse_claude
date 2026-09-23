# Flujo Financiero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Flujo Financiero" sub-módulo to Finanzas — cashflow diario/mensual real vs. proyectado (AR y CO), otros rubros, ratio originación/cobranza y tabla de proveedores, en vivo desde Google Sheets + `/api/sales-s3`, sin persistencia propia.

**Architecture:** Backend endpoint (`/api/flujo-financiero`) that fetches 8 Google Sheets tabs in parallel (raw rows, no parsing — same pattern as `/api/tesoreria`) plus originación diaria real desde el parquet de `/api/sales-s3`, cacheado 15 min in-memory. All row-parsing, date-range aggregation and formatting logic lives in a pure TypeScript module (`flujoFinancieroHelpers.ts`) consumed by a new React component (`FlujoFinancieroSubmodule.tsx`) that follows the same visual/structural conventions as `TesoreriaSubmodule.tsx` (inline CSS-in-JS dark-navy theme, Chart.js via canvas refs, no external chart wrapper library).

**Tech Stack:** Express + `googleapis` (existing `fetchRawSheetByGid`/`fetchRawSheetByPartialName` helpers in `server.ts`), AWS S3 + `hyparquet` (existing `/api/sales-s3`), React + TypeScript, `chart.js` (already a project dependency, used directly as in `TesoreriaSubmodule.tsx` — no `react-chartjs-2`). No test framework exists in this repo — "tests" are (a) small `tsx` fixture scripts run directly with `npx tsx` that assert pure-function output against hand-computed expected values, and (b) `npm run lint` (`tsc --noEmit`) + manual/Playwright browser verification for the frontend.

**Spec:** `docs/superpowers/specs/2026-09-10-flujo-financiero-design.md`

## Global Constraints

- **Sin persistencia propia:** no se escribe a S3 ni a ningún otro store — el endpoint es de solo lectura, cache in-memory con TTL 15 min (`FLUJO_FINANCIERO_CACHE_TTL_MS`).
- **Originación real** se reemplaza siempre por `/api/sales-s3` (campo `pais` = `'ARG'`/`'COL'`, `capital_desembolsado`, `fecha_desembolso`) — la fila de originaciones del sheet de cashflow real nunca se usa para el valor real.
- **Originación proyectada** SÍ se lee directo del sheet de proyecciones (no hay reemplazo, no existe "objetivo real" con el que comparar ahí).
- **Sheet IDs y filas (0-indexed = fila del spec menos 1):**
  - Cashflow AR real: `1FPFod-4AEAZ6L7Qn622PyrDhXG-mROkQdbzadZUq2sM`, tab `01. Proy 2026` (gid `473723070`) — fechas=3, saldoInicio=4, cobranzas=10, proveedores=12, impuestos=14, sueldos=15, gastosBanc=16, caucion=20, recuperoColombia=21, prestamos=23, devCaucion=28, saldoFinal=39.
  - Cashflow AR proyecciones: mismo spreadsheet, tab `04. Proyecciones` (gid `972031162`) — fechas=3, cobranzas=10, originaciones=11, proveedores=12, impuestos=14.
  - Cashflow CO real: `1h979gF1KFAnuJbLd4Bz1OFTaJvTj8sLS6kQRcbj92c0`, tab `01. Proyeccion 2026` — fechas=3, saldoInicio=4, cobranzas=17, proveedores=19, tarjetas=20, impuestos=21, sueldos=22, gastosBanc=23, totalIngFin=31 (total, no detalle), totalEgrFin=38 (total, no detalle), freeCashflowFin=40, saldoFinal=42.
  - Cashflow CO proyecciones: mismo spreadsheet, tab `04. Proyecciones` (gid `1374126371`) — fechas=3, cobranzas=17, originaciones=18, proveedores=19, impuestos=21.
  - Proveedores AR: `1yBWR2FRISRXPxGx2mvWeL_9Jt6MCOpeFJzeEemavAak`, tab con "Fc pendientes de pago" en el nombre — cols A/B/C/D/G/I/J/P (0-indexed 0/1/2/3/6/8/9/15) → sociedad/detalle/mes/diaPago/vencimiento/nombre/importe/aprobacion. Excluir `sociedad === 'Social Plus S.A.'`; incluir solo `aprobacion` en `['Si', 'pendiente']`.
  - Proveedores CO: `1d2iPVtFwFH2DippOHPyUnYR0H3o-cZ7E`, tab con "Liq. de pagos" — cols B/C/D/E/H/I/J/O (0-indexed 1/2/3/4/7/8/9/14) → mismos campos. Excluir `aprobacion === 'No'`.
  - Objetivos ventas AR: `1iMbRbXEHmT7eErcV5QdJhU5jIXke09Ugmun2tw0lZt4`, tab "Objetivos diarios" — cols A/B/D/E/F (0-indexed 0/1/3/4/5) → fecha/semana/nuevos/renovadores/monto.
  - Objetivos ventas CO: `1WT2gdVmWI5HzlvR3-01Iom55CYGChvCOlgEMLGR3Hjs`, misma estructura.
- **Semáforo ratio Orig/Cob:** AR verde `<62%`, amarillo `62–64.99%`, rojo `≥65%`. CO verde `<67%`, amarillo `67–68.99%`, rojo `≥69%`.
- **Semanas:** sábado a viernes (7 días), generadas desde el sábado en/antes del día 1 del mes hasta cubrir el último día del mes (idéntico a `weeksInMonth()` del HTML original).
- **Fila 1 de KPI** = valores del período EXACTO seleccionado (día/semana/mes) + comparación "vs proyectado" del mismo período, simétrica AR/CO. **Fila 2** = valores del MES CALENDARIO COMPLETO al que pertenece el período seleccionado (5 tarjetas: Ventas/Cobranzas/Proveedores/Impuestos/Ratio, sin Saldo Inicio/Final) — "Ventas" es la excepción, compara contra el objetivo de ventas, no contra la proyección de cashflow.
- **Año de trabajo:** 2026, igual que `TesoreriaSubmodule.tsx` (hardcodeado, limitación conocida y ya existente en el patrón que se está siguiendo).
- No hay panel de IA (insights/chat) en este submódulo — no estaba en el HTML original ni en el spec.

---

## File Structure

- **Modify** `server.ts` — extraer `getSalesS3Records()`/agregar `getOriginacionesDiariasPorPais()` de la sección "Sales S3 Parquet Endpoint"; agregar sección nueva `/api/flujo-financiero` + `/api/flujo-financiero/refresh` después de la sección Tesorería.
- **Create** `src/components/submodules/flujoFinancieroHelpers.ts` — tipos, mapeos de fila, parsers puros, agregación por rango de fechas, semanas/días, formato, semáforo. Sin JSX, sin fetch.
- **Create** `src/components/submodules/FlujoFinancieroSubmodule.tsx` — componente autocontenido (fetch, estado país/vista/período, las 2 filas de KPI, otros rubros, gráfico de ratio, tabla de proveedores).
- **Modify** `src/components/LandingPage.tsx` — agregar submódulo a `finance.submodules`.
- **Modify** `src/components/DashboardView.tsx` — import + rama de routing + `isLive`.

---

### Task 1: Backend — compartir el loader de `/api/sales-s3` y agregar originación diaria por país

**Files:**
- Modify: `server.ts` (sección "Sales S3 Parquet Endpoint", ~línea 840-899)

**Interfaces:**
- Produces: `getSalesS3Records(): Promise<any[]>`, `getOriginacionesDiariasPorPais(pais: 'ARG' | 'COL', fechaDesde: string, fechaHasta: string): Promise<Record<string, number>>` (mapa `YYYY-MM-DD` → suma de `capital_desembolsado` de ese día para ese país)

- [ ] **Step 1: Extraer la carga+cache del parquet a una función compartida**

Ubicar el bloque actual (empieza en `let salesS3Cache...`, contiene el handler de `app.get("/api/sales-s3"...)`) y reemplazarlo por:

```ts
  // ── Sales S3 Parquet Endpoint ────────────────────────────────────────────────
  let salesS3Cache: { data: any[]; fetchedAt: number } | null = null;
  const SALES_CACHE_TTL_MS = 10 * 60 * 60 * 1000; // 10 horas

  async function getSalesS3Records(): Promise<any[]> {
    const now = Date.now();
    if (!salesS3Cache || now - salesS3Cache.fetchedAt > SALES_CACHE_TTL_MS) {
      console.log("[S3] Downloading ventas_platinum.parquet...");
      const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
      const cmd = new GetObjectCommand({
        Bucket: "data-lake-libgot-externos",
        Key: "platinum_ia/ventas_multipais/ventas_platinum.parquet",
      });
      const response = await s3.send(cmd);
      const bytes = await (response.Body as any).transformToByteArray() as Uint8Array;

      const asyncBuffer = {
        byteLength: bytes.byteLength,
        slice: async (start: number, end?: number): Promise<ArrayBuffer> =>
          bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + (end ?? bytes.byteLength)) as ArrayBuffer,
      };

      let rows: any[] = [];
      await parquetRead({
        file: asyncBuffer,
        rowFormat: "object",
        onComplete: (data: any[]) => { rows = data; },
      });

      salesS3Cache = { data: rows, fetchedAt: now };
      console.log(`[S3] Cached ${rows.length} records from parquet`);
    } else {
      console.log("[S3] Serving sales data from cache");
    }
    return salesS3Cache.data;
  }

  async function getOriginacionesDiariasPorPais(pais: 'ARG' | 'COL', fechaDesde: string, fechaHasta: string): Promise<Record<string, number>> {
    const records = await getSalesS3Records();
    const from = new Date(fechaDesde);
    const to = new Date(fechaHasta + 'T23:59:59');
    const out: Record<string, number> = {};
    for (const r of records) {
      if (r.pais !== pais) continue;
      const raw = r.fecha_desembolso;
      if (!raw) continue;
      const d = new Date(raw);
      if (d < from || d > to) continue;
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      out[dateStr] = (out[dateStr] ?? 0) + (Number(r.capital_desembolsado) || 0);
    }
    return out;
  }

  app.get("/api/sales-s3", async (req, res) => {
    const { fecha_desde, fecha_hasta } = req.query;
    try {
      let data = await getSalesS3Records();

      if (fecha_desde || fecha_hasta) {
        const from = fecha_desde ? new Date(String(fecha_desde)) : null;
        const to = fecha_hasta ? new Date(String(fecha_hasta) + "T23:59:59") : null;
        data = data.filter((row: any) => {
          const rawDate = row.fecha_desembolso || row.fecha || row.date || row.Date;
          if (!rawDate) return true;
          const d = new Date(rawDate);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }

      const safe = JSON.parse(JSON.stringify(data, (_k, v) => typeof v === "bigint" ? Number(v) : v));
      res.json({ records: safe, total: safe.length, source: "s3" });
    } catch (error: any) {
      console.error("[S3] Error loading parquet:", error);
      res.status(500).json({ error: "Failed to load data from S3", details: error.message });
    }
  });
```

Nota: `parseSheetDate`-style timezone shift no aplica acá — `fecha_desembolso` ya viene como ISO timestamp (`"2026-05-01T00:00:00.000Z"`), por eso se usan los métodos `getUTC*` para no correr un día al convertir a `YYYY-MM-DD`.

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Levantar el server y confirmar que `/api/sales-s3` sigue funcionando igual que antes**

```bash
npm run dev
```

En otra terminal:
```bash
curl -s "http://localhost:3000/api/sales-s3?fecha_desde=2026-05-01&fecha_hasta=2026-05-02" | head -c 300
```
Expected: mismo shape que antes (`{"records":[...],"total":N,"source":"s3"}`), sin error 500.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "refactor: extract shared sales-s3 loader + add getOriginacionesDiariasPorPais"
```

---

### Task 2: Backend — endpoint `/api/flujo-financiero`

**Files:**
- Modify: `server.ts` (agregar sección nueva después del bloque `// ── Tesorería ──...` que termina en `app.get('/api/tesoreria/refresh'...)`)

**Interfaces:**
- Consumes: `fetchRawSheetByGid`, `fetchRawSheetByPartialName` (ya existen), `getOriginacionesDiariasPorPais` (Task 1)
- Produces: `GET /api/flujo-financiero` → `{ ar: PaisSheets, co: PaisSheets, cached: boolean }` donde `PaisSheets = { real: string[][], proy: string[][], proveedores: string[][], ventas: string[][], originaciones: Record<string, number> }`; `GET /api/flujo-financiero/refresh`

- [ ] **Step 1: Agregar el endpoint**

Insertar inmediatamente después de `app.get('/api/tesoreria/refresh', ...)`:

```ts
  // ── Flujo Financiero ────────────────────────────────────────────────────────
  const CASHFLOW_AR_ID = '1FPFod-4AEAZ6L7Qn622PyrDhXG-mROkQdbzadZUq2sM';
  const CASHFLOW_CO_ID = '1h979gF1KFAnuJbLd4Bz1OFTaJvTj8sLS6kQRcbj92c0';
  const PROVEEDORES_AR_ID = '1yBWR2FRISRXPxGx2mvWeL_9Jt6MCOpeFJzeEemavAak';
  const PROVEEDORES_CO_ID = '1d2iPVtFwFH2DippOHPyUnYR0H3o-cZ7E';
  const OBJETIVOS_AR_ID = '1iMbRbXEHmT7eErcV5QdJhU5jIXke09Ugmun2tw0lZt4';
  const OBJETIVOS_CO_ID = '1WT2gdVmWI5HzlvR3-01Iom55CYGChvCOlgEMLGR3Hjs';

  let flujoFinancieroCache: {
    ar: { real: string[][]; proy: string[][]; proveedores: string[][]; ventas: string[][]; originaciones: Record<string, number> };
    co: { real: string[][]; proy: string[][]; proveedores: string[][]; ventas: string[][]; originaciones: Record<string, number> };
    fetchedAt: number;
  } | null = null;
  const FLUJO_FINANCIERO_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

  app.get('/api/flujo-financiero', async (_req, res) => {
    try {
      if (flujoFinancieroCache && Date.now() - flujoFinancieroCache.fetchedAt < FLUJO_FINANCIERO_CACHE_TTL_MS) {
        return res.json({ ar: flujoFinancieroCache.ar, co: flujoFinancieroCache.co, cached: true });
      }

      const [
        arReal, arProy, arProveedores, arVentas,
        coReal, coProy, coProveedores, coVentas,
        arOriginaciones, coOriginaciones,
      ] = await Promise.all([
        fetchRawSheetByGid(CASHFLOW_AR_ID, '473723070', 45),
        fetchRawSheetByGid(CASHFLOW_AR_ID, '972031162', 20),
        fetchRawSheetByPartialName(PROVEEDORES_AR_ID, 'Fc pendientes de pago', 1000),
        fetchRawSheetByPartialName(OBJETIVOS_AR_ID, 'Objetivos diarios', 400),
        fetchRawSheetByPartialName(CASHFLOW_CO_ID, '01. Proyeccion', 50),
        fetchRawSheetByGid(CASHFLOW_CO_ID, '1374126371', 25),
        fetchRawSheetByPartialName(PROVEEDORES_CO_ID, 'Liq. de pagos', 1000),
        fetchRawSheetByPartialName(OBJETIVOS_CO_ID, 'Objetivos diarios', 400),
        getOriginacionesDiariasPorPais('ARG', '2026-01-01', '2026-12-31'),
        getOriginacionesDiariasPorPais('COL', '2026-01-01', '2026-12-31'),
      ]);

      flujoFinancieroCache = {
        ar: { real: arReal, proy: arProy, proveedores: arProveedores, ventas: arVentas, originaciones: arOriginaciones },
        co: { real: coReal, proy: coProy, proveedores: coProveedores, ventas: coVentas, originaciones: coOriginaciones },
        fetchedAt: Date.now(),
      };
      console.log(`[FlujoFinanciero] Fetched: AR real ${arReal.length}f/proy ${arProy.length}f, CO real ${coReal.length}f/proy ${coProy.length}f`);
      res.json({ ar: flujoFinancieroCache.ar, co: flujoFinancieroCache.co, cached: false });
    } catch (error: any) {
      console.error('[FlujoFinanciero] Error:', error);
      res.status(500).json({ error: 'Error al cargar datos de flujo financiero', details: error.message });
    }
  });

  app.get('/api/flujo-financiero/refresh', (_req, res) => {
    flujoFinancieroCache = null;
    res.json({ ok: true });
  });
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Levantar el server y probar el endpoint**

```bash
npm run dev
```
```bash
curl -s http://localhost:3000/api/flujo-financiero | node -e "
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const j=JSON.parse(d);
  console.log('AR real filas:', j.ar.real.length, '| AR proy filas:', j.ar.proy.length, '| AR proveedores filas:', j.ar.proveedores.length, '| AR ventas filas:', j.ar.ventas.length);
  console.log('CO real filas:', j.co.real.length, '| CO proy filas:', j.co.proy.length, '| CO proveedores filas:', j.co.proveedores.length, '| CO ventas filas:', j.co.ventas.length);
  console.log('AR fila 4 (fechas), primeras 6 cols:', j.ar.real[3]?.slice(0,6));
  console.log('AR proy fila 11 (cobranzas), primeras 6 cols:', j.ar.proy[10]?.slice(0,6));
  console.log('CO fila 18 (cobranzas), primeras 6 cols:', j.co.real[17]?.slice(0,6));
  console.log('Muestra originaciones AR (primeras 3 fechas):', Object.entries(j.ar.originaciones).slice(0,3));
})"
```
Expected: sin error 500; `AR real filas` >= 40, `AR proy filas` >= 15, `CO real filas` >= 43, `CO proy filas` >= 22; las filas de fechas muestran valores tipo fecha en las columnas D en adelante (índice 3+); `originaciones` tiene al menos algunas fechas 2026 con montos > 0.

Si `CO real filas` sale muy bajo (ej. 1-2), es señal de que `fetchRawSheetByPartialName(CASHFLOW_CO_ID, '01. Proyeccion', 50)` matcheó la pestaña equivocada — revisar con `fetchRawSheetByPartialName` sobre `'Proyeccion 2026'` en vez de `'01. Proyeccion'` si hace falta desambiguar.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/flujo-financiero and /api/flujo-financiero/refresh endpoints"
```

---

### Task 3: Frontend — `flujoFinancieroHelpers.ts` (tipos, row maps, parsers de días)

**Files:**
- Create: `src/components/submodules/flujoFinancieroHelpers.ts`

**Interfaces:**
- Produces: `Pais`, `RowMap`, `ROWS_AR_REAL`, `ROWS_AR_PROY`, `ROWS_CO_REAL`, `ROWS_CO_PROY`, `DiaFlujo`, `DiaProyeccion`, `parseSheetDate()`, `parseSheetNum()`, `parseDailyReal()`, `parseDailyProy()`

- [ ] **Step 1: Crear el archivo con tipos, row maps y parsers de fecha/número**

```ts
// src/components/submodules/flujoFinancieroHelpers.ts

export type Pais = 'AR' | 'CO';

export interface RowMap {
  fechas: number;
  saldoInicio?: number;
  cobranzas: number;
  originaciones: number;
  proveedores: number;
  impuestos: number;
  sueldos?: number;
  gastosBanc?: number;
  caucion?: number;
  recuperoColombia?: number;
  prestamos?: number;
  devCaucion?: number;
  tarjetas?: number;
  totalIngFin?: number;
  totalEgrFin?: number;
  freeCashflowFin?: number;
  saldoFinal?: number;
}

// 0-indexed: fila del spec menos 1
export const ROWS_AR_REAL: RowMap = {
  fechas: 3, saldoInicio: 4, cobranzas: 10, originaciones: 11, proveedores: 12,
  impuestos: 14, sueldos: 15, gastosBanc: 16, caucion: 20, recuperoColombia: 21,
  prestamos: 23, devCaucion: 28, saldoFinal: 39,
};

export const ROWS_AR_PROY: RowMap = {
  fechas: 3, cobranzas: 10, originaciones: 11, proveedores: 12, impuestos: 14,
};

export const ROWS_CO_REAL: RowMap = {
  fechas: 3, saldoInicio: 4, cobranzas: 17, originaciones: 18, proveedores: 19,
  tarjetas: 20, impuestos: 21, sueldos: 22, gastosBanc: 23,
  totalIngFin: 31, totalEgrFin: 38, freeCashflowFin: 40, saldoFinal: 42,
};

export const ROWS_CO_PROY: RowMap = {
  fechas: 3, cobranzas: 17, originaciones: 18, proveedores: 19, impuestos: 21,
};

export function parseSheetDate(val: string): Date | null {
  if (!val) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 55000) {
    const utcD = new Date(Math.round((num - 25569) * 86400 * 1000));
    return new Date(utcD.getUTCFullYear(), utcD.getUTCMonth(), utcD.getUTCDate());
  }
  if (val.includes('/')) {
    const parts = val.split('/');
    if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function parseSheetNum(val: string): number {
  if (!val || val === '') return 0;
  const n = parseFloat(String(val).replace(/[,\s]/g, '').replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DiaFlujo {
  dateStr: string; // YYYY-MM-DD
  month: number;   // 0-11
  day: number;
  saldoInicio: number;
  cobranzas: number;
  originaciones: number; // siempre viene de /api/sales-s3, nunca de la fila del sheet
  proveedores: number;
  impuestos: number;
  sueldos: number;
  gastosBanc: number;
  caucion: number;
  recuperoColombia: number;
  prestamos: number;
  devCaucion: number;
  tarjetas: number;
  totalIngFin: number;
  totalEgrFin: number;
  freeCashflowFin: number;
  saldoFinal: number;
}

export function parseDailyReal(rows: string[][], map: RowMap, originacionesPorDia: Record<string, number>): DiaFlujo[] {
  const dateRow = rows[map.fechas] || [];
  const get = (rowIdx: number | undefined, col: number): number =>
    rowIdx === undefined ? 0 : Math.abs(parseSheetNum(rows[rowIdx]?.[col] ?? ''));
  const getSigned = (rowIdx: number | undefined, col: number): number =>
    rowIdx === undefined ? 0 : parseSheetNum(rows[rowIdx]?.[col] ?? '');

  const out: DiaFlujo[] = [];
  for (let c = 1; c < dateRow.length; c++) {
    const date = parseSheetDate(dateRow[c]);
    if (!date || date.getFullYear() !== 2026) continue;
    const dateStr = toDateStr(date);
    out.push({
      dateStr, month: date.getMonth(), day: date.getDate(),
      saldoInicio: getSigned(map.saldoInicio, c),
      cobranzas: get(map.cobranzas, c),
      originaciones: originacionesPorDia[dateStr] ?? 0,
      proveedores: get(map.proveedores, c),
      impuestos: get(map.impuestos, c),
      sueldos: get(map.sueldos, c),
      gastosBanc: get(map.gastosBanc, c),
      caucion: get(map.caucion, c),
      recuperoColombia: get(map.recuperoColombia, c),
      prestamos: get(map.prestamos, c),
      devCaucion: get(map.devCaucion, c),
      tarjetas: get(map.tarjetas, c),
      totalIngFin: get(map.totalIngFin, c),
      totalEgrFin: get(map.totalEgrFin, c),
      freeCashflowFin: get(map.freeCashflowFin, c),
      saldoFinal: getSigned(map.saldoFinal, c),
    });
  }
  return out;
}

export interface DiaProyeccion {
  dateStr: string;
  cobranzas: number;
  originaciones: number;
  proveedores: number;
  impuestos: number;
}

export function parseDailyProy(rows: string[][], map: RowMap): DiaProyeccion[] {
  const dateRow = rows[map.fechas] || [];
  const get = (rowIdx: number | undefined, col: number): number =>
    rowIdx === undefined ? 0 : Math.abs(parseSheetNum(rows[rowIdx]?.[col] ?? ''));

  const out: DiaProyeccion[] = [];
  for (let c = 1; c < dateRow.length; c++) {
    const date = parseSheetDate(dateRow[c]);
    if (!date || date.getFullYear() !== 2026) continue;
    out.push({
      dateStr: toDateStr(date),
      cobranzas: get(map.cobranzas, c),
      originaciones: get(map.originaciones, c),
      proveedores: get(map.proveedores, c),
      impuestos: get(map.impuestos, c),
    });
  }
  return out;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Verificar `parseDailyReal`/`parseDailyProy` con un fixture a mano**

Crear un script temporal (no se commitea):

```ts
// scratch-verify-task3.ts (temporal, en la raíz del repo)
import { parseDailyReal, parseDailyProy, ROWS_AR_REAL, ROWS_AR_PROY } from './src/components/submodules/flujoFinancieroHelpers';

const rows: string[][] = [];
rows[3] = ['', '2026-05-01', '2026-05-02'];   // fechas (fila 4, idx 3)
rows[4] = ['', '1000', '1500'];                // saldoInicio (fila 5, idx 4)
rows[10] = ['', '500', '600'];                 // cobranzas (fila 11, idx 10)
rows[12] = ['', '-100', '-120'];               // proveedores (fila 13, idx 12) — negativo en el sheet
rows[14] = ['', '-50', '-60'];                 // impuestos (fila 15, idx 14)
rows[39] = ['', '1350', '1720'];               // saldoFinal (fila 40, idx 39)

const dias = parseDailyReal(rows, ROWS_AR_REAL, { '2026-05-01': 777 });
console.log(JSON.stringify(dias, null, 2));
if (dias.length !== 2) throw new Error(`Esperaba 2 días, salieron ${dias.length}`);
if (dias[0].originaciones !== 777) throw new Error('originaciones debía venir del dict, no del sheet');
if (dias[1].originaciones !== 0) throw new Error('2026-05-02 sin entrada en el dict debía dar 0');
if (dias[0].proveedores !== 100) throw new Error('proveedores debía venir en positivo (Math.abs)');
if (dias[0].saldoFinal !== 1350) throw new Error('saldoFinal debía venir con signo (getSigned)');
console.log('OK: parseDailyReal');

const rowsProy: string[][] = [];
rowsProy[3] = ['', '2026-05-01'];
rowsProy[10] = ['', '480'];   // cobranzas proy
rowsProy[11] = ['', '510'];   // originaciones proy
rowsProy[12] = ['', '90'];    // proveedores proy
rowsProy[14] = ['', '45'];    // impuestos proy
const diasProy = parseDailyProy(rowsProy, ROWS_AR_PROY);
if (diasProy.length !== 1 || diasProy[0].cobranzas !== 480 || diasProy[0].originaciones !== 510) {
  throw new Error('parseDailyProy no matcheó los valores esperados');
}
console.log('OK: parseDailyProy');
```

Run: `npx tsx scratch-verify-task3.ts`
Expected: imprime "OK: parseDailyReal" y "OK: parseDailyProy", sin excepciones.

Borrar el script temporal después: `rm scratch-verify-task3.ts` (no se commitea).

- [ ] **Step 4: Commit**

```bash
git add src/components/submodules/flujoFinancieroHelpers.ts
git commit -m "feat: add row maps and daily-row parsers for Flujo Financiero"
```

---

### Task 4: Frontend — `flujoFinancieroHelpers.ts` (agregación por rango, semanas, formato, semáforo, proveedores/ventas)

**Files:**
- Modify: `src/components/submodules/flujoFinancieroHelpers.ts`

**Interfaces:**
- Consumes: `DiaFlujo`, `DiaProyeccion`, `parseSheetDate`, `parseSheetNum` (Task 3)
- Produces: `sumRangeReal()`, `sumRangeProy()`, `valorEnDia()`, `KpiPeriodo`, `getKpiPeriodo()`, `Semana`, `weeksInMonth()`, `daysInMonth()`, `fmt()`, `fmtLocal()`, `RatioEstado`, `rcT()`, `ProveedorRow`, `parseProveedoresAr()`, `parseProveedoresCo()`, `VentasObjetivoRow`, `parseVentasObjetivo()`, `getVentasPeriodo()`

- [ ] **Step 1: Agregar agregación por rango de fechas y el builder de KPI de período**

Agregar al final de `flujoFinancieroHelpers.ts`:

```ts
type CampoReal = keyof Omit<DiaFlujo, 'dateStr' | 'month' | 'day'>;
type CampoProy = keyof Omit<DiaProyeccion, 'dateStr'>;

export function sumRangeReal(dias: DiaFlujo[], campo: CampoReal, start: string, end: string): number {
  return dias.filter(d => d.dateStr >= start && d.dateStr <= end).reduce((s, d) => s + (d[campo] as number), 0);
}

export function sumRangeProy(dias: DiaProyeccion[], campo: CampoProy, start: string, end: string): number {
  return dias.filter(d => d.dateStr >= start && d.dateStr <= end).reduce((s, d) => s + (d[campo] as number), 0);
}

export function valorEnDia(dias: DiaFlujo[], campo: CampoReal, dateStr: string): number {
  const d = dias.find(x => x.dateStr === dateStr);
  return d ? (d[campo] as number) : 0;
}

export interface KpiPeriodo {
  saldoInicio: number;
  cobranzas: number;
  originaciones: number;
  proveedores: number;
  impuestos: number;
  saldoFinal: number;
  ratio: number;
  proy: { cobranzas: number; originaciones: number; proveedores: number; impuestos: number; ratio: number } | null;
}

// Usada tanto para la Fila 1 (start=end=día, o el rango de la semana/mes elegido) como
// para la Fila 2 (siempre start/end = primer/último día del mes calendario completo).
export function getKpiPeriodo(diasReal: DiaFlujo[], diasProy: DiaProyeccion[], start: string, end: string): KpiPeriodo {
  const cobranzas = sumRangeReal(diasReal, 'cobranzas', start, end);
  const originaciones = sumRangeReal(diasReal, 'originaciones', start, end);
  const proveedores = sumRangeReal(diasReal, 'proveedores', start, end);
  const impuestos = sumRangeReal(diasReal, 'impuestos', start, end);
  const saldoInicio = valorEnDia(diasReal, 'saldoInicio', start);
  const saldoFinal = valorEnDia(diasReal, 'saldoFinal', end);
  const ratio = cobranzas > 0 ? (originaciones / cobranzas) * 100 : 0;

  const hayProy = diasProy.some(d => d.dateStr >= start && d.dateStr <= end);
  const pCobranzas = sumRangeProy(diasProy, 'cobranzas', start, end);
  const pOriginaciones = sumRangeProy(diasProy, 'originaciones', start, end);

  return {
    saldoInicio, cobranzas, originaciones, proveedores, impuestos, saldoFinal, ratio,
    proy: hayProy ? {
      cobranzas: pCobranzas,
      originaciones: pOriginaciones,
      proveedores: sumRangeProy(diasProy, 'proveedores', start, end),
      impuestos: sumRangeProy(diasProy, 'impuestos', start, end),
      ratio: pCobranzas > 0 ? (pOriginaciones / pCobranzas) * 100 : 0,
    } : null,
  };
}
```

- [ ] **Step 2: Agregar semanas/días, formato y semáforo**

```ts
const MS_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface Semana { start: string; end: string; label: string; }

export function weeksInMonth(year: number, month: number): Semana[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const back = first.getDay() === 6 ? 0 : (first.getDay() + 1);
  let ws = new Date(first); ws.setDate(ws.getDate() - back);
  const out: Semana[] = [];
  while (ws <= last) {
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    const fd = (d: Date) => `${d.getDate()} ${MS_CORTO[d.getMonth()]}`;
    out.push({ start: toDateStr(ws), end: toDateStr(we), label: `${fd(ws)} - ${fd(we)}` });
    const n = new Date(ws); n.setDate(n.getDate() + 7); ws = n;
  }
  return out;
}

export function daysInMonth(year: number, month: number): string[] {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => toDateStr(new Date(year, month, i + 1)));
}

export function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (abs / 1e3).toFixed(0) + 'K';
  return abs.toFixed(0);
}

export function fmtLocal(v: number, pais: Pais): string {
  const prefix = pais === 'AR' ? '$' : 'COP';
  return `${prefix} ${Math.round(v).toLocaleString('es-AR')}`;
}

export interface RatioEstado { cls: 'sem-green' | 'sem-yellow' | 'sem-red'; alerta: boolean; }

export function rcT(ratio: number, pais: Pais): RatioEstado {
  const hi = pais === 'CO' ? 69 : 65;
  const mid = pais === 'CO' ? 67 : 62;
  if (ratio >= hi) return { cls: 'sem-red', alerta: true };
  if (ratio >= mid) return { cls: 'sem-yellow', alerta: false };
  return { cls: 'sem-green', alerta: false };
}
```

- [ ] **Step 3: Agregar parsers de proveedores y objetivos de ventas**

```ts
export interface ProveedorRow {
  sociedad: string; detalle: string; mes: string; diaPago: string;
  vencimiento: string; nombre: string; importe: number; aprobacion: string;
}

export function parseProveedoresAr(rows: string[][]): ProveedorRow[] {
  const out: ProveedorRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[8]) continue; // sin nombre → descartar
    const sociedad = (row[0] ?? '').trim();
    if (sociedad === 'Social Plus S.A.') continue;
    const aprobacion = (row[15] ?? '').trim();
    if (aprobacion !== 'Si' && aprobacion !== 'pendiente') continue;
    out.push({
      sociedad, detalle: row[1] ?? '', mes: row[2] ?? '', diaPago: row[3] ?? '',
      vencimiento: row[6] ?? '', nombre: row[8] ?? '', importe: parseSheetNum(row[9] ?? ''), aprobacion,
    });
  }
  return out;
}

export function parseProveedoresCo(rows: string[][]): ProveedorRow[] {
  const out: ProveedorRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[8]) continue;
    const aprobacion = (row[14] ?? '').trim();
    if (aprobacion === 'No') continue;
    out.push({
      sociedad: row[1] ?? '', detalle: row[2] ?? '', mes: row[3] ?? '', diaPago: row[4] ?? '',
      vencimiento: row[7] ?? '', nombre: row[8] ?? '', importe: parseSheetNum(row[9] ?? ''), aprobacion,
    });
  }
  return out;
}

export interface VentasObjetivoRow { dateStr: string; nuevos: number; renovadores: number; monto: number; }

export function parseVentasObjetivo(rows: string[][]): VentasObjetivoRow[] {
  const out: VentasObjetivoRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[0]) continue;
    const date = parseSheetDate(row[0]);
    if (!date) continue;
    out.push({
      dateStr: toDateStr(date),
      nuevos: parseSheetNum(row[3] ?? ''),
      renovadores: parseSheetNum(row[4] ?? ''),
      monto: parseSheetNum(row[5] ?? ''),
    });
  }
  return out;
}

export function getVentasPeriodo(ventas: VentasObjetivoRow[], start: string, end: string): { nuevos: number; renovadores: number; monto: number } | null {
  const filtered = ventas.filter(v => v.dateStr >= start && v.dateStr <= end);
  if (filtered.length === 0) return null;
  return {
    nuevos: Math.round(filtered.reduce((s, v) => s + v.nuevos, 0)),
    renovadores: Math.round(filtered.reduce((s, v) => s + v.renovadores, 0)),
    monto: filtered.reduce((s, v) => s + v.monto, 0),
  };
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 5: Verificar con fixtures a mano**

```ts
// scratch-verify-task4.ts (temporal, no se commitea)
import { getKpiPeriodo, weeksInMonth, rcT, parseProveedoresAr, getVentasPeriodo, parseVentasObjetivo, type DiaFlujo, type DiaProyeccion } from './src/components/submodules/flujoFinancieroHelpers';

const diasReal: DiaFlujo[] = [
  { dateStr: '2026-05-01', month: 4, day: 1, saldoInicio: 1000, cobranzas: 500, originaciones: 300, proveedores: 100, impuestos: 50, sueldos: 0, gastosBanc: 0, caucion: 0, recuperoColombia: 0, prestamos: 0, devCaucion: 0, tarjetas: 0, totalIngFin: 0, totalEgrFin: 0, freeCashflowFin: 0, saldoFinal: 1650 },
  { dateStr: '2026-05-02', month: 4, day: 2, saldoInicio: 1650, cobranzas: 400, originaciones: 350, proveedores: 80, impuestos: 40, sueldos: 0, gastosBanc: 0, caucion: 0, recuperoColombia: 0, prestamos: 0, devCaucion: 0, tarjetas: 0, totalIngFin: 0, totalEgrFin: 0, freeCashflowFin: 0, saldoFinal: 1580 },
];
const diasProy: DiaProyeccion[] = [
  { dateStr: '2026-05-01', cobranzas: 480, originaciones: 310, proveedores: 90, impuestos: 45 },
  { dateStr: '2026-05-02', cobranzas: 420, originaciones: 340, proveedores: 85, impuestos: 42 },
];

const kpi = getKpiPeriodo(diasReal, diasProy, '2026-05-01', '2026-05-02');
if (kpi.cobranzas !== 900) throw new Error(`cobranzas esperaba 900, salió ${kpi.cobranzas}`);
if (kpi.saldoInicio !== 1000) throw new Error('saldoInicio debía tomar el valor del primer día del rango');
if (kpi.saldoFinal !== 1580) throw new Error('saldoFinal debía tomar el valor del último día del rango');
if (kpi.proy === null || kpi.proy.cobranzas !== 900) throw new Error('proy.cobranzas esperaba 900');
console.log('OK: getKpiPeriodo');

const weeks = weeksInMonth(2026, 4); // mayo 2026 empieza viernes 1
if (weeks[0].start !== '2026-04-25') throw new Error(`primera semana debía arrancar el sábado 25/abr, salió ${weeks[0].start}`);
console.log('OK: weeksInMonth', weeks.map(w => w.label));

if (rcT(60, 'AR').cls !== 'sem-green') throw new Error('AR 60% debía ser verde');
if (rcT(63, 'AR').cls !== 'sem-yellow') throw new Error('AR 63% debía ser amarillo');
if (rcT(65, 'AR').cls !== 'sem-red' || !rcT(65, 'AR').alerta) throw new Error('AR 65% debía ser rojo + alerta');
if (rcT(66, 'CO').cls !== 'sem-green') throw new Error('CO 66% debía ser verde');
if (rcT(69, 'CO').cls !== 'sem-red') throw new Error('CO 69% debía ser rojo');
console.log('OK: rcT');

const proveedoresRows: string[][] = [
  ['Sociedad', 'Detalle', 'Mes', 'DiaPago', '', '', 'Venc', '', 'Nombre', 'Importe', '', '', '', '', '', 'Aprobacion'],
  ['Social Plus S.A.', 'x', 'Mayo', '5', '', '', '2026-05-05', '', 'Proveedor Excluido', '1000', '', '', '', '', '', 'Si'],
  ['Barsatex', 'y', 'Mayo', '10', '', '', '2026-05-10', '', 'Proveedor Valido', '2000', '', '', '', '', '', 'pendiente'],
  ['Barsatex', 'z', 'Mayo', '12', '', '', '2026-05-12', '', 'Proveedor Rechazado', '500', '', '', '', '', '', 'No'],
];
const prov = parseProveedoresAr(proveedoresRows);
if (prov.length !== 1 || prov[0].nombre !== 'Proveedor Valido') throw new Error(`esperaba 1 proveedor valido, salió ${JSON.stringify(prov)}`);
console.log('OK: parseProveedoresAr');

const ventasRows: string[][] = [
  ['Fecha', 'Semana', '', 'Nuevos', 'Renovadores', 'Monto'],
  ['2026-05-01', 'S1', '', '10', '5', '100000'],
  ['2026-05-02', 'S1', '', '8', '6', '90000'],
];
const ventas = parseVentasObjetivo(ventasRows);
const periodo = getVentasPeriodo(ventas, '2026-05-01', '2026-05-02');
if (!periodo || periodo.nuevos !== 18 || periodo.monto !== 190000) throw new Error(`getVentasPeriodo no matcheó, salió ${JSON.stringify(periodo)}`);
console.log('OK: parseVentasObjetivo + getVentasPeriodo');
```

Run: `npx tsx scratch-verify-task4.ts`
Expected: todas las líneas "OK: ..." se imprimen, sin excepciones.

Borrar el script temporal: `rm scratch-verify-task4.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/components/submodules/flujoFinancieroHelpers.ts
git commit -m "feat: add period aggregation, weeks/days, semáforo and proveedores/ventas parsers"
```

---

### Task 5: Frontend — `FlujoFinancieroSubmodule.tsx` esqueleto (fetch, parseo, estado, header)

**Files:**
- Create: `src/components/submodules/FlujoFinancieroSubmodule.tsx`

**Interfaces:**
- Consumes: todo lo de `flujoFinancieroHelpers.ts` (Tasks 3-4)

- [ ] **Step 1: Crear el componente con fetch, parseo y estado de selección**

```tsx
// src/components/submodules/FlujoFinancieroSubmodule.tsx
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { RefreshCcw, Loader2, AlertCircle } from 'lucide-react';
import {
  ROWS_AR_REAL, ROWS_AR_PROY, ROWS_CO_REAL, ROWS_CO_PROY,
  parseDailyReal, parseDailyProy, parseProveedoresAr, parseProveedoresCo, parseVentasObjetivo,
  weeksInMonth, daysInMonth, getKpiPeriodo, getVentasPeriodo, fmt, fmtLocal, rcT,
  type DiaFlujo, type DiaProyeccion, type ProveedorRow, type VentasObjetivoRow, type Pais, type Semana,
} from './flujoFinancieroHelpers';

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const C = {
  bg: '#060d1c', bgCard: '#0c1528', bgCard2: '#111e35', border: '#1a2845', border2: '#243558',
  txt: '#e2e8f5', txt2: '#7a90b0', txt3: '#3d5070',
  greenL: '#34d399', redL: '#fb7185', amberL: '#fcd34d', blueL: '#60a5fa', green: '#10b981', amber: '#f59e0b',
};

type Vista = 'mes' | 'semana' | 'dia';

interface PaisData {
  real: DiaFlujo[];
  proy: DiaProyeccion[];
  proveedores: ProveedorRow[];
  ventas: VentasObjetivoRow[];
}

export default function FlujoFinancieroSubmodule() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataAr, setDataAr] = useState<PaisData | null>(null);
  const [dataCo, setDataCo] = useState<PaisData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [pais, setPais] = useState<Pais>('AR');
  const [selMonth, setSelMonth] = useState(new Date().getMonth());
  const [vista, setVista] = useState<Vista>('mes');
  const [selWeekIdx, setSelWeekIdx] = useState(0);
  const [selDay, setSelDay] = useState<string>('');

  const fetchData = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try {
      if (force) await fetch('/api/flujo-financiero/refresh');
      const res = await fetch('/api/flujo-financiero');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setDataAr({
        real: parseDailyReal(json.ar.real, ROWS_AR_REAL, json.ar.originaciones),
        proy: parseDailyProy(json.ar.proy, ROWS_AR_PROY),
        proveedores: parseProveedoresAr(json.ar.proveedores),
        ventas: parseVentasObjetivo(json.ar.ventas),
      });
      setDataCo({
        real: parseDailyReal(json.co.real, ROWS_CO_REAL, json.co.originaciones),
        proy: parseDailyProy(json.co.proy, ROWS_CO_PROY),
        proveedores: parseProveedoresCo(json.co.proveedores),
        ventas: parseVentasObjetivo(json.co.ventas),
      });
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activo = pais === 'AR' ? dataAr : dataCo;

  const semanas: Semana[] = useMemo(() => weeksInMonth(2026, selMonth), [selMonth]);
  const dias: string[] = useMemo(() => daysInMonth(2026, selMonth), [selMonth]);

  useEffect(() => { setSelWeekIdx(0); }, [selMonth]);
  useEffect(() => { if (dias.length > 0) setSelDay(d => dias.includes(d) ? d : dias[0]); }, [dias]);

  // Rango de la Fila 1 según la vista elegida
  const rangoPeriodo = useMemo((): { start: string; end: string } => {
    if (vista === 'dia') return { start: selDay, end: selDay };
    if (vista === 'semana') {
      const w = semanas[selWeekIdx] ?? semanas[0];
      return w ? { start: w.start, end: w.end } : { start: dias[0], end: dias[0] };
    }
    return { start: dias[0], end: dias[dias.length - 1] };
  }, [vista, selDay, selWeekIdx, semanas, dias]);

  // Rango del mes completo para la Fila 2 (siempre el mes, sin importar la vista)
  const rangoMes = useMemo(() => ({ start: dias[0], end: dias[dias.length - 1] }), [dias]);

  const kpiPeriodo = useMemo(
    () => activo ? getKpiPeriodo(activo.real, activo.proy, rangoPeriodo.start, rangoPeriodo.end) : null,
    [activo, rangoPeriodo]
  );
  const kpiMes = useMemo(
    () => activo ? getKpiPeriodo(activo.real, activo.proy, rangoMes.start, rangoMes.end) : null,
    [activo, rangoMes]
  );
  const ventasMes = useMemo(
    () => activo ? getVentasPeriodo(activo.ventas, rangoMes.start, rangoMes.end) : null,
    [activo, rangoMes]
  );

  if (loading) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '80px 0', background: C.bg }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Loader2 style={{ width: 32, height: 32, color: C.blueL }} className="animate-spin" />
        <p style={{ color: C.txt2, fontSize: 13 }}>Cargando datos de flujo financiero...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '80px 0', background: C.bg }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 320, textAlign: 'center' }}>
        <AlertCircle style={{ width: 40, height: 40, color: C.redL }} />
        <p style={{ color: C.txt, fontWeight: 700 }}>Error al cargar datos</p>
        <p style={{ color: C.txt2, fontSize: 13 }}>{error}</p>
        <button onClick={() => fetchData(true)} style={{ padding: '8px 16px', background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 8, color: C.blueL, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCcw size={14} /> Reintentar
        </button>
      </div>
    </div>
  );

  const card: CSSProperties = { background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, position: 'relative', overflow: 'hidden' };
  const mono: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ background: C.bg, minHeight: '100%', flex: 1, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: C.txt }}>
      {/* ── HEADER ── */}
      <div style={{ background: 'linear-gradient(135deg,#07102a 0%,#0c1a3a 100%)', borderBottom: `1px solid ${C.border}`, padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg,#3b82f6,#7c3aed)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: '#fff', flexShrink: 0 }}>G</div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>Flujo Financiero</div>
            <div style={{ fontSize: 11, color: C.txt2, marginTop: 3 }}>Grupo Libgot · Anticipo · {pais === 'AR' ? 'Argentina' : 'Colombia'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefresh && <span style={{ fontSize: 10, color: C.txt3 }}>Act. {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => fetchData(true)} style={{ padding: 6, background: C.bgCard2, border: `1px solid ${C.border2}`, borderRadius: 7, color: C.txt2, cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Actualizar">
            <RefreshCcw size={13} />
          </button>
        </div>
      </div>

      {/* ── CONTROLS ── */}
      <div style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>País</span>
          <select value={pais} onChange={e => setPais(e.target.value as Pais)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            <option value="AR">🇦🇷 Argentina</option>
            <option value="CO">🇨🇴 Colombia</option>
          </select>
        </div>
        <div style={{ width: 1, height: 22, background: C.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Mes</span>
          <select value={selMonth} onChange={e => setSelMonth(parseInt(e.target.value))} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {MN.map((mn, i) => <option key={i} value={i}>{mn} 2026</option>)}
          </select>
        </div>
        <div style={{ width: 1, height: 22, background: C.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 0.6 }}>Vista</span>
          <select value={vista} onChange={e => setVista(e.target.value as Vista)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            <option value="mes">Mes</option>
            <option value="semana">Semana</option>
            <option value="dia">Día</option>
          </select>
        </div>
        {vista === 'semana' && (
          <select value={selWeekIdx} onChange={e => setSelWeekIdx(parseInt(e.target.value))} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {semanas.map((w, i) => <option key={i} value={i}>{w.label}</option>)}
          </select>
        )}
        {vista === 'dia' && (
          <select value={selDay} onChange={e => setSelDay(e.target.value)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '5px 28px 5px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {dias.map(d => {
              const dt = new Date(d + 'T12:00:00');
              return <option key={d} value={d}>{dt.getDate()} {MN[dt.getMonth()].slice(0, 3)}</option>;
            })}
          </select>
        )}
      </div>

      {/* ── MAIN (continúa en Tasks 6-9) ── */}
      <div style={{ padding: '20px 24px', maxWidth: 1680, margin: '0 auto' }}>
        {!activo || !kpiPeriodo || !kpiMes ? (
          <p style={{ color: C.txt2, fontSize: 13 }}>Sin datos para {pais === 'AR' ? 'Argentina' : 'Colombia'}.</p>
        ) : (
          <p style={{ color: C.txt3, fontSize: 11 }}>
            Período: {rangoPeriodo.start} a {rangoPeriodo.end} · Cobranzas del período: {fmtLocal(kpiPeriodo.cobranzas, pais)} ·
            Mes completo: {fmtLocal(kpiMes.cobranzas, pais)}
            {ventasMes ? ` · Objetivo ventas mes: ${fmtLocal(ventasMes.monto, pais)}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
```

Este esqueleto ya deja armados: fetch + parseo de las 4 fuentes por país, selección de país/mes/vista/semana/día, y el cálculo de `kpiPeriodo` (Fila 1) y `kpiMes`+`ventasMes` (Fila 2) — las próximas tasks solo agregan JSX de presentación arriba del placeholder final, no tocan esta lógica.

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/submodules/FlujoFinancieroSubmodule.tsx
git commit -m "feat: add FlujoFinancieroSubmodule skeleton (fetch, parse, period selection)"
```

---

### Task 6: Frontend — Fila 1 (KPI del período exacto)

**Files:**
- Modify: `src/components/submodules/FlujoFinancieroSubmodule.tsx`

**Interfaces:**
- Consumes: `kpiPeriodo`, `rangoPeriodo`, `vista` (Task 5)

- [ ] **Step 1: Reemplazar el placeholder final por la Fila 1**

Reemplazar el bloque `{/* ── MAIN (continúa en Tasks 6-9) ── */}` completo por:

```tsx
      {/* ── MAIN ── */}
      <div style={{ padding: '20px 24px', maxWidth: 1680, margin: '0 auto' }}>
        {!activo || !kpiPeriodo || !kpiMes ? (
          <p style={{ color: C.txt2, fontSize: 13 }}>Sin datos para {pais === 'AR' ? 'Argentina' : 'Colombia'}.</p>
        ) : (
          <>
            {/* Fila 1: posición del período elegido */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                {vista === 'dia' ? 'Posición del Día' : vista === 'semana' ? 'Posición de la Semana' : 'Totales del Mes'}
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {([
                { lbl: 'Saldo Inicio', val: kpiPeriodo.saldoInicio, proy: null, isEgreso: false },
                { lbl: 'Cobranzas', val: kpiPeriodo.cobranzas, proy: kpiPeriodo.proy?.cobranzas ?? null, isEgreso: false },
                { lbl: 'Originaciones', val: -kpiPeriodo.originaciones, proy: kpiPeriodo.proy?.originaciones ?? null, isEgreso: true },
                { lbl: 'Proveedores', val: -kpiPeriodo.proveedores, proy: kpiPeriodo.proy?.proveedores ?? null, isEgreso: true },
                { lbl: 'Impuestos', val: -kpiPeriodo.impuestos, proy: kpiPeriodo.proy?.impuestos ?? null, isEgreso: true },
                { lbl: 'Saldo Final', val: kpiPeriodo.saldoFinal, proy: null, isEgreso: false },
              ] as const).map(c => {
                const proyVal = c.proy === null ? null : (c.isEgreso ? -c.proy : c.proy);
                const delta = proyVal === null ? null : Math.abs(c.val) - Math.abs(proyVal);
                const bueno = delta === null ? null : (c.isEgreso ? delta < 0 : delta > 0);
                return (
                  <div key={c.lbl} style={{ ...card, padding: '14px 16px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 9 }}>{c.lbl}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -1, lineHeight: 1, marginBottom: 5, ...mono, color: c.val < 0 ? C.redL : C.txt }}>{fmt(c.val)}</div>
                    <div style={{ fontSize: 11, color: C.txt3 }}>{fmtLocal(c.val, pais)}</div>
                    {proyVal !== null && Math.abs(delta ?? 0) >= 1 && (
                      <>
                        <div style={{ fontSize: 10, color: C.txt3, fontStyle: 'italic', marginTop: 6 }}>Proy: <strong style={{ color: C.txt2 }}>{fmt(proyVal)}</strong></div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: bueno ? C.greenL : C.redL }}>
                          {(delta ?? 0) > 0 ? '+' : ''}{fmt(delta ?? 0)} vs proy
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {(() => {
                const ratioEstado = rcT(kpiPeriodo.ratio, pais);
                const color = ratioEstado.cls === 'sem-red' ? C.redL : ratioEstado.cls === 'sem-yellow' ? C.amberL : C.greenL;
                return (
                  <div style={{ ...card, padding: '14px 16px', borderColor: ratioEstado.alerta ? 'rgba(244,63,94,.4)' : C.border }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: C.txt2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 9 }}>Ratio Orig/Cob</div>
                    <div style={{ fontSize: 20, fontWeight: 800, ...mono, color }}>{kpiPeriodo.ratio.toFixed(1)}%</div>
                    <div style={{ fontSize: 10, color: C.txt3, marginTop: 4 }}>Orig {fmt(kpiPeriodo.originaciones)} / Cob {fmt(kpiPeriodo.cobranzas)}</div>
                    {kpiPeriodo.proy && (
                      <div style={{ fontSize: 10, color: C.txt3, fontStyle: 'italic', marginTop: 6 }}>Proy: <strong style={{ color: C.txt2 }}>{kpiPeriodo.proy.ratio.toFixed(1)}%</strong></div>
                    )}
                    {ratioEstado.alerta && <div style={{ marginTop: 6, fontSize: 9, fontWeight: 700, color: C.redL }}>ALERTA</div>}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/submodules/FlujoFinancieroSubmodule.tsx
git commit -m "feat: render Fila 1 (posición del período) KPI cards"
```

---

### Task 7: Frontend — Fila 2 (resumen del mes completo) + Otros rubros

**Files:**
- Modify: `src/components/submodules/FlujoFinancieroSubmodule.tsx`

**Interfaces:**
- Consumes: `kpiMes`, `ventasMes`, `activo.real`, `rangoMes` (Task 5)

- [ ] **Step 1: Agregar la Fila 2 después del cierre del grid de Fila 1**

Insertar, dentro del mismo bloque `<>...</>` de contenido, inmediatamente después del `</div>` que cierra el grid de Fila 1 (el que sigue al IIFE de la tarjeta de Ratio):

```tsx
            {/* Fila 2: resumen del mes calendario completo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                Resumen - {MN[selMonth]} 2026
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              {/* Ventas: excepción — compara contra objetivo, no contra proyección de cashflow */}
              <div style={{ ...card, padding: '16px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2, marginBottom: 10 }}>Ventas</div>
                <div style={{ fontSize: 22, fontWeight: 800, ...mono, marginBottom: 6 }}>{fmt(kpiMes.originaciones)}</div>
                <div style={{ fontSize: 11, color: C.txt3, marginBottom: 10 }}>{fmtLocal(kpiMes.originaciones, pais)}</div>
                {ventasMes ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3, marginBottom: 6 }}>
                      <span>Obj. ventas</span><span>{fmtLocal(ventasMes.monto, pais)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{ventasMes.nuevos.toLocaleString('es-AR')}</div>
                        <div style={{ fontSize: 9, color: C.txt3, textTransform: 'uppercase' }}>Nuevos</div>
                      </div>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{ventasMes.renovadores.toLocaleString('es-AR')}</div>
                        <div style={{ fontSize: 9, color: C.txt3, textTransform: 'uppercase' }}>Renovadores</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 10.5, color: C.amberL, fontStyle: 'italic' }}>Sin objetivo para este período</div>
                )}
              </div>

              {([
                { lbl: 'Cobranzas', val: kpiMes.cobranzas, proy: kpiMes.proy?.cobranzas ?? null },
                { lbl: 'Proveedores', val: kpiMes.proveedores, proy: kpiMes.proy?.proveedores ?? null },
                { lbl: 'Impuestos', val: kpiMes.impuestos, proy: kpiMes.proy?.impuestos ?? null },
              ] as const).map(c => {
                const pct = c.proy && c.proy > 0 ? (c.val / c.proy) * 100 : null;
                return (
                  <div key={c.lbl} style={{ ...card, padding: '16px 18px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2, marginBottom: 10 }}>{c.lbl}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, ...mono, marginBottom: 8 }}>{fmt(c.val)}</div>
                    {c.proy !== null && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3, marginBottom: 4 }}>
                          <span>vs proyectado mes</span>
                          <span style={{ fontWeight: 700, color: pct !== null && pct > 100 ? C.redL : C.txt2 }}>{pct !== null ? pct.toFixed(1) + '%' : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3 }}>
                          <span>Proyectado</span><span>{fmt(c.proy)}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {(() => {
                const ratioEstado = rcT(kpiMes.ratio, pais);
                const color = ratioEstado.cls === 'sem-red' ? C.redL : ratioEstado.cls === 'sem-yellow' ? C.amberL : C.greenL;
                return (
                  <div style={{ ...card, padding: '16px 18px', borderColor: ratioEstado.alerta ? 'rgba(244,63,94,.4)' : C.border }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2, marginBottom: 10 }}>Ratio Orig/Cob</div>
                    <div style={{ fontSize: 22, fontWeight: 800, ...mono, color, marginBottom: 8 }}>{kpiMes.ratio.toFixed(1)}%</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3, marginBottom: 4 }}>
                      <span>Período seleccionado</span><span>{kpiPeriodo.ratio.toFixed(1)}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.txt3 }}>
                      <span>Objetivo</span><span>&lt; {pais === 'AR' ? '62' : '67'}%</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Otros rubros del mes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Otros Rubros · {MN[selMonth]} 2026</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <OtrosRubros pais={pais} real={activo.real} start={rangoMes.start} end={rangoMes.end} card={card} mono={mono} />
```

**No agregar ningún tag de cierre después de esta línea.** Task 6 ya dejó, inmediatamente después del `</div>` que cierra el grid de Fila 1, la secuencia `</>` `)}` `</div>` que cierra el Fragment/ternario/`MAIN` div — ese código de Task 6 no se toca, el bloque de arriba se inserta *entre* el `</div>` del grid de Fila 1 y esa secuencia de cierre ya existente. Si al aplicar este step tu editor muestra `</div>\n</>\n)}\n</div>` inmediatamente después de la línea `<OtrosRubros .../>` recién agregada, es exactamente lo esperado — no lo dupliques ni lo borres.

- [ ] **Step 2: Agregar el componente `OtrosRubros` (composición distinta AR/CO)**

Agregar al final del archivo, después de la función principal `FlujoFinancieroSubmodule`:

```tsx
function OtrosRubros({ pais, real, start, end, card, mono }: {
  pais: Pais; real: DiaFlujo[]; start: string; end: string; card: CSSProperties; mono: CSSProperties;
}) {
  const sum = (campo: keyof Omit<DiaFlujo, 'dateStr' | 'month' | 'day'>) =>
    real.filter(d => d.dateStr >= start && d.dateStr <= end).reduce((s, d) => s + (d[campo] as number), 0);

  const filas = pais === 'AR'
    ? [
        { lbl: 'Sueldos', val: sum('sueldos') },
        { lbl: 'Gastos Bancarios', val: sum('gastosBanc') },
        { lbl: 'Caución', val: sum('caucion') },
        { lbl: 'Recupero Colombia', val: sum('recuperoColombia') },
        { lbl: 'Préstamos', val: sum('prestamos') },
        { lbl: 'Devolución Caución', val: sum('devCaucion') },
      ]
    : [
        { lbl: 'Sueldos', val: sum('sueldos') },
        { lbl: 'Gastos Bancarios', val: sum('gastosBanc') },
        { lbl: 'Tarjetas de Crédito', val: sum('tarjetas') },
        { lbl: 'Total Ingresos Financieros', val: sum('totalIngFin') },
        { lbl: 'Total Egresos Financieros', val: sum('totalEgrFin') },
        { lbl: 'Free Cashflow Financiero', val: sum('freeCashflowFin') },
      ];

  return (
    <div style={{ ...card, padding: 0, marginBottom: 12 }}>
      {filas.map((f, i) => (
        <div key={f.lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderBottom: i < filas.length - 1 ? `1px solid ${C.border}` : 'none' }}>
          <span style={{ fontSize: 12, color: C.txt2 }}>{f.lbl}</span>
          <span style={{ fontSize: 12, fontWeight: 700, ...mono, color: f.val < 0 ? C.redL : C.txt }}>{fmt(f.val)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/submodules/FlujoFinancieroSubmodule.tsx
git commit -m "feat: render Fila 2 (resumen del mes) and Otros Rubros"
```

---

### Task 8: Frontend — gráfico de evolución del Ratio Orig/Cob

**Files:**
- Modify: `src/components/submodules/FlujoFinancieroSubmodule.tsx`

**Interfaces:**
- Consumes: `activo.real`, `activo.proy`, `getKpiPeriodo`, `rcT` (Tasks 3-5)

- [ ] **Step 1: Importar Chart.js y agregar el cálculo de ratios mensuales**

Agregar al inicio del archivo (junto a los otros imports):

```tsx
import { useRef } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
```

(Sumar `useRef` al import ya existente de React en vez de duplicar la línea — el import final debe quedar `import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';`.)

Dentro del componente, después de la definición de `ventasMes`, agregar:

```tsx
  const ratiosPorMes = useMemo(() => {
    if (!activo) return [];
    return Array.from({ length: 12 }, (_, m) => {
      const diasDelMes = daysInMonth(2026, m);
      const k = getKpiPeriodo(activo.real, activo.proy, diasDelMes[0], diasDelMes[diasDelMes.length - 1]);
      return { mes: m, ratio: k.ratio };
    });
  }, [activo]);

  const chartRatioRef = useRef<HTMLCanvasElement>(null);
  const chartRatioInst = useRef<Chart | null>(null);

  useEffect(() => {
    chartRatioInst.current?.destroy();
    if (!chartRatioRef.current || ratiosPorMes.length === 0) return;

    const MS_CORTAS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const colorPorRatio = (r: number) => {
      const est = rcT(r, pais);
      return est.cls === 'sem-red' ? '#f43f5e' : est.cls === 'sem-yellow' ? '#f59e0b' : '#10b981';
    };

    chartRatioInst.current = new Chart(chartRatioRef.current, {
      type: 'bar',
      data: {
        labels: MS_CORTAS,
        datasets: [{
          data: ratiosPorMes.map(r => r.ratio),
          backgroundColor: ratiosPorMes.map(r => colorPorRatio(r.ratio)),
          borderColor: ratiosPorMes.map((_, i) => i === selMonth ? '#fff' : 'transparent'),
          borderWidth: ratiosPorMes.map((_, i) => i === selMonth ? 2 : 0),
          borderRadius: 5,
        } as any],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c: any) => ` ${c.raw.toFixed(1)}%` } },
        },
        scales: {
          x: { ticks: { color: C.txt3, font: { size: 10 } }, grid: { color: 'rgba(26,40,69,0.8)' } },
          y: { ticks: { color: C.txt3, font: { size: 10 }, callback: (v: any) => `${v}%` }, grid: { color: 'rgba(26,40,69,0.8)' } },
        },
      },
    });

    return () => { chartRatioInst.current?.destroy(); };
  }, [ratiosPorMes, selMonth, pais]);
```

- [ ] **Step 2: Renderizar el canvas**

Insertar, dentro del `<>...</>` de contenido, inmediatamente después del `<OtrosRubros .../>` agregado en Task 7:

```tsx
            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.txt2 }}>Evolución del Ratio Orig/Cob</div>
                <div style={{ fontSize: 10, color: C.txt3 }}>Mensual 2026 · {pais === 'AR' ? 'Argentina' : 'Colombia'}</div>
              </div>
              <div style={{ height: 195, position: 'relative' }}>
                <canvas ref={chartRatioRef} />
              </div>
            </div>
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Levantar el server y confirmar visualmente que el gráfico renderiza**

```bash
npm run dev
```
Navegar a Finanzas › Flujo Financiero (todavía sin wiring — usar la skill `run` con Playwright apuntando directo a un componente de prueba no aplica aún; este chequeo visual completo se hace en Task 11 una vez wireado el submódulo). Por ahora alcanza con que `npm run lint` no tire errores de tipos en el uso de `Chart`.

- [ ] **Step 5: Commit**

```bash
git add src/components/submodules/FlujoFinancieroSubmodule.tsx
git commit -m "feat: add monthly Ratio Orig/Cob evolution chart"
```

---

### Task 9: Frontend — tabla de proveedores con filtros

**Files:**
- Modify: `src/components/submodules/FlujoFinancieroSubmodule.tsx`

**Interfaces:**
- Consumes: `activo.proveedores` (Task 5)

- [ ] **Step 1: Agregar estado de filtros y la lista filtrada**

Dentro del componente principal, junto a los otros `useState`:

```tsx
  const [provBusqueda, setProvBusqueda] = useState('');
  const [provSociedad, setProvSociedad] = useState('');
  const [provAprobacion, setProvAprobacion] = useState('');
```

Después de `ratiosPorMes`, agregar:

```tsx
  const proveedoresFiltrados = useMemo(() => {
    if (!activo) return [];
    const q = provBusqueda.trim().toLowerCase();
    return activo.proveedores.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) && !p.detalle.toLowerCase().includes(q)) return false;
      if (provSociedad && p.sociedad !== provSociedad) return false;
      if (provAprobacion && p.aprobacion !== provAprobacion) return false;
      return true;
    });
  }, [activo, provBusqueda, provSociedad, provAprobacion]);

  const sociedadesDisponibles = useMemo(
    () => activo ? [...new Set(activo.proveedores.map(p => p.sociedad))].sort() : [],
    [activo]
  );
```

- [ ] **Step 2: Renderizar la sección de proveedores**

Insertar, dentro del `<>...</>` de contenido, inmediatamente después del gráfico de ratio agregado en Task 8:

```tsx
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '28px 0 14px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.txt3, textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>Proveedores</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontSize: 11, color: C.txt3 }}>{proveedoresFiltrados.length} de {activo.proveedores.length}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                type="text" placeholder="Buscar por nombre o detalle..." value={provBusqueda}
                onChange={e => setProvBusqueda(e.target.value)}
                style={{ flex: '1 1 220px', background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}
              />
              <select value={provSociedad} onChange={e => setProvSociedad(e.target.value)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
                <option value="">Todas las sociedades</option>
                {sociedadesDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={provAprobacion} onChange={e => setProvAprobacion(e.target.value)} style={{ background: C.bgCard2, border: `1px solid ${C.border2}`, color: C.txt, padding: '7px 12px', borderRadius: 8, fontSize: 12, outline: 'none' }}>
                <option value="">Todos los estados</option>
                <option value="Si">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
            </div>

            <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 32 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bgCard2 }}>
                    {['Sociedad', 'Detalle', 'Mes', 'Día pago', 'Vencimiento', 'Nombre', 'Importe', 'Estado'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: C.txt3, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proveedoresFiltrados.map((p, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{p.sociedad}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{p.detalle}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{p.mes}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{p.diaPago}</td>
                      <td style={{ padding: '7px 14px', color: C.txt2 }}>{p.vencimiento}</td>
                      <td style={{ padding: '7px 14px', color: C.txt }}>{p.nombre}</td>
                      <td style={{ padding: '7px 14px', ...mono, color: C.txt, fontWeight: 700 }}>{fmtLocal(p.importe, pais)}</td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, color: p.aprobacion === 'Si' ? C.greenL : C.amberL, background: p.aprobacion === 'Si' ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.12)' }}>
                          {p.aprobacion === 'Si' ? 'Pagado' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {proveedoresFiltrados.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: C.txt3 }}>Sin resultados para estos filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/submodules/FlujoFinancieroSubmodule.tsx
git commit -m "feat: add proveedores table with search/sociedad/estado filters"
```

---

### Task 10: Wiring — menú y routing

**Files:**
- Modify: `src/components/LandingPage.tsx`
- Modify: `src/components/DashboardView.tsx`

- [ ] **Step 1: Agregar el submódulo a `finance` en `LandingPage.tsx`**

Ubicar el bloque `id: 'finance'` (contiene `cartera-fideicomiso-arg` y `tesoreria` dentro de `submodules`) y agregar un tercer elemento:

```ts
      {
        id: 'flujo-financiero',
        title: 'Flujo Financiero',
        description: 'Cashflow diario/mensual, proveedores y ratio originación/cobranza — Argentina y Colombia.',
        color: 'bg-slate-800'
      }
```

- [ ] **Step 2: Importar el componente en `DashboardView.tsx`**

Junto al import de `TesoreriaSubmodule`:

```ts
import FlujoFinancieroSubmodule from './submodules/FlujoFinancieroSubmodule';
```

- [ ] **Step 3: Agregar la rama de routing**

Junto a `activeSubmodule.id === 'tesoreria'` (`DashboardView.tsx`, alrededor de la línea 1725 antes de este wiring — la línea puede haberse movido, buscar por el texto `<TesoreriaSubmodule userEmail={userEmail} />`):

```tsx
          ) : activeSubmodule.id === 'tesoreria' ? (
            <TesoreriaSubmodule userEmail={userEmail} />
          ) : activeSubmodule.id === 'flujo-financiero' ? (
            <FlujoFinancieroSubmodule />
```

(`FlujoFinancieroSubmodule` no recibe `userEmail` — no tiene panel de IA que lo necesite, a diferencia de `TesoreriaSubmodule`.)

- [ ] **Step 4: Agregar `'flujo-financiero'` al array `isLive`**

Buscar `const isLive = [...]` en `DashboardView.tsx` y agregar `'flujo-financiero'` a la lista (mismo patrón que el resto de submódulos terminados).

- [ ] **Step 5: Verificar que compila**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/LandingPage.tsx src/components/DashboardView.tsx
git commit -m "feat: wire Flujo Financiero submodule into Finanzas menu and routing"
```

---

### Task 11: Verificación end-to-end

**Files:** ninguno

- [ ] **Step 1: Levantar el dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navegar con Playwright (o manualmente) a Finanzas › Flujo Financiero**

Confirmar: la tarjeta aparece en Finanzas, el submódulo carga sin errores de consola, las tarjetas de Fila 1 y Fila 2 muestran montos, el gráfico de ratio renderiza, y la tabla de proveedores lista filas.

- [ ] **Step 3: Cambiar País (AR → CO) y confirmar que ambas filas, otros rubros, gráfico y tabla de proveedores se actualizan con la moneda correcta (`$` para AR, `COP` para CO)**

- [ ] **Step 4: Cambiar Vista (Mes → Semana → Día) dentro del mismo mes y confirmar que la Fila 1 cambia con el recorte, mientras la Fila 2 ("Resumen - [mes]") se mantiene igual sin importar el recorte de Fila 1**

- [ ] **Step 5: Confirmar que ningún request de red nuevo se dispara a `/api/flujo-financiero` al cambiar país/vista/mes/semana/día** — todo el recorte se resuelve client-side sobre el payload ya cargado (`fetchData` solo se llama al montar o al apretar "Actualizar").

- [ ] **Step 6: Probar la tabla de proveedores — escribir en el buscador, elegir una sociedad y un estado, confirmar que la lista se filtra y el contador "`N` de `M`" es coherente**

- [ ] **Step 7: `npm run lint` final**

Expected: sin errores en todo el proyecto.

---

## Self-Review

**Spec coverage:**
- ✅ Backend de solo lectura, sin S3 — Tasks 1-2.
- ✅ Proyecciones estáticas desde `04. Proyecciones` (AR + CO, mismos spreadsheets) — Tasks 2-3.
- ✅ Originación real desde `/api/sales-s3` — Task 1 (`getOriginacionesDiariasPorPais`) + Task 3 (`parseDailyReal` ignora la fila del sheet).
- ✅ Fila 1 = período exacto con comparación simétrica AR/CO — Task 6.
- ✅ Fila 2 = mes completo, 5 tarjetas, Ventas como excepción (objetivo, no proyección) — Task 7.
- ✅ Otros rubros AR/CO con composición distinta — Task 7.
- ✅ CO ingresos/egresos financieros desde filas de total (32/39) — Task 3 (`ROWS_CO_REAL.totalIngFin/totalEgrFin`).
- ✅ Filtros de proveedores (Social Plus excluida en AR, aprobación≠No en CO) — Task 4 (`parseProveedoresAr/Co`).
- ✅ Semáforo del ratio por país — Task 4 (`rcT`) + Tasks 6-8.
- ✅ Gráfico de ratio — Task 8.
- ✅ Wiring en menú/routing — Task 10.
- ✅ Verificación end-to-end — Task 11.

**Placeholder scan:** sin TBD/TODO — cada step tiene código completo o un comando de verificación concreto.

**Type consistency:** `Pais` (`'AR'|'CO'`), `DiaFlujo`, `DiaProyeccion`, `KpiPeriodo`, `Semana`, `ProveedorRow`, `VentasObjetivoRow` se definen una sola vez en `flujoFinancieroHelpers.ts` (Tasks 3-4) y se importan sin redefinir en `FlujoFinancieroSubmodule.tsx` (Tasks 5-9) — nombres de campos verificados consistentes entre `getKpiPeriodo` (Task 4) y su consumo en Tasks 6-8 (`kpiPeriodo.proy?.cobranzas`, etc.).

