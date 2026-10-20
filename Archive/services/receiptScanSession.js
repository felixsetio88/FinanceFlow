import AsyncStorage from '@react-native-async-storage/async-storage';
import { taskManager, TaskStatus } from './backgroundTaskManager';

const SESSION_KEY = '@financeflow_receipt_scan_session';

let sessionCache = null;
let hasLoaded = false;

function normalizeSession(input = {}) {
    return {
        taskId: input.taskId || null,
        status: input.status || 'idle', // idle | running | completed | cancelled | failed
        imageAsset: input.imageAsset || null,
        result: input.result || null,
        error: input.error || null,
        updatedAt: input.updatedAt || new Date().toISOString(),
    };
}

/**
 * Check if a persisted "running" session is still actually alive in the
 * task manager. After a crash the taskManager singleton is freshly created
 * (empty), so any taskId from a previous process no longer exists.
 * In that case we downgrade the status to 'idle' so the UI doesn't get
 * stuck showing "AI is analyzing your receipt" forever.
 */
function reconcileSessionWithTaskManager(session) {
    if (session.status !== 'running' || !session.taskId) return session;

    const task = taskManager.getTask(session.taskId);
    const isAlive =
        task &&
        (task.status === TaskStatus.RUNNING || task.status === TaskStatus.PENDING);

    if (isAlive) return session;

    // The task no longer exists (app restarted / crashed) — reset to idle
    return normalizeSession({
        imageAsset: session.imageAsset, // preserve the image so the user can retry
        status: 'idle',
        taskId: null,
        result: null,
        error: null,
    });
}

export async function loadReceiptScanSession() {
    // Always re-read from disk on first call per JS runtime lifetime.
    // Do NOT short-circuit with hasLoaded here — after a crash/reload the
    // module-level variables are reset to their initial values anyway, but
    // being explicit prevents subtle hot-reload edge cases.
    if (hasLoaded && sessionCache) return sessionCache;

    try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        const parsed = raw ? normalizeSession(JSON.parse(raw)) : normalizeSession();
        sessionCache = reconcileSessionWithTaskManager(parsed);

        // If we had to downgrade a stale running session, persist the correction
        // immediately so subsequent loads don't repeat the reconciliation work.
        if (parsed.status !== sessionCache.status) {
            try {
                await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionCache));
            } catch {
                // Best effort only
            }
        }
    } catch {
        sessionCache = normalizeSession();
    }

    hasLoaded = true;
    return sessionCache;
}

export function getReceiptScanSessionSync() {
    return sessionCache ? { ...sessionCache } : normalizeSession();
}

export async function updateReceiptScanSession(partial = {}) {
    const current = hasLoaded ? (sessionCache || normalizeSession()) : await loadReceiptScanSession();
    sessionCache = normalizeSession({ ...current, ...partial, updatedAt: new Date().toISOString() });

    try {
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionCache));
    } catch {
        // Best effort persistence only.
    }

    return sessionCache;
}

export async function clearReceiptScanSession(options = {}) {
    const preserveImage = !!options.preserveImage;
    const current = hasLoaded ? (sessionCache || normalizeSession()) : await loadReceiptScanSession();

    sessionCache = normalizeSession({
        imageAsset: preserveImage ? current.imageAsset : null,
    });

    try {
        await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionCache));
    } catch {
        // Best effort persistence only.
    }

    return sessionCache;
}