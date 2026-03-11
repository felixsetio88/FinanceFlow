import { format, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, isWithinInterval, subDays, subWeeks, subMonths, addDays, addWeeks, addMonths } from 'date-fns';

export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(amount);
}

export function formatDate(date, fmt = 'MMM dd, yyyy') {
    return format(new Date(date), fmt);
}

export function formatTime(date) {
    return format(new Date(date), 'hh:mm a');
}

export function formatDateTime(date) {
    return format(new Date(date), 'MMM dd, yyyy hh:mm a');
}

export function getDateRange(period, referenceDate = new Date()) {
    const ref = new Date(referenceDate);
    switch (period) {
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

export function navigateDate(referenceDate, period, direction) {
    const ref = new Date(referenceDate);
    const fn = direction === 'next'
        ? (period === 'daily' ? addDays : period === 'weekly' ? addWeeks : addMonths)
        : (period === 'daily' ? subDays : period === 'weekly' ? subWeeks : subMonths);
    return fn(ref, 1);
}

export function filterTransactionsByDateRange(transactions, start, end) {
    return transactions.filter(t => {
        const d = new Date(t.date);
        return isWithinInterval(d, { start, end });
    });
}

export function groupByCategory(transactions) {
    const groups = {};
    transactions.forEach(t => {
        if (!groups[t.category]) {
            groups[t.category] = { total: 0, count: 0, transactions: [] };
        }
        groups[t.category].total += t.amount;
        groups[t.category].count += 1;
        groups[t.category].transactions.push(t);
    });
    return groups;
}

export function groupByDate(transactions) {
    const groups = {};
    transactions.forEach(t => {
        const key = format(new Date(t.date), 'yyyy-MM-dd');
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(t);
    });
    // Sort keys descending
    const sorted = {};
    Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(key => {
        sorted[key] = groups[key];
    });
    return sorted;
}

export function calculateBudgetUsage(transactions, budget) {
    const now = new Date();
    const range = getDateRange(budget.period, now);
    const filtered = filterTransactionsByDateRange(
        transactions.filter(t => t.type === 'spending'),
        range.start,
        range.end
    );
    const spent = filtered.reduce((sum, t) => sum + t.amount, 0);
    return {
        spent,
        limit: budget.amount,
        percentage: budget.amount > 0 ? (spent / budget.amount) * 100 : 0,
        remaining: budget.amount - spent,
        isOver: spent > budget.amount,
    };
}

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
