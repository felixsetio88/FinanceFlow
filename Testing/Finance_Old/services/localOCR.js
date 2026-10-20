import { Platform } from 'react-native';
// import TextRecognition from '@react-native-ml-kit/text-recognition';
const TextRecognition = null;
import { extractPdfTextChunks, extractImageText, getReadableFileUri, isPdfDocumentUri } from './documentText';
import { LOCAL_MODELS } from './localAIConfig';

function normalizeOcrResult(raw) {
    if (!raw) return '';

    if (Array.isArray(raw)) {
        return raw.map(normalizeOcrResult).filter(Boolean).join('\n');
    }

    if (typeof raw === 'string') {
        return raw;
    }

    if (typeof raw === 'object') {
        const preferred = [raw.text, raw.value, raw.label, raw.content, raw.line, raw.block, raw.word].filter(Boolean);
        if (preferred.length > 0) {
            return preferred.join('\n');
        }
        return Object.values(raw).map(normalizeOcrResult).filter(Boolean).join('\n');
    }

    return '';
}

function cleanOcrText(text) {
    return String(text || '')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function extractTextWithMlKit(imageUri) {
    if (!TextRecognition?.recognize) {
        throw new Error('ML Kit text recognition is unavailable in this build.');
    }

    const readableUri = imageUri && imageUri.startsWith('content://')
        ? await getReadableFileUri(imageUri, 'financeflow_image_', '.jpg')
        : imageUri;
    const result = await Promise.race([
        TextRecognition.recognize(readableUri),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Text recognition timed out.')), 25000)
        ),
    ]);
    return cleanOcrText(normalizeOcrResult(result?.text || result));
}

export async function extractTextFromImageWithMlKit(imageUri) {
    if (Platform.OS === 'web') {
        throw new Error('Local OCR is not available on web.');
    }

    if (!imageUri) {
        throw new Error('Image URI is required for OCR.');
    }

    return extractTextWithMlKit(imageUri);
}

async function transcribeImageWithVisionModel(imageUri) {
    const {
        textCompletion,
        getActiveModelConfig,
        getActiveModelId,
        setActiveModelId,
        isModelDownloaded,
    } = require('./localAI');
    const model = getActiveModelConfig();

    if (!model?.visionFileName) {
        const previousModelId = await getActiveModelId();
        const candidateVisionModels = LOCAL_MODELS.filter((candidate) => !!candidate?.visionFileName);
        let selectedVisionModel = null;

        for (const candidate of candidateVisionModels) {
            try {
                if (await isModelDownloaded(candidate.id)) {
                    selectedVisionModel = candidate;
                    break;
                }
            } catch {
                // Keep checking other vision models.
            }
        }

        if (selectedVisionModel) {
            await setActiveModelId(selectedVisionModel.id);
            try {
                return await transcribeImageWithVisionModel(imageUri);
            } finally {
                await setActiveModelId(previousModelId);
            }
        }

        try {
            return await extractImageText(imageUri);
        } catch (ocrErr) {
            throw new Error(`Vision mode unavailable and OCR fallback failed. Use OCR requires either a downloaded vision model (LightOnOCR, Qwen3 VL, Qwen2.5 VL, Moondream Vision) or native text recognition support. Details: ${ocrErr?.message}`);
        }
    }

    const prompt = `Read this receipt image and transcribe all visible text exactly as plain lines.
Return plain text only.
Do not summarize.
Do not return JSON.`;

    const response = await textCompletion(prompt, imageUri, null, {
        maxTokens: 1200,
        temperature: 0,
    });

    const cleaned = cleanOcrText(normalizeOcrResult(response));
    if (!cleaned) {
        throw new Error('No readable text detected in image. Use a clearer receipt photo.');
    }

    return cleaned;
}

export async function extractTextFromImage(imageUri) {
    if (Platform.OS === 'web') {
        throw new Error('Local OCR is not available on web.');
    }

    if (!imageUri) {
        throw new Error('Image URI is required for OCR.');
    }

    if (isPdfDocumentUri(imageUri)) {
        const extracted = await extractPdfTextChunks(imageUri, { maxPagesPerChunk: 2 });
        const cleaned = cleanOcrText(normalizeOcrResult(extracted.text));
        if (!cleaned) {
            throw new Error('No readable text detected in PDF/document.');
        }
        return cleaned;
    }

    try {
        const mlKitText = await extractTextWithMlKit(imageUri);
        if (mlKitText.length >= 12) {
            return mlKitText;
        }
    } catch {
        // Fall through to alternate OCR engines.
    }

    try {
        const nativeOcrText = cleanOcrText(normalizeOcrResult(await extractImageText(imageUri)));
        if (nativeOcrText.length >= 12) {
            return nativeOcrText;
        }
    } catch {
        // Fall through to vision-based transcription.
    }

    return transcribeImageWithVisionModel(imageUri);
}

// Best-effort OCR for generic document/image URI (including scanned-PDF fallback where supported).
export async function extractTextFromDocumentUri(uri) {
    if (!uri) {
        throw new Error('Document URI is required.');
    }

    try {
        if (isPdfDocumentUri(uri)) {
            const extracted = await extractPdfTextChunks(uri, { maxPagesPerChunk: 2 });
            const cleaned = cleanOcrText(normalizeOcrResult(extracted.text));
            if (!cleaned) {
                throw new Error('No readable text detected in PDF/document.');
            }
            return cleaned;
        }

        const mlKitText = await extractTextWithMlKit(uri);
        if (mlKitText.length >= 12) {
            return mlKitText;
        }

        const nativeOcrText = cleanOcrText(normalizeOcrResult(await extractImageText(uri)));
        if (nativeOcrText.length >= 12) {
            return nativeOcrText;
        }

        return nativeOcrText;
    } catch {
        return extractTextFromImage(uri);
    }
}
