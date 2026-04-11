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
function createDataDigest(salesData: any[]) {
  if (!salesData || salesData.length === 0) return "No hay datos disponibles.";

  const headers = Object.keys(salesData[0] || {});
  const countryCol = headers.find(h => h.toLowerCase().trim().replace(/í/g, 'i') === 'pais') || 'pais';
  
  // DESPUÉS (correcto)
  const numericColumns = headers.filter(h => {
  const lowerH = h.toLowerCase();
  if (['id', 'index', 'timestamp', 'lat', 'lng', 'latitud', 'longitud'].includes(lowerH)) return false;
  if (lowerH.includes('fecha') || lowerH.includes('date')) return false;

  // Tomar hasta 5 muestras reales (no vacías)
  const samples = salesData
    .filter(s => s[h] !== undefined && s[h] !== null && s[h] !== '')
    .slice(0, 5);
  if (samples.length === 0) return false;

  // Una columna es numérica SOLO si sus valores contienen dígitos y parsean correctamente
  const numericCount = samples.filter(s => {
    const raw = s[h];
    if (typeof raw === 'number') return true;
    const str = String(raw).trim().replace(/[$\s]/g, '');
    if (!/\d/.test(str)) return false; // sin dígitos → no es numérico
    const parsed = parseFloat(str.replace(/\./g, '').replace(',', '.'));
    return !isNaN(parsed);
  }).length;

  // Solo se considera numérica si al menos el 60% de las muestras son numéricas
  return numericCount / samples.length >= 0.6;
  });

  const countryGroups: Record<string, any[]> = {};
  salesData.forEach(s => {
    const country = String(s[countryCol] || 'Desconocido').trim().toUpperCase();
    if (!countryGroups[country]) countryGroups[country] = [];
    countryGroups[country].push(s);
  });

  const financialSummaryByCountry = Object.entries(countryGroups).map(([country, data]) => {
    const currency = country.includes('ARGENTINA') ? 'ARS' : (country.includes('COLOMBIA') ? 'COP' : 'USD');
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
          numericColumns.forEach(col => {
            valStats[val].metrics[col] += cleanNumber(s[col]);
          });
        });

        const segments = Object.entries(valStats)
          .sort((a, b) => b[1].count - a[1].count) // Sort by volume
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

            return {
              segmento: name,
              cantidad_operaciones: stats.count,
              metricas: metricsBreakdown
            };
          });

        if (segments.length > 0) {
          categoricalStats[header] = segments;
        }
      }
    });

    return {
      pais: country,
      moneda_local: currency,
      cotizacion_usd: rate,
      total_operaciones: data.length,
      resumen_financiero_global: globalTotals,
      desglose_por_dimensiones: categoricalStats
    };
  });

  return {
    total_registros_dataset: salesData.length,
    analisis_por_pais: financialSummaryByCountry
  };
}

export async function generateInsights(
  salesData: any[],
  dateRange: { from: string; to: string },
  activeFilters: { field: string; values: string[] }[] = [],
  email?: string
) {
  const isRawText = salesData && salesData.length === 1 && salesData[0].rawText;
  let prompt = '';

  if (isRawText) {
    prompt = `
      Eres un analista de negocios senior. Se te ha proporcionado el contenido extraído de un documento PDF.

      CONTENIDO DEL DOCUMENTO:
      ${salesData[0].rawText.substring(0, 15000)}

      INSTRUCCIONES:
      1. Analiza el texto y extrae los hallazgos más relevantes para el negocio.
      2. Si hay tablas o datos numéricos, intenta interpretarlos.
      3. Proporciona un resumen ejecutivo y 3 insights clave.
      4. Si el documento no parece contener datos de negocio relevantes, menciónalo cortésmente.

      Responde en formato JSON con la siguiente estructura:
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

    prompt = `
      Eres un analista de negocios senior. Analiza el RESUMEN INTEGRAL de los datos de ventas proporcionados.

      CONTEXTO DE NEGOCIO Y REGLAS (LEER CON ATENCIÓN):
      ${getBusinessContext()}

      CONTEXTO DEL ANÁLISIS:
      - PERIODO: Desde ${dateRange.from} hasta ${dateRange.to}.
      - FILTROS ACTIVOS: ${filtersDescription}.

      RESUMEN INTEGRAL DINÁMICO:
      ${JSON.stringify(dataDigest, null, 2)}

      INSTRUCCIONES CRÍTICAS DE REPORTE:
      1. REPORTA POR PAÍS: No mezcles Argentina y Colombia en el análisis financiero.
      2. DESGLOSE POR DIMENSIONES: En "desglose_por_dimensiones", cada segmento tiene un objeto "metricas" con el detalle de cada columna numérica (Capital, Interés, etc.). ÚSALOS para responder sobre cualquier dimensión (Tipo Cliente, Sucursal, etc.).
      3. TICKET PROMEDIO: Calcúlalo usando: [monto_nominal_total de la métrica correspondiente] / [cantidad_operaciones] del segmento.
      4. AUDITORÍA: En "calculation_explanation", detalla CÓMO llegaste a los números.

      Responde en formato JSON con la siguiente estructura:
      {
        "summary": "Resumen analítico (separado por país)",
        "insights": ["Insight 1 (País A)", "Insight 2 (País B)", "Insight 3 (Comparativa de CANTIDADES)"],
        "recommendation": "Recomendación estratégica",
        "calculation_explanation": "Detalle de los cálculos y cotizaciones usadas"
      }
    `;
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
  email?: string
) {
  const isRawText = salesData && salesData.length === 1 && salesData[0].rawText;
  let systemInstruction = '';

  if (isRawText) {
    systemInstruction = `
      Eres un analista de negocios experto. Tienes acceso al contenido de un documento PDF.

      CONTENIDO DEL DOCUMENTO:
      ${salesData[0].rawText.substring(0, 10000)}

      INSTRUCCIONES:
      1. Responde preguntas basadas exclusivamente en el contenido del documento.
      2. Si el usuario pregunta por datos que no están en el texto, indícalo.
      3. Mantén un tono profesional y analítico.
    `;
  } else {
    const dataDigest = createDataDigest(salesData);
    const filtersDescription = activeFilters
      .filter(f => f.values.length > 0)
      .map(f => `${f.field}: ${f.values.join(' | ')}`)
      .join(' | ') || 'Ninguno';

    systemInstruction = `
      Eres un analista de negocios experto. Tienes acceso a un análisis dinámico de los datos de ventas.

      CONTEXTO DE NEGOCIO Y REGLAS (ESTRICTO):
      ${getBusinessContext()}

      FILTROS ACTIVOS ACTUALMENTE: ${filtersDescription}

      RESUMEN INTEGRAL DINÁMICO:
      ${JSON.stringify(dataDigest, null, 2)}

      INSTRUCCIONES DE PRECISIÓN:
      1. REPORTE SEPARADO: Nunca sumes montos de ARS y COP.
      2. DESGLOSE DINÁMICO: En "desglose_por_dimensiones", tienes el detalle de todas las métricas numéricas para cada categoría. Si te preguntan por "Tipo de Cliente", busca esa clave y usa los datos dentro de "metricas".
      3. TICKET PROMEDIO: Usa el valor nominal de la métrica (ej: Capital Desembolsado) y divídelo por "cantidad_operaciones" del segmento.
      4. TRANSPARENCIA: Muestra siempre el cálculo realizado.
    `;
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
