# Cartera ARG – Fideicomiso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el sub-módulo "Cartera ARG – Fideicomiso" dentro de Finanzas con 6 KPI cards, 5 gráficos recharts, tabla de cosechas y exportación Excel formateada.

**Architecture:** Backend agrega 2 endpoints en server.ts usando el redshiftPool existente + helper ExcelJS en archivo separado. Frontend agrega el sub-módulo a Finanzas en LandingPage/DashboardView + nuevo componente React.

**Tech Stack:** ExcelJS (nuevo), recharts, pg (existentes), TypeScript, React.

**Spec:** `docs/superpowers/specs/2026-06-17-cartera-fideicomiso-arg-design.md`

---

## Archivos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Crear | `carteraFideicomisoExcel.ts` | Generación Excel con ExcelJS (Insights + hojas por período) |
| Modificar | `server.ts` | 2 nuevos endpoints Redshift + import del helper |
| Modificar | `src/components/LandingPage.tsx` | Agregar sub-módulos a Finanzas |
| Modificar | `src/components/DashboardView.tsx` | Import + routing del nuevo componente |
| Crear | `src/components/submodules/CarteraFideicomisoSubmodule.tsx` | Componente completo: fetch, KPIs, 5 charts, tabla |

---

## Task 1: Instalar exceljs

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar la dependencia**

```
npm install exceljs
```

- [ ] **Step 2: Verificar que compiló sin errores**

```
npm run lint
```

Expected: 0 errores TypeScript.

- [ ] **Step 3: Commit**

```
git add package.json package-lock.json
git commit -m "chore: add exceljs dependency"
```

---

## Task 2: Crear helper de Excel (`carteraFideicomisoExcel.ts`)

**Files:**
- Create: `carteraFideicomisoExcel.ts` (en raíz del proyecto, junto a server.ts)

- [ ] **Step 1: Crear el archivo completo**

```typescript
import ExcelJS from 'exceljs';

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  NAVY:   'FF0B2545',
  BLUE:   'FF1F4E78',
  LBLUE:  'FF5B8DEF',
  TEAL:   'FF13A8A8',
  GREEN:  'FF22C55E',
  YELLOW: 'FFF59E0B',
  ORANGE: 'FFF97316',
  RED:    'FFDC2626',
  WHITE:  'FFFFFFFF',
  GRAY:   'FF94A3B8',
  BG_GREEN:  'FFD9F2DD',
  BG_YELLOW: 'FFFFF3CD',
  BG_RED:    'FFFDECEA',
  BG_BLUE:   'FFD0E8FF',
};

const BUCKET_LABELS  = ['Current','1-30d','31-60d','61-90d','91-120d','+120d'];
const BUCKET_FIELDS  = ['a_current','b_bucket_1_30','c_bucket_31_60','d_bucket_61_90','e_bucket_91_120','f_bucket_mas_120'] as const;
const BUCKET_COLORS  = [C.GREEN, C.YELLOW, C.ORANGE, C.RED, 'FF9B1C1C', 'FF4B0000'];
const MONEY_FIELDS   = ['k_originado','k_precancelado','k_cancelado_no_precancelado','k_pagado_total','k_saldo_total',...BUCKET_FIELDS] as const;

export function fv(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

// ── Helpers de estilo ─────────────────────────────────────────────────────────
const thinBorder: ExcelJS.Borders = {
  top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

function hCell(
  ws: ExcelJS.Worksheet, row: number, col: number, value: string | number,
  fillArgb = C.BLUE, fontArgb = C.WHITE, sz = 10, bold = true, align: ExcelJS.Alignment['horizontal'] = 'center'
) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  c.font = { bold, color: { argb: fontArgb }, size: sz };
  c.alignment = { horizontal: align, vertical: 'middle', wrapText: true };
  c.border = thinBorder;
  return c;
}

function dCell(
  ws: ExcelJS.Worksheet, row: number, col: number, value: string | number | null,
  numFmt?: string, bold = false, fillArgb?: string, align: ExcelJS.Alignment['horizontal'] = 'right'
) {
  const c = ws.getCell(row, col);
  c.value = value;
  if (numFmt) c.numFmt = numFmt;
  c.font = { bold, color: { argb: bold ? C.WHITE : 'FF334155' } };
  if (fillArgb) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  c.alignment = { horizontal: align, vertical: 'middle' };
  c.border = thinBorder;
  return c;
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, value: string, colCount: number, fillArgb = C.NAVY) {
  ws.mergeCells(row, 1, row, colCount);
  const c = ws.getCell(row, 1);
  c.value = value;
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  c.font = { bold: true, color: { argb: C.WHITE }, size: 11 };
  c.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(row).height = 20;
}

function totalRow(
  ws: ExcelJS.Worksheet, row: number, values: (string | number | null)[],
  numFmts: (string | undefined)[], fillArgb = C.BLUE
) {
  values.forEach((v, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = v;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    c.font = { bold: true, color: { argb: C.WHITE } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' };
    c.border = thinBorder;
    if (numFmts[i]) c.numFmt = numFmts[i]!;
  });
  ws.getRow(row).height = 16;
}

// ── Hoja Insights ─────────────────────────────────────────────────────────────
function buildInsightsSheet(
  ws: ExcelJS.Worksheet,
  periodoFoto: string,
  fotoRows: Record<string, unknown>[],
  totalPeriodos: number
) {
  ws.getColumn('A').width = 20;
  ws.getColumn('B').width = 14;
  ws.getColumn('C').width = 14;
  ws.getColumn('D').width = 14;
  ws.getColumn('E').width = 13;
  ws.getColumn('F').width = 13;

  const COLS = 6;

  // Row 1: título
  ws.mergeCells(1, 1, 1, COLS);
  const title = ws.getCell(1, 1);
  title.value = `CARTERA FIDEICOMISO ARG — Foto Período ${periodoFoto}`;
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.NAVY } };
  title.font = { bold: true, color: { argb: C.WHITE }, size: 14 };
  title.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Row 2: metadata
  ws.mergeCells(2, 1, 2, COLS);
  const meta = ws.getCell(2, 1);
  meta.value = `Generado ${new Date().toLocaleString('es-AR')} | Cosechas en foto: ${fotoRows.length} | Períodos históricos: ${totalPeriodos}`;
  meta.font = { italic: true, size: 9, color: { argb: 'FF555555' } };
  meta.alignment = { horizontal: 'left', vertical: 'middle' };

  ws.getRow(3).height = 6;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const orig   = fotoRows.reduce((s, r) => s + fv(r['k_originado']), 0);
  const pagado = fotoRows.reduce((s, r) => s + fv(r['k_pagado_total']), 0);
  const prec   = fotoRows.reduce((s, r) => s + fv(r['k_precancelado']), 0);
  const saldo  = fotoRows.reduce((s, r) => s + fv(r['k_saldo_total']), 0);

  const kpiItems: [string, string, string][] = [
    ['K Originado Hist.', `$${(orig/1e6).toFixed(1)}M`,   C.YELLOW],
    ['K Pago Total',      `$${(pagado/1e6).toFixed(1)}M`, C.GREEN],
    ['K Precancelado',    `$${(prec/1e6).toFixed(1)}M`,   C.LBLUE],
    ['Saldo Vigente',     `$${(saldo/1e6).toFixed(1)}M`,  C.TEAL],
    ['% Pagado/Orig',     orig>0 ? `${(pagado/orig*100).toFixed(1)}%` : '—', C.BLUE],
    ['% Saldo/Orig',      orig>0 ? `${(saldo/orig*100).toFixed(1)}%` : '—', C.NAVY],
  ];

  kpiItems.forEach(([label, val, color], i) => {
    const col = i + 1;
    const lc = ws.getCell(4, col);
    lc.value = label;
    lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    lc.font = { bold: true, color: { argb: C.WHITE }, size: 9 };
    lc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(4).height = 22;

    const vc = ws.getCell(5, col);
    vc.value = val;
    vc.font = { bold: true, size: 12, color: { argb: color } };
    vc.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(5).height = 26;
  });

  ws.getRow(6).height = 8;

  // ── Distribución de Saldo por Bucket ──────────────────────────────────────
  let row = 7;
  sectionTitle(ws, row, 'Distribución de Saldo por Bucket', COLS); row++;
  ['Bucket','Saldo ($M)','% sobre Saldo','% sobre Originado'].forEach((h, i) => hCell(ws, row, i+1, h));
  ws.getRow(row).height = 18; row++;

  const buckets = BUCKET_FIELDS.map(f => fotoRows.reduce((s, r) => s + fv(r[f]), 0));
  BUCKET_LABELS.forEach((lbl, i) => {
    const val = buckets[i];
    dCell(ws, row, 1, lbl, undefined, false, undefined, 'left');
    dCell(ws, row, 2, val/1e6, '#,##0.0');
    dCell(ws, row, 3, saldo>0 ? val/saldo : 0, '0.0%');
    dCell(ws, row, 4, orig>0  ? val/orig  : 0, '0.0%');
    ws.getRow(row).height = 16; row++;
  });
  const totalSaldoBuckets = buckets.reduce((s, v) => s + v, 0);
  totalRow(ws, row, ['TOTAL', totalSaldoBuckets/1e6, 1, saldo>0 ? saldo/orig : 0],
    [undefined, '#,##0.0', '0.0%', '0.0%']); row++;

  ws.getRow(row).height = 8; row++;

  // ── Indicadores de Calidad ────────────────────────────────────────────────
  sectionTitle(ws, row, 'Indicadores de Calidad [sobre Saldo Vigente]', COLS); row++;
  ['Indicador','Valor','Estado'].forEach((h, i) => hCell(ws, row, i+1, h));
  ws.getRow(row).height = 18; row++;

  const current = fotoRows.reduce((s, r) => s + fv(r['a_current']), 0);
  const mora1p  = saldo - current;
  const moraLt90 = fotoRows.reduce((s, r) => s + fv(r['b_bucket_1_30']) + fv(r['c_bucket_31_60']) + fv(r['d_bucket_61_90']), 0);
  const moraGt90 = fotoRows.reduce((s, r) => s + fv(r['e_bucket_91_120']) + fv(r['f_bucket_mas_120']), 0);
  const mas120   = fotoRows.reduce((s, r) => s + fv(r['f_bucket_mas_120']), 0);

  const indicators: [string, number, string, string][] = [
    ['% Current',    saldo>0 ? current/saldo : 0,  saldo>0 && current/saldo > 0.75 ? 'Saludable ✓' : 'Revisar !', saldo>0 && current/saldo > 0.75 ? C.BG_GREEN : C.BG_YELLOW],
    ['% Mora 1+',    saldo>0 ? mora1p/saldo  : 0,  saldo>0 && mora1p/saldo < 0.20  ? 'Moderado'    : 'Crítico ✗', saldo>0 && mora1p/saldo < 0.20  ? C.BG_YELLOW : C.BG_RED],
    ['% Mora <90d',  saldo>0 ? moraLt90/saldo : 0, 'Moderado',  C.BG_YELLOW],
    ['% Mora >90d',  saldo>0 ? moraGt90/saldo : 0, saldo>0 && moraGt90/saldo < 0.10 ? 'Moderado' : 'Crítico ✗', saldo>0 && moraGt90/saldo < 0.10 ? C.BG_YELLOW : C.BG_RED],
    ['% Mora +120d', saldo>0 ? mas120/saldo   : 0, saldo>0 && mas120/saldo < 0.05   ? 'Controlado ✓' : 'Crítico ✗', saldo>0 && mas120/saldo < 0.05 ? C.BG_GREEN : C.BG_RED],
  ];

  for (const [nombre, val, estado, bg] of indicators) {
    dCell(ws, row, 1, nombre, undefined, false, bg, 'left');
    const c2 = ws.getCell(row, 2);
    c2.value = val; c2.numFmt = '0.0%'; c2.font = { bold: true };
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c2.alignment = { horizontal: 'center', vertical: 'middle' }; c2.border = thinBorder;
    dCell(ws, row, 3, estado, undefined, false, bg, 'left');
    ws.getRow(row).height = 16; row++;
  }

  ws.getRow(row).height = 8; row++;

  // ── Top 5 Cosechas por Saldo ──────────────────────────────────────────────
  sectionTitle(ws, row, 'Top 5 Cosechas por Saldo Vigente', COLS); row++;
  ['Cosecha','% Orig','K Saldo ($M)','% Saldo/Orig','% Current','% Mora 1+'].forEach((h,i) => hCell(ws,row,i+1,h));
  ws.getRow(row).height = 18; row++;

  const top5 = [...fotoRows].sort((a, b) => fv(b['k_saldo_total']) - fv(a['k_saldo_total'])).slice(0, 5);
  for (const r of top5) {
    const ko = fv(r['k_originado']); const ks = fv(r['k_saldo_total']); const kc = fv(r['a_current']);
    dCell(ws, row, 1, String(r['fecha_desembolso_periodo']).slice(0,7), undefined, false, undefined, 'left');
    dCell(ws, row, 2, orig>0 ? ko/orig : 0, '0.0%');
    dCell(ws, row, 3, ks/1e6, '#,##0.0');
    dCell(ws, row, 4, ko>0 ? ks/ko : 0, '0.0%');
    dCell(ws, row, 5, ks>0 ? kc/ks : 0, '0.0%');
    dCell(ws, row, 6, ks>0 ? (ks-kc)/ks : 0, '0.0%');
    ws.getRow(row).height = 16; row++;
  }

  ws.getRow(row).height = 8; row++;

  // ── Top 3 Cosechas +120d ──────────────────────────────────────────────────
  sectionTitle(ws, row, 'Top 3 Cosechas con Mayor Saldo en Bucket +120 días', COLS); row++;
  ['Cosecha','% Orig','f_bucket_mas_120 ($M)','% f/Orig','K Saldo ($M)','% Mora >90'].forEach((h,i) => hCell(ws,row,i+1,h));
  ws.getRow(row).height = 18; row++;

  const top3f = [...fotoRows].sort((a, b) => fv(b['f_bucket_mas_120']) - fv(a['f_bucket_mas_120'])).slice(0, 3);
  for (const r of top3f) {
    const ko = fv(r['k_originado']); const ks = fv(r['k_saldo_total']);
    const fval = fv(r['f_bucket_mas_120']); const ev = fv(r['e_bucket_91_120']);
    dCell(ws, row, 1, String(r['fecha_desembolso_periodo']).slice(0,7), undefined, false, C.BG_RED, 'left');
    dCell(ws, row, 2, orig>0 ? ko/orig : 0, '0.0%', false, C.BG_RED);
    dCell(ws, row, 3, fval/1e6, '#,##0.0', false, C.BG_RED);
    dCell(ws, row, 4, ko>0 ? fval/ko : 0, '0.0%', false, C.BG_RED);
    dCell(ws, row, 5, ks/1e6, '#,##0.0', false, C.BG_RED);
    dCell(ws, row, 6, ks>0 ? (ev+fval)/ks : 0, '0.0%', false, C.BG_RED);
    ws.getRow(row).height = 16; row++;
  }
}

// ── Hojas por período ─────────────────────────────────────────────────────────
function buildPeriodSheet(
  ws: ExcelJS.Worksheet,
  periodo: string,
  periodRows: Record<string, unknown>[]
) {
  const moneyFields: (keyof typeof periodRows[0])[] = [
    'k_originado','k_precancelado','k_cancelado_no_precancelado','k_pagado_total',
    'k_saldo_total','a_current','b_bucket_1_30','c_bucket_31_60',
    'd_bucket_61_90','e_bucket_91_120','f_bucket_mas_120'
  ];
  const pctFields = moneyFields.slice(1); // % sobre k_originado
  const allHeaders = [
    'cosecha', ...moneyFields.map(f => String(f).replace(/_/g,' ')),
    ...pctFields.map(f => `%_${f}`),
    '%_mora_lt90', '%_mora_gt90'
  ];
  const COLS = allHeaders.length;

  // Configura anchos
  ws.getColumn(1).width = 14;
  for (let c = 2; c <= COLS; c++) ws.getColumn(c).width = 13;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 0 }];

  function writeTable(
    startRow: number,
    dataRows: Record<string, unknown>[],
    titleText: string,
    titleFill: string
  ): number {
    sectionTitle(ws, startRow, titleText, COLS, titleFill);
    let r = startRow + 1;

    // Headers
    allHeaders.forEach((h, i) => hCell(ws, r, i+1, h, titleFill));
    ws.getRow(r).height = 18; r++;

    const totalOrig = dataRows.reduce((s, row) => s + fv(row['k_originado']), 0);

    for (const row of dataRows) {
      const ko = fv(row['k_originado']);
      dCell(ws, r, 1, String(row['fecha_desembolso_periodo']).slice(0,7), undefined, false, undefined, 'left');
      moneyFields.forEach((f, i) => dCell(ws, r, i+2, fv(row[f]), '#,##0'));

      const base = 2 + moneyFields.length;
      pctFields.forEach((f, i) => dCell(ws, r, base+i, ko>0 ? fv(row[f])/ko : 0, '0.00%'));

      const colLt90 = base + pctFields.length;
      const colGt90 = colLt90 + 1;
      const lt90 = fv(row['b_bucket_1_30']) + fv(row['c_bucket_31_60']) + fv(row['d_bucket_61_90']);
      const gt90 = fv(row['e_bucket_91_120']) + fv(row['f_bucket_mas_120']);
      dCell(ws, r, colLt90, ko>0 ? lt90/ko : 0, '0.00%', false, 'FFFCE4D6');
      dCell(ws, r, colGt90, ko>0 ? gt90/ko : 0, '0.00%', false, 'FFF8CBAD');
      ws.getRow(r).height = 16; r++;
    }

    // Fila TOTAL
    const totMoney = moneyFields.map(f => dataRows.reduce((s, row) => s + fv(row[f]), 0));
    const totPct   = pctFields.map(f => { const tv = dataRows.reduce((s,row)=>s+fv(row[f]),0); return totalOrig>0?tv/totalOrig:0; });
    const totLt90  = dataRows.reduce((s,row)=>s+fv(row['b_bucket_1_30'])+fv(row['c_bucket_31_60'])+fv(row['d_bucket_61_90']),0);
    const totGt90  = dataRows.reduce((s,row)=>s+fv(row['e_bucket_91_120'])+fv(row['f_bucket_mas_120']),0);

    const totalVals: (string|number|null)[] = ['TOTAL', ...totMoney, ...totPct, totalOrig>0?totLt90/totalOrig:0, totalOrig>0?totGt90/totalOrig:0];
    const totalFmts: (string|undefined)[]   = [undefined, ...moneyFields.map(()=>'#,##0'), ...pctFields.map(()=>'0.00%'), '0.00%','0.00%'];
    totalRow(ws, r, totalVals, totalFmts, titleFill); r++;

    return r;
  }

  // Agregar cosechas como suma NUEVO + RENOVADOR
  const cosechas = [...new Set(periodRows.map(r => String(r['fecha_desembolso_periodo'])))].sort();
  const totalAgg: Record<string, unknown>[] = cosechas.map(cosecha => {
    const sub = periodRows.filter(r => String(r['fecha_desembolso_periodo']) === cosecha);
    const agg: Record<string, unknown> = { fecha_desembolso_periodo: cosecha };
    for (const f of moneyFields) agg[String(f)] = sub.reduce((s, r) => s + fv(r[String(f)]), 0);
    return agg;
  });
  const nuevoRows     = periodRows.filter(r => String(r['tipo_cliente']) === 'NUEVO');
  const renovadorRows = periodRows.filter(r => String(r['tipo_cliente']) === 'RENOVADOR');

  let cur = writeTable(1, totalAgg,     `TOTAL CARTERA — ${periodo}`,    C.NAVY);
  cur += 3;
  cur = writeTable(cur, nuevoRows,      `NEGOCIO NUEVO — ${periodo}`,    C.BLUE);
  cur += 3;
  if (renovadorRows.length > 0) {
    writeTable(cur, renovadorRows, `NEGOCIO RENOVADOR — ${periodo}`, C.TEAL);
  }
}

// ── Función principal exportable ──────────────────────────────────────────────
export async function generateCarteraExcel(records: Record<string, unknown>[]): Promise<Buffer> {
  const sorted = [...records].sort((a, b) => {
    const pDiff = String(b['periodo']).localeCompare(String(a['periodo']));
    if (pDiff !== 0) return pDiff;
    return String(a['fecha_desembolso_periodo']).localeCompare(String(b['fecha_desembolso_periodo']));
  });

  const periodos = [...new Set(sorted.map(r => String(r['periodo'])))];
  const periodoFoto = periodos.find(p => sorted.filter(r => String(r['periodo']) === p).length > 1) ?? periodos[0];
  const fotoRows = sorted.filter(r => String(r['periodo']) === periodoFoto);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'DataPulse';
  wb.created = new Date();

  const wsInsights = wb.addWorksheet('Insights Cartera');
  buildInsightsSheet(wsInsights, periodoFoto, fotoRows, periodos.length);

  for (const periodo of periodos) {
    const ws = wb.addWorksheet(periodo);
    buildPeriodSheet(ws, periodo, sorted.filter(r => String(r['periodo']) === periodo));
  }

  return await wb.xlsx.writeBuffer() as Buffer;
}
```

- [ ] **Step 2: Verificar tipos**

```
npm run lint
```

Expected: 0 errores.

- [ ] **Step 3: Commit**

```
git add carteraFideicomisoExcel.ts
git commit -m "feat: add cartera fideicomiso Excel generator (ExcelJS)"
```

---

## Task 3: Agregar endpoints en server.ts

**Files:**
- Modify: `server.ts` — insertar antes de `// Catch-all for unhandled API routes` (línea ~1407)

- [ ] **Step 1: Agregar el import de ExcelJS helper** al inicio de server.ts, junto a los otros imports

En el bloque de imports de server.ts (al comienzo del archivo), agregar:

```typescript
import { generateCarteraExcel } from './carteraFideicomisoExcel';
```

- [ ] **Step 2: Agregar cache y endpoints** — insertar el siguiente bloque justo antes de `// Catch-all for unhandled API routes`:

```typescript
// ── Cartera Fideicomiso ARG ────────────────────────────────────────────────────
let carteraCache: { data: Record<string, unknown>[]; fetchedAt: number } | null = null;
const CARTERA_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

const CARTERA_QUERY = `
  SELECT
    periodo, fecha_desembolso_periodo, tipo_cliente,
    k_originado, k_precancelado, k_cancelado_no_precancelado,
    k_pagado_total, k_saldo_total,
    a_current, b_bucket_1_30, c_bucket_31_60,
    d_bucket_61_90, e_bucket_91_120, f_bucket_mas_120
  FROM finance_arg.cartera_fideicomiso_sumarizada_arg
  ORDER BY periodo DESC, fecha_desembolso_periodo ASC, tipo_cliente ASC
`;

async function loadCarteraCache(): Promise<void> {
  if (carteraCache && Date.now() - carteraCache.fetchedAt < CARTERA_CACHE_TTL_MS) return;
  if (!redshiftPool) throw new Error('Redshift no configurado');
  console.log('[CARTERA] Querying Redshift...');
  const result = await redshiftPool.query(CARTERA_QUERY);
  const safe = JSON.parse(JSON.stringify(result.rows, (_k, v) => typeof v === 'bigint' ? Number(v) : v));
  carteraCache = { data: safe, fetchedAt: Date.now() };
  console.log(`[CARTERA] Cached ${safe.length} records`);
}

app.get('/api/cartera-fideicomiso', async (_req, res) => {
  if (!redshiftPool) {
    return res.status(503).json({
      error: 'Conexión a Redshift no configurada',
      required_env: ['REDSHIFT_HOST', 'REDSHIFT_DATABASE', 'REDSHIFT_USER', 'REDSHIFT_PASSWORD'],
    });
  }
  try {
    await loadCarteraCache();
    res.json({ records: carteraCache!.data, total: carteraCache!.data.length, source: 'redshift' });
  } catch (error: any) {
    console.error('[CARTERA] Error:', error);
    res.status(500).json({ error: 'Error al cargar datos de cartera', details: error.message });
  }
});

app.get('/api/cartera-fideicomiso/export', async (_req, res) => {
  if (!redshiftPool) {
    return res.status(503).json({ error: 'Conexión a Redshift no configurada' });
  }
  try {
    await loadCarteraCache();
    const buffer = await generateCarteraExcel(carteraCache!.data);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="cartera_fideicomiso_ARG_${today}.xlsx"`);
    res.send(buffer);
    console.log(`[CARTERA] Excel exported: ${buffer.length} bytes`);
  } catch (error: any) {
    console.error('[CARTERA] Export error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error al exportar Excel', details: error.message });
  }
});
```

- [ ] **Step 3: Verificar compilación**

```
npm run lint
```

Expected: 0 errores.

- [ ] **Step 4: Probar endpoint en el browser**

Con el servidor corriendo (`npm run dev`), abrir: `http://localhost:5173/api/cartera-fideicomiso`

Expected: JSON con `{ records: [...], total: N, source: "redshift" }` o error 503 si Redshift no está configurado en `.env`.

- [ ] **Step 5: Commit**

```
git add server.ts
git commit -m "feat: add /api/cartera-fideicomiso data and export endpoints"
```

---

## Task 4: Actualizar LandingPage.tsx — agregar sub-módulos a Finanzas

**Files:**
- Modify: `src/components/LandingPage.tsx`

- [ ] **Step 1: Reemplazar la definición del módulo `finance`**

Encontrar:
```typescript
  {
    id: 'finance',
    title: 'Finanzas',
    description: 'Gestión de presupuestos, flujo de caja y estados financieros.',
    icon: Banknote,
    color: 'bg-slate-800',
    type: 'api'
  },
```

Reemplazar con:
```typescript
  {
    id: 'finance',
    title: 'Finanzas',
    description: 'Gestión de presupuestos, flujo de caja y estados financieros.',
    icon: Banknote,
    color: 'bg-slate-800',
    type: 'api',
    submodules: [
      {
        id: 'cartera-fideicomiso-arg',
        title: 'Cartera ARG – Fideicomiso',
        description: 'Visualización y análisis de la cartera del fideicomiso argentino: KPIs, distribución de buckets, cosechas y exportación Excel.',
        color: 'bg-slate-800'
      }
    ]
  },
```

- [ ] **Step 2: Verificar en el browser**

Con `npm run dev` corriendo, navegar a la landing y hacer click en "Finanzas". Debe mostrar el selector de sub-módulos con "Cartera ARG – Fideicomiso".

- [ ] **Step 3: Commit**

```
git add src/components/LandingPage.tsx
git commit -m "feat: add cartera-fideicomiso-arg sub-module to Finanzas"
```

---

## Task 5: Actualizar DashboardView.tsx — routing del nuevo sub-módulo

**Files:**
- Modify: `src/components/DashboardView.tsx`

- [ ] **Step 1: Agregar el import del nuevo componente**

Encontrar (línea ~37):
```typescript
import BuscadorPagosSubmodule from './submodules/BuscadorPagosSubmodule';
```

Reemplazar con:
```typescript
import BuscadorPagosSubmodule from './submodules/BuscadorPagosSubmodule';
import CarteraFideicomisoSubmodule from './submodules/CarteraFideicomisoSubmodule';
```

- [ ] **Step 2: Agregar el routing del sub-módulo**

Encontrar:
```typescript
          ) : activeSubmodule.id === 'buscador-pagos' ? (
            <BuscadorPagosSubmodule />
          ) : (
```

Reemplazar con:
```typescript
          ) : activeSubmodule.id === 'buscador-pagos' ? (
            <BuscadorPagosSubmodule />
          ) : activeSubmodule.id === 'cartera-fideicomiso-arg' ? (
            <CarteraFideicomisoSubmodule />
          ) : (
```

- [ ] **Step 3: Commit**

```
git add src/components/DashboardView.tsx
git commit -m "feat: wire CarteraFideicomisoSubmodule in DashboardView routing"
```

---

## Task 6: Crear CarteraFideicomisoSubmodule.tsx

**Files:**
- Create: `src/components/submodules/CarteraFideicomisoSubmodule.tsx`

- [ ] **Step 1: Crear el componente completo**

```typescript
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
  ResponsiveContainer,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CarteraRecord {
  periodo: string;
  fecha_desembolso_periodo: string;
  tipo_cliente: string;
  k_originado: number;
  k_precancelado: number;
  k_cancelado_no_precancelado: number;
  k_pagado_total: number;
  k_saldo_total: number;
  a_current: number;
  b_bucket_1_30: number;
  c_bucket_31_60: number;
  d_bucket_61_90: number;
  e_bucket_91_120: number;
  f_bucket_mas_120: number;
}

// ── Paleta ────────────────────────────────────────────────────────────────────
const BUCKET_COLORS = ['#22C55E', '#F59E0B', '#F97316', '#DC2626', '#9B1C1C', '#4B0000'];
const BUCKET_LABELS = ['Current', '1-30d', '31-60d', '61-90d', '91-120d', '+120d'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const fv = (v: unknown): number => typeof v === 'number' ? v : parseFloat(String(v)) || 0;
const fmt$ = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtAxis$ = (v: number) => `$${v.toFixed(0)}M`;
const fmtAxisPct = (v: number) => `${v.toFixed(0)}%`;
const shortDate = (s: string) => String(s).slice(0, 7);

const AXIS_STYLE = { fontSize: 9, fill: '#64748b' };
const GRID_STYLE = { stroke: '#1e293b', strokeDasharray: '3 3' };
const CHART_MARGIN = { top: 8, right: 16, left: 0, bottom: 40 };

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="flex-1 min-w-36 bg-slate-900 border border-slate-700 rounded-xl p-4" style={{ borderLeft: `3px solid ${accent}` }}>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Chart Section ─────────────────────────────────────────────────────────────
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

// ── Tabla scroll ──────────────────────────────────────────────────────────────
const TABLE_COLS: { key: keyof CarteraRecord; label: string; fmt: (v: number) => string }[] = [
  { key: 'fecha_desembolso_periodo', label: 'Cosecha',    fmt: String as any },
  { key: 'tipo_cliente',             label: 'Tipo',       fmt: String as any },
  { key: 'k_originado',              label: 'K Orig',     fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'k_saldo_total',            label: 'Saldo',      fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'a_current',                label: 'Current',    fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'b_bucket_1_30',            label: '1-30d',      fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'c_bucket_31_60',           label: '31-60d',     fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'd_bucket_61_90',           label: '61-90d',     fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'e_bucket_91_120',          label: '91-120d',    fmt: n => `$${(n/1e6).toFixed(1)}M` },
  { key: 'f_bucket_mas_120',         label: '+120d',      fmt: n => `$${(n/1e6).toFixed(1)}M` },
];

// ── Componente principal ──────────────────────────────────────────────────────
export default function CarteraFideicomisoSubmodule() {
  const [records, setRecords] = useState<CarteraRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const topScrollRef   = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef   = useRef(false);
  const [tableWidth, setTableWidth] = useState(0);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/cartera-fideicomiso');
      if (!res.ok) throw new Error('Error al cargar datos del servidor.');
      const json = await res.json();
      setRecords(Array.isArray(json) ? json : (json.records || []));
    } catch (e: any) {
      setError(e.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (tableScrollRef.current) setTableWidth(tableScrollRef.current.scrollWidth);
    });
  }, [records]);

  const handleTopScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (tableScrollRef.current && topScrollRef.current)
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    isSyncingRef.current = false;
  };
  const handleTableScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (topScrollRef.current && tableScrollRef.current)
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    isSyncingRef.current = false;
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const periodoFoto = useMemo(() => {
    const periodos = [...new Set(records.map(r => r.periodo))].sort().reverse();
    return periodos.find(p => records.filter(r => r.periodo === p).length > 1) ?? periodos[0] ?? '';
  }, [records]);

  const fotoRows = useMemo(() =>
    records.filter(r => r.periodo === periodoFoto)
  , [records, periodoFoto]);

  const fotoSorted = useMemo(() =>
    [...fotoRows].sort((a, b) => shortDate(a.fecha_desembolso_periodo).localeCompare(shortDate(b.fecha_desembolso_periodo)))
  , [fotoRows]);

  const kpis = useMemo(() => {
    const sum = (f: keyof CarteraRecord) => fotoRows.reduce((s, r) => s + fv(r[f]), 0);
    const orig   = sum('k_originado');
    const pagado = sum('k_pagado_total');
    const prec   = sum('k_precancelado');
    const saldo  = sum('k_saldo_total');
    const current = sum('a_current');
    const b130   = sum('b_bucket_1_30');
    const b3160  = sum('c_bucket_31_60');
    const b6190  = sum('d_bucket_61_90');
    const b91120 = sum('e_bucket_91_120');
    const bmas120 = sum('f_bucket_mas_120');
    return { orig, pagado, prec, saldo, current, b130, b3160, b6190, b91120, bmas120 };
  }, [fotoRows]);

  // Chart 1 — Donut
  const bucketData = useMemo(() => [
    { name: 'Current', value: kpis.current,  color: BUCKET_COLORS[0] },
    { name: '1-30d',   value: kpis.b130,     color: BUCKET_COLORS[1] },
    { name: '31-60d',  value: kpis.b3160,    color: BUCKET_COLORS[2] },
    { name: '61-90d',  value: kpis.b6190,    color: BUCKET_COLORS[3] },
    { name: '91-120d', value: kpis.b91120,   color: BUCKET_COLORS[4] },
    { name: '+120d',   value: kpis.bmas120,  color: BUCKET_COLORS[5] },
  ].filter(d => d.value > 0), [kpis]);

  // Chart 2 — Clustered bar top 15
  const clusterData = useMemo(() => {
    const top15 = [...fotoRows]
      .sort((a, b) => fv(b.k_saldo_total) - fv(a.k_saldo_total))
      .slice(0, 15)
      .sort((a, b) => shortDate(a.fecha_desembolso_periodo).localeCompare(shortDate(b.fecha_desembolso_periodo)));
    return top15.map(r => ({
      cosecha:  shortDate(r.fecha_desembolso_periodo),
      originado: fv(r.k_originado) / 1e6,
      saldo:    fv(r.k_saldo_total) / 1e6,
    }));
  }, [fotoRows]);

  // Chart 3 — Stacked bar composición
  const stackedData = useMemo(() => fotoSorted.map(r => {
    const s = fv(r.k_saldo_total);
    return {
      cosecha: shortDate(r.fecha_desembolso_periodo),
      current:  s > 0 ? fv(r.a_current) / s * 100 : 0,
      mora130:  s > 0 ? fv(r.b_bucket_1_30) / s * 100 : 0,
      mora3190: s > 0 ? (fv(r.c_bucket_31_60) + fv(r.d_bucket_61_90)) / s * 100 : 0,
      mora90p:  s > 0 ? (fv(r.e_bucket_91_120) + fv(r.f_bucket_mas_120)) / s * 100 : 0,
    };
  }), [fotoSorted]);

  // Chart 4 — Line mora 1+
  const moraData = useMemo(() => fotoSorted.map(r => ({
    cosecha: shortDate(r.fecha_desembolso_periodo),
    mora1p:  fv(r.k_originado) > 0
      ? (fv(r.k_saldo_total) - fv(r.a_current)) / fv(r.k_originado) * 100
      : 0,
  })), [fotoSorted]);

  // Chart 5 — Bar originación mensual
  const origData = useMemo(() => fotoSorted.map(r => ({
    cosecha:  shortDate(r.fecha_desembolso_periodo),
    originado: fv(r.k_originado) / 1e6,
  })), [fotoSorted]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/cartera-fideicomiso/export');
      if (!res.ok) throw new Error('Error al generar el Excel');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
      a.href = url; a.download = `cartera_fideicomiso_ARG_${today}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
    </div>
  );

  if (error) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700/50 rounded-xl text-red-400 text-sm max-w-lg w-full">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {error}
      </div>
      <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-zinc-300 text-sm font-bold rounded-xl transition-all">
        <RefreshCw className="w-4 h-4" /> Reintentar
      </button>
    </div>
  );

  const donutFormatter = (value: number) => fmt$(value);

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Cartera ARG – Fideicomiso</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Período foto: <span className="text-zinc-300 font-bold">{periodoFoto}</span></p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || records.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-800/60 hover:bg-emerald-700/60 disabled:opacity-40 border border-emerald-700/50 text-emerald-300 font-bold text-sm rounded-xl transition-all"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? 'Generando...' : 'Exportar Excel'}
        </button>
      </motion.div>

      {/* KPI Cards */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex gap-3 flex-wrap">
        <KpiCard label="K Originado Hist."  value={fmt$(kpis.orig)}   accent="#F59E0B" />
        <KpiCard label="K Pago Total"        value={fmt$(kpis.pagado)} accent="#22C55E"
          sub={kpis.orig > 0 ? `${fmtPct(kpis.pagado/kpis.orig)} del originado` : undefined} />
        <KpiCard label="K Precancelado"      value={fmt$(kpis.prec)}   accent="#5B8DEF" />
        <KpiCard label="Saldo Vigente"       value={fmt$(kpis.saldo)}  accent="#13A8A8"
          sub={kpis.orig > 0 ? `${fmtPct(kpis.saldo/kpis.orig)} del originado` : undefined} />
        <KpiCard label="% Current"           value={kpis.saldo > 0 ? fmtPct(kpis.current/kpis.saldo) : '—'} accent="#22C55E" />
        <KpiCard label="% Mora >90d"         value={kpis.saldo > 0 ? fmtPct((kpis.b91120+kpis.bmas120)/kpis.saldo) : '—'} accent="#DC2626" />
      </motion.div>

      {/* Charts row 1: Donut + Clustered Bar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <ChartCard title="Distribución de Saldo por Bucket">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={bucketData} dataKey="value" innerRadius="50%" outerRadius="75%"
                startAngle={90} endAngle={-270} paddingAngle={1}>
                {bucketData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [fmt$(v), '']}
              />
              <Legend iconSize={10} iconType="circle"
                formatter={(value, entry: any) => (
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>
                    {value}: {fmt$(entry.payload?.value ?? 0)}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="K Originado vs Saldo Vigente (Top 15 cosechas)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={clusterData} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxis$} tick={AXIS_STYLE} width={45} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number, name: string) => [fmtAxis$(v), name === 'originado' ? 'K Originado' : 'Saldo Vigente']}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="originado" name="K Originado"   fill="#1F4E78" radius={[2,2,0,0]} />
              <Bar dataKey="saldo"     name="Saldo Vigente" fill="#13A8A8" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Chart 3: Stacked */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <ChartCard title="Composición del Saldo por Cosecha (% sobre saldo vigente)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stackedData} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxisPct} tick={AXIS_STYLE} width={40} domain={[0, 100]} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v.toFixed(1)}%`, '']}
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              <Bar dataKey="current"  name="Current"    stackId="a" fill="#22C55E" />
              <Bar dataKey="mora130"  name="Mora 1-30d" stackId="a" fill="#F59E0B" />
              <Bar dataKey="mora3190" name="Mora 31-90d" stackId="a" fill="#F97316" />
              <Bar dataKey="mora90p"  name="Mora >90d"  stackId="a" fill="#DC2626" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Chart 4: Line mora */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <ChartCard title="% Mora 1+ sobre K Originado por Cosecha">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={moraData} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="moraGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#F97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxisPct} tick={AXIS_STYLE} width={40} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v.toFixed(1)}%`, '% Mora 1+']}
              />
              <Area dataKey="mora1p" name="% Mora 1+" stroke="#F97316" strokeWidth={2}
                fill="url(#moraGrad)" dot={{ r: 3, fill: '#F97316' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Chart 5: Bar originación */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <ChartCard title="Evolución Mensual de Originación">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={origData} margin={CHART_MARGIN}>
              <CartesianGrid {...GRID_STYLE} />
              <XAxis dataKey="cosecha" tick={AXIS_STYLE} angle={-45} textAnchor="end" interval={0} />
              <YAxis tickFormatter={fmtAxis$} tick={AXIS_STYLE} width={45} />
              <RTooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [fmtAxis$(v), 'K Originado']}
              />
              <Bar dataKey="originado" name="K Originado" fill="#5B8DEF" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </motion.div>

      {/* Tabla cosechas */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="flex flex-col gap-1">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Detalle por Cosecha — {fotoRows.length} registros
        </p>

        {/* Top scrollbar mirror */}
        <div ref={topScrollRef} onScroll={handleTopScroll}
          className="overflow-x-auto rounded-t-xl border-x border-t border-slate-700"
          style={{ height: 14 }}>
          <div style={{ width: tableWidth > 0 ? tableWidth : '100%', height: 1 }} />
        </div>

        <div ref={tableScrollRef} onScroll={handleTableScroll}
          className="overflow-x-auto rounded-b-xl border border-t-0 border-slate-700">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                {TABLE_COLS.map(col => (
                  <th key={String(col.key)}
                    className="px-3 py-2.5 text-left font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap border-b border-slate-700">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fotoRows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/30'}>
                  {TABLE_COLS.map(col => (
                    <td key={String(col.key)}
                      className="px-3 py-2 text-zinc-300 whitespace-nowrap border-b border-slate-800/60">
                      {col.key === 'fecha_desembolso_periodo'
                        ? shortDate(row[col.key] as string)
                        : col.key === 'tipo_cliente'
                        ? String(row[col.key])
                        : col.fmt(fv(row[col.key]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

    </div>
  );
}
```

- [ ] **Step 2: Verificar compilación TypeScript**

```
npm run lint
```

Expected: 0 errores.

- [ ] **Step 3: Validar en el browser**

Con `npm run dev`, navegar a Finanzas → Cartera ARG – Fideicomiso. Verificar:
- KPI cards se renderizan (con datos reales o vacíos si Redshift no está configurado)
- Los 5 gráficos aparecen
- La tabla muestra las cosechas
- El botón "Exportar Excel" dispara la descarga

- [ ] **Step 4: Commit final**

```
git add src/components/submodules/CarteraFideicomisoSubmodule.tsx
git commit -m "feat: add CarteraFideicomisoSubmodule with 5 charts, KPIs and table"
```

---

## Task 7: Push

- [ ] **Step 1: Push a remote**

```
git push origin master
```
