// Data Export / Import Service
// Supports JSON and Excel (XLSX) formats

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from './database';
import { getOrFetchRates, convertCurrency } from './exchangeRates';
import { generateId } from '../utils/helpers';

function normalizeSavingHistory(goal) {
    if (Array.isArray(goal?.savingHistory)) return goal.savingHistory;
    if (Array.isArray(goal?.savingsHistory)) return goal.savingsHistory;
    return [];
}

function getFilterInterval(options) {
    const { period, start, end } = options || {};
    if (!period || period === 'all') return null;

    const now = new Date();
    let startDate, endDate;

    if (period === 'daily') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'weekly') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startDate = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0);
        endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 999);
    } else if (period === 'monthly') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === 'custom') {
        if (!start || !end) return null;
        startDate = new Date(`${start}T00:00:00Z`);
        endDate = new Date(`${end}T23:59:59Z`);
    }

    return { startDate, endDate };
}

// ─── EXPORT ───────────────────────────────────

export async function exportToJSON() {
    const data = await db.getAllData();

    // Load AsyncStorage settings/appearance preferences
    let appThemeMode = 'system';
    let thinkingPrefs = null;
    let activeModelId = null;
    let modelContextOverrides = null;

    try {
        appThemeMode = (await AsyncStorage.getItem('app_theme_mode')) || 'system';
        const rawThinking = await AsyncStorage.getItem('@financeflow_ai_thinking_prefs_v1');
        if (rawThinking) thinkingPrefs = JSON.parse(rawThinking);
        activeModelId = await AsyncStorage.getItem('active_model_id');
        const rawOverrides = await AsyncStorage.getItem('model_context_overrides');
        if (rawOverrides) modelContextOverrides = JSON.parse(rawOverrides);
    } catch (e) {
        console.warn('Failed to load some settings from AsyncStorage during export:', e);
    }

    const exportData = {
        version: '3.0',
        exportDate: new Date().toISOString(),
        app: 'FinanceFlow',
        data: {
            transactions: data.transactions,
            budgets: data.budgets,
            assets: data.assets,
            savingsGoals: data.savingsGoals || [],
            chatSessions: data.chatSessions || [],
            vehicles: data.vehicles || [],
            settings: {
                ...data.settings,
                app_theme_mode: appThemeMode,
                ai_thinking_prefs: thinkingPrefs,
                active_model_id: activeModelId,
                model_context_overrides: modelContextOverrides,
            },
        },
    };

    const json = JSON.stringify(exportData, null, 2);
    const fileName = `financeflow_export_${new Date().toISOString().slice(0, 10)}.json`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, json);
    await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'Export FinanceFlow Data',
        UTI: 'public.json',
    });

    return filePath;
}

export async function exportToExcel(options = {}) {
    const data = await db.getAllData();
    const interval = getFilterInterval(options);

    let transactions = data.transactions || [];
    if (interval) {
        transactions = transactions.filter(t => {
            const txDate = new Date(t.date);
            return txDate >= interval.startDate && txDate <= interval.endDate;
        });
    }

    const baseCurrency = data.settings?.currency || 'USD';
    const exchangeRates = await getOrFetchRates(baseCurrency);

    // --- Generate Summary Dashboard Data ---
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const totalExpense = transactions.filter(t => t.type === 'spending').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

    const categoryTotals = {};
    transactions.filter(t => t.type === 'spending').forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + Math.abs(t.amount || 0);
    });
    const sortedCategories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);

    const summaryRows = [
        { 'Metric': 'Total Income', 'Amount': totalIncome },
        { 'Metric': 'Total Spending', 'Amount': totalExpense },
        {}, // blank row
        { 'Metric': 'Spending by Category', 'Amount': '' }
    ];
    sortedCategories.forEach(cat => {
        summaryRows.push({ 'Metric': cat, 'Amount': categoryTotals[cat] });
    });

    // Transactions sheet
    const txRows = transactions.map(t => {
        let paymentMethodDisplay = '';
        if (t.paymentMethod === 'transfer') {
            paymentMethodDisplay = 'Transfer';
        } else if (t.paymentMethod === 'asset' || t.assetId) {
            const asset = data.assets.find(a => a.id === t.assetId);
            paymentMethodDisplay = asset ? asset.name : 'Account';
        } else {
            paymentMethodDisplay = '';
        }

        return {
            Id: t.id,
            Date: t.date,
            Type: t.type,
            Amount: t.amount,
            Category: t.category,
            Description: t.description || '',
            'Payment Method': paymentMethodDisplay,
            Currency: t.currency || baseCurrency,
            'Converted Amount': convertCurrency(t.amount, t.currency || baseCurrency, baseCurrency, exchangeRates),
            'Base Currency': baseCurrency,
            'Exchange Rate': (exchangeRates?.rates && exchangeRates.rates[t.currency || baseCurrency]) ? (1 / exchangeRates.rates[t.currency || baseCurrency]) : 1,
            'Created At': t.createdAt || '',
            'Asset Id': t.assetId || '',
            'From Asset Id': t.fromAssetId || '',
            'To Asset Id': t.toAssetId || '',
            Tax: t.tax || 0,
            'Tax Is Percent': t.taxIsPercent ? 'true' : 'false',
            'Tax Enabled': t.taxEnabled ? 'true' : 'false',
            'Service Fee': t.serviceFee || 0,
            'Service Fee Is Percent': t.serviceFeeIsPercent ? 'true' : 'false',
            'Service Fee Enabled': t.serviceFeeEnabled ? 'true' : 'false',
            Tip: t.tip || 0,
            'Tip Is Percent': t.tipIsPercent ? 'true' : 'false',
            'Tip Enabled': t.tipEnabled ? 'true' : 'false',
            Items: JSON.stringify(t.items || []),
            Photos: JSON.stringify(t.photos || []),
            'Vehicle Id': t.vehicleId || '',
            'Vehicle Log Type': t.vehicleLogType || '',
            'Vehicle Odometer': t.vehicleOdometer || '',
            'Vehicle Volume': t.vehicleVolume || '',
            'Vehicle Maintenance Items': t.vehicleMaintenanceItems || '',
        };
    });

    // Budgets sheet
    const budgetRows = data.budgets.map(b => ({
        Id: b.id,
        Period: b.period,
        Amount: b.amount,
        Category: b.category || 'all',
        Currency: b.currency || baseCurrency,
        'Converted Amount': convertCurrency(b.amount, b.currency || baseCurrency, baseCurrency, exchangeRates),
        'Base Currency': baseCurrency,
        'Created At': b.createdAt || '',
    }));

    // Assets sheet
    const assetRows = data.assets.map(a => ({
        Id: a.id,
        Name: a.name,
        Type: a.type,
        Balance: a.balance,
        Color: a.color || '',
        Currency: a.currency || baseCurrency,
        'Converted Balance': convertCurrency(a.balance, a.currency || baseCurrency, baseCurrency, exchangeRates),
        'Base Currency': baseCurrency,
        'Created At': a.createdAt || '',
    }));

    // Saving Goals sheet
    const goalRows = (data.savingsGoals || []).map(g => ({
        Id: g.id,
        Title: g.title,
        'Target Amount': g.targetAmount,
        'Current Amount': g.currentAmount || 0,
        'Start Date': g.startDate || '',
        'End Date': g.endDate || '',
        Commitment: g.commitment || '',
        'Notify Enabled': g.notifyEnabled ? 'true' : 'false',
        'Is Completed': g.isCompleted ? 'true' : 'false',
        Currency: g.currency || baseCurrency,
        'Converted Target': convertCurrency(g.targetAmount, g.currency || baseCurrency, baseCurrency, exchangeRates),
        'Converted Current': convertCurrency(g.currentAmount, g.currency || baseCurrency, baseCurrency, exchangeRates),
        'Base Currency': baseCurrency,
        'Created At': g.createdAt || '',
    }));

    // Saving History sheet
    const historyRows = [];
    for (const g of (data.savingsGoals || [])) {
        for (const h of normalizeSavingHistory(g)) {
            historyRows.push({
                'Goal Id': g.id,
                'Goal Title': g.title,
                'Entry Id': h.id,
                Amount: h.amount,
                Date: h.date,
                'Created At': h.createdAt || '',
            });
        }
    }

    // Chat Sessions sheet
    const chatRows = (data.chatSessions || []).map(s => ({
        Id: s.id,
        Title: s.title || 'Chat',
        Messages: JSON.stringify(s.messages || []),
        'Created At': s.createdAt || '',
        'Updated At': s.updatedAt || '',
    }));

    // Vehicles sheet
    const vehicleRows = (data.vehicles || []).map(v => ({
        Id: v.id,
        Name: v.name,
        Type: v.type || 'gas',
        Currency: v.currency || 'USD',
        'Initial Odometer': v.initialOdometer || 0,
        'Created At': v.createdAt || '',
    }));

    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Dashboard');

    const wsTx = XLSX.utils.json_to_sheet(txRows);
    XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');

    const wsBudget = XLSX.utils.json_to_sheet(budgetRows);
    XLSX.utils.book_append_sheet(wb, wsBudget, 'Budgets');

    const wsAssets = XLSX.utils.json_to_sheet(assetRows);
    XLSX.utils.book_append_sheet(wb, wsAssets, 'Assets');

    const wsGoals = XLSX.utils.json_to_sheet(goalRows);
    XLSX.utils.book_append_sheet(wb, wsGoals, 'Saving Goals');

    const wsHistory = XLSX.utils.json_to_sheet(historyRows);
    XLSX.utils.book_append_sheet(wb, wsHistory, 'Saving History');

    const wsChats = XLSX.utils.json_to_sheet(chatRows);
    XLSX.utils.book_append_sheet(wb, wsChats, 'Chat Sessions');

    const wsVehicles = XLSX.utils.json_to_sheet(vehicleRows);
    XLSX.utils.book_append_sheet(wb, wsVehicles, 'Vehicles');

    // Write to file
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileName = `financeflow_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, wbout, {
        encoding: FileSystem.EncodingType.Base64,
    });

    await Sharing.shareAsync(filePath, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Export FinanceFlow Data',
    });

    return filePath;
}

// ─── IMPORT ───────────────────────────────────

export async function importFromJSON(fileUri) {
    const content = await FileSystem.readAsStringAsync(fileUri);
    const parsed = JSON.parse(content);

    // Validate structure
    if (!parsed.data) {
        throw new Error('Invalid file format. Expected FinanceFlow export file.');
    }

    const result = {
        transactions: [],
        budgets: [],
        assets: [],
        savingsGoals: [],
        chatSessions: [],
        vehicles: [],
        settings: parsed.data.settings || {},
    };

    if (parsed.data.transactions && Array.isArray(parsed.data.transactions)) {
        result.transactions = parsed.data.transactions.map(t => ({
            id: t.id || generateId(),
            type: t.type || 'spending',
            amount: parseFloat(t.amount) || 0,
            category: t.category || 'other_spending',
            description: t.description || '',
            date: t.date || new Date().toISOString(),
            items: Array.isArray(t.items) ? t.items : [],
            photos: Array.isArray(t.photos) ? t.photos : [],
            paymentMethod: t.paymentMethod || 'cash',
            assetId: t.assetId || null,
            fromAssetId: t.fromAssetId || null,
            toAssetId: t.toAssetId || null,
            tax: parseFloat(t.tax) || 0,
            taxIsPercent: !!t.taxIsPercent,
            taxEnabled: !!t.taxEnabled,
            serviceFee: parseFloat(t.serviceFee) || 0,
            serviceFeeIsPercent: !!t.serviceFeeIsPercent,
            serviceFeeEnabled: !!t.serviceFeeEnabled,
            tip: parseFloat(t.tip) || 0,
            tipIsPercent: !!t.tipIsPercent,
            tipEnabled: !!t.tipEnabled,
            currency: t.currency || 'USD',
            createdAt: t.createdAt || new Date().toISOString(),
            vehicleId: t.vehicleId || null,
            vehicleLogType: t.vehicleLogType || null,
            vehicleOdometer: t.vehicleOdometer ? parseFloat(t.vehicleOdometer) : null,
            vehicleVolume: t.vehicleVolume ? parseFloat(t.vehicleVolume) : null,
            vehicleMaintenanceItems: t.vehicleMaintenanceItems || null,
        }));
    }

    if (parsed.data.vehicles && Array.isArray(parsed.data.vehicles)) {
        result.vehicles = parsed.data.vehicles.map(v => ({
            id: v.id || generateId(),
            name: v.name || 'Unknown Vehicle',
            type: v.type || 'gas',
            currency: v.currency || 'USD',
            initialOdometer: parseFloat(v.initialOdometer) || 0,
            createdAt: v.createdAt || new Date().toISOString(),
        }));
    }

    if (parsed.data.budgets && Array.isArray(parsed.data.budgets)) {
        result.budgets = parsed.data.budgets.map(b => ({
            id: b.id || generateId(),
            period: b.period || 'monthly',
            amount: parseFloat(b.amount) || 0,
            currency: b.currency || 'USD',
            createdAt: b.createdAt || new Date().toISOString(),
        }));
    }

    if (parsed.data.assets && Array.isArray(parsed.data.assets)) {
        result.assets = parsed.data.assets.map(a => ({
            id: a.id || generateId(),
            name: a.name || 'Unknown',
            type: a.type || 'bank',
            balance: parseFloat(a.balance) || 0,
            color: a.color || null,
            currency: a.currency || 'USD',
            createdAt: a.createdAt || new Date().toISOString(),
        }));
    }

    if (parsed.data.savingsGoals && Array.isArray(parsed.data.savingsGoals)) {
        result.savingsGoals = parsed.data.savingsGoals.map(g => ({
            id: g.id || generateId(),
            title: g.title || 'Untitled Goal',
            targetAmount: parseFloat(g.targetAmount) || 0,
            currentAmount: parseFloat(g.currentAmount) || 0,
            startDate: g.startDate || null,
            endDate: g.endDate || null,
            commitment: g.commitment || null,
            notifyEnabled: !!g.notifyEnabled,
            savingHistory: normalizeSavingHistory(g),
            isCompleted: !!g.isCompleted,
            currency: g.currency || 'USD',
            createdAt: g.createdAt || new Date().toISOString(),
        }));
    }

    if (parsed.data.chatSessions && Array.isArray(parsed.data.chatSessions)) {
        result.chatSessions = parsed.data.chatSessions.map(s => ({
            id: s.id || generateId(),
            title: s.title || 'New Chat',
            messages: Array.isArray(s.messages) ? s.messages : [],
            createdAt: s.createdAt || new Date().toISOString(),
            updatedAt: s.updatedAt || new Date().toISOString(),
        }));
    }

    return result;
}

export async function importFromExcel(fileUri) {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
    });

    const wb = XLSX.read(base64, { type: 'base64' });
    const result = { transactions: [], budgets: [], assets: [], savingsGoals: [], chatSessions: [] };

    // Parse Assets sheet
    if (wb.SheetNames.includes('Assets')) {
        const ws = wb.Sheets['Assets'];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.assets = rows.map(r => ({
            id: r.Id || generateId(),
            name: r.Name || 'Unknown',
            type: (r.Type || 'bank').toLowerCase(),
            balance: parseFloat(r.Balance) || 0,
            color: r.Color || null,
            currency: r.Currency || 'USD',
            createdAt: r['Created At'] || new Date().toISOString(),
        }));
    }

    // Parse Budgets sheet
    if (wb.SheetNames.includes('Budgets')) {
        const ws = wb.Sheets['Budgets'];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.budgets = rows.map(r => ({
            id: r.Id || generateId(),
            period: (r.Period || 'monthly').toLowerCase(),
            amount: parseFloat(r.Amount) || 0,
            category: r.Category || 'all',
            currency: r.Currency || 'USD',
            createdAt: r['Created At'] || new Date().toISOString(),
        }));
    }

    // Parse Saving Goals sheet
    if (wb.SheetNames.includes('Saving Goals') || wb.SheetNames.includes('SavingGoals')) {
        const sheetName = wb.SheetNames.includes('Saving Goals') ? 'Saving Goals' : 'SavingGoals';
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.savingsGoals = rows.map(r => ({
            id: r.Id || generateId(),
            title: r.Title || 'Untitled Goal',
            targetAmount: parseFloat(r['Target Amount']) || 0,
            currentAmount: parseFloat(r['Current Amount']) || 0,
            startDate: r['Start Date'] || null,
            endDate: r['End Date'] || null,
            commitment: r.Commitment || null,
            notifyEnabled: r['Notify Enabled'] === 'true' || r['Notify Enabled'] === true || r['Notify Enabled'] === 1,
            isCompleted: r['Is Completed'] === 'true' || r['Is Completed'] === true || r['Is Completed'] === 1,
            currency: r.Currency || 'USD',
            createdAt: r['Created At'] || new Date().toISOString(),
            savingHistory: [],
        }));
    }

    // Parse Saving History sheet
    if (wb.SheetNames.includes('Saving History') || wb.SheetNames.includes('SavingHistory')) {
        const sheetName = wb.SheetNames.includes('Saving History') ? 'Saving History' : 'SavingHistory';
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws);
        const historyByGoal = {};
        for (const r of rows) {
            const goalId = r['Goal Id'];
            if (!goalId) continue;
            if (!historyByGoal[goalId]) {
                historyByGoal[goalId] = [];
            }
            historyByGoal[goalId].push({
                id: r['Entry Id'] || generateId(),
                amount: parseFloat(r.Amount) || 0,
                date: r.Date ? new Date(r.Date).toISOString() : new Date().toISOString(),
                createdAt: r['Created At'] || new Date().toISOString(),
            });
        }

        // Link history back to saving goals
        if (result.savingsGoals) {
            for (const goal of result.savingsGoals) {
                if (historyByGoal[goal.id]) {
                    goal.savingHistory = historyByGoal[goal.id];
                }
            }
        }
    }

    // Parse Transactions sheet
    if (wb.SheetNames.includes('Transactions')) {
        const ws = wb.Sheets['Transactions'];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.transactions = rows.map(r => {
            let parsedItems = [];
            if (r.Items) {
                try {
                    parsedItems = JSON.parse(r.Items);
                } catch (_) {
                    parsedItems = [];
                }
            }
            let parsedPhotos = [];
            if (r.Photos) {
                try {
                    parsedPhotos = JSON.parse(r.Photos);
                } catch (_) {
                    parsedPhotos = [];
                }
            }

            const paymentVal = (r['Payment Method'] || '').trim();
            let matchedAsset = null;
            if (paymentVal && paymentVal.toLowerCase() !== 'cash' && paymentVal.toLowerCase() !== 'transfer') {
                matchedAsset = result.assets?.find(a => (a.name || '').trim().toLowerCase() === paymentVal.toLowerCase());
            }

            const assetId = r['Asset Id'] || (matchedAsset ? matchedAsset.id : null) || null;

            let paymentMethod = 'cash';
            if (paymentVal.toLowerCase() === 'transfer') {
                paymentMethod = 'transfer';
            } else if (assetId) {
                paymentMethod = 'asset';
            }

            return {
                id: r.Id || generateId(),
                type: (r.Type || 'spending').toLowerCase(),
                amount: parseFloat(r.Amount) || 0,
                category: r.Category || 'other_spending',
                description: r.Description || '',
                date: r.Date ? new Date(r.Date).toISOString() : new Date().toISOString(),
                items: parsedItems,
                photos: parsedPhotos,
                paymentMethod: paymentMethod,
                currency: r.Currency || 'USD',
                createdAt: r['Created At'] || new Date().toISOString(),
                assetId: assetId,
                fromAssetId: r['From Asset Id'] || null,
                toAssetId: r['To Asset Id'] || null,
                tax: parseFloat(r.Tax) || 0,
                taxIsPercent: r['Tax Is Percent'] === 'true' || r['Tax Is Percent'] === true || r['Tax Is Percent'] === 1,
                taxEnabled: r['Tax Enabled'] === 'true' || r['Tax Enabled'] === true || r['Tax Enabled'] === 1,
                serviceFee: parseFloat(r['Service Fee']) || 0,
                serviceFeeIsPercent: r['Service Fee Is Percent'] === 'true' || r['Service Fee Is Percent'] === true || r['Service Fee Is Percent'] === 1,
                serviceFeeEnabled: r['Service Fee Enabled'] === 'true' || r['Service Fee Enabled'] === true || r['Service Fee Enabled'] === 1,
                tip: parseFloat(r.Tip) || 0,
                tipIsPercent: r['Tip Is Percent'] === 'true' || r['Tip Is Percent'] === true || r['Tip Is Percent'] === 1,
                tipEnabled: r['Tip Enabled'] === 'true' || r['Tip Enabled'] === true || r['Tip Enabled'] === 1,
                vehicleId: r['Vehicle Id'] || null,
                vehicleLogType: r['Vehicle Log Type'] || null,
                vehicleOdometer: r['Vehicle Odometer'] ? parseFloat(r['Vehicle Odometer']) : null,
                vehicleVolume: r['Vehicle Volume'] ? parseFloat(r['Vehicle Volume']) : null,
                vehicleMaintenanceItems: r['Vehicle Maintenance Items'] || null,
            };
        });
    }

    // Parse Chat Sessions sheet
    if (wb.SheetNames.includes('Chat Sessions') || wb.SheetNames.includes('ChatSessions')) {
        const sheetName = wb.SheetNames.includes('Chat Sessions') ? 'Chat Sessions' : 'ChatSessions';
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.chatSessions = rows.map(r => {
            let messages = [];
            if (r.Messages) {
                try {
                    messages = JSON.parse(r.Messages);
                } catch (_) {
                    messages = [];
                }
            }
            return {
                id: r.Id || generateId(),
                title: r.Title || 'Chat',
                messages: Array.isArray(messages) ? messages : [],
                createdAt: r['Created At'] || new Date().toISOString(),
                updatedAt: r['Updated At'] || new Date().toISOString(),
            };
        });
    }

    // Parse Vehicles sheet
    if (wb.SheetNames.includes('Vehicles')) {
        const ws = wb.Sheets['Vehicles'];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.vehicles = rows.map(r => ({
            id: r.Id || generateId(),
            name: r.Name || 'Unknown Vehicle',
            type: (r.Type || 'gas').toLowerCase(),
            currency: r.Currency || 'USD',
            initialOdometer: parseFloat(r['Initial Odometer']) || 0,
            createdAt: r['Created At'] || new Date().toISOString(),
        }));
    }

    return result;
}

export async function applyImport(importData, isJSON = false) {
    if (isJSON) {
        // Merge data instead of restoring / clearing
        await db.mergeAllData(importData);

        // Merge AsyncStorage preferences (only set if not already set)
        if (importData.settings) {
            try {
                const currentTheme = await AsyncStorage.getItem('app_theme_mode');
                if (!currentTheme) {
                    const theme = importData.settings.app_theme_mode;
                    if (theme === 'light' || theme === 'dark' || theme === 'system') {
                        await AsyncStorage.setItem('app_theme_mode', theme);
                    }
                }

                const currentThinking = await AsyncStorage.getItem('@financeflow_ai_thinking_prefs_v1');
                if (!currentThinking) {
                    const thinkingPrefs = importData.settings.ai_thinking_prefs;
                    if (thinkingPrefs) {
                        await AsyncStorage.setItem('@financeflow_ai_thinking_prefs_v1', JSON.stringify(thinkingPrefs));
                    }
                }

                const currentActiveModel = await AsyncStorage.getItem('active_model_id');
                if (!currentActiveModel) {
                    const activeModelId = importData.settings.active_model_id;
                    if (activeModelId) {
                        await AsyncStorage.setItem('active_model_id', activeModelId);
                    }
                }

                const currentOverrides = await AsyncStorage.getItem('model_context_overrides');
                if (!currentOverrides) {
                    const overrides = importData.settings.model_context_overrides;
                    if (overrides) {
                        await AsyncStorage.setItem('model_context_overrides', JSON.stringify(overrides));
                    }
                }
            } catch (e) {
                console.warn('Failed to restore some settings in AsyncStorage:', e);
            }
        }
    } else {
        // Excel imports merge/upsert behavior
        if (importData.transactions?.length > 0) {
            await db.bulkAddTransactions(importData.transactions);
        }

        for (const budget of (importData.budgets || [])) {
            try {
                await db.addBudget(budget);
            } catch (_) {
                await db.updateBudget(budget);
            }
        }

        for (const asset of (importData.assets || [])) {
            try {
                await db.addAsset(asset);
            } catch (_) {
                await db.updateAsset(asset);
            }
        }

        for (const goal of (importData.savingsGoals || [])) {
            try {
                await db.addSavingsGoal(goal);
            } catch (_) {
                await db.updateSavingsGoal(goal);
            }
        }

        for (const vehicle of (importData.vehicles || [])) {
            try {
                await db.addVehicle(vehicle);
            } catch (_) {
                await db.updateVehicle(vehicle);
            }
        }
    }

    return {
        transactions: importData.transactions?.length || 0,
        budgets: importData.budgets?.length || 0,
        assets: importData.assets?.length || 0,
        savingsGoals: importData.savingsGoals?.length || 0,
        chatSessions: importData.chatSessions?.length || 0,
        vehicles: importData.vehicles?.length || 0,
    };
}
