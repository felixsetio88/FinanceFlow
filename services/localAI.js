// On-Device AI Service using llama.rn (llama.cpp React Native binding)
// Manages Qwen 3.5 0.8B GGUF model lifecycle: download, init, completion

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getModelConfig, LOCAL_MODELS } from './localAIConfig';

const ACTIVE_MODEL_KEY = '@financeflow_active_local_model';

// Qwen ChatML stop tokens
const STOP_WORDS = [
    '\x3c|im_end|\x3e',
    '\x3c|endoftext|\x3e',
    '\x3c/s\x3e',
];

// ─── State ────────────────────────────────────
let llamaContext = null;
let activeModelId = 'qwen2.5-0.5b'; // Default fallback
let modelStatus = 'idle'; // idle | downloading | downloaded | loading | ready | error
let downloadProgress = 0;
let statusListeners = [];
let isCheckingStatus = false;

function notifyListeners() {
    const state = getModelState();
    statusListeners.forEach(fn => fn(state));
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
    };
}

export async function getActiveModelId() {
    try {
        const stored = await AsyncStorage.getItem(ACTIVE_MODEL_KEY);
        if (stored) activeModelId = stored;
    } catch { }
    return activeModelId;
}

export async function setActiveModelId(id) {
    activeModelId = id;
    try {
        await AsyncStorage.setItem(ACTIVE_MODEL_KEY, id);
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

export async function isModelDownloaded(id = activeModelId) {
    if (Platform.OS === 'web') return false;
    try {
        const info = await FileSystem.getInfoAsync(getModelPath(id));
        return info.exists && info.size > 100 * 1024 * 1024; // at least 100MB
    } catch {
        return false;
    }
}

export async function downloadModel(id, onProgress) {
    if (Platform.OS === 'web') {
        throw new Error('On-device AI is not available on web. Use cloud AI instead.');
    }

    modelStatus = 'downloading';
    downloadProgress = 0;
    notifyListeners();

    try {
        // Ensure models directory exists
        const modelsDir = `${FileSystem.documentDirectory}models/`;
        const dirInfo = await FileSystem.getInfoAsync(modelsDir);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
        }

        const config = getModelConfig(id);
        const modelPath = getModelPath(id);

        // Create download resumable
        const downloadResumable = FileSystem.createDownloadResumable(
            config.downloadUrl,
            modelPath,
            {},
            (progress) => {
                const pct = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
                downloadProgress = Math.round(pct * 100);
                if (onProgress) onProgress(downloadProgress);
                notifyListeners();
            }
        );

        const result = await downloadResumable.downloadAsync();

        if (result && result.uri) {
            // Only update active status if we just downloaded the currently selected active model
            if (id === activeModelId) {
                modelStatus = 'downloaded';
                downloadProgress = 100;
                notifyListeners();
            }
            return true;
        } else {
            throw new Error('Download failed — no file URI returned');
        }
    } catch (error) {
        if (id === activeModelId) {
            modelStatus = 'error';
            notifyListeners();
        }
        throw error;
    }
}

export async function deleteModel(id) {
    try {
        const modelPath = getModelPath(id);
        const info = await FileSystem.getInfoAsync(modelPath);
        if (info.exists) {
            await FileSystem.deleteAsync(modelPath);
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

    const downloaded = await isModelDownloaded(activeModelId);
    if (!downloaded) {
        throw new Error('Model not downloaded. Please download it first from Settings.');
    }

    modelStatus = 'loading';
    notifyListeners();

    try {
        const { initLlama } = require('llama.rn');
        const config = getModelConfig(activeModelId);
        const modelPath = getModelPath(activeModelId);

        llamaContext = await initLlama({
            model: modelPath,
            use_mlock: true,
            n_ctx: config.contextLength,
            n_gpu_layers: config.gpuLayers,
            n_threads: 4,
        });

        modelStatus = 'ready';
        notifyListeners();
        return true;
    } catch (error) {
        modelStatus = 'error';
        llamaContext = null;
        notifyListeners();
        console.error('Failed to init Llama:', error);
        throw error;
    }
}

export async function releaseModel() {
    if (llamaContext) {
        try {
            await llamaContext.release();
        } catch { }
        llamaContext = null;
    }
    modelStatus = 'idle';
    notifyListeners();
}

// ─── Chat Completion ──────────────────────────
export async function chatCompletion(messages, onToken, options = {}) {
    if (!llamaContext) {
        // Try to init
        await initModel();
    }

    if (!llamaContext) {
        throw new Error('Local AI model is not loaded.');
    }

    const result = await llamaContext.completion(
        {
            messages,
            n_predict: options.maxTokens || 512,
            stop: STOP_WORDS,
            temperature: options.temperature || 0.7,
            top_p: options.topP || 0.8,
            top_k: options.topK || 20,
            repeat_penalty: options.repeatPenalty || 1.05,
        },
        (data) => {
            if (onToken && data.token) {
                onToken(data.token);
            }
        }
    );

    return result.text || '';
}

// ─── Text Completion (for structured output) ──
export async function textCompletion(prompt, onToken, options = {}) {
    if (!llamaContext) {
        await initModel();
    }

    if (!llamaContext) {
        throw new Error('Local AI model is not loaded.');
    }

    const result = await llamaContext.completion(
        {
            prompt,
            n_predict: options.maxTokens || 1024,
            stop: [...STOP_WORDS, ...(options.stop || [])],
            temperature: options.temperature || 0.1,
            top_p: options.topP || 0.9,
            top_k: options.topK || 40,
        },
        (data) => {
            if (onToken && data.token) {
                onToken(data.token);
            }
        }
    );

    return result.text || '';
}

// ─── Check status on startup ──────────────────
export async function checkModelStatus() {
    if (Platform.OS === 'web' || isCheckingStatus) return;
    isCheckingStatus = true;
    try {
        await getActiveModelId();
        const downloaded = await isModelDownloaded(activeModelId);
        if (llamaContext) {
            modelStatus = 'ready';
        } else {
            modelStatus = downloaded ? 'downloaded' : 'idle';
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
