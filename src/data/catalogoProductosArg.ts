// Catálogo de Productos — teórico / vigente en política de originación (uFlow).
// Refleja lo que la política dice que vende, no lo efectivamente originado.
// Actualizar este archivo cada vez que cambie la versión de política.

export interface TopeOferta {
  situacionBcra: string;
  probMora: string;
  maximo: string;
}

export interface MontoFallback {
  caso: string;
  monto: string;
}

export interface NuevosPais {
  politicaVigente: string;
  principal: {
    titulo: string;
    descripcion: string;
    tabla: TopeOferta[];
    topeAbsoluto: string;
    topeSituacion2: string;
    reglaCorte: string;
  };
  fallback: {
    titulo: string;
    descripcion: string;
    montos: MontoFallback[];
  };
  resumen: string;
}

export interface RenovacionBanda {
  renovacion: string;
  rates: string;
  multiplicador: string;
  montoMinimo?: string;
  montoMaximo: string;
  plazo: string;
}

export interface RenovadoresPais {
  politica: string;
  descripcion: string;
  tabla: RenovacionBanda[];
  resumen: string;
}

export interface TramoTasaNuevos {
  tramo: string;
  default: string;
  sitBcra2: string;
  sinInfoLaboral: string;
}

export interface OtroProductoTasa {
  producto: string;
  tasa: string;
}

export interface TasasNuevosPais {
  producto: string;
  tramos: TramoTasaNuevos[];
  otrosProductos: OtroProductoTasa[];
  bonificacion: string;
}

export interface TasaRenovacionPlazo1 {
  renovacion: string;
  y1: string;
  y2: string;
  y3: string;
  y4: string;
}

export interface TasaPlazoExtendido {
  plazo: string;
  tasa: string;
  tramoMonto: string;
}

export interface TasasRenovadoresPais {
  codigoFormato: string;
  nivelRenovacion: { codigo: string; nivel: string }[];
  comportamientoPago: { codigo: string; descripcion: string }[];
  legacy: string;
  tasaPlazo1: TasaRenovacionPlazo1[];
  plazosDisponibles: string[];
  tasaPlazosExtendidos: TasaPlazoExtendido[];
  bonificacion: string;
}

export interface CatalogoProductosPais {
  disponible: boolean;
  ultimaActualizacion?: string;
  fuente?: string;
  nuevos?: NuevosPais;
  renovadores?: RenovadoresPais;
  tasasNuevos?: TasasNuevosPais;
  tasasRenovadores?: TasasRenovadoresPais;
  punitorios?: string;
  gastosCobranza?: string;
  notas?: string[];
}

export type PaisCatalogo = 'ARG' | 'COL';

export const catalogoProductos: Record<PaisCatalogo, CatalogoProductosPais> = {
  ARG: {
    disponible: true,
    ultimaActualizacion: '2026-10-06',
    fuente: 'Política de originación (uFlow) y tabla de tasas provista por Adri.',
    nuevos: {
      politicaVigente: 'Política 15, con fallback a Política 12',
      principal: {
        titulo: 'Camino principal (Política 15)',
        descripcion: 'El tope de oferta surge de cruzar la probabilidad de mora del modelo XGBoost con la situación BCRA actual del cliente.',
        tabla: [
          { situacionBcra: '= 2', probMora: '700–999 (alta)', maximo: '$39.000' },
          { situacionBcra: '= 2', probMora: '300–699', maximo: '$40.000 (tope)' },
          { situacionBcra: '= 2', probMora: '0–299 (baja)', maximo: '$40.000 (tope)' },
          { situacionBcra: 'otra', probMora: '700–999', maximo: '$50.000' },
          { situacionBcra: 'otra', probMora: '300–699', maximo: '$55.000' },
          { situacionBcra: 'otra', probMora: '0–299 / sin dato ML', maximo: '$60.000' },
        ],
        topeAbsoluto: '$60.000',
        topeSituacion2: '$40.000. Aplica sobre el máximo que resulte de la tabla (en situación 2 el máximo ofrecido nunca supera $40.000).',
        reglaCorte: 'Si el ingreso disponible calculado < $20.000 → oferta = $0 (rechazo).',
      },
      fallback: {
        titulo: 'Fallback (Política 12) — si la 15 no logra generar oferta',
        descripcion: 'Monto directo según la situación BCRA de los últimos 6 meses del cliente (siisa_maxBCRA6m) — no hay matriz de NSE × Perfil de Riesgo ni monto mínimo aparte.',
        montos: [
          { caso: 'Situación 0 o 5 (sin historial BCRA reciente / sin información)', monto: '$40.000' },
          { caso: 'Cualquier otra situación (con información)', monto: '$60.000' },
        ],
      },
      resumen: 'Nuevos ARG vende entre $0 (rechazo) y $60.000, en cualquiera de los dos caminos — la Política 15 (principal) topea en $40.000 para situación BCRA = 2 y en $60.000 para el resto; si no logra generar oferta, el fallback (Política 12) da directamente $40.000 (sin información) o $60.000 (con información).',
    },
    renovadores: {
      politica: 'Política 11 (Política de Renovadores)',
      descripcion: 'El monto se calcula dinámicamente multiplicando la oferta del préstamo anterior (last_loan_offer_amount) por un multiplicador de fidelidad, redondeando a miles. El resultado se acota entre un piso y un techo por banda: si da menos que el monto mínimo de la banda, se usa el mínimo; si supera el tope máximo (max_amount_rule) que le corresponde al código de tasa (rate) del cliente, se usa el tope máximo. El código de rate combina cantidad de préstamos pagados + comportamiento de pago (medio de cobro y días de mora).',
      tabla: [
        { renovacion: '1ra', rates: '1021–1024', multiplicador: '1.1', montoMinimo: '$100.000', montoMaximo: '$300.000', plazo: '1 cuota' },
        { renovacion: '2da', rates: '1031–1034', multiplicador: '3.0 (CVU sin mora, rate 1031); 1.05–1.3 (resto)', montoMaximo: '$360.000', plazo: '1–12 cuotas (1031) / 1 cuota (resto)' },
        { renovacion: '3ra', rates: '1041–1044', multiplicador: '1.0–1.5', montoMaximo: '$450.000–$600.000 (según canal de cobro y puntualidad)', plazo: '1–12 cuotas' },
        { renovacion: '4ta en adelante (4to a 9no+ préstamo pagado)', rates: '1051–1094', multiplicador: '1.3', montoMaximo: '$1.000.000 (tope absoluto)', plazo: '1–12 cuotas' },
      ],
      resumen: 'Renovadores ARG vende entre $100.000 (piso de 1ra renovación) y $1.000.000, creciendo con la cantidad de préstamos pagados — mismo diseño que Colombia (tope global $1M), pero con más granularidad de multiplicadores por medio de cobro (CVU) y mora reciente.',
    },
    tasasNuevos: {
      producto: 'Producto 1010 (cuotas 1 a 30, tasa % según día del plazo)',
      tramos: [
        { tramo: '1–15', default: '65%', sitBcra2: '75%', sinInfoLaboral: '75%' },
        { tramo: '16–20', default: '60%', sitBcra2: '72%', sinInfoLaboral: '72%' },
        { tramo: '21–25', default: '55%', sitBcra2: '70%', sinInfoLaboral: '70%' },
        { tramo: '26–30', default: '50%', sitBcra2: '65%', sinInfoLaboral: '65%' },
      ],
      otrosProductos: [
        { producto: '9001', tasa: '43,875%' },
        { producto: '9002', tasa: '29,58%' },
      ],
      bonificacion: '20% de descuento sobre la tasa si el cliente abona hasta el día de vencimiento; si no, se cobra la tasa full.',
    },
    tasasRenovadores: {
      codigoFormato: '10{X}{Y}',
      nivelRenovacion: [
        { codigo: 'X=2', nivel: '1ra' },
        { codigo: 'X=3', nivel: '2da' },
        { codigo: 'X=4', nivel: '3ra' },
        { codigo: 'X=5', nivel: '4ta' },
        { codigo: 'X=6', nivel: '5ta' },
        { codigo: 'X=7', nivel: '6ta' },
        { codigo: 'X=8', nivel: '7ma' },
        { codigo: 'X=9', nivel: '8va' },
      ],
      comportamientoPago: [
        { codigo: 'Y=1', descripcion: 'Pagó por CVU sin mora' },
        { codigo: 'Y=2', descripcion: 'Pagó por CVU con hasta 8 días de mora' },
        { codigo: 'Y=3', descripcion: 'Hubo que debitarle o pagó por otro medio, hasta 8 días de mora' },
        { codigo: 'Y=4', descripcion: 'Pagó con más de 8 días de mora (hasta 40 días, el máximo al que se le da renovación)' },
      ],
      legacy: '999 = caso legacy: renovador tan antiguo que se trata como Nuevo (tasa fija 40%, plazo 1).',
      tasaPlazo1: [
        { renovacion: '1ra (102X)', y1: '50%', y2: '50%', y3: '50%', y4: '50%' },
        { renovacion: '2da (103X)', y1: '40%', y2: '40%', y3: '40%', y4: '48%' },
        { renovacion: '3ra (104X)', y1: '33%', y2: '33%', y3: '37%', y4: '40%' },
        { renovacion: '4ta (105X)', y1: '29%', y2: '32%', y3: '35%', y4: '38%' },
        { renovacion: '5ta (106X)', y1: '28%', y2: '31%', y3: '34%', y4: '37%' },
        { renovacion: '6ta (107X)', y1: '28%', y2: '31%', y3: '34%', y4: '37%' },
        { renovacion: '7ma (108X)', y1: '27%', y2: '30%', y3: '33%', y4: '36%' },
        { renovacion: '8va (109X)', y1: '25%', y2: '28%', y3: '31%', y4: '34%' },
      ],
      plazosDisponibles: [
        '1ra renovación (102X): solo plazo 1, todas las variantes de Y.',
        '2da renovación (103X): solo 1031 (Y=1, CVU sin mora) tiene plazos extendidos; 1032/1033/1034 (Y=2,3,4) solo plazo 1.',
        '3ra renovación en adelante (104X a 109X): todas las variantes de Y tienen plazos extendidos.',
      ],
      tasaPlazosExtendidos: [
        { plazo: '3', tasa: '41,3275%', tramoMonto: '$201.000–$299.000' },
        { plazo: '6', tasa: '42,5804%', tramoMonto: '≥ $300.000' },
        { plazo: '12', tasa: '34,6638%', tramoMonto: '≥ $300.000' },
        { plazo: '18', tasa: '31,0082%', tramoMonto: '≥ $401.000' },
      ],
      bonificacion: 'Renovadores no tiene bonificación por pago a tiempo.',
    },
    punitorios: '2% diario sobre el capital adeudado.',
    gastosCobranza: 'No aplica en Argentina.',
    notas: [
      'Política 15 (Nuevos) entró como camino principal el 2025-09-23; la 12 quedó como fallback.',
      'Actualización 2026-10-06: en Nuevos, situación BCRA = 2 (Política 15) y sin información BCRA, situación 0 o 5 (recorte de la Política 12 fallback), pasaron a tener un tope de $40.000.',
      'Corrección 2026-10-07: la Política 12 (fallback) no usa matriz de NSE × Perfil de Riesgo ni tiene un mínimo de $30.000 aparte — da directamente $40.000 (sin información) o $60.000 (resto). Dato mal documentado en la versión anterior.',
      'Corrección 2026-10-07: Renovadores — el resultado del multiplicador tiene piso además de techo (ej. 1ra renovación: mínimo $100.000, máximo $300.000); los mínimos de 2da/3ra/4ta en adelante todavía no están documentados.',
      'Uso del módulo: solo informativo/documental, para que usuarios vean qué se vende hoy — no es un motor de reglas consultable.',
      'Montos de Renovadores: el monto se calcula dinámicamente (last_loan_offer_amount × multiplicador, redondeado a miles, acotado entre el mínimo y el máximo de la banda) — no es un monto fijo de tabla.',
    ],
  },
  COL: {
    disponible: false,
  },
};
