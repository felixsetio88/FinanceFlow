import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'exchangeRates';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 8000; // 8 seconds

// Approximate baseline rates relative to 1 USD for offline first-launch fallback
// Prevents catastrophic 1:1 fallback (e.g. 1,000,000 IDR being treated as $1,000,000 USD)
const OFFLINE_USD_BASELINE_RATES = {
    USD: 1,
    IDR: 16200,
    MYR: 4.45,
    SGD: 1.34,
    EUR: 0.92,
    AUD: 1.52,
    GBP: 0.79,
    JPY: 154,
    CNY: 7.24,
    THB: 34.5,
    KRW: 1380,
    INR: 84.0,
    PHP: 58.0,
    VND: 25400,
    CAD: 1.39,
};

export async function fetchExchangeRates(baseCurrency = 'USD') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${baseCurrency}`, {
            signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.result === 'success' && data.rates) {
            const ratesData = {
                rates: data.rates,
                base: data.base_code || baseCurrency,
                timestamp: Date.now(),
            };
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(ratesData));
            return ratesData;
        }
        return null;
    } catch (e) {
        console.warn('Failed to fetch exchange rates (offline or timeout):', e?.message || e);
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function getOrFetchRates(baseCurrency = 'USD') {
    let staleCache = null;
    try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            if (data?.rates) {
                staleCache = data;
                if (data.base === baseCurrency && Date.now() - data.timestamp < CACHE_DURATION_MS) {
                    return data;
                }
            }
        }
        const fresh = await fetchExchangeRates(baseCurrency);
        if (fresh) return fresh;
        // If offline, return stale cache rather than null
        if (staleCache) return staleCache;
    } catch (e) {
        console.warn('Error getting rates:', e);
        if (staleCache) return staleCache;
    }
    return {
        base: 'USD',
        rates: OFFLINE_USD_BASELINE_RATES,
        timestamp: 0,
        isOfflineFallback: true,
    };
}

export function convertCurrency(amount, fromCurrency, toCurrency, exchangeRatesData) {
    const num = Number(amount);
    if (!num || !Number.isFinite(num)) return 0;
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return num;

    let rates = exchangeRatesData?.rates || exchangeRatesData;
    if (!rates || typeof rates !== 'object' || Object.keys(rates).length === 0) {
        rates = OFFLINE_USD_BASELINE_RATES;
    }

    const fromRate = Number(rates[fromCurrency]);
    const toRate = Number(rates[toCurrency]);

    if (!fromRate || !toRate || !Number.isFinite(fromRate) || !Number.isFinite(toRate) || fromRate <= 0 || toRate <= 0) {
        // Fall back to baseline USD rates if either rate is missing or non-positive
        const fallbackFrom = Number(OFFLINE_USD_BASELINE_RATES[fromCurrency]);
        const fallbackTo = Number(OFFLINE_USD_BASELINE_RATES[toCurrency]);
        if (fallbackFrom && fallbackTo && fallbackFrom > 0 && fallbackTo > 0) {
            return (num / fallbackFrom) * fallbackTo;
        }
        return num;
    }

    const amountInBase = num / fromRate;
    return amountInBase * toRate;
}
