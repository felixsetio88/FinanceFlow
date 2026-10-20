import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, isWithinInterval, parseISO, subDays, subWeeks, subMonths } from 'date-fns';
import { normalizeCategoryId } from './categories';

export function formatDate(date) {
    return format(new Date(date), 'MMM dd, yyyy');
}

export function formatDateShort(date) {
    return format(new Date(date), 'MMM dd');
}

export function formatTime(date) {
    return format(new Date(date), 'hh:mm a');
}

export function formatDateTime(date) {
    return format(new Date(date), 'MMM dd, yyyy · hh:mm a');
}

export function getDateRange(period, referenceDate = new Date(), cycleStartDay = 1) {
    const ref = new Date(referenceDate);
    const wrap = (start, end) => ({ start, end, startDate: start, endDate: end });
    switch (period) {
        case 'all':
            return wrap(new Date(0), new Date(8640000000000000));
        case 'daily':
            return wrap(startOfDay(ref), endOfDay(ref));
        case 'weekly':
            return wrap(startOfWeek(ref, { weekStartsOn: 1 }), endOfWeek(ref, { weekStartsOn: 1 }));
        case 'monthly': {
            const targetDay = Math.max(1, Math.min(31, parseInt(cycleStartDay, 10) || 1));
            if (targetDay === 1) {
                return wrap(startOfMonth(ref), endOfMonth(ref));
            }
            // Clamped salary cycle: e.g. 31st automatically clamps to 28/29th in Feb, 30th in 30-day months
            const year = ref.getFullYear();
            const month = ref.getMonth(); // 0-indexed

            const getClampedDate = (y, m, day) => {
                const daysInMonth = new Date(y, m + 1, 0).getDate();
                const actualDay = Math.min(day, daysInMonth);
                return new Date(y, m, actualDay, 0, 0, 0, 0);
            };

            const thisMonthStart = getClampedDate(year, month, targetDay);

            let cycleStart, cycleEnd;
            if (ref >= thisMonthStart) {
                cycleStart = thisMonthStart;
                const nextMonthStart = getClampedDate(year, month + 1, targetDay);
                cycleEnd = new Date(nextMonthStart.getTime() - 1);
            } else {
                cycleStart = getClampedDate(year, month - 1, targetDay);
                cycleEnd = new Date(thisMonthStart.getTime() - 1);
            }
            return wrap(cycleStart, cycleEnd);
        }
        default:
            return wrap(startOfDay(ref), endOfDay(ref));
    }
}

export function getPreviousDateRange(period, referenceDate = new Date()) {
    const ref = new Date(referenceDate);
    switch (period) {
        case 'all':
            return getDateRange('all', ref);
        case 'daily':
            return getDateRange('daily', subDays(ref, 1));
        case 'weekly':
            return getDateRange('weekly', subWeeks(ref, 1));
        case 'monthly':
            return getDateRange('monthly', subMonths(ref, 1));
        default:
            return getDateRange('daily', subDays(ref, 1));
    }
}

export function filterTransactionsByPeriod(transactions, period, referenceDate) {
    if (period === 'all') {
        return Array.isArray(transactions) ? [...transactions] : [];
    }
    const { start, end } = getDateRange(period, referenceDate);
    return transactions.filter(t => {
        const d = new Date(t.date);
        return isWithinInterval(d, { start, end });
    });
}

export function groupByCategory(transactions, getConvertedAmount = null) {
    const groups = {};
    transactions.forEach(t => {
        const splits = Array.isArray(t.splits) && t.splits.length > 0 ? t.splits : null;

        if (splits) {
            // Distribute each split to its respective category
            splits.forEach(split => {
                const rawCat = split.category || t.category || 'other_spending';
                const cat = normalizeCategoryId(rawCat);
                if (!groups[cat]) groups[cat] = { total: 0, count: 0, transactions: [] };
                const amount = Math.abs(split.amount || 0);
                groups[cat].total += amount;
                groups[cat].count += 1;
                groups[cat].transactions.push(t);
            });
        } else {
            const rawCat = t.category || 'other_spending';
            const cat = normalizeCategoryId(rawCat);
            if (!groups[cat]) groups[cat] = { total: 0, count: 0, transactions: [] };
            const amount = getConvertedAmount ? Math.abs(getConvertedAmount(t)) : Math.abs(t.amount || 0);
            groups[cat].total += amount;
            groups[cat].count += 1;
            groups[cat].transactions.push(t);
        }
    });
    return groups;
}

export function groupByDate(transactions) {
    const groups = {};
    transactions.forEach(t => {
        const key = format(new Date(t.date), 'yyyy-MM-dd');
        if (!groups[key]) groups[key] = [];
        groups[key].push(t);
    });
    return groups;
}

export function calculateBudgetUsage(transactions, budget, referenceDate = new Date(), getConvertedAmount = null) {
    const { start, end } = getDateRange(budget.period, referenceDate, budget.cycleStartDay || 1);
    const periodTransactions = transactions.filter(t => {
        if (t.type !== 'spending') return false;
        if (budget.category && budget.category !== 'all' && t.category !== budget.category) return false;
        const d = new Date(t.date);
        return isWithinInterval(d, { start, end });
    });
    const spent = periodTransactions.reduce((sum, t) => {
        const amt = getConvertedAmount ? Math.abs(getConvertedAmount(t)) : Math.abs(t.amount || 0);
        return sum + amt;
    }, 0);
    const limit = budget.amount || 0;
    const remaining = limit - spent;
    const percentage = limit > 0 ? (spent / limit) * 100 : 0;
    return { spent, limit, remaining, percentage, isOver: spent > limit };
}

let _idSeq = 0;

export function generateId() {
    _idSeq = (_idSeq + 1) % 1679616;
    return Date.now().toString(36) + _idSeq.toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 9);
}

/**
 * Given a recurrence frequency and date, returns the next ISO date string.
 * Supports both (frequency, fromDate) and (fromDate, frequency) orderings.
 * @param {'daily'|'weekly'|'biweekly'|'monthly'|'yearly'|Date|string} arg1
 * @param {'daily'|'weekly'|'biweekly'|'monthly'|'yearly'|Date|string} arg2
 * @returns {string} ISO date string
 */
export function getNextDueDate(arg1, arg2) {
    const validFrequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];
    let frequency = 'monthly';
    let fromDate = new Date();

    if (typeof arg1 === 'string' && validFrequencies.includes(arg1.toLowerCase())) {
        frequency = arg1.toLowerCase();
        fromDate = arg2;
    } else if (typeof arg2 === 'string' && validFrequencies.includes(arg2.toLowerCase())) {
        frequency = arg2.toLowerCase();
        fromDate = arg1;
    } else if (typeof arg1 === 'string') {
        frequency = arg1;
        fromDate = arg2;
    }

    let d = new Date(fromDate);
    if (Number.isNaN(d.getTime())) {
        d = new Date();
    }

    switch (frequency) {
        case 'daily':    d.setDate(d.getDate() + 1);    break;
        case 'weekly':   d.setDate(d.getDate() + 7);    break;
        case 'biweekly': d.setDate(d.getDate() + 14);   break;
        case 'monthly':  d.setMonth(d.getMonth() + 1);  break;
        case 'yearly':   d.setFullYear(d.getFullYear() + 1); break;
        default:         d.setDate(d.getDate() + 1);    break;
    }
    return d.toISOString();
}

/**
 * Resolves an asset identifier or account name/reference against a list of assets.
 * Matches exact ID, case-insensitive ID, exact name, noise-stripped name, or substring.
 * @param {string|object} input - Asset ID or account name (e.g. 'ms1wzpfz000o3fr8jch', 'BPR KITA', 'BPR kita account')
 * @param {Array} assets - Array of asset objects from context or database
 * @returns {object|null} - The matched asset object or null if not found
 */
export function findMatchingAsset(input, assets) {
    if (!input || !Array.isArray(assets) || assets.length === 0) return null;
    const raw = typeof input === 'object' ? (input.id || input.name || '') : String(input);
    const clean = raw.trim();
    if (!clean) return null;

    // 1. Direct ID match
    const byId = assets.find(a => a.id === clean);
    if (byId) return byId;

    // 2. Case-insensitive ID match
    const byIdCi = assets.find(a => a.id && a.id.toLowerCase() === clean.toLowerCase());
    if (byIdCi) return byIdCi;

    // 3. Exact Name match (case-insensitive)
    const cleanLower = clean.toLowerCase();
    const byName = assets.find(a => a.name && a.name.toLowerCase() === cleanLower);
    if (byName) return byName;

    // 4. Strip common noise words: account, rekening, bank, wallet, tabungan, kartu, card, acc
    const stripNoise = (str) => str.replace(/\b(account|rekening|bank|wallet|tabungan|kartu|card|acc)\b/gi, '').trim().toLowerCase();
    const cleanStripped = stripNoise(clean);
    if (cleanStripped) {
        const byStrippedName = assets.find(a => {
            const aStripped = stripNoise(a.name || '');
            return aStripped === cleanStripped;
        });
        if (byStrippedName) return byStrippedName;
    }

    // 5. Contains match (longest name match takes precedence)
    const candidates = assets
        .filter(a => {
            const aNameLower = (a.name || '').toLowerCase();
            const aStripped = stripNoise(a.name || '');
            return (
                (aNameLower && cleanLower.includes(aNameLower)) ||
                (aStripped && cleanStripped && cleanStripped.includes(aStripped)) ||
                (aNameLower && aNameLower.includes(cleanLower))
            );
        })
        .sort((a, b) => (b.name || '').length - (a.name || '').length);

    if (candidates.length > 0) return candidates[0];

    return null;
}

