import { getCategoryById } from './categories';

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeText(value) {
    return (value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function toDisplayDescription(description, categoryName) {
    const cleaned = (description || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return categoryName;
    return cleaned.slice(0, 36);
}

function getHourDelta(a, b) {
    const delta = Math.abs(a - b);
    return Math.min(delta, 24 - delta);
}

function monthlyDecay(daysOld) {
    const monthsOld = Math.floor(Math.max(0, daysOld) / 30);
    return Math.pow(0.92, monthsOld);
}

function scoreTransactionPattern(txDate, currentDate) {
    const txHour = txDate.getHours();
    const currentHour = currentDate.getHours();
    const txDay = txDate.getDate();
    const currentDay = currentDate.getDate();
    const txWeekday = txDate.getDay();
    const currentWeekday = currentDate.getDay();

    let score = 1;

    const hourDelta = getHourDelta(txHour, currentHour);
    if (hourDelta === 0) score += 2.5;
    else if (hourDelta === 1) score += 1.5;
    else if (hourDelta === 2) score += 0.75;

    if (txDay === currentDay) score += 2.5;

    const startOfMonthPattern = currentDay <= 3 && txDay <= 3;
    if (startOfMonthPattern) score += 3.5;

    if (txWeekday === currentWeekday) score += 0.75;

    const daysOld = Math.floor((currentDate.getTime() - txDate.getTime()) / DAY_MS);
    return score * monthlyDecay(daysOld);
}

function reasonFromSignals(signals, currentDate) {
    if (currentDate.getDate() <= 3 && signals.startOfMonth >= 2) {
        return 'Often added at beginning of month';
    }
    if (signals.hour >= 2) {
        const hour = String(currentDate.getHours()).padStart(2, '0');
        return `Often around ${hour}:00`;
    }
    if (signals.dayOfMonth >= 2) {
        return `Often around day ${currentDate.getDate()}`;
    }
    if (signals.weekday >= 2) {
        const weekday = currentDate.toLocaleDateString(undefined, { weekday: 'long' });
        return `Often on ${weekday}`;
    }
    return 'Frequently used pattern';
}

export function getTransactionRecommendations({
    transactions = [],
    type = 'spending',
    selectedDate = new Date(),
    limit = 4,
}) {
    const currentDate = selectedDate instanceof Date ? selectedDate : new Date(selectedDate);
    if (Number.isNaN(currentDate.getTime())) return [];

    const currentHour = currentDate.getHours();
    const currentDay = currentDate.getDate();
    const currentWeekday = currentDate.getDay();
    const atStartOfMonth = currentDay <= 3;

    const grouped = new Map();

    transactions
        .filter(tx => tx && tx.type === type && tx.type !== 'move' && tx.category)
        .forEach(tx => {
            const txDate = new Date(tx.date);
            if (Number.isNaN(txDate.getTime())) return;

            const categoryMeta = getCategoryById(tx.category);
            const description = toDisplayDescription(tx.description, categoryMeta.name);
            const key = `${tx.category}|${normalizeText(description)}`;

            const item = grouped.get(key) || {
                key,
                categoryId: tx.category,
                categoryName: categoryMeta.name,
                description,
                count: 0,
                score: 0,
                signals: { hour: 0, dayOfMonth: 0, startOfMonth: 0, weekday: 0 },
            };

            const weightedScore = scoreTransactionPattern(txDate, currentDate);
            item.count += 1;
            item.score += weightedScore;

            const hourDelta = getHourDelta(txDate.getHours(), currentHour);
            if (hourDelta <= 1) item.signals.hour += 1;
            if (txDate.getDate() === currentDay) item.signals.dayOfMonth += 1;
            if (atStartOfMonth && txDate.getDate() <= 3) item.signals.startOfMonth += 1;
            if (txDate.getDay() === currentWeekday) item.signals.weekday += 1;

            grouped.set(key, item);
        });

    return [...grouped.values()]
        .filter(item => item.count >= 2 || item.score >= 5)
        .sort((a, b) => (b.score - a.score) || (b.count - a.count))
        .slice(0, limit)
        .map(item => ({
            id: item.key,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            description: item.description,
            label: item.description !== item.categoryName
                ? `${item.description} (${item.categoryName})`
                : item.categoryName,
            reason: reasonFromSignals(item.signals, currentDate),
        }));
}