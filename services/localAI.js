// On-Device AI Service using llama.rn (llama.cpp React Native binding)
// Manages local GGUF model lifecycle: download, init, completion

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initLlama } from 'llama.rn';
import { getModelConfig, LOCAL_MODELS, getAllModels } from './localAIConfig';

const ACTIVE_MODEL_KEY = '@financeflow_active_local_model';
const MODEL_CONTEXT_OVERRIDES_KEY = '@financeflow_model_context_overrides';
const DOWNLOAD_JOB_KEY = '@financeflow_model_download_job_v1';

// Qwen ChatML stop tokens
const STOP_WORDS = [
    '\x3c|im_end|\x3e',
    '\x3c|endoftext|\x3e',
    '\x3c/s\x3e',
];

// ─── State ────────────────────────────────────
let llamaContext = null;
let activeModelId = 'qwen3.5-0.8b'; // Default fallback
let modelStatus = 'idle'; // idle | downloading | paused | downloaded | loading | ready | error
let downloadProgress = 0;
let statusListeners = [];
let isCheckingStatus = false;
let modelContextOverrides = {};
let overridesLoaded = false;
let multimodalInitialized = false;
let completionQueue = Promise.resolve();
let activeCompletions = 0;
let pendingRelease = false;
let currentDownloadPromise = null;
let currentDownloadModelId = null;
let autoResumeChecked = false;
let llmResumable = null;
let visionResumable = null;
let lastDownloadCallback = null;
let pauseRequested = false;


function queueCompletion(taskFn) {
    activeCompletions += 1;
    const run = completionQueue.then(taskFn, taskFn);
    completionQueue = run.catch(() => undefined);
    return run.finally(() => {
        activeCompletions = Math.max(0, activeCompletions - 1);
        if (activeCompletions === 0 && pendingRelease) {
            pendingRelease = false;
            releaseModelInternal().catch(() => undefined);
        }
    });
}

async function loadDownloadJob() {
    try {
        const raw = await AsyncStorage.getItem(DOWNLOAD_JOB_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function saveDownloadJob(job) {
    try {
        await AsyncStorage.setItem(DOWNLOAD_JOB_KEY, JSON.stringify(job));
    } catch {
        // Best effort persistence only.
    }
}

async function clearDownloadJob() {
    try {
        await AsyncStorage.removeItem(DOWNLOAD_JOB_KEY);
    } catch {
        // Best effort persistence only.
    }
}


async function maybeResumeDownloadJob() {
    if (autoResumeChecked || Platform.OS === 'web') return;
    autoResumeChecked = true;

    const pending = await loadDownloadJob();
    if (!pending?.modelId) return;

    const done = await isModelDownloaded(pending.modelId);
    if (done) {
        await clearDownloadJob();
        return;
    }

    modelStatus = 'downloading';
    downloadProgress = Number.isFinite(pending.lastProgress) ? pending.lastProgress : 0;
    notifyListeners();

    downloadModel(pending.modelId).catch((err) => {
        console.warn('Auto-resume model download failed:', err?.message || err);
    });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

async function ensureOverridesLoaded() {
    if (overridesLoaded) return;
    try {
        const raw = await AsyncStorage.getItem(MODEL_CONTEXT_OVERRIDES_KEY);
        modelContextOverrides = raw ? JSON.parse(raw) : {};
    } catch {
        modelContextOverrides = {};
    }
    overridesLoaded = true;
}

function resolveModelContextLength(config, id) {
    const min = config.minContextLength || 1024;
    const max = config.maxContextLength || config.contextLength || 4096;
    const override = modelContextOverrides[id];
    const candidate = Number.isFinite(override) ? override : config.contextLength;
    return clamp(candidate, min, max);
}

export function getContextPresets(config) {
    const min = config.minContextLength || 1024;
    const max = config.maxContextLength || config.contextLength || 4096;

    return [
        { label: 'Lowest', value: clamp(2048, min, max) },
        { label: 'Low', value: clamp(4096, min, max) },
        { label: 'Medium', value: clamp(8192, min, max) },
        { label: 'High', value: clamp(16384, min, max) },
        { label: 'Higher', value: clamp(24576, min, max) },
        { label: 'Maximum', value: clamp(32768, min, max) },
    ];
}

function describeLikelyCause(error, config, taskLabel) {
    const raw = String(error?.message || error || 'Unknown error');
    const lower = raw.toLowerCase();
    const task = taskLabel || 'request';

    if (lower.includes('out of memory') || lower.includes('oom') || lower.includes('malloc')) {
        return `${task} failed due to memory pressure (model too heavy for current RAM/settings).`;
    }

    if (lower.includes('mmproj') || lower.includes('multimodal') || lower.includes('vision')) {
        return `${task} failed because vision projector initialization failed for this model/build.`;
    }

    if (lower.includes('not downloaded')) {
        return `${task} failed because model files are missing or incomplete.`;
    }

    const modelName = config?.name || 'Active model';
    return `${task} failed while loading or running ${modelName}. Cause may be model/runtime compatibility on low-end hardware.`;
}

function normalizeModelId(id) {
    const found = getAllModels().find((m) => m.id === id);
    return found ? id : LOCAL_MODELS[0].id;
}

function notifyListeners() {
    const state = getModelState();
    statusListeners.forEach(fn => fn(state));
}

async function ensureMultimodalReady(config) {
    if (!config.visionFileName) {
        throw new Error('This model does not provide vision support files.');
    }

    if (!llamaContext) {
        throw new Error('Model context is not initialized.');
    }

    if (multimodalInitialized) {
        return true;
    }

    const visionPath = `${FileSystem.documentDirectory}models/${config.visionFileName}`;
    try {
        const success = await llamaContext.initMultimodal({
            path: visionPath,
            use_gpu: config.visionUseGpu === true,
        });

        if (!success) {
            throw new Error('Vision projector initialization returned false.');
        }

        multimodalInitialized = true;
        return true;
    } catch (visionError) {
        throw new Error(`Vision init failed for ${config.name}. Cause: ${visionError?.message || 'unknown native failure'}`);
    }
}

export function addStatusListener(fn) {
    statusListeners.push(fn);
    return () => {
        statusListeners = statusListeners.filter(l => l !== fn);
    };
}

export function getModelState() {
    const config = getModelConfig(activeModelId);
    return {
        status: modelStatus,
        downloadProgress,
        isReady: modelStatus === 'ready',
        isNative: Platform.OS !== 'web',
        modelName: config.name,
        modelSize: config.sizeLabel,
        activeModelId,
        contextLength: resolveModelContextLength(config, activeModelId),
        minContextLength: config.minContextLength || 1024,
        maxContextLength: config.maxContextLength || config.contextLength || 4096,
    };
}

export function getActiveModelConfig() {
    return getModelConfig(activeModelId);
}

export function activeModelSupportsVision() {
    const config = getModelConfig(activeModelId);
    return !!config.visionFileName;
}

export async function getActiveModelId() {
    try {
        const stored = await AsyncStorage.getItem(ACTIVE_MODEL_KEY);
        if (stored) {
            const normalized = normalizeModelId(stored);
            activeModelId = normalized;
            if (normalized !== stored) {
                await AsyncStorage.setItem(ACTIVE_MODEL_KEY, normalized);
            }
        }
    } catch { }
    await ensureOverridesLoaded();
    return activeModelId;
}

export async function getModelContextLength(id = activeModelId) {
    await ensureOverridesLoaded();
    const config = getModelConfig(id);
    return resolveModelContextLength(config, id);
}

export async function setModelContextLength(id, value) {
    await ensureOverridesLoaded();
    const config = getModelConfig(id);
    const min = config.minContextLength || 1024;
    const max = config.maxContextLength || config.contextLength || 4096;
    const normalized = clamp(parseInt(value, 10) || config.contextLength, min, max);

    modelContextOverrides[id] = normalized;
    await AsyncStorage.setItem(MODEL_CONTEXT_OVERRIDES_KEY, JSON.stringify(modelContextOverrides));

    if (id === activeModelId && llamaContext) {
        await releaseModel();
    }

    notifyListeners();
    return normalized;
}

export function validateActiveModelForTask(task) {
    const config = getModelConfig(activeModelId);
    if (task === 'chatbot' && config.recommendedForChat === false) {
        throw new Error('Model blocked for chatbot to prevent crash. Cause: this vision model is unstable for long chat sessions on low-end hardware. Use Qwen 3.5 0.8B for chatbot, or lower context to 1024.');
    }
    if (task === 'pdf-read' && config.recommendedForPdf === false) {
        throw new Error('Model blocked for PDF parsing. Cause: this model is not recommended for long OCR/document text parsing. Use LightOnOCR 1B, Qwen3 VL 2B IQ4_XS, Qwen2.5 VL 2B Q4, Moondream Vision, or Qwen 3.5 0.8B with OCR mode.');
    }
    return true;
}

export async function setActiveModelId(id) {
    activeModelId = normalizeModelId(id);
    try {
        await AsyncStorage.setItem(ACTIVE_MODEL_KEY, activeModelId);
    } catch { }
    // If ready, we trigger a release to force re-init next time
    if (llamaContext) await releaseModel();
    await checkModelStatus();
}

// ─── Model File Management ────────────────────
function getModelPath(id = activeModelId) {
    const config = getModelConfig(id);
    return `${FileSystem.documentDirectory}models/${config.fileName}`;
}

function getLegacyModelPaths(id = activeModelId) {
    const config = getModelConfig(id);
    return (config.legacyFileNames || []).map((fileName) => `${FileSystem.documentDirectory}models/${fileName}`);
}

async function cleanupLegacyModelFiles(id = activeModelId) {
    const legacyPaths = getLegacyModelPaths(id);
    for (const filePath of legacyPaths) {
        const info = await FileSystem.getInfoAsync(filePath);
        if (info.exists) {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
        }
    }
}

function toDirectDownloadUrl(url) {
    if (!url) return url;
    return url.includes('?') ? `${url}&download=true` : `${url}?download=true`;
}

export async function isModelDownloaded(id = activeModelId) {
    if (Platform.OS === 'web') return false;
    const config = getModelConfig(id);
    const modelPath = getModelPath(id);
    try {
        const info = await FileSystem.getInfoAsync(modelPath);
        if (!info.exists) return false;
        if (config.visionFileName) {
            const visionPath = `${FileSystem.documentDirectory}models/${config.visionFileName}`;
            const visionInfo = await FileSystem.getInfoAsync(visionPath);
            if (!visionInfo.exists) return false;
        }
        return true;
    } catch {
        return false;
    }
}



export async function pauseDownloadModel() {
    if (modelStatus !== 'downloading') return;
    pauseRequested = true;
    modelStatus = 'paused';
    notifyListeners();
    try {
        if (llmResumable) await llmResumable.pauseAsync();
        if (visionResumable) await visionResumable.pauseAsync();
    } catch (e) { console.warn('Failed to pause properly:', e); }
}

export async function resumeDownloadModel(id, onProgress) {
    if (modelStatus !== 'paused' && modelStatus !== 'error') return;
    return downloadModel(id || activeModelId, onProgress || lastDownloadCallback);
}

export async function cancelDownloadModel(id) {
    pauseRequested = true;
    try {
        if (llmResumable) await llmResumable.pauseAsync();
        if (visionResumable) await visionResumable.pauseAsync();
    } catch (e) { }
    llmResumable = null;
    visionResumable = null;
    currentDownloadPromise = null;
    currentDownloadModelId = null;
    await clearDownloadJob();
    const config = getModelConfig(id || activeModelId);
    if (config) {
        const modelPath = `${FileSystem.documentDirectory}models/${config.fileName}`;
        const info = await FileSystem.getInfoAsync(modelPath);
        if (info.exists) await FileSystem.deleteAsync(modelPath, { idempotent: true });

        if (config.visionFileName) {
            const visionPath = `${FileSystem.documentDirectory}models/${config.visionFileName}`;
            const vInfo = await FileSystem.getInfoAsync(visionPath);
            if (vInfo.exists) await FileSystem.deleteAsync(visionPath, { idempotent: true });
        }
    }
    if ((id || activeModelId) === activeModelId) {
        modelStatus = 'idle';
        downloadProgress = 0;
        notifyListeners();
    }
}
export async function downloadModel(id, onProgress) {
    if (Platform.OS === 'web') {
        throw new Error('On-device AI is not available on web. Use cloud AI instead.');
    }

    if (currentDownloadPromise && currentDownloadModelId === id && modelStatus === 'downloading') {
        return currentDownloadPromise;
    }

    pauseRequested = false;
    modelStatus = 'downloading';
    if (onProgress) lastDownloadCallback = onProgress;
    notifyListeners();

    const runDownload = async () => {
        let hasVision = false;
        let lastProgress = 0;
        let llmTotalBytes = 0;
        let llmWrittenBytes = 0;
        let visionTotalBytes = 0;
        let visionWrittenBytes = 0;
        try {
            const modelsDir = `${FileSystem.documentDirectory}models/`;
            const dirInfo = await FileSystem.getInfoAsync(modelsDir);
            if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });

            const config = getModelConfig(id);
            const modelPath = getModelPath(id);
            hasVision = !!config.visionUrl;
            const requestHeaders = { Accept: 'application/octet-stream', 'User-Agent': 'FinanceFlow/1.0' };

            await cleanupLegacyModelFiles(id);

            const savedJob = await loadDownloadJob();
            let job = savedJob?.modelId === id
                ? savedJob
                : {
                    modelId: id, phase: 'llm', lastProgress: 0,
                    llmTotalBytes: config.sizeBytes || 0, llmWrittenBytes: 0,
                    visionTotalBytes: config.visionSizeBytes || 0, visionWrittenBytes: 0,
                    llmSavable: null, visionSavable: null, updatedAt: new Date().toISOString(),
                };

            lastProgress = Number.isFinite(job.lastProgress) ? job.lastProgress : 0;
            llmTotalBytes = Number.isFinite(job.llmTotalBytes) && job.llmTotalBytes > 0 ? job.llmTotalBytes : (config.sizeBytes || 0);
            llmWrittenBytes = Math.max(0, Math.min(Number(job.llmWrittenBytes) || 0, llmTotalBytes || Number.MAX_SAFE_INTEGER));
            visionTotalBytes = Number.isFinite(job.visionTotalBytes) && job.visionTotalBytes > 0 ? job.visionTotalBytes : (config.visionSizeBytes || 0);
            visionWrittenBytes = Math.max(0, Math.min(Number(job.visionWrittenBytes) || 0, visionTotalBytes || Number.MAX_SAFE_INTEGER));

            if (lastProgress > 0) {
                downloadProgress = lastProgress;
                if (lastDownloadCallback) lastDownloadCallback(downloadProgress);
                notifyListeners();
            }

            let lastPersistTs = 0;
            const persistJob = async (extra = {}) => {
                const now = Date.now();
                if (!extra.force && now - lastPersistTs < 1000) return;
                job = { ...job, ...extra, modelId: id, llmTotalBytes, llmWrittenBytes, visionTotalBytes, visionWrittenBytes, lastProgress, updatedAt: new Date().toISOString() };
                await saveDownloadJob(job);
                lastPersistTs = now;
            };

            const emitProgress = () => {
                const modelKnown = Math.max(1, Number(config.sizeBytes || llmTotalBytes || 1));
                const visionKnown = hasVision ? Math.max(1, Number(config.visionSizeBytes || visionTotalBytes || 1)) : 0;
                const totalBytes = modelKnown + visionKnown;
                const effectiveLlmWritten = Math.min(modelKnown, Math.max(llmWrittenBytes, 0));
                const effectiveVisionWritten = hasVision ? Math.min(visionKnown, Math.max(visionWrittenBytes, 0)) : 0;
                const writtenBytes = effectiveLlmWritten + effectiveVisionWritten;
                if (totalBytes <= 0) return;
                const pct = Math.min(100, Math.max(lastProgress, Math.round((writtenBytes / totalBytes) * 100)));
                if (pct === lastProgress) return;
                lastProgress = pct;
                downloadProgress = pct;
                if (lastDownloadCallback) lastDownloadCallback(pct);
                notifyListeners();
                persistJob();
            };

            const resolveResumeData = (value) => (value && typeof value !== 'string') ? value.resumeData : value;

            if (job.phase === 'llm') {
                const llmResumeData = resolveResumeData(job.llmSavable);
                llmResumable = FileSystem.createDownloadResumable(
                    toDirectDownloadUrl(config.downloadUrl), modelPath, { headers: requestHeaders },
                    async (progress) => {
                        if (pauseRequested) return;
                        if (progress.totalBytesExpectedToWrite > 0) {
                            llmTotalBytes = Math.max(config.sizeBytes || 0, progress.totalBytesExpectedToWrite);
                            llmWrittenBytes = Math.min(progress.totalBytesWritten, llmTotalBytes);
                            emitProgress();
                            if (llmResumable) await persistJob({ phase: 'llm', llmSavable: llmResumable.savable()?.resumeData || null });
                        }
                    }, llmResumeData
                );

                await persistJob({ phase: 'llm', llmSavable: llmResumable.savable()?.resumeData || null, force: true });

                let result = llmResumeData ? await llmResumable.resumeAsync() : await llmResumable.downloadAsync();
                if (pauseRequested) return;
                if (!result || !result.uri) throw new Error('LLM Download failed — no file URI returned');
                if (result.status && result.status >= 400) {
                    await FileSystem.deleteAsync(modelPath, { idempotent: true });
                    throw new Error(`LLM Download failed with HTTP ${result.status}.`);
                }

                const info = await FileSystem.getInfoAsync(modelPath);
                if (info.exists && info.size < 5 * 1024 * 1024) {
                    await FileSystem.deleteAsync(modelPath);
                    throw new Error(`LLM Download failed. URL might be broken (Received ${info.size} bytes).`);
                }

                llmWrittenBytes = Math.max(llmWrittenBytes, info.size || llmTotalBytes);
                emitProgress();
                await persistJob({ phase: hasVision ? 'vision' : 'done', llmSavable: null, force: true });
            }

            if (hasVision && (job.phase === 'vision' || job.phase === 'llm')) {
                const visionPath = `${FileSystem.documentDirectory}models/${config.visionFileName}`;
                const visionResumeData = resolveResumeData(job.visionSavable);
                visionResumable = FileSystem.createDownloadResumable(
                    toDirectDownloadUrl(config.visionUrl), visionPath, { headers: requestHeaders },
                    (progress) => {
                        if (pauseRequested) return;
                        if (progress.totalBytesExpectedToWrite > 0) {
                            visionTotalBytes = Math.max(config.visionSizeBytes || 0, progress.totalBytesExpectedToWrite);
                            visionWrittenBytes = Math.min(progress.totalBytesWritten, visionTotalBytes);
                            emitProgress();
                            if (visionResumable) persistJob({ phase: 'vision', visionSavable: visionResumable.savable()?.resumeData || null });
                        }
                    }, visionResumeData
                );

                await persistJob({ phase: 'vision', visionSavable: visionResumable.savable()?.resumeData || null, force: true });

                let result = visionResumeData ? await visionResumable.resumeAsync() : await visionResumable.downloadAsync();
                if (pauseRequested) return;
                if (!result || !result.uri) throw new Error('Vision array Download failed');
                if (result.status && result.status >= 400) {
                    await FileSystem.deleteAsync(visionPath, { idempotent: true });
                    throw new Error(`Vision array Download failed with HTTP ${result.status}.`);
                }

                const visionInfo = await FileSystem.getInfoAsync(visionPath);
                if (visionInfo.exists && visionInfo.size < 5 * 1024 * 1024) {
                    await FileSystem.deleteAsync(visionPath);
                    throw new Error(`Vision array Download failed (Received ${visionInfo.size} bytes).`);
                }

                visionWrittenBytes = Math.max(visionWrittenBytes, visionInfo.size || visionTotalBytes);
                emitProgress();
                await persistJob({ phase: 'done', visionSavable: null, force: true });
            }

            if (pauseRequested) return;

            await clearDownloadJob();
            llmResumable = null;
            visionResumable = null;

            if (id === activeModelId) {
                modelStatus = 'downloaded';
                downloadProgress = 100;
                notifyListeners();
            }
            return true;
        } catch (error) {
            if (pauseRequested) return;
            await saveDownloadJob({
                ...(await loadDownloadJob()),
                modelId: id, phase: hasVision ? 'vision' : 'llm',
                lastProgress, llmTotalBytes, llmWrittenBytes, visionTotalBytes, visionWrittenBytes,
                updatedAt: new Date().toISOString(),
            });

            if (id === activeModelId) {
                modelStatus = 'error';
                notifyListeners();
            }
            throw error;
        }
    };

    currentDownloadModelId = id;
    currentDownloadPromise = runDownload().finally(() => {
        if (!pauseRequested) {
            currentDownloadPromise = null;
            currentDownloadModelId = null;
        }
    });

    return currentDownloadPromise;
}

export async function deleteModel(id) {
    try {
        const config = getModelConfig(id);
        const modelPath = getModelPath(id);
        const info = await FileSystem.getInfoAsync(modelPath);
        if (info.exists) {
            await FileSystem.deleteAsync(modelPath);
        }

        await cleanupLegacyModelFiles(id);

        if (config.visionFileName) {
            const visionPath = `${FileSystem.documentDirectory}models/${config.visionFileName}`;
            const stillUsedByOtherModel = getAllModels().some((m) => {
                if (m.id === id) return false;
                if (!m.visionFileName || m.visionFileName !== config.visionFileName) return false;
                return true;
            });

            if (!stillUsedByOtherModel) {
                const visionInfo = await FileSystem.getInfoAsync(visionPath);
                if (visionInfo.exists) {
                    await FileSystem.deleteAsync(visionPath);
                }
            }
        }
        if (id === activeModelId) {
            modelStatus = 'idle';
            downloadProgress = 0;
            if (llamaContext) await releaseModel();
            else notifyListeners();
        }
    } catch (error) {
        console.error('Failed to delete model:', error);
    }
}

// ─── Model Initialization ─────────────────────



export async function initModel() {
    if (Platform.OS === 'web') return false;
    await getActiveModelId(); // ensure we have newest active selection
    if (llamaContext) return true; // Already loaded

    if (!(await isModelDownloaded(activeModelId))) {
        throw new Error('Model not downloaded. Please download it first from Settings.');
    }

    modelStatus = 'loading';
    notifyListeners();

    try {
        await ensureOverridesLoaded();
        const config = getModelConfig(activeModelId);
        const modelPath = getModelPath(activeModelId);
        const nCtx = resolveModelContextLength(config, activeModelId);

        const initOptions = {
            model: modelPath,
            use_mlock: false,
            n_ctx: nCtx,
            n_gpu_layers: Platform.OS === 'ios' ? 99 : (config.gpuLayers || 0),
            n_threads: Platform.OS === 'android' ? 4 : 6,
            flash_attn: true,
            ctx_shift: config.visionFileName ? false : true,
        };

        // If the model supports thinking, check the user's preference
        if (config.canThink) {
            let isThinkingEnabled = false;
            try {
                const rawPref = await AsyncStorage.getItem('@financeflow_ai_thinking_prefs_v1');
                const prefs = rawPref ? JSON.parse(rawPref) : {};
                isThinkingEnabled = !!prefs[activeModelId];
            } catch { }

            // If user explicitly disabled it, forcefully budget it to 0
            if (!isThinkingEnabled) {
                initOptions.reasoning_budget = 0;
            }
        }

        llamaContext = await initLlama(initOptions);
        multimodalInitialized = false;

        modelStatus = 'ready';
        notifyListeners();
        return true;
    } catch (error) {
        modelStatus = 'error';
        llamaContext = null;
        notifyListeners();
        console.error('Failed to init LlamaContext:', error);
        const config = getModelConfig(activeModelId);
        const cause = describeLikelyCause(error, config, 'Model initialization');
        throw new Error(`${cause} Raw error: ${error?.message || 'unknown'}`);
    }
}

export async function releaseModel() {
    if (activeCompletions > 0) {
        pendingRelease = true;
        try {
            await completionQueue;
        } catch {
            // Ignore completion errors while waiting to release.
        }
    }

    pendingRelease = false;
    await releaseModelInternal();
}

async function releaseModelInternal() {
    if (llamaContext) {
        try {
            await llamaContext.release();
        } catch { }
        llamaContext = null;
        multimodalInitialized = false;
    }
    modelStatus = 'idle';
    notifyListeners();
}

// ─── Chat Completion ──────────────────────────
export async function stopCurrentCompletion() {
    if (llamaContext && activeCompletions > 0) {
        try {
            await llamaContext.stopCompletion();
        } catch (e) {
            console.warn('Failed to stop local AI completion:', e);
        }
    }
}

export async function chatCompletion(messages, onToken, options = {}) {
    try {
        if (!llamaContext) {
            await initModel();
        }

        if (!llamaContext) {
            throw new Error('Local AI model is not loaded.');
        }

        const config = getModelConfig(activeModelId);
        const completionParams = {
            n_predict: options.maxTokens || 512,
            stop: STOP_WORDS,
            temperature: options.temperature || 0.7,
            top_p: options.topP || 0.8,
            top_k: options.topK || 20,
            repeat_penalty: options.repeatPenalty || 1.05,
        };

        if (config.visionFileName) {
            // Vision-language models (SmolVLM, Qwen2.5-VL, etc.) use messages array format.
            completionParams.messages = messages.map((m) => ({
                role: m.role,
                content: [{ type: 'text', text: m.content }],
            }));
        } else {
            // Qwen ChatML raw prompt format for text-only models.
            const rawPrompt = messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>`).join('\n') + '\n<|im_start|>assistant\n';
            completionParams.prompt = rawPrompt;
        }

        const result = await queueCompletion(async () => llamaContext.completion(
            completionParams,
            (data) => {
                if (onToken && data.token) {
                    onToken(data.token);
                }
            }
        ));

        return result.text || '';
    } catch (error) {
        const config = getModelConfig(activeModelId);
        const cause = describeLikelyCause(error, config, 'Chatbot request');
        throw new Error(`${cause} Raw error: ${error?.message || 'unknown'}`);
    }
}

export async function textCompletion(prompt, imagePath = null, onToken, options = {}) {
    try {
        if (!llamaContext) {
            await initModel();
        }

        if (!llamaContext) {
            throw new Error('Local AI model is not loaded.');
        }

        // Format as ChatML and pre-close <think></think> when disableThinking is set
        // This stops Qwen 3.5 from wasting 400+ tokens on internal thinking before outputting JSON!
        const formattedPrompt = options.disableThinking
            ? `<|im_start|>system\nYou are a fast JSON extraction engine. Output valid JSON only.<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n<think>\n</think>\n`
            : `<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;

        const completionParams = {
            prompt: formattedPrompt,
            n_predict: options.maxTokens || 768,
            stop: [...STOP_WORDS, ...(options.stop || [])],
            temperature: options.temperature ?? 0.1,
            top_p: options.topP || 0.9,
            top_k: options.topK || 20,
        };

        if (imagePath) {
            const config = getModelConfig(activeModelId);
            if (config.visionFileName) {
                await ensureMultimodalReady(config);
            }

            completionParams.messages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imagePath } }
                    ]
                }
            ];
            delete completionParams.prompt;
        }

        const result = await queueCompletion(async () => llamaContext.completion(
            completionParams,
            (data) => {
                if (onToken && data.token) {
                    onToken(data.token);
                }
            }
        ));

        return result.text || '';
    } catch (error) {
        const config = getModelConfig(activeModelId);
        const cause = describeLikelyCause(error, config, 'Receipt parsing');
        throw new Error(`${cause} Raw error: ${error?.message || 'unknown'}`);
    }
}

// ─── Check status on startup ──────────────────
export async function checkModelStatus() {
    if (Platform.OS === 'web' || isCheckingStatus) return;
    isCheckingStatus = true;
    try {
        await maybeResumeDownloadJob();
        await getActiveModelId();
        await ensureOverridesLoaded();
        const downloaded = await isModelDownloaded(activeModelId);
        const pending = await loadDownloadJob();
        const hasActiveDownload = !!currentDownloadPromise && currentDownloadModelId === activeModelId;

        if (downloaded && pending?.modelId === activeModelId) {
            await clearDownloadJob();
        }

        if (hasActiveDownload) {
            modelStatus = 'downloading';
        } else if (llamaContext) {
            modelStatus = 'ready';
        } else if (pending && pending.modelId === activeModelId) {
            modelStatus = 'paused';
            downloadProgress = pending.lastProgress || 0;
        } else {
            modelStatus = downloaded ? 'downloaded' : 'idle';
        }

        if (downloaded && !hasActiveDownload) {
            downloadProgress = 100;
        }
        notifyListeners();
    } finally {
        isCheckingStatus = false;
    }
}

// ─── Utility ──────────────────────────────────
export function isLocalAIAvailable() {
    return Platform.OS !== 'web' && modelStatus === 'ready';
}

export function isLocalAIDownloaded() {
    return modelStatus === 'downloaded' || modelStatus === 'ready' || modelStatus === 'loading';
}
