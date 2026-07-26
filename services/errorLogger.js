import * as FileSystem from 'expo-file-system';

const LOG_FILE_PATH = FileSystem.documentDirectory + 'app_error_logs.json';
const MAX_LOGS = 50;

export const logError = async (error, additionalInfo = '') => {
    try {
        const newLog = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            message: error?.message || String(error),
            stack: error?.stack || null,
            info: additionalInfo,
        };

        let logs = [];
        const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_PATH);
        if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(LOG_FILE_PATH);
            try {
                logs = JSON.parse(content);
            } catch (e) {}
        }

        logs.unshift(newLog);
        if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);

        await FileSystem.writeAsStringAsync(LOG_FILE_PATH, JSON.stringify(logs, null, 2));
        console.log(`[ErrorLogger] Logged error: ${newLog.message}`);
    } catch (e) {
        console.error('[ErrorLogger] Failed to write error log:', e);
    }
};

export const getErrorLogs = async () => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_PATH);
        if (!fileInfo.exists) return [];
        const content = await FileSystem.readAsStringAsync(LOG_FILE_PATH);
        return JSON.parse(content) || [];
    } catch (error) {
        return [];
    }
};

export const clearErrorLogs = async () => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(LOG_FILE_PATH);
        if (fileInfo.exists) await FileSystem.deleteAsync(LOG_FILE_PATH);
    } catch (error) {}
};
