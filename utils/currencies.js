// Multi-currency support
export const currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', decimals: 2 },
    { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', locale: 'id-ID', decimals: 0 },
    { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', locale: 'ms-MY', decimals: 2 },
    { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG', decimals: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', decimals: 2 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', decimals: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', decimals: 2 },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', decimals: 0 },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', decimals: 2 },
    { code: 'THB', symbol: '฿', name: 'Thai Baht', locale: 'th-TH', decimals: 2 },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won', locale: 'ko-KR', decimals: 0 },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', decimals: 2 },
    { code: 'PHP', symbol: '₱', name: 'Philippine Peso', locale: 'en-PH', decimals: 2 },
    { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', locale: 'vi-VN', decimals: 0 },
];

export function getCurrency(code) {
    return currencies.find(c => c.code === code) || currencies[0];
}

export function roundCurrency(amount, currencyCode = 'USD') {
    const num = Number(amount);
    if (!Number.isFinite(num)) return 0;
    const curr = getCurrency(currencyCode);
    const factor = curr.decimals === 0 ? 1 : Math.pow(10, curr.decimals);
    return Math.round((num + Number.EPSILON) * factor) / factor;
}

export function getTopCurrencies(defaultCode, selectedCode = null) {
    const popular = ['USD', 'IDR', 'EUR', 'GBP', 'JPY', 'AUD', 'SGD'];
    const defaultCur = getCurrency(defaultCode);
    const top = [defaultCur];

    if (selectedCode && selectedCode !== defaultCur.code) {
        const selCur = getCurrency(selectedCode);
        if (selCur) top.push(selCur);
    }

    for (const code of popular) {
        if (top.length >= 5) break;
        if (!top.some(c => c.code === code)) {
            const cur = getCurrency(code);
            if (cur) top.push(cur);
        }
    }
    return top;
}

export function formatCurrency(amount, currencyCode = 'USD') {
    const curr = getCurrency(currencyCode);
    const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
    try {
        return new Intl.NumberFormat(curr.locale, {
            style: 'currency',
            currency: curr.code,
            minimumFractionDigits: curr.decimals,
            maximumFractionDigits: curr.decimals,
        }).format(safeAmount);
    } catch {
        const formatted = safeAmount.toFixed(curr.decimals);
        return `${curr.symbol}${formatted}`;
    }
}

export function parseCurrencyAmount(str, currencyCode = 'USD') {
    if (typeof str === 'number') return Number.isFinite(str) ? str : 0;
    if (!str) return 0;

    let clean = String(str).trim().replace(/[^0-9.,-]/g, '');
    if (!clean) return 0;

    const commaCount = (clean.match(/,/g) || []).length;
    const dotCount = (clean.match(/\./g) || []).length;

    if (commaCount > 0 && dotCount > 0) {
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
            // European/Indonesian format: 1.250.000,50 -> 1250000.50
            clean = clean.replace(/\./g, '').replace(',', '.');
        } else {
            // US/UK format: 1,250,000.50 -> 1250000.50
            clean = clean.replace(/,/g, '');
        }
    } else if (commaCount > 0) {
        // Only commas present
        if (commaCount > 1) {
            // Multiple commas = thousands separators: 1,250,000 -> 1250000
            clean = clean.replace(/,/g, '');
        } else {
            const parts = clean.split(',');
            // If 3 digits after comma and currency has 0 decimals (or integer >= 1), treat as thousands if 1,000
            const curr = getCurrency(currencyCode);
            if (parts[1].length === 3 && curr.decimals === 0) {
                clean = clean.replace(/,/g, '');
            } else if (parts[1].length <= 2) {
                // Decimal comma: 12,50 -> 12.50
                clean = clean.replace(',', '.');
            } else {
                clean = clean.replace(/,/g, '');
            }
        }
    } else if (dotCount > 1) {
        // Multiple dots = thousands separators (e.g. Indonesian 1.500.000 -> 1500000)
        clean = clean.replace(/\./g, '');
    } else if (dotCount === 1) {
        const parts = clean.split('.');
        const curr = getCurrency(currencyCode);
        // In 0-decimal currencies like IDR/JPY, "75.000" with 3 trailing digits is 75000
        if (curr.decimals === 0 && parts[1].length === 3 && parts[0].length >= 1) {
            clean = clean.replace('.', '');
        }
    }

    const val = parseFloat(clean);
    return Number.isFinite(val) ? val : 0;
}
