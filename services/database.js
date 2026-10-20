import { Platform } from 'react-native';
import { generateId } from '../utils/helpers';

let db = null;
let isNative = Platform.OS !== 'web';

const safeParse = (str, fallback) => {
    if (!str) return fallback;
    try { return JSON.parse(str); }
    catch (e) { console.warn('JSON parse error:', e); return fallback; }
};

function normalizeSavingHistory(goal) {
    if (Array.isArray(goal?.savingHistory)) return goal.savingHistory;
    if (Array.isArray(goal?.savingsHistory)) return goal.savingsHistory;
    return [];
}

// ─── In-memory fallback for web ───────────────
const memStore = {
    transactions: [],
    budgets: [],
    assets: [],
    savingsGoals: [],
    chatSessions: [],
    vehicles: [],
    settings: {},
};

function loadMemStore() {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const data = localStorage.getItem('financeflow_data');
            if (data) {
                const parsed = safeParse(data, null);
                if (parsed) Object.assign(memStore, parsed);
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
      category TEXT DEFAULT 'all',
      currency TEXT DEFAULT 'USD',
      cycleStartDay INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id TEXT PRIMARY KEY,
      templateData TEXT NOT NULL,
      frequency TEXT NOT NULL,
      postMode TEXT NOT NULL DEFAULT 'auto',
      nextDueDate TEXT NOT NULL,
      lastPostedDate TEXT,
      isActive INTEGER DEFAULT 1,
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

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      messages TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS savings_goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      targetAmount REAL NOT NULL DEFAULT 0,
      currentAmount REAL NOT NULL DEFAULT 0,
      startDate TEXT,
      endDate TEXT,
      commitment TEXT,
      notifyEnabled INTEGER DEFAULT 0,
            savingsHistory TEXT,
      isCompleted INTEGER DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT DEFAULT 'USD',
      isDefault INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );
  `);

    // Run migrations – ignore errors if column already exists
    const migrations = [
        'ALTER TABLE assets ADD COLUMN color TEXT',
        'ALTER TABLE budgets ADD COLUMN category TEXT',
        'ALTER TABLE transactions ADD COLUMN assetId TEXT',
        'ALTER TABLE transactions ADD COLUMN fromAssetId TEXT',
        'ALTER TABLE transactions ADD COLUMN toAssetId TEXT',
        'ALTER TABLE transactions ADD COLUMN tax REAL DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN taxIsPercent INTEGER DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN taxEnabled INTEGER DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN serviceFee REAL DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN serviceFeeIsPercent INTEGER DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN serviceFeeEnabled INTEGER DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN tip REAL DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN tipIsPercent INTEGER DEFAULT 0',
        'ALTER TABLE transactions ADD COLUMN tipEnabled INTEGER DEFAULT 0',
        'ALTER TABLE savings_goals ADD COLUMN savingsHistory TEXT',
        'ALTER TABLE transactions ADD COLUMN vehicleId TEXT',
        'ALTER TABLE transactions ADD COLUMN vehicleLogType TEXT',
        'ALTER TABLE transactions ADD COLUMN vehicleOdometer REAL',
        'ALTER TABLE transactions ADD COLUMN vehicleVolume REAL',
        'ALTER TABLE transactions ADD COLUMN vehicleMaintenanceItems TEXT',
        'ALTER TABLE vehicles ADD COLUMN initialOdometer REAL',
        'ALTER TABLE vehicles ADD COLUMN isDefault INTEGER DEFAULT 0',
        'ALTER TABLE vehicles ADD COLUMN obdMacAddress TEXT',
        'ALTER TABLE vehicles ADD COLUMN totalDistance REAL DEFAULT 0',
        'ALTER TABLE vehicles ADD COLUMN totalDrivingTime REAL DEFAULT 0',
        'ALTER TABLE vehicles ADD COLUMN totalFuelConsumed REAL DEFAULT 0',
        'ALTER TABLE budgets ADD COLUMN cycleStartDay INTEGER DEFAULT 1',
        'ALTER TABLE transactions ADD COLUMN tags TEXT',
        'ALTER TABLE transactions ADD COLUMN splits TEXT',
    ];

    // Create net_worth_snapshots table
    await database.execAsync(`
        CREATE TABLE IF NOT EXISTS net_worth_snapshots (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            totalValue REAL NOT NULL DEFAULT 0,
            breakdown TEXT,
            currency TEXT DEFAULT 'USD',
            createdAt TEXT NOT NULL
        );
    `);

    const versionRow = await database.getFirstAsync('PRAGMA user_version');
    const currentVersion = versionRow?.user_version || 0;
    const TARGET_SCHEMA_VERSION = 2;

    if (currentVersion < TARGET_SCHEMA_VERSION) {
        for (const sql of migrations) {
            try { await database.execAsync(sql); } catch (_) { /* column already exists */ }
        }
        await database.execAsync(`PRAGMA user_version = ${TARGET_SCHEMA_VERSION}`);
    }

    try {
        await database.execAsync("UPDATE transactions SET category = 'transport' WHERE LOWER(category) IN ('transport', 'car', 'vehicle');");
    } catch (_) { }
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
        category: (r.category && ['transport', 'car', 'vehicle'].includes(r.category.toLowerCase())) ? 'transport' : r.category,
        amount: r.amount,
        items: safeParse(r.items, []),
        photos: safeParse(r.photos, []),
        assetId: r.assetId || null,
        fromAssetId: r.fromAssetId || null,
        toAssetId: r.toAssetId || null,
        tax: r.tax || 0,
        taxIsPercent: !!r.taxIsPercent,
        taxEnabled: !!r.taxEnabled,
        serviceFee: r.serviceFee || 0,
        serviceFeeIsPercent: !!r.serviceFeeIsPercent,
        serviceFeeEnabled: !!r.serviceFeeEnabled,
        tip: r.tip || 0,
        tipIsPercent: !!r.tipIsPercent,
        tipEnabled: !!r.tipEnabled,
        tags: safeParse(r.tags, []),
        splits: safeParse(r.splits, []),
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
        `INSERT INTO transactions (id, type, amount, category, description, date, items, photos, paymentMethod, assetId, fromAssetId, toAssetId, tax, taxIsPercent, taxEnabled, serviceFee, serviceFeeIsPercent, serviceFeeEnabled, tip, tipIsPercent, tipEnabled, currency, tags, splits, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tx.type, tx.amount, tx.category || '', tx.description || '', tx.date || now,
            JSON.stringify(tx.items || []), JSON.stringify(tx.photos || []), tx.paymentMethod || 'cash',
            tx.assetId || null, tx.fromAssetId || null, tx.toAssetId || null,
            tx.tax || 0, tx.taxIsPercent ? 1 : 0, tx.taxEnabled ? 1 : 0,
            tx.serviceFee || 0, tx.serviceFeeIsPercent ? 1 : 0, tx.serviceFeeEnabled ? 1 : 0,
            tx.tip || 0, tx.tipIsPercent ? 1 : 0, tx.tipEnabled ? 1 : 0,
            tx.currency || 'USD',
            JSON.stringify(tx.tags || []), JSON.stringify(tx.splits || []),
            now]
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
        `UPDATE transactions SET type=?, amount=?, category=?, description=?, date=?, items=?, photos=?, paymentMethod=?, assetId=?, fromAssetId=?, toAssetId=?, tax=?, taxIsPercent=?, taxEnabled=?, serviceFee=?, serviceFeeIsPercent=?, serviceFeeEnabled=?, tip=?, tipIsPercent=?, tipEnabled=?, currency=?, tags=?, splits=? WHERE id=?`,
        [tx.type, tx.amount, tx.category, tx.description, tx.date,
        JSON.stringify(tx.items || []), JSON.stringify(tx.photos || []), tx.paymentMethod || 'cash',
        tx.assetId || null, tx.fromAssetId || null, tx.toAssetId || null,
        tx.tax || 0, tx.taxIsPercent ? 1 : 0, tx.taxEnabled ? 1 : 0,
        tx.serviceFee || 0, tx.serviceFeeIsPercent ? 1 : 0, tx.serviceFeeEnabled ? 1 : 0,
        tx.tip || 0, tx.tipIsPercent ? 1 : 0, tx.tipEnabled ? 1 : 0,
        tx.currency || 'USD',
        JSON.stringify(tx.tags || []), JSON.stringify(tx.splits || []),
        tx.id]
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
        memStore.budgets.unshift({ ...b, id, category: b.category || 'all', cycleStartDay: b.cycleStartDay || 1, createdAt: now });
        saveMemStore();
        return id;
    }

    const database = await getDB();
    await database.runAsync(
        'INSERT INTO budgets (id, period, amount, category, currency, cycleStartDay, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, b.period, b.amount, b.category || 'all', b.currency || 'USD', b.cycleStartDay || 1, now]
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
        'UPDATE budgets SET period=?, amount=?, category=?, currency=?, cycleStartDay=? WHERE id=?',
        [b.period, b.amount, b.category || 'all', b.currency || 'USD', b.cycleStartDay || 1, b.id]
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
        'INSERT INTO assets (id, name, type, balance, color, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, a.name, a.type, a.balance || 0, a.color || null, a.currency || 'USD', now]
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
        'UPDATE assets SET name=?, type=?, balance=?, color=?, currency=? WHERE id=?',
        [a.name, a.type, a.balance, a.color || null, a.currency || 'USD', a.id]
    );
}

export async function deleteAsset(id) {
    if (!isNative) {
        memStore.assets = memStore.assets.filter(a => a.id !== id);
        memStore.transactions = memStore.transactions.map(t =>
            t.assetId === id ? { ...t, assetId: null, paymentMethod: 'cash' } : t
        );
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.withTransactionAsync(async () => {
        await database.runAsync('UPDATE transactions SET assetId = NULL, paymentMethod = "cash" WHERE assetId = ?', [id]);
        await database.runAsync('DELETE FROM assets WHERE id = ?', [id]);
    });
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
    await database.withTransactionAsync(async () => {
        for (const tx of transactions) {
            const id = tx.id || generateId();
            await database.runAsync(
                `INSERT OR REPLACE INTO transactions (id, type, amount, category, description, date, items, photos, paymentMethod, assetId, fromAssetId, toAssetId, tax, taxIsPercent, taxEnabled, serviceFee, serviceFeeIsPercent, serviceFeeEnabled, tip, tipIsPercent, tipEnabled, currency, tags, splits, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    tx.type,
                    tx.amount,
                    tx.category || '',
                    tx.description || '',
                    tx.date || now,
                    JSON.stringify(tx.items || []),
                    JSON.stringify(tx.photos || []),
                    tx.paymentMethod || (tx.assetId ? 'asset' : 'cash'),
                    tx.assetId || null,
                    tx.fromAssetId || null,
                    tx.toAssetId || null,
                    tx.tax || 0,
                    tx.taxIsPercent ? 1 : 0,
                    tx.taxEnabled ? 1 : 0,
                    tx.serviceFee || 0,
                    tx.serviceFeeIsPercent ? 1 : 0,
                    tx.serviceFeeEnabled ? 1 : 0,
                    tx.tip || 0,
                    tx.tipIsPercent ? 1 : 0,
                    tx.tipEnabled ? 1 : 0,
                    tx.currency || 'USD',
                    JSON.stringify(tx.tags || []),
                    JSON.stringify(tx.splits || []),
                    tx.createdAt || now,
                ]
            );
        }
    });
}

// ─── Tags ─────────────────────────────────────
export async function getAllTags() {
    if (!isNative) {
        loadMemStore();
        const tagSet = new Set();
        (memStore.transactions || []).forEach(t => {
            const tags = Array.isArray(t.tags) ? t.tags : safeParse(t.tags, []);
            tags.forEach(tag => tagSet.add(tag));
        });
        return [...tagSet].sort();
    }
    const database = await getDB();
    const rows = await database.getAllAsync('SELECT tags FROM transactions WHERE tags IS NOT NULL AND tags != "[]"');
    const tagSet = new Set();
    rows.forEach(r => {
        const tags = safeParse(r.tags, []);
        tags.forEach(tag => tagSet.add(tag));
    });
    return [...tagSet].sort();
}

// ─── Net Worth Snapshots ──────────────────────
export async function addNetWorthSnapshot(snapshot) {
    const id = snapshot.id || generateId();
    const now = new Date().toISOString();
    if (!isNative) {
        if (!memStore.netWorthSnapshots) memStore.netWorthSnapshots = [];
        memStore.netWorthSnapshots.push({ ...snapshot, id, createdAt: now });
        saveMemStore();
        return id;
    }
    const database = await getDB();
    await database.runAsync(
        'INSERT INTO net_worth_snapshots (id, date, totalValue, breakdown, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [id, snapshot.date, snapshot.totalValue, JSON.stringify(snapshot.breakdown || {}), snapshot.currency || 'USD', now]
    );
    return id;
}

export async function getNetWorthHistory(limit = 90) {
    if (!isNative) {
        loadMemStore();
        return (memStore.netWorthSnapshots || []).slice(-limit);
    }
    const database = await getDB();
    const rows = await database.getAllAsync(
        'SELECT * FROM net_worth_snapshots ORDER BY date ASC LIMIT ?', [limit]
    );
    return rows.map(r => ({
        ...r,
        breakdown: safeParse(r.breakdown, {}),
    }));
}

export async function getLatestNetWorthSnapshot() {
    if (!isNative) {
        loadMemStore();
        const snapshots = memStore.netWorthSnapshots || [];
        return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    }
    const database = await getDB();
    const row = await database.getFirstAsync(
        'SELECT * FROM net_worth_snapshots ORDER BY date DESC LIMIT 1'
    );
    if (!row) return null;
    return { ...row, breakdown: safeParse(row.breakdown, {}) };
}

// ─── Vehicles ─────────────────────────────────
export async function getAllVehicles() {
    if (!isNative) {
        loadMemStore();
        return memStore.vehicles || [];
    }
    const database = await getDB();
    return database.getAllAsync('SELECT * FROM vehicles ORDER BY createdAt DESC');
}

export async function addVehicle(v) {
    const id = v.id || generateId();
    const now = new Date().toISOString();
    if (!isNative) {
        if (!memStore.vehicles) memStore.vehicles = [];
        memStore.vehicles.unshift({ ...v, id, createdAt: now });
        saveMemStore();
        return id;
    }
    const database = await getDB();
    await database.runAsync(
        'INSERT INTO vehicles (id, name, type, currency, createdAt, initialOdometer, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, v.name, v.type || 'gas', v.currency || 'USD', now, v.initialOdometer || null, v.isDefault ? 1 : 0]
    );
    return id;
}

export async function updateVehicle(v) {
    if (!isNative) {
        const idx = (memStore.vehicles || []).findIndex(x => x.id === v.id);
        if (idx >= 0) memStore.vehicles[idx] = { ...memStore.vehicles[idx], ...v };
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync(
        'UPDATE vehicles SET name=?, type=?, currency=?, initialOdometer=?, isDefault=?, obdMacAddress=?, totalDistance=?, totalDrivingTime=?, totalFuelConsumed=? WHERE id=?',
        [v.name, v.type, v.currency || 'USD', v.initialOdometer || null, v.isDefault ? 1 : 0, v.obdMacAddress || null, v.totalDistance || 0, v.totalDrivingTime || 0, v.totalFuelConsumed || 0, v.id]
    );
}

export async function setDefaultVehicle(id) {
    if (!isNative) {
        if (memStore.vehicles) {
            memStore.vehicles = memStore.vehicles.map(v => ({ ...v, isDefault: v.id === id ? 1 : 0 }));
            saveMemStore();
        }
        return;
    }
    const database = await getDB();
    await database.runAsync('UPDATE vehicles SET isDefault = 0');
    await database.runAsync('UPDATE vehicles SET isDefault = 1 WHERE id = ?', [id]);
}

export async function deleteVehicle(id) {
    if (!isNative) {
        memStore.vehicles = (memStore.vehicles || []).filter(v => v.id !== id);
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync('DELETE FROM vehicles WHERE id=?', [id]);
}

export async function restoreAllData(data) {
    if (!isNative) {
        memStore.transactions = data.transactions || [];
        memStore.budgets = data.budgets || [];
        memStore.assets = data.assets || [];
        memStore.savingsGoals = data.savingsGoals || [];
        memStore.chatSessions = data.chatSessions || [];
        memStore.vehicles = data.vehicles || [];
        memStore.settings = {};
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                if (!['app_theme_mode', 'ai_thinking_prefs', 'active_model_id', 'model_context_overrides'].includes(key)) {
                    memStore.settings[key] = typeof value === 'string' ? value : String(value);
                }
            }
        }
        saveMemStore();
        return;
    }

    const database = await getDB();
    await database.withTransactionAsync(async () => {
        // Clear all tables
        await database.execAsync(`
            DELETE FROM transactions;
            DELETE FROM budgets;
            DELETE FROM assets;
            DELETE FROM savings_goals;
            DELETE FROM chat_sessions;
            DELETE FROM settings;
            DELETE FROM vehicles;
        `);

        // Restore settings
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                if (['app_theme_mode', 'ai_thinking_prefs', 'active_model_id', 'model_context_overrides'].includes(key)) {
                    continue;
                }
                const valStr = typeof value === 'string' ? value : String(value);
                await database.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', [key, valStr]);
            }
        }

        // Restore assets
        for (const a of (data.assets || [])) {
            const now = a.createdAt || new Date().toISOString();
            await database.runAsync(
                'INSERT INTO assets (id, name, type, balance, color, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [a.id || generateId(), a.name || 'Unknown', a.type || 'bank', a.balance || 0, a.color || null, a.currency || 'USD', now]
            );
        }

        // Restore budgets
        for (const b of (data.budgets || [])) {
            const now = b.createdAt || new Date().toISOString();
            await database.runAsync(
                'INSERT INTO budgets (id, period, amount, category, currency, cycleStartDay, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [b.id || generateId(), b.period || 'monthly', b.amount || 0, b.category || 'all', b.currency || 'USD', b.cycleStartDay || 1, now]
            );
        }

        // Restore transactions
        for (const tx of (data.transactions || [])) {
            const now = tx.createdAt || tx.date || new Date().toISOString();
            await database.runAsync(
                `INSERT INTO transactions (id, type, amount, category, description, date, items, photos, paymentMethod, assetId, fromAssetId, toAssetId, tax, taxIsPercent, taxEnabled, serviceFee, serviceFeeIsPercent, serviceFeeEnabled, tip, tipIsPercent, tipEnabled, currency, createdAt, vehicleId, vehicleLogType, vehicleOdometer, vehicleVolume, vehicleMaintenanceItems)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tx.id || generateId(),
                    tx.type || 'spending',
                    tx.amount || 0,
                    tx.category || 'other_spending',
                    tx.description || '',
                    tx.date || now,
                    JSON.stringify(tx.items || []),
                    JSON.stringify(tx.photos || []),
                    tx.paymentMethod || 'cash',
                    tx.assetId || null,
                    tx.fromAssetId || null,
                    tx.toAssetId || null,
                    tx.tax || 0,
                    tx.taxIsPercent ? 1 : 0,
                    tx.taxEnabled ? 1 : 0,
                    tx.serviceFee || 0,
                    tx.serviceFeeIsPercent ? 1 : 0,
                    tx.serviceFeeEnabled ? 1 : 0,
                    tx.tip || 0,
                    tx.tipIsPercent ? 1 : 0,
                    tx.tipEnabled ? 1 : 0,
                    tx.currency || 'USD',
                    now,
                    tx.vehicleId || null,
                    tx.vehicleLogType || null,
                    tx.vehicleOdometer || null,
                    tx.vehicleVolume || null,
                    tx.vehicleMaintenanceItems || null
                ]
            );
        }

        // Restore savings goals
        for (const goal of (data.savingsGoals || [])) {
            const now = goal.createdAt || new Date().toISOString();
            await database.runAsync(
                'INSERT INTO savings_goals (id, title, targetAmount, currentAmount, startDate, endDate, commitment, notifyEnabled, savingsHistory, isCompleted, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    goal.id || generateId(),
                    goal.title || 'Untitled Goal',
                    goal.targetAmount || 0,
                    goal.currentAmount || 0,
                    goal.startDate || null,
                    goal.endDate || null,
                    goal.commitment || null,
                    goal.notifyEnabled ? 1 : 0,
                    JSON.stringify(normalizeSavingHistory(goal)),
                    goal.isCompleted ? 1 : 0,
                    goal.currency || 'USD',
                    now
                ]
            );
        }

        // Restore chat sessions
        for (const session of (data.chatSessions || [])) {
            const now = session.createdAt || new Date().toISOString();
            const updated = session.updatedAt || now;
            await database.runAsync(
                'INSERT INTO chat_sessions (id, title, messages, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
                [
                    session.id || generateId(),
                    session.title || 'New Chat',
                    JSON.stringify(session.messages || []),
                    now,
                    updated
                ]
            );
        }

        // Restore vehicles
        for (const v of (data.vehicles || [])) {
            const now = v.createdAt || new Date().toISOString();
            await database.runAsync(
                'INSERT INTO vehicles (id, name, type, currency, createdAt, initialOdometer) VALUES (?, ?, ?, ?, ?, ?)',
                [v.id || generateId(), v.name, v.type || 'gas', v.currency || 'USD', now, v.initialOdometer || null]
            );
        }
    });
}

export async function mergeAllData(data) {
    if (!isNative) {
        loadMemStore();
        if (!memStore.transactions) memStore.transactions = [];
        if (!memStore.budgets) memStore.budgets = [];
        if (!memStore.assets) memStore.assets = [];
        if (!memStore.savingsGoals) memStore.savingsGoals = [];
        if (!memStore.chatSessions) memStore.chatSessions = [];
        if (!memStore.vehicles) memStore.vehicles = [];
        if (!memStore.settings) memStore.settings = {};

        // 1. Assets Merge & ID mapping
        const assetIdMap = {};
        const existingAssetIds = new Set(memStore.assets.map(a => a.id));
        const existingAssetNames = new Set(memStore.assets.map(a => (a.name || '').trim().toLowerCase()));

        for (const a of (data.assets || [])) {
            const incomingNameLower = (a.name || '').trim().toLowerCase();
            if (existingAssetIds.has(a.id)) {
                assetIdMap[a.id] = a.id;
            } else {
                const matchedExisting = memStore.assets.find(existing => (existing.name || '').trim().toLowerCase() === incomingNameLower);
                if (matchedExisting) {
                    assetIdMap[a.id] = matchedExisting.id;
                } else {
                    const newId = a.id || generateId();
                    assetIdMap[a.id] = newId;
                    memStore.assets.unshift({
                        ...a,
                        id: newId,
                        createdAt: a.createdAt || new Date().toISOString()
                    });
                    existingAssetIds.add(newId);
                    existingAssetNames.add(incomingNameLower);
                }
            }
        }

        // 2. Budgets Merge
        const existingBudgetIds = new Set(memStore.budgets.map(b => b.id));
        const makeBudgetKey = (b) => `${(b.period || 'monthly').trim().toLowerCase()}_${(b.category || 'all').trim().toLowerCase()}`;
        const existingBudgetPeriods = new Set(memStore.budgets.map(makeBudgetKey));

        for (const b of (data.budgets || [])) {
            const incomingKey = makeBudgetKey(b);
            if (!existingBudgetIds.has(b.id) && !existingBudgetPeriods.has(incomingKey)) {
                const newId = b.id || generateId();
                memStore.budgets.unshift({
                    ...b,
                    id: newId,
                    category: b.category || 'all',
                    cycleStartDay: b.cycleStartDay || 1,
                    createdAt: b.createdAt || new Date().toISOString()
                });
                existingBudgetIds.add(newId);
                existingBudgetPeriods.add(incomingKey);
            }
        }

        // 3. Saving Goals Merge
        const existingGoalIds = new Set(memStore.savingsGoals.map(g => g.id));
        const existingGoalTitles = new Set(memStore.savingsGoals.map(g => (g.title || '').trim().toLowerCase()));

        for (const goal of (data.savingsGoals || [])) {
            const incomingTitleLower = (goal.title || '').trim().toLowerCase();
            if (!existingGoalIds.has(goal.id) && !existingGoalTitles.has(incomingTitleLower)) {
                const newId = goal.id || generateId();
                memStore.savingsGoals.unshift({
                    ...goal,
                    id: newId,
                    savingHistory: normalizeSavingHistory(goal),
                    createdAt: goal.createdAt || new Date().toISOString()
                });
                existingGoalIds.add(newId);
                existingGoalTitles.add(incomingTitleLower);
            }
        }

        // 4. Transactions Merge
        const existingTxIds = new Set(memStore.transactions.map(t => t.id));
        const makeTxKey = (t) => `${t.date}_${t.type}_${t.amount}_${t.category}_${t.description}`;
        const existingTxKeys = new Set(memStore.transactions.map(makeTxKey));

        for (const tx of (data.transactions || [])) {
            const txKey = makeTxKey(tx);
            if (!existingTxIds.has(tx.id) && !existingTxKeys.has(txKey)) {
                const newId = tx.id || generateId();
                const remappedAssetId = assetIdMap[tx.assetId] || tx.assetId || null;
                const remappedFromAssetId = assetIdMap[tx.fromAssetId] || tx.fromAssetId || null;
                const remappedToAssetId = assetIdMap[tx.toAssetId] || tx.toAssetId || null;

                memStore.transactions.unshift({
                    ...tx,
                    id: newId,
                    assetId: remappedAssetId,
                    fromAssetId: remappedFromAssetId,
                    toAssetId: remappedToAssetId,
                    createdAt: tx.createdAt || new Date().toISOString(),
                    items: tx.items || [],
                    photos: tx.photos || []
                });
                existingTxIds.add(newId);
                existingTxKeys.add(txKey);
            }
        }

        // 5. Chat Sessions Merge
        const existingChatIds = new Set(memStore.chatSessions.map(c => c.id));
        const makeChatKey = (c) => `${c.title}_${c.createdAt}`;
        const existingChatKeys = new Set(memStore.chatSessions.map(makeChatKey));

        for (const session of (data.chatSessions || [])) {
            const chatKey = makeChatKey(session);
            if (!existingChatIds.has(session.id) && !existingChatKeys.has(chatKey)) {
                const newId = session.id || generateId();
                memStore.chatSessions.unshift({
                    ...session,
                    id: newId,
                    messages: session.messages || [],
                    createdAt: session.createdAt || new Date().toISOString(),
                    updatedAt: session.updatedAt || new Date().toISOString()
                });
                existingChatIds.add(newId);
                existingChatKeys.add(chatKey);
            }
        }

        // 6. Settings Merge
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                if (['app_theme_mode', 'ai_thinking_prefs', 'active_model_id', 'model_context_overrides'].includes(key)) {
                    continue;
                }
                if (memStore.settings[key] === undefined) {
                    memStore.settings[key] = typeof value === 'string' ? value : String(value);
                }
            }
        }

        saveMemStore();
        return;
    }

    const database = await getDB();

    // Fetch all existing data to prevent SQLite constraint failures and correctly map assets
    const [
        existingTx,
        existingBudgetsList,
        existingAssetsList,
        existingGoalsList,
        existingChatsList,
        existingVehiclesList
    ] = await Promise.all([
        getAllTransactions(),
        getAllBudgets(),
        getAllAssets(),
        getAllSavingsGoals(),
        getAllChatSessions(),
        getAllVehicles()
    ]);

    // Setup helper containers
    const existingAssetIds = new Set(existingAssetsList.map(a => a.id));
    const existingAssetNamesMap = new Map(existingAssetsList.map(a => [(a.name || '').trim().toLowerCase(), a.id]));

    const existingBudgetIds = new Set(existingBudgetsList.map(b => b.id));
    const makeBudgetKey = (b) => `${(b.period || 'monthly').trim().toLowerCase()}_${(b.category || 'all').trim().toLowerCase()}`;
    const existingBudgetPeriods = new Set(existingBudgetsList.map(makeBudgetKey));

    const existingGoalIds = new Set(existingGoalsList.map(g => g.id));
    const existingGoalTitlesMap = new Map(existingGoalsList.map(g => [(g.title || '').trim().toLowerCase(), g.id]));

    const existingTxIds = new Set(existingTx.map(t => t.id));
    const makeTxKey = (t) => `${t.date}_${t.type}_${t.amount}_${t.category}_${t.description}`;
    const existingTxKeys = new Set(existingTx.map(makeTxKey));

    const existingChatIds = new Set(existingChatsList.map(c => c.id));
    const makeChatKey = (c) => `${c.title}_${c.createdAt}`;
    const existingChatKeys = new Set(existingChatsList.map(makeChatKey));

    const existingVehicleIds = new Set(existingVehiclesList.map(v => v.id));
    const existingVehicleNamesMap = new Map(existingVehiclesList.map(v => [(v.name || '').trim().toLowerCase(), v.id]));

    // Get current setting keys
    const existingSettingKeys = new Set();
    const settingsRows = await database.getAllAsync('SELECT key FROM settings');
    for (const r of settingsRows) {
        existingSettingKeys.add(r.key);
    }

    // 1. Assets Merge & ID Mapping
    const assetIdMap = {};
    const assetsToInsert = [];
    for (const a of (data.assets || [])) {
        const incomingNameLower = (a.name || '').trim().toLowerCase();
        if (existingAssetIds.has(a.id)) {
            assetIdMap[a.id] = a.id;
        } else if (existingAssetNamesMap.has(incomingNameLower)) {
            assetIdMap[a.id] = existingAssetNamesMap.get(incomingNameLower);
        } else {
            const newId = a.id || generateId();
            assetIdMap[a.id] = newId;
            assetsToInsert.push({ ...a, id: newId });
            existingAssetIds.add(newId);
            existingAssetNamesMap.set(incomingNameLower, newId);
        }
    }

    // 2. Budgets Merge
    const budgetsToInsert = [];
    for (const b of (data.budgets || [])) {
        const incomingKey = makeBudgetKey(b);
        if (!existingBudgetIds.has(b.id) && !existingBudgetPeriods.has(incomingKey)) {
            const newId = b.id || generateId();
            budgetsToInsert.push({ ...b, id: newId });
            existingBudgetIds.add(newId);
            existingBudgetPeriods.add(incomingKey);
        }
    }

    // 3. Saving Goals Merge
    const goalsToInsert = [];
    for (const goal of (data.savingsGoals || [])) {
        const incomingTitleLower = (goal.title || '').trim().toLowerCase();
        if (!existingGoalIds.has(goal.id) && !existingGoalTitlesMap.has(incomingTitleLower)) {
            const newId = goal.id || generateId();
            goalsToInsert.push({ ...goal, id: newId });
            existingGoalIds.add(newId);
            existingGoalTitlesMap.set(incomingTitleLower, newId);
        }
    }

    // 4. Transactions Merge
    const transactionsToInsert = [];
    for (const tx of (data.transactions || [])) {
        const txKey = makeTxKey(tx);
        if (!existingTxIds.has(tx.id) && !existingTxKeys.has(txKey)) {
            const newId = tx.id || generateId();
            const remappedAssetId = assetIdMap[tx.assetId] || tx.assetId || null;
            const remappedFromAssetId = assetIdMap[tx.fromAssetId] || tx.fromAssetId || null;
            const remappedToAssetId = assetIdMap[tx.toAssetId] || tx.toAssetId || null;

            transactionsToInsert.push({
                ...tx,
                id: newId,
                assetId: remappedAssetId,
                fromAssetId: remappedFromAssetId,
                toAssetId: remappedToAssetId
            });
            existingTxIds.add(newId);
            existingTxKeys.add(txKey);
        }
    }

    // 5. Chat Sessions Merge
    const chatsToInsert = [];
    for (const session of (data.chatSessions || [])) {
        const chatKey = makeChatKey(session);
        if (!existingChatIds.has(session.id) && !existingChatKeys.has(chatKey)) {
            const newId = session.id || generateId();
            chatsToInsert.push({ ...session, id: newId });
            existingChatIds.add(newId);
            existingChatKeys.add(chatKey);
        }
    }

    // 6. Settings Merge
    const settingsToInsert = [];
    if (data.settings) {
        for (const [key, value] of Object.entries(data.settings)) {
            if (['app_theme_mode', 'ai_thinking_prefs', 'active_model_id', 'model_context_overrides'].includes(key)) {
                continue;
            }
            if (!existingSettingKeys.has(key)) {
                const valStr = typeof value === 'string' ? value : String(value);
                settingsToInsert.push({ key, value: valStr });
                existingSettingKeys.add(key);
            }
        }
    }

    // Write to SQLite database in a transaction
    await database.withTransactionAsync(async () => {
        // Insert Settings
        for (const s of settingsToInsert) {
            await database.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', [s.key, s.value]);
        }

        // Insert Assets
        for (const a of assetsToInsert) {
            const now = a.createdAt || new Date().toISOString();
            await database.runAsync(
                'INSERT INTO assets (id, name, type, balance, color, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [a.id, a.name || 'Unknown', a.type || 'bank', a.balance || 0, a.color || null, a.currency || 'USD', now]
            );
        }

        // Insert Budgets
        for (const b of budgetsToInsert) {
            const now = b.createdAt || new Date().toISOString();
            await database.runAsync(
                'INSERT INTO budgets (id, period, amount, category, currency, cycleStartDay, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [b.id, b.period || 'monthly', b.amount || 0, b.category || 'all', b.currency || 'USD', b.cycleStartDay || 1, now]
            );
        }

        // Insert Transactions
        for (const tx of transactionsToInsert) {
            const now = tx.createdAt || tx.date || new Date().toISOString();
            await database.runAsync(
                `INSERT INTO transactions (id, type, amount, category, description, date, items, photos, paymentMethod, assetId, fromAssetId, toAssetId, tax, taxIsPercent, taxEnabled, serviceFee, serviceFeeIsPercent, serviceFeeEnabled, tip, tipIsPercent, tipEnabled, currency, createdAt, vehicleId, vehicleLogType, vehicleOdometer, vehicleVolume, vehicleMaintenanceItems)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    tx.id,
                    tx.type || 'spending',
                    tx.amount || 0,
                    tx.category || 'other_spending',
                    tx.description || '',
                    tx.date || now,
                    JSON.stringify(tx.items || []),
                    JSON.stringify(tx.photos || []),
                    tx.paymentMethod || 'cash',
                    tx.assetId || null,
                    tx.fromAssetId || null,
                    tx.toAssetId || null,
                    tx.tax || 0,
                    tx.taxIsPercent ? 1 : 0,
                    tx.taxEnabled ? 1 : 0,
                    tx.serviceFee || 0,
                    tx.serviceFeeIsPercent ? 1 : 0,
                    tx.serviceFeeEnabled ? 1 : 0,
                    tx.tip || 0,
                    tx.tipIsPercent ? 1 : 0,
                    tx.tipEnabled ? 1 : 0,
                    tx.currency || 'USD',
                    now,
                    tx.vehicleId || null,
                    tx.vehicleLogType || null,
                    tx.vehicleOdometer || null,
                    tx.vehicleVolume || null,
                    tx.vehicleMaintenanceItems || null
                ]
            );
        }

        // Insert Saving Goals
        for (const goal of goalsToInsert) {
            const now = goal.createdAt || new Date().toISOString();
            await database.runAsync(
                'INSERT INTO savings_goals (id, title, targetAmount, currentAmount, startDate, endDate, commitment, notifyEnabled, savingsHistory, isCompleted, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    goal.id,
                    goal.title || 'Untitled Goal',
                    goal.targetAmount || 0,
                    goal.currentAmount || 0,
                    goal.startDate || null,
                    goal.endDate || null,
                    goal.commitment || null,
                    goal.notifyEnabled ? 1 : 0,
                    JSON.stringify(normalizeSavingHistory(goal)),
                    goal.isCompleted ? 1 : 0,
                    goal.currency || 'USD',
                    now
                ]
            );
        }

        // Insert Chat Sessions
        for (const session of chatsToInsert) {
            const now = session.createdAt || new Date().toISOString();
            const updated = session.updatedAt || now;
            await database.runAsync(
                'INSERT INTO chat_sessions (id, title, messages, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
                [
                    session.id,
                    session.title || 'New Chat',
                    JSON.stringify(session.messages || []),
                    now,
                    updated
                ]
            );
        }

        // Insert Vehicles
        for (const v of (data.vehicles || [])) {
            const incomingNameLower = (v.name || '').trim().toLowerCase();
            if (!existingVehicleIds.has(v.id) && !existingVehicleNamesMap.has(incomingNameLower)) {
                const newId = v.id || generateId();
                const now = v.createdAt || new Date().toISOString();
                await database.runAsync(
                    'INSERT INTO vehicles (id, name, type, currency, createdAt, initialOdometer) VALUES (?, ?, ?, ?, ?, ?)',
                    [newId, v.name, v.type || 'gas', v.currency || 'USD', now, v.initialOdometer || null]
                );
                existingVehicleIds.add(newId);
                existingVehicleNamesMap.set(incomingNameLower, newId);
            }
        }
    });
}



// ─── Savings Goals ───────────────────────────
export async function getAllSavingsGoals() {
    if (!isNative) {
        loadMemStore();
        return memStore.savingsGoals || [];
    }
    const database = await getDB();
    const rows = await database.getAllAsync('SELECT * FROM savings_goals ORDER BY createdAt DESC');
    return rows.map(r => ({
        ...r,
        targetAmount: r.targetAmount,
        currentAmount: r.currentAmount,
        notifyEnabled: !!r.notifyEnabled,
        savingHistory: safeParse(r.savingsHistory, []),
        isCompleted: !!r.isCompleted,
    }));
}

export async function addSavingsGoal(goal) {
    const id = goal.id || generateId();
    const now = new Date().toISOString();
    if (!isNative) {
        if (!memStore.savingsGoals) memStore.savingsGoals = [];
        memStore.savingsGoals.unshift({ ...goal, id, savingHistory: normalizeSavingHistory(goal), createdAt: now });
        saveMemStore();
        return id;
    }
    const database = await getDB();
    await database.runAsync(
        'INSERT INTO savings_goals (id, title, targetAmount, currentAmount, startDate, endDate, commitment, notifyEnabled, savingsHistory, isCompleted, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            id,
            goal.title,
            goal.targetAmount,
            goal.currentAmount || 0,
            goal.startDate || null,
            goal.endDate || null,
            goal.commitment || null,
            goal.notifyEnabled ? 1 : 0,
            JSON.stringify(normalizeSavingHistory(goal)),
            goal.isCompleted ? 1 : 0,
            goal.currency || 'USD',
            now,
        ]
    );
    return id;
}

export async function updateSavingsGoal(goal) {
    if (!isNative) {
        if (!memStore.savingsGoals) memStore.savingsGoals = [];
        const idx = memStore.savingsGoals.findIndex(g => g.id === goal.id);
        if (idx >= 0) memStore.savingsGoals[idx] = {
            ...memStore.savingsGoals[idx],
            ...goal,
            savingHistory: normalizeSavingHistory(goal),
        };
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync(
        'UPDATE savings_goals SET title=?, targetAmount=?, currentAmount=?, startDate=?, endDate=?, commitment=?, notifyEnabled=?, savingsHistory=?, isCompleted=?, currency=? WHERE id=?',
        [
            goal.title,
            goal.targetAmount,
            goal.currentAmount || 0,
            goal.startDate || null,
            goal.endDate || null,
            goal.commitment || null,
            goal.notifyEnabled ? 1 : 0,
            JSON.stringify(normalizeSavingHistory(goal)),
            goal.isCompleted ? 1 : 0,
            goal.currency || 'USD',
            goal.id,
        ]
    );
}

export async function deleteSavingsGoal(id) {
    if (!isNative) {
        if (!memStore.savingsGoals) memStore.savingsGoals = [];
        memStore.savingsGoals = memStore.savingsGoals.filter(g => g.id !== id);
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync('DELETE FROM savings_goals WHERE id=?', [id]);
}

export async function getAllData() {
    const [transactions, budgets, assets, savingsGoals, chatSessions, vehicles, recurringTransactions] = await Promise.all([
        getAllTransactions(),
        getAllBudgets(),
        getAllAssets(),
        getAllSavingsGoals(),
        getAllChatSessions(),
        getAllVehicles(),
        getAllRecurringTransactions(),
    ]);
    const currency = await getSetting('currency');
    const aiApiKey = await getSetting('ai_api_key');
    const aiEndpoint = await getSetting('ai_endpoint');
    let onboardingCompleted = await getSetting('onboarding_completed');

    // Safety: If the database already contains assets or transactions, the user has completed onboarding
    const hasExistingData = (assets && assets.length > 0) || (transactions && transactions.length > 0);
    if (hasExistingData && onboardingCompleted !== 'true') {
        onboardingCompleted = 'true';
        try {
            await setSetting('onboarding_completed', 'true');
        } catch (e) {
            console.warn('Failed to auto-persist onboarding status:', e);
        }
    }

    return {
        transactions,
        budgets,
        assets,
        savingsGoals,
        chatSessions,
        vehicles,
        recurringTransactions,
        settings: { currency: currency || 'USD', aiApiKey, aiEndpoint, onboardingCompleted: onboardingCompleted === 'true' },
    };
}

// ─── Chat Sessions ────────────────────────────
export async function getAllChatSessions() {
    if (!isNative) {
        loadMemStore();
        return memStore.chatSessions || [];
    }
    const database = await getDB();
    const rows = await database.getAllAsync('SELECT * FROM chat_sessions ORDER BY updatedAt DESC');
    return rows.map(r => ({
        ...r,
        messages: safeParse(r.messages, [])
    }));
}

export async function addChatSession(session) {
    const id = session.id || generateId();
    const now = new Date().toISOString();

    if (!isNative) {
        if (!memStore.chatSessions) memStore.chatSessions = [];
        memStore.chatSessions.unshift({ ...session, id, createdAt: now, updatedAt: now });
        saveMemStore();
        return id;
    }

    const database = await getDB();
    await database.runAsync(
        'INSERT INTO chat_sessions (id, title, messages, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
        [id, session.title || 'New Chat', JSON.stringify(session.messages || []), now, now]
    );
    return id;
}

export async function updateChatSession(id, messages) {
    const now = new Date().toISOString();

    if (!isNative) {
        if (!memStore.chatSessions) memStore.chatSessions = [];
        const idx = memStore.chatSessions.findIndex(s => s.id === id);
        if (idx >= 0) {
            memStore.chatSessions[idx] = { ...memStore.chatSessions[idx], messages, updatedAt: now };
        }
        saveMemStore();
        return;
    }

    const database = await getDB();
    await database.runAsync(
        'UPDATE chat_sessions SET messages=?, updatedAt=? WHERE id=?',
        [JSON.stringify(messages), now, id]
    );
}

export async function deleteChatSession(id) {
    if (!isNative) {
        if (!memStore.chatSessions) memStore.chatSessions = [];
        memStore.chatSessions = memStore.chatSessions.filter(s => s.id !== id);
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync('DELETE FROM chat_sessions WHERE id=?', [id]);
}

// ─── Recurring Transactions ───────────────────
export async function getAllRecurringTransactions() {
    if (!isNative) {
        loadMemStore();
        return (memStore.recurringTransactions || []).map(r => ({
            ...r,
            templateData: typeof r.templateData === 'string' ? JSON.parse(r.templateData) : r.templateData,
        }));
    }
    const database = await getDB();
    const rows = await database.getAllAsync('SELECT * FROM recurring_transactions ORDER BY createdAt DESC');
    return rows.map(r => ({
        ...r,
        templateData: safeParse(r.templateData, {}),
        isActive: !!r.isActive,
    }));
}

export async function addRecurringTransaction(rt) {
    const id = rt.id || generateId();
    const now = new Date().toISOString();

    if (!isNative) {
        if (!memStore.recurringTransactions) memStore.recurringTransactions = [];
        memStore.recurringTransactions.unshift({
            ...rt, id,
            templateData: typeof rt.templateData === 'object' ? JSON.stringify(rt.templateData) : rt.templateData,
            createdAt: now,
        });
        saveMemStore();
        return id;
    }

    const database = await getDB();
    await database.runAsync(
        `INSERT INTO recurring_transactions
         (id, templateData, frequency, postMode, nextDueDate, lastPostedDate, isActive, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            JSON.stringify(rt.templateData || {}),
            rt.frequency,
            rt.postMode || 'auto',
            rt.nextDueDate,
            rt.lastPostedDate || null,
            rt.isActive !== false ? 1 : 0,
            now,
        ]
    );
    return id;
}

export async function updateRecurringTransaction(rt) {
    if (!isNative) {
        if (!memStore.recurringTransactions) memStore.recurringTransactions = [];
        const idx = memStore.recurringTransactions.findIndex(r => r.id === rt.id);
        if (idx >= 0) {
            memStore.recurringTransactions[idx] = {
                ...memStore.recurringTransactions[idx],
                ...rt,
                templateData: typeof rt.templateData === 'object' ? JSON.stringify(rt.templateData) : rt.templateData,
            };
        }
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync(
        `UPDATE recurring_transactions
         SET templateData=?, frequency=?, postMode=?, nextDueDate=?, lastPostedDate=?, isActive=?
         WHERE id=?`,
        [
            JSON.stringify(rt.templateData || {}),
            rt.frequency,
            rt.postMode || 'auto',
            rt.nextDueDate,
            rt.lastPostedDate || null,
            rt.isActive !== false ? 1 : 0,
            rt.id,
        ]
    );
}

export async function deleteRecurringTransaction(id) {
    if (!isNative) {
        if (!memStore.recurringTransactions) memStore.recurringTransactions = [];
        memStore.recurringTransactions = memStore.recurringTransactions.filter(r => r.id !== id);
        saveMemStore();
        return;
    }
    const database = await getDB();
    await database.runAsync('DELETE FROM recurring_transactions WHERE id=?', [id]);
}
