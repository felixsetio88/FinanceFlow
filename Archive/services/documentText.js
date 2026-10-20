import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
// import TextRecognition from '@react-native-ml-kit/text-recognition';
const TextRecognition = null;
import { extractText as extractPdfNativeText, isAvailable as isPdfTextExtractAvailable } from 'expo-pdf-text-extract';

function cleanText(text) {
    return String(text || '')
        .replace(/\r/g, '\n')
        .replace(/\u0000/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function isPdfUri(uri) {
    const normalized = String(uri || '').toLowerCase();
    return normalized.endsWith('.pdf') || normalized.includes('.pdf?') || normalized.startsWith('content://');
}

function ensureMlKitAvailable() {
    if (!TextRecognition?.recognize) {
        throw new Error('ML Kit text recognition is unavailable. Rebuild the app with npx expo run:ios or npx expo run:android.');
    }
}

function getFileExtensionFromUri(uri, fallback = '.bin') {
    const normalized = String(uri || '').split('?')[0].split('#')[0];
    const match = normalized.match(/\.[a-z0-9]+$/i);
    return match ? match[0] : fallback;
}

export async function getReadableFileUri(fileUri, prefix = 'financeflow_pdf_', fallbackExtension = '.bin') {
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!cacheDir) {
        throw new Error('Could not access app cache directory.');
    }

    const targetUri = `${cacheDir}${prefix}${Date.now()}${fallbackExtension}`;
    const candidates = [fileUri];
    if (fileUri.includes(' ')) {
        candidates.push(encodeURI(fileUri));
    }

    for (const candidateUri of candidates) {
        try {
            await FileSystem.copyAsync({ from: candidateUri, to: targetUri });
            const copiedInfo = await FileSystem.getInfoAsync(targetUri);
            if (copiedInfo.exists) {
                return targetUri;
            }
        } catch {
            // Try next URI candidate.
        }

        const candidateInfo = await FileSystem.getInfoAsync(candidateUri);
        if (candidateInfo.exists) {
            return candidateUri;
        }
    }

    throw new Error('Selected file is no longer accessible. Please pick the file again.');
}

export async function extractPdfTextChunks(fileUri, options = {}) {
    if (!fileUri) {
        throw new Error('PDF URI is required.');
    }

    if (Platform.OS === 'web') {
        throw new Error('PDF text extraction is not available on web.');
    }

    if (!isPdfTextExtractAvailable()) {
        throw new Error('expo-pdf-text-extract is unavailable. Rebuild the app with npx expo run:ios or npx expo run:android.');
    }

    const readableUri = await getReadableFileUri(fileUri, 'financeflow_pdf_', '.pdf');
    const extracted = await extractPdfNativeText(readableUri);
    const text = cleanText(extracted);

    return {
        text,
        pageCount: null,
        chunks: text ? [{ startPage: 1, endPage: 1, text, length: text.length }] : [],
    };
}

export async function extractImageText(fileUri, options = {}) {
    if (!fileUri) {
        throw new Error('Image URI is required.');
    }

    if (Platform.OS === 'web') {
        throw new Error('Image text recognition is not available on web.');
    }

    const readableUri = fileUri.startsWith('content://')
        ? await getReadableFileUri(fileUri, 'financeflow_image_', getFileExtensionFromUri(fileUri, '.jpg'))
        : fileUri.startsWith('file://')
            ? fileUri
            : await getReadableFileUri(fileUri, 'financeflow_image_', getFileExtensionFromUri(fileUri, '.jpg'));

    ensureMlKitAvailable();

    const recognized = await Promise.race([
        TextRecognition.recognize(readableUri),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Image text recognition timed out.')), 25000)
        ),
    ]);
    const text = cleanText(recognized?.text || recognized);

    return text;
}

export function isPdfDocumentUri(uri) {
    return isPdfUri(uri);
}
