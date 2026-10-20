import {
    differenceInCalendarDays,
    differenceInCalendarMonths,
    endOfDay,
    endOfMonth,
    endOfWeek,
    isWithinInterval,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from 'date-fns';

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00`);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeSavingHistory(goal) {
    return Array.isArray(goal?.savingHistory) ? goal.savingHistory : [];
}

export function getSavingsPlan(goalLike) {
    const targetAmount = parseFloat(goalLike?.targetAmount) || 0;
    const currentAmount = parseFloat(goalLike?.currentAmount) || 0;
    const commitment = goalLike?.commitment;
    const startDate = toDate(goalLike?.startDate);
    const endDate = toDate(goalLike?.endDate);

    if (!commitment || !startDate || !endDate || targetAmount <= 0) return null;

    const daySpan = differenceInCalendarDays(endDate, startDate);
    if (daySpan <= 0) return null;

    let periods = daySpan;
    if (commitment === 'weekly') {
        periods = Math.max(1, Math.ceil(daySpan / 7));
    } else if (commitment === 'monthly') {
        const monthSpan = differenceInCalendarMonths(endDate, startDate);
        periods = Math.max(1, monthSpan || Math.ceil(daySpan / 30));
    } else if (commitment !== 'daily') {
        return null;
    }

    const remainingAmount = Math.max(0, targetAmount - currentAmount);
    const amountPerPeriod = periods > 0 ? remainingAmount / periods : remainingAmount;

    return {
        commitment,
        periods,
        daySpan,
        remainingAmount,
        amountPerPeriod,
    };
}

function hasSavingInCurrentPeriod(goal, now) {
    const commitment = goal.commitment;
    const history = normalizeSavingHistory(goal);

    let start = startOfDay(now);
    let end = endOfDay(now);

    if (commitment === 'weekly') {
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
    } else if (commitment === 'monthly') {
        start = startOfMonth(now);
        end = endOfMonth(now);
    }

    return history.some(entry => {
        const date = toDate(entry?.date || entry?.createdAt);
        return date ? isWithinInterval(date, { start, end }) : false;
    });
}

export function getSavingReminderRecommendations(goals = [], nowInput = new Date()) {
    const now = toDate(nowInput) || new Date();

    return goals
        .filter(goal => goal && !goal.isCompleted && goal.notifyEnabled && ['daily', 'weekly', 'monthly'].includes(goal.commitment))
        .filter(goal => {
            const activeFrom = toDate(goal.startDate) || toDate(goal.createdAt) || now;
            return now >= activeFrom;
        })
        .filter(goal => !hasSavingInCurrentPeriod(goal, now))
        .map(goal => {
            const periodWord = goal.commitment === 'daily' ? 'day' : goal.commitment === 'weekly' ? 'week' : 'month';
            return {
                goalId: goal.id,
                title: goal.title,
                commitment: goal.commitment,
                message: `No ${goal.commitment} saving added this ${periodWord}.`,
            };
        });
}
