import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'exchangeRates';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch fresh exchange rates from open.er-api.com and cache them.
 * Rates are relative to `baseCurrency` (e.g. 1 USD = X others).
 */
export async function fetchExchangeRates(baseCurrency = 'USD') {
    try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`);
        const data = await res.json();
        if (data.result === 'success') {
            const ratesData = {
                rates: data.rates,
                base: data.base_code,
                timestamp: Date.now(),
            };
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(ratesData));
            return ratesData;
        }
        return null;
    } catch (e) {
        console.error('Failed to fetch exchange rates:', e);
        return null;
    }
}

/**
 * Return cached rates if still fresh, otherwise fetch new ones.
 */
export async function getOrFetchRates(baseCurrency = 'USD') {
    try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            if (data.base === baseCurrency && Date.now() - data.timestamp < CACHE_DURATION_MS) {
                return data;
            }
        }
        return await fetchExchangeRates(baseCurrency);
    } catch (e) {
        console.error('Error getting rates:', e);
        return null;
    }
}

/**
 * Convert an amount from one currency to another using cached rates.
 *
 * The rates object has the structure: { base: 'USD', rates: { USD: 1, IDR: 16000, EUR: 0.92, ... } }
 * This means: 1 base = rates[X] of X.
 * So to convert from FROM to TO:
 *   1. Convert FROM to base: amountInBase = amount / rates[FROM]
 *   2. Convert base to TO:   result = amountInBase * rates[TO]
 */
export function convertCurrency(amount, fromCurrency, toCurrency, exchangeRatesData) {
    if (!amount || amount === 0) return 0;
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount;
    if (!exchangeRatesData?.rates) return amount; // No rates available — return as-is

    const fromRate = exchangeRatesData.rates[fromCurrency];
    const toRate = exchangeRatesData.rates[toCurrency];

    if (!fromRate || !toRate) return amount; // Unknown currency — return as-is

    const amountInBase = amount / fromRate;
    return amountInBase * toRate;
}
