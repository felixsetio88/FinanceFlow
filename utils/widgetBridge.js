import { Platform, NativeModules } from 'react-native';
import { convertCurrency } from '../services/exchangeRates';

export function computeDailyAllowance(transactions, budgets, currency, exchangeRates = null) {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    const safeBudgets = Array.isArray(budgets) ? budgets : [];
    const activeBudget = safeBudgets.find(b => (b.category || 'all') === 'all') || safeBudgets[0] || null;

    let dailyBudget = 0;
    if (activeBudget) {
        const rawBudgetAmt = Number(activeBudget.amount ?? activeBudget.limit ?? 0);
        const budgetAmt = convertCurrency(rawBudgetAmt, activeBudget.currency || currency, currency, exchangeRates);
        if (activeBudget.period === 'daily') {
            dailyBudget = budgetAmt;
        } else if (activeBudget.period === 'weekly') {
            dailyBudget = budgetAmt / 7;
        } else {
            dailyBudget = budgetAmt / daysInMonth;
        }
    }

    const todaySpent = (Array.isArray(transactions) ? transactions : [])
        .filter(t => {
            if (t.type !== 'spending' || !t.date) return false;
            const txDate = new Date(t.date);
            return txDate >= startOfToday && txDate <= endOfToday;
        })
        .reduce((sum, t) => {
            const amt = Math.abs(Number(t.amount) || 0);
            return sum + convertCurrency(amt, t.currency || currency, currency, exchangeRates);
        }, 0);

    const remaining = dailyBudget - todaySpent;
    const percentage = dailyBudget > 0 ? Math.min(100, Math.round((todaySpent / dailyBudget) * 100)) : 0;

    return { dailyBudget, todaySpent, remaining, percentage, currency };
}

export function computeSavingsSummary(savingsGoals) {
    const activeGoals = (Array.isArray(savingsGoals) ? savingsGoals : []).filter(g => !g.isCompleted);
    if (activeGoals.length === 0) {
        return { totalGoals: 0, totalSaved: 0, totalTarget: 0, nearestGoal: null };
    }

    const totalSaved = activeGoals.reduce((sum, g) => sum + (Number(g.currentAmount ?? g.savedAmount) || 0), 0);
    const totalTarget = activeGoals.reduce((sum, g) => sum + (Number(g.targetAmount) || 0), 0);

    const nearestGoal = activeGoals
        .filter(g => (Number(g.targetAmount) || 0) > 0)
        .sort((a, b) => {
            const pctA = (Number(a.currentAmount ?? a.savedAmount) || 0) / a.targetAmount;
            const pctB = (Number(b.currentAmount ?? b.savedAmount) || 0) / b.targetAmount;
            return pctB - pctA;
        })[0] || null;

    const savedVal = nearestGoal ? (Number(nearestGoal.currentAmount ?? nearestGoal.savedAmount) || 0) : 0;

    return {
        totalGoals: activeGoals.length,
        totalSaved,
        totalTarget,
        nearestGoal: nearestGoal ? {
            name: nearestGoal.title || nearestGoal.name || 'Savings Goal',
            savedAmount: savedVal,
            targetAmount: Number(nearestGoal.targetAmount) || 0,
            percentage: Math.min(100, Math.round((savedVal / nearestGoal.targetAmount) * 100)),
        } : null,
    };
}

export async function updateWidgetData(state) {
    if (Platform.OS === 'web') return;

    try {
        const {
            transactions = [],
            budgets = [],
            savingsGoals = [],
            currency = 'USD',
            exchangeRates = null,
        } = state;

        const allowance = computeDailyAllowance(transactions, budgets, currency, exchangeRates);
        const savings = computeSavingsSummary(savingsGoals);

        const widgetData = {
            updatedAt: new Date().toISOString(),
            currency,
            dailyAllowance: allowance,
            savings,
            hasGoals: savings.totalGoals > 0,
        };

        const jsonStr = JSON.stringify(widgetData);

        const { WidgetDataModule } = NativeModules;
        if (WidgetDataModule && WidgetDataModule.updateWidgetData) {
            await WidgetDataModule.updateWidgetData(jsonStr);
        }
    } catch (e) {
        console.warn('[widgetBridge] updateWidgetData failed:', e);
    }
}
