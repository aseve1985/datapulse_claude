export interface HechoRow {
  score_key: string;
  pais: string;
  segmento: string;
  cepa: string;
  banda: string; // decil vigente ('1'..'N') | 'SIN_SCORE' | 'ERROR_NODO'
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
  tramo_5: string | null; // null en esquemas sin tramos (ej. SHADOW_Q6)
  esquema_bandas?: string;
  metrica_bad?: string;
  flag_vigente?: number;
}

export const UMBRALES = [5, 10, 30, 60, 90] as const;
export const BANDAS_ESPECIALES = ['SIN_SCORE', 'ERROR_NODO'];

/**
 * Bandas vigentes de un score, ordenadas por decil. La cantidad depende del esquema
 * vigente en gold.catalogo_scores_bandas_multipais (10 deciles, 6 bandas, etc.) —
 * nunca se asume un número fijo. El server ya filtra flag_vigente = 1; el filtro acá
 * es defensa por si llega alguna fila no vigente.
 */
export function bandasVigentesDelScore(bandas: BandaCatalogo[], scoreKey: string): BandaCatalogo[] {
  return bandas
    .filter(b => b.score_key === scoreKey && (b.flag_vigente === undefined || Number(b.flag_vigente) === 1))
    .sort((a, b) => Number(a.decil) - Number(b.decil));
}

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

function computeTotalRow(rows: GridRow[]): GridRow {
  return {
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
}

export function pivotGrid(
  hechos: HechoRow[],
  bandas: BandaCatalogo[],
  scoreKey: string,
  cepas: string[]
): GridRow[] {
  const cepasSet = new Set(cepas);
  const filtrados = hechos.filter(h => h.score_key === scoreKey && cepasSet.has(h.cepa));
  const vigentes = bandasVigentesDelScore(bandas, scoreKey);
  const bandasDelScore = new Map(vigentes.map(b => [String(b.decil), b]));
  const bandaOrder = [...vigentes.map(b => String(b.decil)), ...BANDAS_ESPECIALES];

  const rows: GridRow[] = bandaOrder.map(banda => {
    const filasBanda = filtrados.filter(h => h.banda === banda);
    const catalogoBanda = bandasDelScore.get(banda);
    // q_vendidos/capital/capital_mas_interes se repiten idénticos en las 5 filas de
    // umbral de una misma cepa — para no contarlos 5 veces al sumar entre cepas,
    // se toma una sola fila (umbral de referencia) por cepa antes de sumar.
    const unaFilaPorCepa = [...new Map(filasBanda.filter(h => h.umbral_dias === UMBRALES[0]).map(h => [h.cepa, h])).values()];
    const qVendidos = unaFilaPorCepa.reduce((acc, h) => acc + h.q_vendidos, 0);
    const capital = unaFilaPorCepa.reduce((acc, h) => acc + h.capital, 0);
    const capitalMasInteres = unaFilaPorCepa.reduce((acc, h) => acc + h.capital_mas_interes, 0);

    const celdas: Record<number, GridCell> = {};
    UMBRALES.forEach(umbral => {
      const filasUmbral = filasBanda.filter(h => h.umbral_dias === umbral);
      const nElegible = filasUmbral.reduce((acc, h) => acc + h.n_elegible, 0);
      const nMalos = filasUmbral.reduce((acc, h) => acc + h.n_malos, 0);
      celdas[umbral] = { nElegible, moraPct: nElegible > 0 ? (nMalos / nElegible) * 100 : null };
    });

    const label = banda === 'SIN_SCORE' ? 'SIN SCORE'
      : banda === 'ERROR_NODO' ? 'ERROR NODO (-1)'
      : catalogoBanda?.tramo_5 ? `${banda} · ${catalogoBanda.tramo_5}` : `Banda ${banda}`;
    const scoreRange = catalogoBanda ? `${catalogoBanda.score_min}-${catalogoBanda.score_max}` : null;

    return { banda, label, scoreRange, qVendidos, capital, capitalMasInteres, celdas };
  });

  // Cualquier banda no reconocida (ej. un score fuera del rango de bandas del catálogo)
  // se agrupa en una fila visible propia — nunca se descarta en silencio.
  const bandasReconocidas = new Set(bandaOrder);
  const filasFueraDeRango = filtrados.filter(h => !bandasReconocidas.has(h.banda));
  if (filasFueraDeRango.length > 0) {
    const unaFilaPorCepa = [...new Map(filasFueraDeRango.filter(h => h.umbral_dias === UMBRALES[0]).map(h => [h.cepa, h])).values()];
    const qVendidos = unaFilaPorCepa.reduce((acc, h) => acc + h.q_vendidos, 0);
    const capital = unaFilaPorCepa.reduce((acc, h) => acc + h.capital, 0);
    const capitalMasInteres = unaFilaPorCepa.reduce((acc, h) => acc + h.capital_mas_interes, 0);
    const celdas: Record<number, GridCell> = {};
    UMBRALES.forEach(umbral => {
      const filasUmbral = filasFueraDeRango.filter(h => h.umbral_dias === umbral);
      const nElegible = filasUmbral.reduce((acc, h) => acc + h.n_elegible, 0);
      const nMalos = filasUmbral.reduce((acc, h) => acc + h.n_malos, 0);
      celdas[umbral] = { nElegible, moraPct: nElegible > 0 ? (nMalos / nElegible) * 100 : null };
    });
    rows.push({ banda: 'FUERA_DE_RANGO', label: 'FUERA DE RANGO', scoreRange: null, qVendidos, capital, capitalMasInteres, celdas });
  }

  return [...rows, computeTotalRow(rows)];
}

/**
 * Filtra la grilla a las bandas elegidas (la fila Total no cuenta como banda) y
 * recalcula el Total sobre lo que queda visible.
 */
export function filterGridByBanda(grid: GridRow[], bandasSeleccionadas: Set<string>): GridRow[] {
  const rows = grid.filter(r => !r.esTotal && bandasSeleccionadas.has(r.banda));
  return [...rows, computeTotalRow(rows)];
}

export interface HeaderIndicators {
  spread: number | null; // null = volumen insuficiente
  spreadEsperado: number | null;
  spreadEsperadoLabel: string;
  inversiones: number;
  coberturaPct: number;
}

const TRAMOS_ORDEN = ['1 MUY BUENO', '2 BUENO', '3 MEDIO', '4 MALO', '5 MUY MALO'];
const MIN_N_PARA_SPREAD = 300;

/**
 * Si todas las bandas vigentes del score tienen tramo_5 (esquema de deciles de desarrollo),
 * el spread y las inversiones se miden por tramo (5 MUY MALO / 1 MUY BUENO) contra el
 * lift d1/d10 del catálogo — comportamiento original.
 * Si el esquema vigente no tiene tramos (ej. SHADOW_Q6 de arg_nuevos_v2), se mide banda a
 * banda (peor banda / mejor banda) y el esperado sale del bad_rate de esas mismas bandas
 * vigentes, para no comparar contra el lift del esquema viejo.
 */
export function computeHeaderIndicators(
  grid: GridRow[],
  bandas: BandaCatalogo[],
  scoreKey: string,
  liftD1D10Esperado: number | null
): HeaderIndicators {
  const vigentes = bandasVigentesDelScore(bandas, scoreKey);
  const bandasDelScore = new Map(vigentes.map(b => [String(b.decil), b]));
  const usaTramos = vigentes.length > 0 && vigentes.every(b => !!b.tramo_5);

  // Grupos ordenados de mejor a peor: tramos (esquema D10) o bandas individuales.
  const grupos = usaTramos ? TRAMOS_ORDEN : vigentes.map(b => String(b.decil));
  const grupoDe = (banda: string) => usaTramos ? bandasDelScore.get(banda)?.tramo_5 ?? undefined
    : bandasDelScore.has(banda) ? banda : undefined;

  const porGrupo = new Map<string, { nElegible: number; nMalos: number }>();
  grid.filter(r => !r.esTotal && !BANDAS_ESPECIALES.includes(r.banda)).forEach(r => {
    const grupo = grupoDe(r.banda);
    if (!grupo) return;
    const celda30 = r.celdas[30];
    const acc = porGrupo.get(grupo) ?? { nElegible: 0, nMalos: 0 };
    acc.nElegible += celda30.nElegible;
    acc.nMalos += celda30.moraPct !== null ? Math.round((celda30.moraPct / 100) * celda30.nElegible) : 0;
    porGrupo.set(grupo, acc);
  });

  const moraPorGrupo = grupos.map(g => {
    const v = porGrupo.get(g);
    return v && v.nElegible > 0 ? v.nMalos / v.nElegible : null;
  });

  const nPorGrupo = grupos.map(g => porGrupo.get(g)?.nElegible ?? 0);
  const volumenSuficiente = grupos.length >= 2 && nPorGrupo.every(n => n >= MIN_N_PARA_SPREAD);

  const mejor = moraPorGrupo[0];
  const peor = moraPorGrupo[moraPorGrupo.length - 1];
  const spread = volumenSuficiente && mejor !== null && peor !== null && mejor > 0
    ? peor / mejor
    : null;

  let inversiones = 0;
  for (let i = 0; i < moraPorGrupo.length - 1; i++) {
    const a = moraPorGrupo[i];
    const b = moraPorGrupo[i + 1];
    if (a !== null && b !== null && b < a) inversiones++;
  }

  let spreadEsperado: number | null;
  let spreadEsperadoLabel: string;
  if (usaTramos) {
    spreadEsperado = liftD1D10Esperado;
    spreadEsperadoLabel = 'esperado (lift d1/d10)';
  } else {
    const brMejor = vigentes.length > 0 ? Number(vigentes[0].bad_rate) : NaN;
    const brPeor = vigentes.length > 0 ? Number(vigentes[vigentes.length - 1].bad_rate) : NaN;
    spreadEsperado = Number.isFinite(brMejor) && Number.isFinite(brPeor) && brMejor > 0 ? brPeor / brMejor : null;
    spreadEsperadoLabel = `esperado (bad rate banda ${grupos[grupos.length - 1] ?? '?'}/banda ${grupos[0] ?? '?'})`;
  }

  const totalRow = grid.find(r => r.esTotal)!;
  const sinScoreRow = grid.find(r => r.banda === 'SIN_SCORE');
  const qConScore = totalRow.qVendidos - (sinScoreRow?.qVendidos ?? 0);
  const coberturaPct = totalRow.qVendidos > 0 ? (qConScore / totalRow.qVendidos) * 100 : 0;

  return { spread, spreadEsperado, spreadEsperadoLabel, inversiones, coberturaPct };
}
