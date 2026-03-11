import { openDB } from 'idb';

const DB_NAME = 'FinancialAppDB';
const DB_VERSION = 1;

async function getDB() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('transactions')) {
                const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
                txStore.createIndex('type', 'type');
                txStore.createIndex('date', 'date');
                txStore.createIndex('category', 'category');
            }
            if (!db.objectStoreNames.contains('budgets')) {
                db.createObjectStore('budgets', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('assets')) {
                db.createObjectStore('assets', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        },
    });
}

// Transactions
export async function getAllTransactions() {
    const db = await getDB();
    return db.getAll('transactions');
}

export async function addTransaction(transaction) {
    const db = await getDB();
    return db.put('transactions', transaction);
}

export async function deleteTransaction(id) {
    const db = await getDB();
    return db.delete('transactions', id);
}

export async function updateTransaction(transaction) {
    const db = await getDB();
    return db.put('transactions', transaction);
}

// Budgets
export async function getAllBudgets() {
    const db = await getDB();
    return db.getAll('budgets');
}

export async function addBudget(budget) {
    const db = await getDB();
    return db.put('budgets', budget);
}

export async function deleteBudget(id) {
    const db = await getDB();
    return db.delete('budgets', id);
}

export async function updateBudget(budget) {
    const db = await getDB();
    return db.put('budgets', budget);
}

// Assets
export async function getAllAssets() {
    const db = await getDB();
    return db.getAll('assets');
}

export async function addAsset(asset) {
    const db = await getDB();
    return db.put('assets', asset);
}

export async function deleteAsset(id) {
    const db = await getDB();
    return db.delete('assets', id);
}

export async function updateAsset(asset) {
    const db = await getDB();
    return db.put('assets', asset);
}

// Settings
export async function getSetting(key) {
    const db = await getDB();
    const result = await db.get('settings', key);
    return result?.value;
}

export async function setSetting(key, value) {
    const db = await getDB();
    return db.put('settings', { key, value });
}
