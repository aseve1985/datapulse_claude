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
const MONEY_FIELDS   = ['k_originado','k_precancelado','k_cancelado_no_precancelado','k_pagado_total','k_saldo_total',...BUCKET_FIELDS] as const;

export function fv(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

// ── Helpers de estilo ─────────────────────────────────────────────────────────
const thinBorder: ExcelJS.Borders = {
  top:      { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left:     { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
  diagonal: { style: 'thin', color: { argb: 'FFCCCCCC' } },
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
  const moneyFields: string[] = [
    'k_originado','k_precancelado','k_cancelado_no_precancelado','k_pagado_total',
    'k_saldo_total','a_current','b_bucket_1_30','c_bucket_31_60',
    'd_bucket_61_90','e_bucket_91_120','f_bucket_mas_120'
  ];
  const pctFields = moneyFields.slice(1);
  const allHeaders = [
    'cosecha', ...moneyFields.map(f => f.replace(/_/g,' ')),
    ...pctFields.map(f => `%_${f}`),
    '%_mora_lt90', '%_mora_gt90'
  ];
  const COLS = allHeaders.length;

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

    const totMoney = moneyFields.map(f => dataRows.reduce((s, row) => s + fv(row[f]), 0));
    const totPct   = pctFields.map(f => { const tv = dataRows.reduce((s,row)=>s+fv(row[f]),0); return totalOrig>0?tv/totalOrig:0; });
    const totLt90  = dataRows.reduce((s,row)=>s+fv(row['b_bucket_1_30'])+fv(row['c_bucket_31_60'])+fv(row['d_bucket_61_90']),0);
    const totGt90  = dataRows.reduce((s,row)=>s+fv(row['e_bucket_91_120'])+fv(row['f_bucket_mas_120']),0);

    const totalVals: (string|number|null)[] = ['TOTAL', ...totMoney, ...totPct, totalOrig>0?totLt90/totalOrig:0, totalOrig>0?totGt90/totalOrig:0];
    const totalFmts: (string|undefined)[]   = [undefined, ...moneyFields.map(()=>'#,##0'), ...pctFields.map(()=>'0.00%'), '0.00%','0.00%'];
    totalRow(ws, r, totalVals, totalFmts, titleFill); r++;

    return r;
  }

  const cosechas = [...new Set(periodRows.map(r => String(r['fecha_desembolso_periodo'])))].sort();
  const totalAgg: Record<string, unknown>[] = cosechas.map(cosecha => {
    const sub = periodRows.filter(r => String(r['fecha_desembolso_periodo']) === cosecha);
    const agg: Record<string, unknown> = { fecha_desembolso_periodo: cosecha };
    for (const f of moneyFields) agg[f] = sub.reduce((s, r) => s + fv(r[f]), 0);
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
