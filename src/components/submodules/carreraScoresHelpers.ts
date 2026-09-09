export interface HechoRow {
  score_key: string;
  pais: string;
  segmento: string;
  cepa: string;
  banda: string; // '1'..'10' | 'SIN_SCORE' | 'ERROR_NODO'
  umbral_dias: number;
  q_vendidos: number;
  capital: number;
  capital_mas_interes: number;
  n_elegible: number;
  n_malos: number;
}

export interface BandaCatalogo {
  score_key: string;
  decil: number;
  score_min: number;
  score_max: number;
  bad_rate: number;
  lift: number;
  tramo_5: string;
}

export const UMBRALES = [5, 10, 30, 60, 90] as const;
export const BANDA_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'SIN_SCORE', 'ERROR_NODO'];

export interface GridCell {
  moraPct: number | null; // null = sin madurar (n_elegible === 0)
  nElegible: number;
}

export interface GridRow {
  banda: string;
  label: string;
  scoreRange: string | null; // null para SIN_SCORE/ERROR_NODO
  qVendidos: number;
  capital: number;
  capitalMasInteres: number;
  celdas: Record<number, GridCell>; // key = umbral_dias
  esTotal?: boolean;
}

export function pivotGrid(
  hechos: HechoRow[],
  bandas: BandaCatalogo[],
  scoreKey: string,
  cepa: string
): GridRow[] {
  const filtrados = hechos.filter(h => h.score_key === scoreKey && h.cepa === cepa);
  const bandasDelScore = new Map(bandas.filter(b => b.score_key === scoreKey).map(b => [String(b.decil), b]));

  const rows: GridRow[] = BANDA_ORDER.map(banda => {
    const filasBanda = filtrados.filter(h => h.banda === banda);
    const catalogoBanda = bandasDelScore.get(banda);
    const qVendidos = filasBanda[0]?.q_vendidos ?? 0;
    const capital = filasBanda[0]?.capital ?? 0;
    const capitalMasInteres = filasBanda[0]?.capital_mas_interes ?? 0;

    const celdas: Record<number, GridCell> = {};
    UMBRALES.forEach(umbral => {
      const fila = filasBanda.find(h => h.umbral_dias === umbral);
      const nElegible = fila?.n_elegible ?? 0;
      const nMalos = fila?.n_malos ?? 0;
      celdas[umbral] = { nElegible, moraPct: nElegible > 0 ? (nMalos / nElegible) * 100 : null };
    });

    const label = banda === 'SIN_SCORE' ? 'SIN SCORE'
      : banda === 'ERROR_NODO' ? 'ERROR NODO (-1)'
      : `${banda} · ${catalogoBanda?.tramo_5 ?? ''}`;
    const scoreRange = catalogoBanda ? `${catalogoBanda.score_min}-${catalogoBanda.score_max}` : null;

    return { banda, label, scoreRange, qVendidos, capital, capitalMasInteres, celdas };
  });

  const total: GridRow = {
    banda: 'TOTAL', label: 'Total', scoreRange: null, esTotal: true,
    qVendidos: rows.reduce((acc, r) => acc + r.qVendidos, 0),
    capital: rows.reduce((acc, r) => acc + r.capital, 0),
    capitalMasInteres: rows.reduce((acc, r) => acc + r.capitalMasInteres, 0),
    celdas: Object.fromEntries(UMBRALES.map(umbral => {
      const nElegible = rows.reduce((acc, r) => acc + r.celdas[umbral].nElegible, 0);
      const nMalos = rows.reduce((acc, r) => acc + (r.celdas[umbral].moraPct !== null
        ? Math.round((r.celdas[umbral].moraPct! / 100) * r.celdas[umbral].nElegible) : 0), 0);
      return [umbral, { nElegible, moraPct: nElegible > 0 ? (nMalos / nElegible) * 100 : null }];
    })),
  };

  return [...rows, total];
}

export interface HeaderIndicators {
  spread: number | null; // null = volumen insuficiente
  spreadEsperado: number | null;
  inversiones: number;
  coberturaPct: number;
}

const TRAMOS_ORDEN = ['1 MUY BUENO', '2 BUENO', '3 MEDIO', '4 MALO', '5 MUY MALO'];
const MIN_N_PARA_SPREAD = 300;

export function computeHeaderIndicators(
  grid: GridRow[],
  bandas: BandaCatalogo[],
  scoreKey: string,
  liftD1D10Esperado: number | null
): HeaderIndicators {
  const bandasDelScore = new Map(bandas.filter(b => b.score_key === scoreKey).map(b => [String(b.decil), b]));

  const porTramo = new Map<string, { nElegible: number; nMalos: number }>();
  grid.filter(r => !r.esTotal && r.banda !== 'SIN_SCORE' && r.banda !== 'ERROR_NODO').forEach(r => {
    const tramo = bandasDelScore.get(r.banda)?.tramo_5;
    if (!tramo) return;
    const celda30 = r.celdas[30];
    const acc = porTramo.get(tramo) ?? { nElegible: 0, nMalos: 0 };
    acc.nElegible += celda30.nElegible;
    acc.nMalos += celda30.moraPct !== null ? Math.round((celda30.moraPct / 100) * celda30.nElegible) : 0;
    porTramo.set(tramo, acc);
  });

  const moraPorTramo = TRAMOS_ORDEN.map(t => {
    const v = porTramo.get(t);
    return v && v.nElegible > 0 ? v.nMalos / v.nElegible : null;
  });

  const nPorTramo = TRAMOS_ORDEN.map(t => porTramo.get(t)?.nElegible ?? 0);
  const volumenSuficiente = nPorTramo.every(n => n >= MIN_N_PARA_SPREAD);

  const valores = moraPorTramo.filter((m): m is number => m !== null);
  const spread = volumenSuficiente && valores.length === 5 && Math.min(...valores) > 0
    ? Math.max(...valores) / Math.min(...valores)
    : null;

  let inversiones = 0;
  for (let i = 0; i < moraPorTramo.length - 1; i++) {
    const a = moraPorTramo[i];
    const b = moraPorTramo[i + 1];
    if (a !== null && b !== null && b < a) inversiones++;
  }

  const totalRow = grid.find(r => r.esTotal)!;
  const sinScoreRow = grid.find(r => r.banda === 'SIN_SCORE')!;
  const qConScore = totalRow.qVendidos - sinScoreRow.qVendidos;
  const coberturaPct = totalRow.qVendidos > 0 ? (qConScore / totalRow.qVendidos) * 100 : 0;

  return { spread, spreadEsperado: liftD1D10Esperado, inversiones, coberturaPct };
}
