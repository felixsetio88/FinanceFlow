import { logError as appLogError, getLogs, clearLogs } from './appLogger';

export const logError = async (error, additionalInfo = '') => {
    return appLogError(error, additionalInfo);
};

export const getErrorLogs = async () => {
    const logs = await getLogs();
    return logs.filter(l => l.level === 'error' || l.category === 'error');
};

export const clearErrorLogs = async () => {
    return clearLogs();
};
