// Background Task Manager for long-running operations (receipt scanning, PDF import, etc.)
// Provides async task queuing, progress tracking, and notifications

import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateReceiptScanSession } from './receiptScanSession';
import { router } from 'expo-router';

const TASK_STORAGE_KEY = 'bg_tasks';
const TASK_HISTORY_KEY = 'bg_task_history';

// Task status enum
export const TaskStatus = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
};

// Task type enum
export const TaskType = {
    SCAN_RECEIPT: 'scan_receipt',
    IMPORT_PDF: 'import_pdf',
    BATCH_IMPORT: 'batch_import',
};

class BackgroundTaskManager {
    constructor() {
        this.queue = [];
        this.running = false;
        this.listeners = [];
        this.currentTask = null;
        this.taskResults = new Map();
    }

    /**
     * Register a listener for task status updates
     * @param {Function} callback - Called with (taskId, status, progress, result, error)
     */
    onTaskUpdate(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Emit task update to all listeners
     */
    _notifyListeners(taskId, status, progress = 0, result = null, error = null) {
        this.listeners.forEach(callback => {
            try {
                callback(taskId, status, progress, result, error);
            } catch (err) {
                console.error('Task listener error:', err);
            }
        });
    }

    /**
     * Create and queue a new task
     * @param {string} type - Task type from TaskType enum
     * @param {Function} handler - Async function that performs the task
     * @param {Object} metadata - Task metadata (name, description, etc)
     * @returns {string} Task ID
     */
    enqueueTask(type, handler, metadata = {}) {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task = {
            id: taskId,
            type,
            handler,
            status: TaskStatus.PENDING,
            progress: 0,
            result: null,
            error: null,
            cancelRequested: false,
            cancellationReason: null,
            metadata: {
                name: metadata.name || type,
                description: metadata.description || '',
                createdAt: new Date().toISOString(),
                ...metadata,
            },
            startedAt: null,
            completedAt: null,
        };

        this.queue.push(task);
        this._notifyListeners(taskId, TaskStatus.PENDING, 0);
        this._processQueue();
        return taskId;
    }

    /**
     * Get task info
     */
    getTask(taskId) {
        const queued = this.queue.find(t => t.id === taskId);
        if (queued) return { ...queued };
        return this.taskResults.get(taskId) || null;
    }

    /**
     * Get all tasks (pending, running, and completed)
     */
    getAllTasks() {
        return [
            ...this.queue,
            ...Array.from(this.taskResults.values()),
        ].sort((a, b) => new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt));
    }

    /**
     * Get only pending/running tasks
     */
    getActiveTasks() {
        return this.queue
            .concat(this.currentTask ? [this.currentTask] : [])
            .filter(t => !t.cancelRequested && t.status !== TaskStatus.CANCELLED);
    }

    /**
     * Cancel a pending task
     */
    cancelTask(taskId) {
        const idx = this.queue.findIndex(t => t.id === taskId);
        if (idx >= 0) {
            const task = this.queue[idx];
            task.status = TaskStatus.CANCELLED;
            task.cancelRequested = true;
            task.cancellationReason = 'Cancelled before start';
            task.completedAt = new Date().toISOString();
            this.queue.splice(idx, 1);
            this.taskResults.set(task.id, task);
            this._notifyListeners(taskId, TaskStatus.CANCELLED);
            return true;
        }

        if (this.currentTask && this.currentTask.id === taskId) {
            this.currentTask.cancelRequested = true;
            this.currentTask.cancellationReason = 'Cancelled by user';
            this.currentTask.status = TaskStatus.CANCELLED;
            if (typeof this.currentTask._cancelFn === 'function') {
                this.currentTask._cancelFn(new Error('Task cancelled by user'));
            }
            if (typeof this.currentTask._cancelCallback === 'function') {
                try { this.currentTask._cancelCallback(); } catch(e) {}
            }
            this._notifyListeners(taskId, TaskStatus.CANCELLED, this.currentTask.progress || 0);
            return true;
        }

        return false;
    }

    /**
     * Clear completed tasks from history
     */
    clearHistory() {
        const before = this.taskResults.size;
        this.taskResults.clear();
        return before;
    }

    /**
     * Process the task queue sequentially
     */
    async _processQueue() {
        if (this.running || this.queue.length === 0) {
            return;
        }

        this.running = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            this.currentTask = task;
            let cancelTaskExecution = null;

            try {
                task.status = TaskStatus.RUNNING;
                task.startedAt = new Date().toISOString();
                this._notifyListeners(task.id, TaskStatus.RUNNING, 0);

                // Create a progress callback function for handlers to use
                const reportProgress = (progress) => {
                    if (task.cancelRequested || task.status === TaskStatus.CANCELLED) return;
                    task.progress = Math.min(100, Math.max(0, progress));
                    this._notifyListeners(task.id, TaskStatus.RUNNING, task.progress);
                };

                const taskControl = {
                    isCancelled: () => !!task.cancelRequested,
                    throwIfCancelled: () => {
                        if (task.cancelRequested) {
                            throw new Error('Task cancelled by user');
                        }
                    },
                    onCancel: (fn) => {
                        task._cancelCallback = fn;
                    }
                };

                const cancelPromise = new Promise((_, reject) => {
                    cancelTaskExecution = reject;
                });
                task._cancelFn = cancelTaskExecution;

                // Execute the task with timeout protection (30 minutes max)
                const result = await Promise.race([
                    task.handler(reportProgress, taskControl).catch(e => {
                        if (task.cancelRequested) return null;
                        throw e;
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Task timeout (30m)')), 30 * 60 * 1000)
                    ),
                    cancelPromise,
                ]);

                if (task.cancelRequested) {
                    task.status = TaskStatus.CANCELLED;
                    task.completedAt = new Date().toISOString();
                    this.taskResults.set(task.id, task);
                    this._notifyListeners(task.id, TaskStatus.CANCELLED, task.progress || 0);
                    continue;
                }

                task.status = TaskStatus.COMPLETED;
                task.result = result;
                task.completedAt = new Date().toISOString();
                this.taskResults.set(task.id, task);
                this._notifyListeners(task.id, TaskStatus.COMPLETED, 100, result);

            } catch (error) {
                if (task.cancelRequested || /task cancelled/i.test(String(error?.message || ''))) {
                    task.status = TaskStatus.CANCELLED;
                    task.completedAt = new Date().toISOString();
                    this.taskResults.set(task.id, task);
                    this._notifyListeners(task.id, TaskStatus.CANCELLED, task.progress || 0);
                } else {
                    task.status = TaskStatus.FAILED;
                    task.error = {
                        message: error.message,
                        stack: error.stack,
                        code: error.code,
                    };
                    task.completedAt = new Date().toISOString();
                    this.taskResults.set(task.id, task);
                    console.error(`Task ${task.id} failed:`, error);
                    this._notifyListeners(task.id, TaskStatus.FAILED, 0, null, task.error);
                }
            } finally {
                task._cancelFn = null;
                cancelTaskExecution = null;
                this.currentTask = null;
            }
        }

        this.running = false;
    }

    /**
     * Export task history to JSON for debugging
     */
    async exportHistory() {
        const tasks = this.getAllTasks();
        return {
            exportedAt: new Date().toISOString(),
            taskCount: tasks.length,
            tasks: tasks.map(t => ({
                ...t,
                handler: undefined, // Don't export function
            })),
        };
    }
}

// Singleton instance
export const taskManager = new BackgroundTaskManager();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━████████
// Notification Service (using native alerts and toasts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━████████

import { Alert } from 'react-native';

export class NotificationService {
    /**
     * Show a toast-like notification (uses native Alert for now)
     */
    static showNotification(title, message, duration = 3000) {
        Alert.alert(title, message, [{ text: 'OK' }]);
    }

    /**
     * Show task progress notification
     */
    static showTaskProgress(taskMetadata, progress) {
        // In a real app, you might use react-native-toasts or similar
        // For now, just log it
        console.log(`Task: ${taskMetadata.name} - ${progress}%`);
    }

    /**
     * Show task completion notification
     */
    static showTaskComplete(taskMetadata, result) {
        const message = taskMetadata.description
            ? `${taskMetadata.description}\n✓ Completed`
            : 'Task completed successfully';

        if (taskMetadata.type === TaskType.SCAN_RECEIPT) {
            Alert.alert('Success', 'Receipt scanned successfully.', [
                { text: 'Later', style: 'cancel' },
                {
                    text: 'Open Scan',
                    onPress: () => {
                        try {
                            router.push('/receipt-scanner');
                        } catch {
                            // Navigation best effort only.
                        }
                    },
                },
            ]);
            return;
        }

        this.showNotification('Success', message);
    }

    /**
     * Show task failure notification
     */
    static showTaskFailed(taskMetadata, error) {
        const message = `${taskMetadata.name} failed:\n${error.message}`;
        this.showNotification('Error', message);
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━████████
// Higher-level task creation helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━████████

/**
 * Enqueue a receipt scanning task
 * @param {Object} input - Receipt image input (uri or base64)
 * @param {Function} scanFunction - The async scan function to call
 * @param {Object} options - Additional options
 */
export function enqueueReceiptScan(input, scanFunction, options = {}) {
    const taskId = taskManager.enqueueTask(
        TaskType.SCAN_RECEIPT,
        async (reportProgress, taskControl) => {
            reportProgress(10);
            try {
                const result = await scanFunction(input, (token) => {
                    // Update progress based on token streaming
                    reportProgress(Math.min(90, 10 + token.length / 100));
                }, taskControl);
                reportProgress(100);
                return result;
            } catch (err) {
                throw new Error(`Receipt scan failed: ${err.message}`);
            }
        },
        {
            name: options.name || 'Scan Receipt',
            description: options.description || 'Processing receipt image...',
        }
    );

    // Auto-notify on completion
    taskManager.onTaskUpdate((id, status, progress, result, error) => {
        if (id !== taskId) return;

        if (status === TaskStatus.COMPLETED) {
            updateReceiptScanSession({
                taskId,
                status: 'completed',
                result: result?.data || result,
                error: null,
            });
            NotificationService.showTaskComplete(
                { name: 'Receipt Scan', description: 'Receipt scanned successfully', type: TaskType.SCAN_RECEIPT },
                result
            );
        } else if (status === TaskStatus.FAILED) {
            updateReceiptScanSession({
                taskId,
                status: 'failed',
                error: error?.message || 'Receipt scan failed',
            });
            NotificationService.showTaskFailed(
                { name: 'Receipt Scan' },
                error
            );
        } else if (status === TaskStatus.CANCELLED) {
            updateReceiptScanSession({
                taskId: null,
                status: 'cancelled',
                result: null,
            });
        }
    });

    return taskId;
}

/**
 * Enqueue a PDF import task
 * @param {string} filePath - Path to PDF file
 * @param {Function} importFunction - The async import function to call
 * @param {Object} options - Additional options
 */
export function enqueuePdfImport(filePath, importFunction, options = {}) {
    const taskId = taskManager.enqueueTask(
        TaskType.IMPORT_PDF,
        async (reportProgress, taskControl) => {
            reportProgress(10);
            try {
                const result = await importFunction(filePath, (stage, progress) => {
                    // Update progress based on stage
                    const stageProgress = {
                        extracting: 10,
                        parsing: 40,
                        validating: 80,
                    };
                    const baseProgress = stageProgress[stage] || 10;
                    reportProgress(baseProgress + (progress || 0));
                }, taskControl);
                reportProgress(100);
                return result;
            } catch (err) {
                throw new Error(`PDF import failed: ${err.message}`);
            }
        },
        {
            name: options.name || 'Import PDF',
            description: options.description || 'Processing PDF file...',
        }
    );

    // Auto-notify on completion
    taskManager.onTaskUpdate((id, status, progress, result, error) => {
        if (id !== taskId) return;

        if (status === TaskStatus.COMPLETED) {
            NotificationService.showTaskComplete(
                {
                    name: 'PDF Import',
                    description: `Imported ${result?.transactionCount || 0} transactions`,
                },
                result
            );
        } else if (status === TaskStatus.FAILED) {
            NotificationService.showTaskFailed(
                { name: 'PDF Import' },
                error
            );
        }
    });

    return taskId;
}
