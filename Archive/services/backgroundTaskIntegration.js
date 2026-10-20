/**
 * Integration examples for using background task manager with receipt scanning and PDF import
 * This file contains wrapper functions and integration points
 */

import { enqueueReceiptScan, enqueuePdfImport, taskManager } from './backgroundTaskManager';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Receipt Scanning Integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Scan a receipt in the background with progress tracking
 * 
 * Usage in receipt-scanner.js:
 * ```
 * import { scanReceiptInBackground } from '../services/backgroundTaskIntegration';
 * 
 * const handleScanBackground = async () => {
 *   const taskId = await scanReceiptInBackground(imageUri, async (reportProgress) => {
 *     const result = await scanReceiptLocal(imageUri, reportProgress);
 *     return result;
 *   });
 *   
 *   // Listen for completion
 *   taskManager.onTaskUpdate((id, status, progress, result, error) => {
 *     if (id !== taskId) return;
 *     if (status === 'completed') {
 *       setScannedData(result);
 *     }
 *   });
 * };
 * ```
 */
export async function scanReceiptInBackground(imageUri, scanFunction) {
    return enqueueReceiptScan(imageUri, scanFunction, {
        name: 'Scan Receipt',
        description: 'Processing receipt image in background...',
    });
}

/**
 * Get receipt scan result by task ID
 */
export function getReceiptScanResult(taskId) {
    const task = taskManager.getTask(taskId);
    return task && task.status === 'completed' ? task.result : null;
}

/**
 * Monitor a receipt scan task
 */
export function monitorReceiptScan(taskId, callback) {
    return taskManager.onTaskUpdate((id, status, progress, result, error) => {
        if (id !== taskId) return;
        callback({ id, status, progress, result, error });
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF Import Integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Import a PDF statement in the background with progress tracking
 * 
 * Usage in pdf-import.js:
 * ```
 * import { importPdfInBackground } from '../services/backgroundTaskIntegration';
 * 
 * const handleImportBackground = async () => {
 *   const taskId = await importPdfInBackground(
 *     pdfUri, 
 *     async (reportProgress) => {
 *       const transactions = await extractTextFromPDF(pdfUri, {
 *         useNativeOcr: true,
 *       });
 *       reportProgress(70);
 *       
 *       const parsed = await parsePdfStatementText(transactions, {
 *         parseHints: improveAccuracy ? {...} : null,
 *       });
 *       reportProgress(100);
 *       
 *       return {
 *         transactions: parsed,
 *         transactionCount: parsed.length,
 *       };
 *     }
 *   );
 * };
 * ```
 */
export async function importPdfInBackground(filePath, importFunction) {
    return enqueuePdfImport(filePath, importFunction, {
        name: 'Import PDF',
        description: 'Processing PDF bank statement...',
    });
}

/**
 * Get PDF import result by task ID
 */
export function getPdfImportResult(taskId) {
    const task = taskManager.getTask(taskId);
    return task && task.status === 'completed' ? task.result : null;
}

/**
 * Monitor a PDF import task
 */
export function monitorPdfImport(taskId, callback) {
    return taskManager.onTaskUpdate((id, status, progress, result, error) => {
        if (id !== taskId) return;
        callback({ id, status, progress, result, error });
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Batch Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Process multiple PDFs in batch
 * Each PDF is queued as a separate task
 */
export async function importMultiplePdfsInBackground(filePaths, importFunction) {
    const taskIds = filePaths.map((filePath, index) =>
        enqueuePdfImport(filePath, importFunction, {
            name: `Import PDF ${index + 1}/${filePaths.length}`,
            description: `Processing ${filePath.split('/').pop()}...`,
        })
    );
    return taskIds;
}

/**
 * Wait for all tasks to complete
 */
export async function waitForTaskCompletion(taskIds, timeout = 30 * 60 * 1000) {
    return Promise.race([
        new Promise((resolve) => {
            let completed = 0;
            const results = {};

            taskIds.forEach(id => {
                taskManager.onTaskUpdate((taskId, status, progress, result, error) => {
                    if (!taskIds.includes(taskId)) return;

                    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                        results[taskId] = { status, result, error };
                        completed++;

                        if (completed === taskIds.length) {
                            resolve(results);
                        }
                    }
                });
            });
        }),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Task completion timeout')), timeout)
        ),
    ]);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get all active tasks
 */
export function getActiveTasks() {
    return taskManager.getActiveTasks();
}

/**
 * Get task progress percentage
 */
export function getTaskProgress(taskId) {
    const task = taskManager.getTask(taskId);
    return task ? task.progress : 0;
}

/**
 * Check if a task is still running
 */
export function isTaskRunning(taskId) {
    const task = taskManager.getTask(taskId);
    return task ? ['pending', 'running'].includes(task.status) : false;
}

/**
 * Cancel a pending task
 */
export function cancelTask(taskId) {
    return taskManager.cancelTask(taskId);
}

/**
 * Export task history for debugging
 */
export async function exportTaskHistory() {
    return taskManager.exportHistory();
}
