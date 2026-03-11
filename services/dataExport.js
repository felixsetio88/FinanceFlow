// Data Export / Import Service
// Supports JSON and Excel (XLSX) formats

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import * as db from './database';
import { generateId } from '../utils/helpers';

// ─── EXPORT ───────────────────────────────────

export async function exportToJSON() {
    const data = await db.getAllData();
    const exportData = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        app: 'FinanceFlow',
        data: {
            transactions: data.transactions,
            budgets: data.budgets,
            assets: data.assets,
            settings: data.settings,
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

export async function exportToExcel() {
    const data = await db.getAllData();

    // Transactions sheet
    const txRows = data.transactions.map(t => ({
        Date: new Date(t.date).toLocaleDateString(),
        Type: t.type,
        Amount: t.amount,
        Category: t.category,
        Description: t.description || '',
        'Payment Method': t.paymentMethod || '',
        Currency: t.currency || 'USD',
        Items: (t.items || []).map(i => `${i.name} x${i.quantity} @ ${i.price}`).join('; '),
    }));

    // Budgets sheet
    const budgetRows = data.budgets.map(b => ({
        Period: b.period,
        Amount: b.amount,
        Currency: b.currency || 'USD',
    }));

    // Assets sheet
    const assetRows = data.assets.map(a => ({
        Name: a.name,
        Type: a.type,
        Balance: a.balance,
        Currency: a.currency || 'USD',
    }));

    const wb = XLSX.utils.book_new();

    const wsTx = XLSX.utils.json_to_sheet(txRows);
    XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions');

    if (budgetRows.length > 0) {
        const wsBudget = XLSX.utils.json_to_sheet(budgetRows);
        XLSX.utils.book_append_sheet(wb, wsBudget, 'Budgets');
    }

    if (assetRows.length > 0) {
        const wsAssets = XLSX.utils.json_to_sheet(assetRows);
        XLSX.utils.book_append_sheet(wb, wsAssets, 'Assets');
    }

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
    };

    if (parsed.data.transactions && Array.isArray(parsed.data.transactions)) {
        result.transactions = parsed.data.transactions.map(t => ({
            id: t.id || generateId(),
            type: t.type || 'spending',
            amount: parseFloat(t.amount) || 0,
            category: t.category || 'other_spending',
            description: t.description || '',
            date: t.date || new Date().toISOString(),
            items: t.items || [],
            photos: t.photos || [],
            paymentMethod: t.paymentMethod || 'cash',
            currency: t.currency || 'USD',
        }));
    }

    if (parsed.data.budgets && Array.isArray(parsed.data.budgets)) {
        result.budgets = parsed.data.budgets.map(b => ({
            id: b.id || generateId(),
            period: b.period || 'monthly',
            amount: parseFloat(b.amount) || 0,
            currency: b.currency || 'USD',
        }));
    }

    if (parsed.data.assets && Array.isArray(parsed.data.assets)) {
        result.assets = parsed.data.assets.map(a => ({
            id: a.id || generateId(),
            name: a.name || 'Unknown',
            type: a.type || 'bank',
            balance: parseFloat(a.balance) || 0,
            currency: a.currency || 'USD',
        }));
    }

    return result;
}

export async function importFromExcel(fileUri) {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
    });

    const wb = XLSX.read(base64, { type: 'base64' });
    const result = { transactions: [], budgets: [], assets: [] };

    // Parse Transactions sheet
    if (wb.SheetNames.includes('Transactions')) {
        const ws = wb.Sheets['Transactions'];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.transactions = rows.map(r => ({
            id: generateId(),
            type: (r.Type || 'spending').toLowerCase(),
            amount: parseFloat(r.Amount) || 0,
            category: (r.Category || 'other_spending').toLowerCase().replace(/\s/g, '_'),
            description: r.Description || '',
            date: r.Date ? new Date(r.Date).toISOString() : new Date().toISOString(),
            items: [],
            photos: [],
            paymentMethod: (r['Payment Method'] || 'cash').toLowerCase(),
            currency: r.Currency || 'USD',
        }));
    }

    // Parse Budgets sheet
    if (wb.SheetNames.includes('Budgets')) {
        const ws = wb.Sheets['Budgets'];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.budgets = rows.map(r => ({
            id: generateId(),
            period: (r.Period || 'monthly').toLowerCase(),
            amount: parseFloat(r.Amount) || 0,
            currency: r.Currency || 'USD',
        }));
    }

    // Parse Assets sheet
    if (wb.SheetNames.includes('Assets')) {
        const ws = wb.Sheets['Assets'];
        const rows = XLSX.utils.sheet_to_json(ws);
        result.assets = rows.map(r => ({
            id: generateId(),
            name: r.Name || 'Unknown',
            type: (r.Type || 'bank').toLowerCase(),
            balance: parseFloat(r.Balance) || 0,
            currency: r.Currency || 'USD',
        }));
    }

    return result;
}

export async function applyImport(importData) {
    // Save all imported data to DB
    if (importData.transactions?.length > 0) {
        await db.bulkAddTransactions(importData.transactions);
    }

    for (const budget of (importData.budgets || [])) {
        await db.addBudget(budget);
    }

    for (const asset of (importData.assets || [])) {
        await db.addAsset(asset);
    }

    return {
        transactions: importData.transactions?.length || 0,
        budgets: importData.budgets?.length || 0,
        assets: importData.assets?.length || 0,
    };
}
