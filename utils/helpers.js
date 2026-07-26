import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, isWithinInterval, parseISO, subDays, subWeeks, subMonths } from 'date-fns';

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

export function getDateRange(period, referenceDate = new Date()) {
    const ref = new Date(referenceDate);
    switch (period) {
        case 'all':
            return { start: new Date(0), end: new Date(8640000000000000) };
        case 'daily':
            return { start: startOfDay(ref), end: endOfDay(ref) };
        case 'weekly':
            return { start: startOfWeek(ref, { weekStartsOn: 1 }), end: endOfWeek(ref, { weekStartsOn: 1 }) };
        case 'monthly':
            return { start: startOfMonth(ref), end: endOfMonth(ref) };
        default:
            return { start: startOfDay(ref), end: endOfDay(ref) };
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
        const cat = t.category || 'other_spending';
        if (!groups[cat]) groups[cat] = { total: 0, count: 0, transactions: [] };
        
        const amount = getConvertedAmount ? Math.abs(getConvertedAmount(t)) : Math.abs(t.amount || 0);
        groups[cat].total += amount;
        groups[cat].count += 1;
        groups[cat].transactions.push(t);
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

export function calculateBudgetUsage(transactions, budget, referenceDate = new Date()) {
    const { start, end } = getDateRange(budget.period, referenceDate);
    const periodTransactions = transactions.filter(t => {
        if (t.type !== 'spending') return false;
        if (budget.category && budget.category !== 'all' && t.category !== budget.category) return false;
        const d = new Date(t.date);
        return isWithinInterval(d, { start, end });
    });
    const spent = periodTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
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
