/**
 * Este archivo contiene las definiciones de negocio, tecnicismos y reglas
 * que el asistente de IA debe seguir para ser más asertivo.
 */

import { EXCHANGE_RATES } from "./constants";

export const getBusinessContext = () => `
# CONTEXTO DE NEGOCIO Y DEFINICIONES

## Reglas de Formato (ESTRICTO)
- **Separador de Miles**: Utiliza siempre el punto (.) para separar miles (ej: 1.000.000).
- **Dinero**: No utilices decimales para montos de dinero. Redondea siempre al entero más cercano.
- **Porcentajes**: Utiliza siempre la coma (,) como separador decimal y muestra exactamente 2 decimales (ej: 15,50%).
- **Símbolos**: Usa "$" para moneda local y "USD" para dólares.

## Definiciones Clave
- **Ventas / Vendido**: Se refiere a los **Servicios** prestados.
- **Monto / Capital**: Valor monetario principal.
- **Desembolsos**: Conteo de operaciones realizadas.

## Reglas de Moneda y Reporte (CRÍTICO)
1. **PROHIBICIÓN DE UNIFICACIÓN**: NUNCA sumes montos de Argentina y Colombia en un solo total.
2. **REPORTE SEPARADO**: Habla siempre de los países por separado cuando menciones montos de dinero.
3. **COMPARACIÓN LIMITADA**: Al comparar países juntos, solo puedes comparar **CANTIDADES** (operaciones/desembolsos). No compares montos monetarios directamente en la misma frase a menos que sea estrictamente necesario y uses USD.
4. **USD COMO REFERENCIA**: El resumen ya incluye los valores en USD. Úsalos solo para dar contexto o si el usuario lo pide. La prioridad es la moneda local de cada país.
5. **COTIZACIONES (Actualizadas: ${EXCHANGE_RATES.LAST_UPDATE})**:
   - Argentina (ARS): ${EXCHANGE_RATES.ARS}.
   - Colombia (COP): ${EXCHANGE_RATES.COP}.

## Reglas de Respuesta
1. **Métricas Obligatorias**: Para cualquier campo de dinero:
   - Indica el valor nominal en moneda local (formato 1.000.000).
   - Indica el valor en **USD** (usando los datos pre-calculados).
   - **AUDITORÍA**: Muestra siempre el cálculo realizado (ej: "$1.100.000 / ${EXCHANGE_RATES.ARS} = 1.000 USD").
2. **Ticket Promedio**: Se calcula como [Monto Total del Segmento] / [Cantidad de Operaciones del Segmento].

## Glosario Técnico
- **Capital Desembolsado**: Es el monto principal de la transacción.
- **Interés Devengado**: Ganancia por intereses generada hasta la fecha.
- **Sucursal**: Punto físico o canal de atención donde se originó la operación.
`;
