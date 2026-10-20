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

export function getTopCurrencies(defaultCode, selectedCode = null) {
    const popular = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'SGD'];
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
    try {
        return new Intl.NumberFormat(curr.locale, {
            style: 'currency',
            currency: curr.code,
            minimumFractionDigits: curr.decimals,
            maximumFractionDigits: curr.decimals,
        }).format(amount || 0);
    } catch {
        // Fallback
        const formatted = (amount || 0).toFixed(curr.decimals);
        return `${curr.symbol}${formatted}`;
    }
}

export function parseCurrencyAmount(str, currencyCode = 'USD') {
    if (!str) return 0;
    // Remove currency symbols and thousands separators
    const cleaned = str.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    return parseFloat(cleaned) || 0;
}
