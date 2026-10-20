import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const LOG_FILE_PATH = FileSystem.documentDirectory + 'app_activity_logs.json';
const MAX_LOGS = 500;

// In-memory listeners for live UI updates
const listeners = new Set();

const notifyListeners = (logs) => {
    listeners.forEach((cb) => {
        try {
            cb(logs);
        } catch (e) {
            console.error('[appLogger] Listener error:', e);
        }
    });
};

/**
 * Log any user activity or system event to local on-device storage.
 * @param {Object} entry
 * @param {('info'|'warn'|'error'|'success')} [entry.level='info']
 * @param {('transaction'|'asset'|'currency'|'settings'|'backup'|'ai'|'error'|'system')} [entry.category='system']
 * @param {string} entry.title
 * @param {string} [entry.details='']
 * @param {string} [entry.stack=null]
 */
export const logActivity = async ({
    level = 'info',
    category = 'system',
    title = '',
    details = '',
    stack = null,
} = {}) => {
    try {
        const newLog = {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
            level,
            category,
            title,
            details: String(details || ''),
            stack: stack || null,
        };

        let logs = [];
        const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_PATH);
        if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(LOG_FILE_PATH);
            try {
                logs = JSON.parse(content);
                if (!Array.isArray(logs)) logs = [];
            } catch (e) {
                logs = [];
            }
        }

        logs.unshift(newLog);
        if (logs.length > MAX_LOGS) {
            logs = logs.slice(0, MAX_LOGS);
        }

        await FileSystem.writeAsStringAsync(LOG_FILE_PATH, JSON.stringify(logs, null, 2));
        notifyListeners(logs);
        console.log(`[appLogger] [${level.toUpperCase()}] [${category}] ${title} ${details ? '- ' + details : ''}`);
    } catch (e) {
        console.error('[appLogger] Failed to write activity log:', e);
    }
};

/**
 * Log an error or crash event
 */
export const logError = async (error, additionalInfo = '') => {
    const message = error?.message || String(error);
    const stack = error?.stack || null;
    return logActivity({
        level: 'error',
        category: 'error',
        title: 'Error Occurred',
        details: additionalInfo ? `${additionalInfo}: ${message}` : message,
        stack,
    });
};

/**
 * Retrieve all on-device logs
 * @returns {Promise<Array>}
 */
export const getLogs = async () => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_PATH);
        if (!fileInfo.exists) return [];
        const content = await FileSystem.readAsStringAsync(LOG_FILE_PATH);
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('[appLogger] Failed to read logs:', e);
        return [];
    }
};

/**
 * Clear all on-device logs
 */
export const clearLogs = async () => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_PATH);
        if (fileInfo.exists) {
            await FileSystem.deleteAsync(LOG_FILE_PATH);
        }
        notifyListeners([]);
    } catch (e) {
        console.error('[appLogger] Failed to clear logs:', e);
    }
};

/**
 * Export logs as a readable text file and trigger the native system share sheet
 */
export const exportLogs = async () => {
    try {
        const logs = await getLogs();
        if (logs.length === 0) {
            return { success: false, reason: 'empty' };
        }

        const lines = [
            '================================================================',
            'FinanceFlow On-Device Activity & System Log',
            `Exported at: ${new Date().toLocaleString()}`,
            `Total entries: ${logs.length}`,
            'Privacy notice: This log was generated locally on this device.',
            '================================================================\n',
        ];

        for (const log of logs) {
            lines.push(`[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category.toUpperCase()}]`);
            lines.push(`Title: ${log.title}`);
            if (log.details) lines.push(`Details: ${log.details}`);
            if (log.stack) lines.push(`Stack: \n${log.stack}`);
            lines.push('----------------------------------------------------------------');
        }

        const exportPath = `${FileSystem.cacheDirectory}financeflow_logs_${Date.now()}.txt`;
        await FileSystem.writeAsStringAsync(exportPath, lines.join('\n'));

        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(exportPath, {
                mimeType: 'text/plain',
                dialogTitle: 'Export FinanceFlow Logs',
                UTI: 'public.plain-text',
            });
            return { success: true };
        } else {
            return { success: false, reason: 'sharing_unavailable' };
        }
    } catch (e) {
        console.error('[appLogger] Export failed:', e);
        return { success: false, reason: e.message };
    }
};

/**
 * Subscribe to live log updates
 */
export const subscribeToLogs = (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
};
