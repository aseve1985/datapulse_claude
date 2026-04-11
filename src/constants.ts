/**
 * Centralized business constants and exchange rates.
 * These values are used for financial calculations across the app.
 */

export const EXCHANGE_RATES = {
  ARS: 1385,
  COP: 3655,
  LAST_UPDATE: '10 de Abril, 2026',
};

export const updateExchangeRates = (newRates: Partial<typeof EXCHANGE_RATES>) => {
  Object.assign(EXCHANGE_RATES, newRates);
};

export const BUSINESS_RULES = {
  THOUSANDS_SEPARATOR: '.',
  DECIMAL_SEPARATOR: ',',
  PERCENT_DECIMALS: 2,
};
