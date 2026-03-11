import { Platform } from 'react-native';
import { generateId } from '../utils/helpers';

let db = null;
let isNative = Platform.OS !== 'web';

// ─── In-memory fallback for web ───────────────
const memStore = {
    transactions: [],
    budgets: [],
    assets: [],
    settings: {},
};

function loadMemStore() {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const data = localStorage.getItem('financeflow_data');
            if (data) {
                const parsed = JSON.parse(data);
                Object.assign(memStore, parsed);
            }
        } catch { }
    }
}

function saveMemStore() {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            localStorage.setItem('financeflow_data', JSON.stringify(memStore));
        } catch { }
    }
}

// ─── Native SQLite ────────────────────────────
export async function getDB() {
    if (!isNative) {
        loadMemStore();
        return null;
    }
    if (!db) {
        const SQLite = require('expo-sqlite');
        db = await SQLite.openDatabaseAsync('financeflow.db');
        await initDB(db);
    }
    return db;
}

async function initDB(database) {
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      description TEXT,
      date TEXT NOT NULL,
      items TEXT,
      photos TEXT,
      paymentMethod TEXT,
      currency TEXT DEFAULT 'USD',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ─── Transactions ─────────────────────────────
export async function getAllTransactions() {
    if (!isNative) {
        loadMemStore();
        return memStore.transactions;
    }
    const database = await getDB();
    const rows = await database.getAllAsync('SELECT * FROM transactions ORDER BY date DESC');
    return rows.map(r => ({
        ...r,
        amount: r.amount,
        items: r.items ? JSON.parse(r.items) : [],
        photos: r.photos ? JSON.parse(r.photos) : [],
    }));
}

export async function addTransaction(tx) {
    const id = tx.id || generateId();
    const now = new Date().toISOString();

    if (!isNative) {
        const fullTx = { ...tx, id, createdAt: now, items: tx.items || [], photos: tx.photos || [] };
        memStore.transactions.unshift(fullTx);
        saveMemStore();
        return id;
    }

    const database = await getDB();
    await database.runAsync(
        `INSERT INTO transactions (id, type, amount, category, description, date, items, photos, paymentMethod, currency, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tx.type, tx.amount, tx.category || '', tx.description || '', tx.date || now, JSON.stringify(tx.items || []), JSON.stringify(tx.photos || []), tx.paymentMethod || 'cash', tx.currency || 'USD', now]
    );
    return id;
}

export async function updateTransaction(tx) {
    if (!isNative) {
        const idx = memStore.transactions.findIndex(t => t.id === tx.id);
        if (idx >= 0) memStore.transactions[idx] = { ...memStore.transactions[idx], ...tx };
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync(
        `UPDATE transactions SET type=?, amount=?, category=?, description=?, date=?, items=?, photos=?, paymentMethod=?, currency=? WHERE id=?`,
        [tx.type, tx.amount, tx.category, tx.description, tx.date, JSON.stringify(tx.items || []), JSON.stringify(tx.photos || []), tx.paymentMethod || 'cash', tx.currency || 'USD', tx.id]
    );
}

export async function deleteTransaction(id) {
    if (!isNative) {
        memStore.transactions = memStore.transactions.filter(t => t.id !== id);
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync('DELETE FROM transactions WHERE id=?', [id]);
}

// ─── Budgets ──────────────────────────────────
export async function getAllBudgets() {
    if (!isNative) {
        loadMemStore();
        return memStore.budgets;
    }
    const database = await getDB();
    return database.getAllAsync('SELECT * FROM budgets ORDER BY createdAt DESC');
}

export async function addBudget(b) {
    const id = b.id || generateId();
    const now = new Date().toISOString();

    if (!isNative) {
        memStore.budgets.unshift({ ...b, id, createdAt: now });
        saveMemStore();
        return id;
    }

    const database = await getDB();
    await database.runAsync(
        'INSERT INTO budgets (id, period, amount, currency, createdAt) VALUES (?, ?, ?, ?, ?)',
        [id, b.period, b.amount, b.currency || 'USD', now]
    );
    return id;
}

export async function updateBudget(b) {
    if (!isNative) {
        const idx = memStore.budgets.findIndex(x => x.id === b.id);
        if (idx >= 0) memStore.budgets[idx] = { ...memStore.budgets[idx], ...b };
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync(
        'UPDATE budgets SET period=?, amount=?, currency=? WHERE id=?',
        [b.period, b.amount, b.currency || 'USD', b.id]
    );
}

export async function deleteBudget(id) {
    if (!isNative) {
        memStore.budgets = memStore.budgets.filter(b => b.id !== id);
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync('DELETE FROM budgets WHERE id=?', [id]);
}

// ─── Assets ───────────────────────────────────
export async function getAllAssets() {
    if (!isNative) {
        loadMemStore();
        return memStore.assets;
    }
    const database = await getDB();
    return database.getAllAsync('SELECT * FROM assets ORDER BY createdAt DESC');
}

export async function addAsset(a) {
    const id = a.id || generateId();
    const now = new Date().toISOString();

    if (!isNative) {
        memStore.assets.unshift({ ...a, id, createdAt: now });
        saveMemStore();
        return id;
    }

    const database = await getDB();
    await database.runAsync(
        'INSERT INTO assets (id, name, type, balance, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [id, a.name, a.type, a.balance || 0, a.currency || 'USD', now]
    );
    return id;
}

export async function updateAsset(a) {
    if (!isNative) {
        const idx = memStore.assets.findIndex(x => x.id === a.id);
        if (idx >= 0) memStore.assets[idx] = { ...memStore.assets[idx], ...a };
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync(
        'UPDATE assets SET name=?, type=?, balance=?, currency=? WHERE id=?',
        [a.name, a.type, a.balance, a.currency || 'USD', a.id]
    );
}

export async function deleteAsset(id) {
    if (!isNative) {
        memStore.assets = memStore.assets.filter(a => a.id !== id);
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync('DELETE FROM assets WHERE id=?', [id]);
}

// ─── Settings ─────────────────────────────────
export async function getSetting(key) {
    if (!isNative) {
        loadMemStore();
        return memStore.settings[key] || null;
    }
    const database = await getDB();
    const row = await database.getFirstAsync('SELECT value FROM settings WHERE key=?', [key]);
    return row ? row.value : null;
}

export async function setSetting(key, value) {
    if (!isNative) {
        memStore.settings[key] = value;
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
    );
}

// ─── Bulk operations for import ───────────────
export async function bulkAddTransactions(transactions) {
    if (!isNative) {
        const now = new Date().toISOString();
        for (const tx of transactions) {
            const id = tx.id || generateId();
            memStore.transactions.unshift({ ...tx, id, createdAt: tx.createdAt || now, items: tx.items || [], photos: tx.photos || [] });
        }
        saveMemStore();
        return;
    }

    const database = await getDB();
    const now = new Date().toISOString();
    for (const tx of transactions) {
        const id = tx.id || generateId();
        await database.runAsync(
            `INSERT OR REPLACE INTO transactions (id, type, amount, category, description, date, items, photos, paymentMethod, currency, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, tx.type, tx.amount, tx.category || '', tx.description || '', tx.date || now, JSON.stringify(tx.items || []), JSON.stringify(tx.photos || []), tx.paymentMethod || 'cash', tx.currency || 'USD', tx.createdAt || now]
        );
    }
}

export async function getAllData() {
    const [transactions, budgets, assets] = await Promise.all([
        getAllTransactions(),
        getAllBudgets(),
        getAllAssets(),
    ]);
    const currency = await getSetting('currency');
    const aiApiKey = await getSetting('ai_api_key');
    const aiEndpoint = await getSetting('ai_endpoint');
    return {
        transactions,
        budgets,
        assets,
        settings: { currency: currency || 'USD', aiApiKey, aiEndpoint },
    };
}
