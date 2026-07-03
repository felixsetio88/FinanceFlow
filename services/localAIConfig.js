// Configuration for supported local AI models (llama.rn / GGUF)

export const LOCAL_MODELS = [
    {
        id: 'qwen3.5-0.8b',
        name: 'Qwen 3.5 0.8B Q4 (Image + Text)',
        description: 'Fastest speed, medium accuracy AI model for chatbot and receipt image workflows, suitable for lower-memory devices.',
        fileName: 'Qwen3.5-0.8B-Q4_K_M.gguf',
        legacyFileNames: ['Qwen2.5-0.5B-Instruct-Q4_K_M.gguf', 'Qwen3.5-2B-Q4_K_M.gguf'],
        downloadUrl: 'https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf',
        visionFileName: 'mmproj-Qwen3.5-0.8B-BF16.gguf',
        visionUrl: 'https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF/resolve/main/mmproj-Qwen3.5-0.8B-BF16.gguf',
        sizeBytes: 527502816,
        visionSizeBytes: 207345952,
        sizeLabel: '~734 MB Total',
        contextLength: 4096,
        minContextLength: 1024,
        maxContextLength: 32768,
        gpuLayers: 16,
        visionUseGpu: false,
        forceOcrPipeline: false,
        recommendedForChat: true,
        recommendedForReceipt: true,
        recommendedForPdf: true,
        canThink: true,
    },
    {
        id: 'qwen3.5-0.8b-q8',
        name: 'Qwen 3.5 0.8B Q8 (Image + Text)',
        description: 'Moderate speed, medium accuracy AI model for receipt image scanning and PDF recognition, suitable for mid-range devices.',
        fileName: 'Qwen3.5-0.8B-Q8_0.gguf',
        downloadUrl: 'https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q8_0.gguf',
        visionFileName: 'mmproj-Qwen3.5-0.8B-BF16.gguf',
        visionUrl: 'https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF/resolve/main/mmproj-Qwen3.5-0.8B-BF16.gguf',
        sizeBytes: 812000000,
        visionSizeBytes: 207345952,
        sizeLabel: '~1.0 GB Total',
        contextLength: 4096,
        minContextLength: 1024,
        maxContextLength: 32768,
        gpuLayers: 16,
        visionUseGpu: false,
        forceOcrPipeline: false,
        recommendedForChat: true,
        recommendedForReceipt: true,
        recommendedForPdf: true,
        canThink: false,
    },
    {
        id: 'qwen3-vl-2b-q2',
        name: 'Qwen3 VL 2B Q2 (Ultra-Light Vision)',
        description: 'Smallest quantization, fastest speed, lower accuracy, best for low-memory devices with vision capabilities.',
        fileName: 'Qwen3-VL-2B-Instruct-Q2_K.gguf',
        downloadUrl: 'https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3-VL-2B-Instruct-Q2_K.gguf',
        visionFileName: 'mmproj-F16.gguf',
        visionUrl: 'https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-F16.gguf',
        sizeBytes: 644023936,
        visionSizeBytes: 819395232,
        sizeLabel: '~1.42 GB Total',
        contextLength: 4096,
        minContextLength: 1024,
        maxContextLength: 32768,
        gpuLayers: 0,
        visionUseGpu: false,
        forceOcrPipeline: false,
        recommendedForChat: true,
        recommendedForReceipt: true,
        recommendedForPdf: true,
        canThink: false,
    },
    {
        id: 'qwen3-vl-2b-q3',
        name: 'Qwen3 VL 2B Q3 (Light Vision)',
        description: 'Light quantization, medium speed, good accuracy balance for vision tasks on mid-range devices.',
        fileName: 'Qwen3-VL-2B-Instruct-Q3_K_M.gguf',
        downloadUrl: 'https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3-VL-2B-Instruct-Q3_K_M.gguf',
        visionFileName: 'mmproj-F16.gguf',
        visionUrl: 'https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-F16.gguf',
        sizeBytes: 787832064,
        visionSizeBytes: 819395232,
        sizeLabel: '~1.57 GB Total',
        contextLength: 4096,
        minContextLength: 1024,
        maxContextLength: 32768,
        gpuLayers: 0,
        visionUseGpu: false,
        forceOcrPipeline: false,
        recommendedForChat: true,
        recommendedForReceipt: true,
        recommendedForPdf: true,
        canThink: false,
    },
    {
        id: 'qwen3-vl-2b-iq4-xs',
        name: 'Qwen3 VL 2B IQ4_XS (High Accuracy)',
        description: 'Slower speed, but highly accurate AI model, specifically designed for vision-language tasks, suitable for higher-end devices.',
        fileName: 'Qwen3-VL-2B-Instruct-IQ4_XS.gguf',
        downloadUrl: 'https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3-VL-2B-Instruct-IQ4_XS.gguf',
        visionFileName: 'mmproj-F16.gguf',
        visionUrl: 'https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-F16.gguf',
        sizeBytes: 1010384576,
        visionSizeBytes: 819395232,
        sizeLabel: '~1.83 GB Total',
        contextLength: 4096,
        minContextLength: 1024,
        maxContextLength: 32768,
        gpuLayers: 0,
        visionUseGpu: false,
        forceOcrPipeline: false,
        recommendedForChat: true,
        recommendedForReceipt: true,
        recommendedForPdf: true,
        canThink: false,
    },
    {
        id: 'qwen2.5-vl-2b-q4',
        name: 'Qwen2.5 VL 2B Q4 (Vision + Text + OCR/PDF)',
        description: 'Vision-language model for direct image receipt scanning, chatbot, and PDF bank statement parsing.',
        fileName: 'Qwen2.5_VL_2B.Q4_K_M.gguf',
        legacyFileNames: ['Qwen3.5-2B-Q4_K_M.gguf', 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf'],
        downloadUrl: 'https://huggingface.co/mradermacher/Qwen2.5_VL_2B-GGUF/resolve/main/Qwen2.5_VL_2B.Q4_K_M.gguf',
        visionFileName: 'Qwen2.5_VL_2B.mmproj-Q8_0.gguf',
        visionUrl: 'https://huggingface.co/mradermacher/Qwen2.5_VL_2B-GGUF/resolve/main/Qwen2.5_VL_2B.mmproj-Q8_0.gguf',
        sizeBytes: 1929901888,
        visionSizeBytes: 847768704,
        sizeLabel: '~2.65 GB Total',
        contextLength: 4096,
        minContextLength: 1024,
        maxContextLength: 32768,
        gpuLayers: 0,
        visionUseGpu: false,
        forceOcrPipeline: false,
        recommendedForChat: true,
        recommendedForReceipt: true,
        recommendedForPdf: true,
        canThink: false,
    }
];

// ─── Custom Model Persistence ─────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

const CUSTOM_MODELS_KEY = '@financeflow_custom_models_v1';

let _cachedCustomModels = null;

export async function loadCustomModels() {
    try {
        const raw = await AsyncStorage.getItem(CUSTOM_MODELS_KEY);
        _cachedCustomModels = raw ? JSON.parse(raw) : [];
    } catch {
        _cachedCustomModels = [];
    }
    return _cachedCustomModels;
}

export function getCachedCustomModels() {
    return _cachedCustomModels || [];
}

export async function saveCustomModel(model) {
    const models = await loadCustomModels();
    const exists = models.findIndex(m => m.id === model.id);
    if (exists >= 0) {
        models[exists] = { ...models[exists], ...model };
    } else {
        models.push({ ...model, isCustom: true });
    }
    _cachedCustomModels = models;
    await AsyncStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
    return models;
}

export async function removeCustomModel(id) {
    let models = await loadCustomModels();
    models = models.filter(m => m.id !== id);
    _cachedCustomModels = models;
    await AsyncStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models));
    return models;
}

export function getAllModels() {
    return [...LOCAL_MODELS, ...getCachedCustomModels()];
}

export function getModelConfig(id) {
    return getAllModels().find(m => m.id === id) || LOCAL_MODELS[0];
}
