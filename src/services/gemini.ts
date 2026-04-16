import { getBusinessContext } from "../businessContext";
import { EXCHANGE_RATES } from "../constants";

function findAmountColumn(headers: string[]): string {
  const candidates = ['monto', 'capital', 'importe', 'total', 'monto_total', 'capital_desembolsado', 'valor', 'monto total', 'capital desembolsado', 'capital_desembolsado'];
  
  const normalizedHeaders = headers.map(h => ({ original: h, clean: h.trim().toLowerCase().replace(/_/g, ' ') }));
  
  // Try exact match on cleaned headers
  for (const candidate of candidates) {
    const cleanCandidate = candidate.replace(/_/g, ' ');
    const found = normalizedHeaders.find(h => h.clean === cleanCandidate);
    if (found) return found.original;
  }
  
  // Try partial match
  for (const candidate of candidates) {
    const cleanCandidate = candidate.replace(/_/g, ' ');
    const found = normalizedHeaders.find(h => h.clean.includes(cleanCandidate));
    if (found) return found.original;
  }
  
  return headers.find(h => h.toLowerCase().includes('monto')) || headers[0] || 'monto';
}

function cleanNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let s = String(val).trim();
  // Remove currency symbols, spaces and other non-numeric chars except , and .
  s = s.replace(/[$\s]/g, '');
  
  // Logic based on user rules and common data formats:
  // 1. If it has a comma, it's Latin format (1.000,00)
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  
  // 2. If it only has dots, we must distinguish between thousands and decimals.
  if (s.includes('.')) {
    const parts = s.split('.');
    // Multiple dots: definitely thousands (1.000.000)
    if (parts.length > 2) {
      return parseFloat(s.replace(/\./g, '')) || 0;
    }
    // Single dot: 
    // If followed by exactly 3 digits, it's likely a thousands separator (1.100, 1.000)
    // If followed by 1, 2 or >3 digits, it's likely a decimal point (123.45, 10.5)
    const lastPart = parts[1];
    if (lastPart.length === 3) {
      return parseFloat(s.replace(/\./g, '')) || 0;
    } else {
      return parseFloat(s) || 0;
    }
  }
  
  return parseFloat(s) || 0;
}

const moneyFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatMoney(val: number): string {
  // Format: 1.000.000 (dot for thousands, no decimals)
  return moneyFormatter.format(Math.round(val));
}

function formatPercent(val: number): string {
  // Format: 15,50% (comma for decimals, 2 decimals)
  return val.toLocaleString('es-AR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}
function detectDateColumns(headers: string[]): string[] {
  return headers.filter(h => {
    const l = h.toLowerCase();
    return l.includes('fecha') || l.includes('date') || l.includes('periodo') || l.includes('period');
  });
}

function describeDateColumns(salesData: any[], dateColumns: string[]): Record<string, { min: string; max: string; ejemplo: string }> {
  const info: Record<string, { min: string; max: string; ejemplo: string }> = {};
  for (const col of dateColumns) {
    const dates = salesData
      .map(s => s[col])
      .filter(v => v != null && v !== '')
      .map(v => { try { return new Date(v); } catch { return null; } })
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    if (dates.length === 0) continue;
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    info[col] = {
      min: min.toISOString().slice(0, 10),
      max: max.toISOString().slice(0, 10),
      ejemplo: String(salesData.find(s => s[col] != null)?.[col] ?? ''),
    };
  }
  return info;
}

function toYearMonth(raw: any): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch { return null; }
}

function buildTemporalAnalysis(
  data: any[],
  dateCol: string,
  numericColumns: string[],
  rate: number
): any {
  const monthlyGroups: Record<string, any[]> = {};
  data.forEach(s => {
    const ym = toYearMonth(s[dateCol]);
    if (!ym) return;
    if (!monthlyGroups[ym]) monthlyGroups[ym] = [];
    monthlyGroups[ym].push(s);
  });

  const amountCol = findAmountColumn(numericColumns.length ? numericColumns : [dateCol]);

  const monthly = Object.entries(monthlyGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, rows]) => {
      const totals: Record<string, string> = {};
      numericColumns.forEach(col => {
        const sum = rows.reduce((acc, r) => acc + cleanNumber(r[col]), 0);
        totals[col] = formatMoney(sum);
        if (rate !== 1) totals[`${col}_usd`] = formatMoney(sum / rate);
      });
      const mainTotal = rows.reduce((acc, r) => acc + cleanNumber(r[amountCol]), 0);
      return {
        mes,
        operaciones: rows.length,
        principal_metrica: { campo: amountCol, total: formatMoney(mainTotal), usd: formatMoney(mainTotal / rate) },
        todas_las_metricas: totals,
      };
    });

  const sorted = [...monthly].sort((a, b) => b.principal_metrica.campo === amountCol
    ? cleanNumber(b.principal_metrica.total.replace(/\./g, '')) - cleanNumber(a.principal_metrica.total.replace(/\./g, ''))
    : 0);

  return {
    campo_fecha_usado: dateCol,
    total_meses_con_datos: monthly.length,
    desglose_mensual: monthly,
    ranking_mejores_meses: monthly
      .slice()
      .sort((a, b) => {
        const valA = Object.values(monthlyGroups[a.mes] || []).reduce((acc: number, r: any) => acc + cleanNumber(r[amountCol]), 0);
        const valB = Object.values(monthlyGroups[b.mes] || []).reduce((acc: number, r: any) => acc + cleanNumber(r[amountCol]), 0);
        return valB - valA;
      })
      .slice(0, 5)
      .map(m => ({ mes: m.mes, operaciones: m.operaciones, ...m.principal_metrica })),
  };
}

function createDataDigest(salesData: any[]) {
  if (!salesData || salesData.length === 0) return "No hay datos disponibles.";

  const headers = Object.keys(salesData[0] || {});
  const countryCol = headers.find(h => h.toLowerCase().trim().replace(/í/g, 'i') === 'pais') || 'pais';
  const dateColumns = detectDateColumns(headers);
  const primaryDateCol = dateColumns[0] || null;

  const numericColumns = headers.filter(h => {
    const lowerH = h.toLowerCase();
    if (['id', 'index', 'timestamp', 'lat', 'lng', 'latitud', 'longitud'].includes(lowerH)) return false;
    if (lowerH.includes('fecha') || lowerH.includes('date')) return false;

    const samples = salesData
      .filter(s => s[h] !== undefined && s[h] !== null && s[h] !== '')
      .slice(0, 5);
    if (samples.length === 0) return false;

    const numericCount = samples.filter(s => {
      const raw = s[h];
      if (typeof raw === 'number') return true;
      const str = String(raw).trim().replace(/[$\s]/g, '');
      if (!/\d/.test(str)) return false;
      const parsed = parseFloat(str.replace(/\./g, '').replace(',', '.'));
      return !isNaN(parsed);
    }).length;

    return numericCount / samples.length >= 0.6;
  });

  const countryGroups: Record<string, any[]> = {};
  salesData.forEach(s => {
    const country = String(s[countryCol] || 'Desconocido').trim().toUpperCase();
    if (!countryGroups[country]) countryGroups[country] = [];
    countryGroups[country].push(s);
  });

  const financialSummaryByCountry = Object.entries(countryGroups).map(([country, data]) => {
    const currency = country.includes('ARGENTIN') ? 'ARS' : (country.includes('COLOMB') ? 'COP' : 'USD');
    const rate = currency === 'ARS' ? EXCHANGE_RATES.ARS : (currency === 'COP' ? EXCHANGE_RATES.COP : 1);

    const globalTotals: Record<string, any> = {};
    numericColumns.forEach(col => {
      const sum = data.reduce((acc, s) => acc + cleanNumber(s[col]), 0);
      globalTotals[col] = {
        nominal: formatMoney(sum),
        usd: formatMoney(sum / rate),
        valor_numerico_nominal: Math.round(sum)
      };
    });

    const categoricalStats: Record<string, any> = {};
    const excludeFromCategorical = [
      ...numericColumns.map(c => c.toLowerCase()),
      countryCol.toLowerCase(),
      'fecha', 'id', 'index', 'timestamp', 'lat', 'lng', 'latitud', 'longitud', 'date'
    ];

    headers.forEach(header => {
      const lowerHeader = header.toLowerCase();
      if (!excludeFromCategorical.some(ex => lowerHeader.includes(ex)) && !numericColumns.includes(header)) {
        const valStats: Record<string, { count: number, metrics: Record<string, number> }> = {};
        data.forEach(s => {
          const val = String(s[header] || 'N/A').trim();
          if (!valStats[val]) {
            valStats[val] = { count: 0, metrics: {} };
            numericColumns.forEach(col => valStats[val].metrics[col] = 0);
          }
          valStats[val].count++;
          numericColumns.forEach(col => { valStats[val].metrics[col] += cleanNumber(s[col]); });
        });

        const segments = Object.entries(valStats)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(([name, stats]) => {
            const metricsBreakdown: Record<string, any> = {};
            numericColumns.forEach(col => {
              metricsBreakdown[col] = {
                nominal: formatMoney(stats.metrics[col]),
                usd: formatMoney(stats.metrics[col] / rate),
                valor_numerico_nominal: Math.round(stats.metrics[col])
              };
            });
            return { segmento: name, cantidad_operaciones: stats.count, metricas: metricsBreakdown };
          });

        if (segments.length > 0) categoricalStats[header] = segments;
      }
    });

    const temporal = primaryDateCol
      ? buildTemporalAnalysis(data, primaryDateCol, numericColumns, rate)
      : null;

    return {
      pais: country,
      moneda_local: currency,
      cotizacion_usd: rate,
      total_operaciones: data.length,
      resumen_financiero_global: globalTotals,
      desglose_por_dimensiones: categoricalStats,
      ...(temporal ? { analisis_temporal: temporal } : {}),
    };
  });

  return {
    total_registros_dataset: salesData.length,
    campos_disponibles: {
      todos: headers,
      numericos: numericColumns,
      fechas: dateColumns,
      detalle_fechas: describeDateColumns(salesData, dateColumns),
      categoricos: headers.filter(h => !numericColumns.includes(h) && !dateColumns.includes(h) && h !== 'id'),
    },
    analisis_por_pais: financialSummaryByCountry,
  };
}

const MODULE_CONTEXTS: Record<string, string> = {
  sales: `Estás analizando datos del módulo de VENTAS. El foco es: ingresos, productos más vendidos, clientes, tendencias comerciales y ticket promedio.`,
  collections: `Estás analizando datos del módulo de COBRANZAS. El foco es: pagos recibidos, cartera vencida, mora, eficiencia de recaudación y aging de deuda.`,
  risks: `Estás analizando datos del módulo de RIESGOS. El foco es: perfiles crediticios, indicadores de mora, comportamiento de pago, alertas de riesgo y segmentación por nivel de riesgo.`,
  marketing: `Estás analizando datos del módulo de MARKETING. El foco es: performance de campañas, ROI, adquisición de clientes, conversión y canales de captación.`,
  finance: `Estás analizando datos del módulo de FINANZAS. El foco es: presupuesto, flujo de caja, estados financieros, rentabilidad y desvíos.`,
  callcenter: `Estás analizando datos del módulo de CALLCENTER. El foco es: volumen de llamadas, tiempos de atención, resolución en primer contacto y satisfacción del cliente.`,
  legal: `Estás analizando datos del módulo de LEGALES. El foco es: contratos, litigios, estado de causas y cumplimiento normativo.`,
  board: `Estás analizando datos del módulo de DIRECTORIO. El foco es: KPIs estratégicos de alto nivel, resumen ejecutivo y visión global del negocio.`,
  product: `Estás analizando datos del módulo de PRODUCTO. El foco es: ciclo de vida del producto, inventario, adopción y desarrollo.`,
  administration: `Estás analizando datos del módulo de ADMINISTRACIÓN. El foco es: procesos internos, recursos operativos y gestión administrativa.`,
};

function buildDataPrompt(
  dataDigest: any,
  dateRange: { from: string; to: string },
  filtersDescription: string,
  moduleId?: string
): string {
  const isApiModule = moduleId && MODULE_CONTEXTS[moduleId];

  if (isApiModule) {
    // API module: use business context + module-specific framing
    return `
      Eres un analista de negocios senior.

      MÓDULO: ${MODULE_CONTEXTS[moduleId]}

      CONTEXTO DE NEGOCIO Y REGLAS (LEER CON ATENCIÓN):
      ${getBusinessContext()}

      CONTEXTO DEL ANÁLISIS:
      - PERIODO: Desde ${dateRange.from} hasta ${dateRange.to}.
      - FILTROS ACTIVOS: ${filtersDescription}.

      RESUMEN INTEGRAL DINÁMICO:
      ${JSON.stringify(dataDigest, null, 2)}

      INSTRUCCIONES CRÍTICAS DE REPORTE:
      1. REPORTA POR PAÍS: No mezcles Argentina y Colombia en el análisis financiero.
      2. DESGLOSE POR DIMENSIONES: Usa los datos en "desglose_por_dimensiones" para analizar cada segmento con sus métricas numéricas.
      3. ANÁLISIS TEMPORAL: Usa "analisis_temporal.ranking_mejores_meses" y "analisis_temporal.desglose_mensual" para destacar tendencias mensuales. Si hay varias fechas en "campos_disponibles.fechas", basá el análisis en la primera y mencioná que hay otras disponibles.
      4. PROMEDIO: Calcúlalo como [total métrica] / [cantidad_operaciones] del segmento.
      5. AUDITORÍA: En "calculation_explanation", detalla cómo llegaste a los números.

      Responde en formato JSON:
      {
        "summary": "Resumen analítico (separado por país si aplica)",
        "insights": ["Insight 1", "Insight 2", "Insight 3"],
        "recommendation": "Recomendación estratégica",
        "calculation_explanation": "Detalle de cálculos"
      }
    `;
  } else {
    // File or Sheet: completely generic — AI must detect the domain
    return `
      Eres un analista de datos senior. Se te ha proporcionado un dataset externo cargado manualmente por el usuario.

      IMPORTANTE: NO asumas que estos datos son de ventas, préstamos u otro dominio específico.
      Tu primera tarea es DETECTAR qué tipo de información contiene el dataset (hotelería, RRHH, logística, salud, etc.)
      y analizar en función de lo que realmente ves.

      PERIODO DEL FILTRO: Desde ${dateRange.from} hasta ${dateRange.to}.
      FILTROS ACTIVOS: ${filtersDescription}.

      RESUMEN DEL DATASET:
      ${JSON.stringify(dataDigest, null, 2)}

      INSTRUCCIONES:
      1. Identificá el dominio del dataset por los nombres de columnas y valores que contiene.
      2. Analizá en función de ese dominio — no uses terminología de ventas ni finanzas si no corresponde.
      3. Si hay columnas numéricas, identificá cuáles son métricas clave para ese dominio.
      4. Si hay grupos geográficos o categorías, usá las reglas de formato numérico: punto para miles, sin decimales en montos.
      5. En "calculation_explanation", indicá qué tipo de dataset detectaste y por qué.

      Responde en formato JSON:
      {
        "summary": "Descripción del dataset y resumen de hallazgos",
        "insights": ["Insight 1 relevante al dominio detectado", "Insight 2", "Insight 3"],
        "recommendation": "Recomendación basada en los datos",
        "calculation_explanation": "Tipo de dataset detectado y lógica del análisis"
      }
    `;
  }
}

export async function generateInsights(
  salesData: any[],
  dateRange: { from: string; to: string },
  activeFilters: { field: string; values: string[] }[] = [],
  email?: string,
  moduleId?: string
) {
  const isRawText = salesData && salesData.length === 1 && salesData[0].rawText;
  let prompt = '';

  if (isRawText) {
    prompt = `
      Eres un analista de negocios senior. Se te ha proporcionado el contenido extraído de un documento PDF.

      CONTENIDO DEL DOCUMENTO:
      ${salesData[0].rawText.substring(0, 15000)}

      INSTRUCCIONES:
      1. Analiza el texto y extrae los hallazgos más relevantes.
      2. Si hay tablas o datos numéricos, intenta interpretarlos.
      3. Proporciona un resumen ejecutivo y 3 insights clave.
      4. Si el documento no parece contener datos relevantes, menciónalo cortésmente.

      Responde en formato JSON:
      {
        "summary": "Resumen analítico del documento",
        "insights": ["Insight 1", "Insight 2", "Insight 3"],
        "recommendation": "Recomendación basada en el documento",
        "calculation_explanation": ""
      }
    `;
  } else {
    const dataDigest = createDataDigest(salesData);
    const filtersDescription = activeFilters
      .filter(f => f.values.length > 0)
      .map(f => `${f.field}: ${f.values.join(', ')}`)
      .join(', ') || 'Ninguno';

    prompt = buildDataPrompt(dataDigest, dateRange, filtersDescription, moduleId);
  }

  try {
    const response = await fetch('/api/ai/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, email })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `Error del servidor: ${response.status}`);
    }
    return await response.json();
  } catch (e: any) {
    console.error("Error generating insights:", e);
    return {
      summary: `Error al conectar con la IA: ${e.message || 'Error desconocido'}`,
      insights: ["Verifica que GEMINI_API_KEY esté configurada en el servidor.", "Intenta recargar la página."],
      recommendation: "Revisa la consola del servidor para más detalles.",
      calculation_explanation: ""
    };
  }
}

export async function chatWithData(
  messages: { role: 'user' | 'model', content: string }[],
  salesData: any[],
  activeFilters: { field: string; values: string[] }[] = [],
  email?: string,
  moduleId?: string
) {
  const isRawText = salesData && salesData.length === 1 && salesData[0].rawText;
  let systemInstruction = '';

  if (isRawText) {
    systemInstruction = `
      Eres un analista de datos experto. Tienes acceso al contenido de un documento PDF.

      CONTENIDO DEL DOCUMENTO:
      ${salesData[0].rawText.substring(0, 10000)}

      INSTRUCCIONES:
      1. Responde preguntas basadas exclusivamente en el contenido del documento.
      2. Si el usuario pregunta por datos que no están en el texto, indícalo.
      3. Mantén un tono profesional y analítico.
    `;
  } else {
    const isApiModule = moduleId && MODULE_CONTEXTS[moduleId];
    const dataDigest = createDataDigest(salesData);
    const filtersDescription = activeFilters
      .filter(f => f.values.length > 0)
      .map(f => `${f.field}: ${f.values.join(' | ')}`)
      .join(' | ') || 'Ninguno';

    if (isApiModule) {
      systemInstruction = `
        Eres un analista de negocios experto con capacidad de inferencia sobre datos estructurados.

        MÓDULO: ${MODULE_CONTEXTS[moduleId]}

        CONTEXTO DE NEGOCIO Y REGLAS (ESTRICTO):
        ${getBusinessContext()}

        FILTROS ACTIVOS ACTUALMENTE: ${filtersDescription}

        RESUMEN INTEGRAL DINÁMICO (incluye campos disponibles, análisis temporal y categórico):
        ${JSON.stringify(dataDigest, null, 2)}

        INSTRUCCIONES DE PRECISIÓN:
        1. REPORTE SEPARADO: Nunca sumes montos de ARS y COP.
        2. DESGLOSE DINÁMICO: Usa "desglose_por_dimensiones" para responder sobre segmentos.
        3. ANÁLISIS TEMPORAL: El digest incluye "analisis_temporal" con desglose mensual ("desglose_mensual") y ranking de mejores meses ("ranking_mejores_meses"). Úsalo siempre que el usuario pregunte por meses, trimestres, períodos, tendencias, "mejor mes", "peor mes", etc.
        4. INFERENCIA DE CAMPOS: Si el usuario menciona "fecha", "mes", "período", "tiempo" o similar, buscá en "campos_disponibles.fechas" qué columnas de fecha existen y usá "analisis_temporal" para responder. No digas que no hay dimensión temporal si "campos_disponibles.fechas" no está vacío.
        5. MÚLTIPLES FECHAS: Si "campos_disponibles.fechas" tiene MÁS DE UNA columna y el usuario hace una pregunta temporal SIN especificar qué fecha usar, NO respondas todavía. En cambio, preguntale al usuario en cuál fecha quiere basar el análisis, listando las opciones con su rango disponible (usando "campos_disponibles.detalle_fechas"). Ejemplo: "Tengo varias fechas disponibles: ¿en cuál querés basar el análisis? → fecha_desembolso (2022-01 a 2024-12) / fecha_vencimiento (2023-01 a 2025-06)". Si hay UNA SOLA fecha, usala directamente sin preguntar.
        5. PROMEDIO: Usa [total métrica] / [cantidad_operaciones] del segmento.
        6. TRANSPARENCIA: Muestra siempre el cálculo realizado.
        7. SENTIDO COMÚN: Si el usuario hace una pregunta de negocio obvia (ej: "mejor mes", "top clientes", "país con más ventas"), respondé directamente usando los datos disponibles aunque el usuario no haya especificado el campo exacto.
      `;
    } else {
      systemInstruction = `
        Eres un analista de datos experto. El usuario cargó un dataset externo manualmente.

        IMPORTANTE: NO asumas que estos datos son de ventas, préstamos u otro dominio específico.
        Primero identificá el dominio del dataset por los nombres de columnas y valores, y respondé en consecuencia.

        FILTROS ACTIVOS ACTUALMENTE: ${filtersDescription}

        RESUMEN DEL DATASET:
        ${JSON.stringify(dataDigest, null, 2)}

        INSTRUCCIONES:
        1. Respondé basándote en los datos reales del dataset, usando la terminología que corresponda al dominio detectado.
        2. Si te preguntan algo que no está en los datos, indicalo claramente.
        3. Formato numérico: punto para miles, sin decimales en montos, coma para porcentajes.
        4. Siempre mostrá los cálculos realizados.
      `;
    }
  }

  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, systemInstruction, email })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `Error del servidor: ${response.status}`);
    }
    const data = await response.json();
    return data.text;
  } catch (e: any) {
    console.error("Chat Error:", e);
    return `Lo siento, hubo un error al procesar tu consulta: ${e.message || 'Error de conexión'}. Revisa la configuración del servidor.`;
  }
}
