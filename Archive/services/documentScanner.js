/**
 * documentScanner.js
 *
 * Receipt/document edge detection and perspective-crop helpers.
 *
 * Strategy:
 *   1. If a native module (iOS Vision / Android OpenCV) is available, use it.
 *   2. Otherwise fall back to a pure-JS implementation:
 *      - detectRectangle: run ML Kit OCR → compute bounding box of all text
 *      - perspectiveCorrect: use expo-image-manipulator to crop that bounding box
 *
 * This gives "good-enough" auto-crop on any device without requiring any
 * extra native dependencies.
 */
import { NativeModules, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const { ReceiptOCRModule, DocumentScannerModule } = NativeModules;

// ─── Availability ────────────────────────────────────────────────────────────

export const isDocumentScannerAvailable = () => {
    // The JS fallback always works, so this is always true.
    return true;
};

// ─── Auto edge detection ─────────────────────────────────────────────────────

/**
 * Attempt to detect the four corners of a document/receipt in the image.
 * Returns normalised coords (0–1 relative to image size) in the shape:
 *   { topLeft, topRight, bottomRight, bottomLeft }  each { x, y }
 */
export const detectRectangle = async (imageUri) => {
    // 1. Try native modules first
    try {
        const receiptMod = getReceiptOCRModule();
        if (Platform.OS === 'ios' && receiptMod?.detectRectangle) {
            console.log('[DocumentScanner] Calling iOS native Vision detectRectangle...');
            const res = await receiptMod.detectRectangle(imageUri);
            if (res) return res;
        } else if (Platform.OS === 'android' && NativeModules.DocumentScannerModule?.detectRectangle) {
            const res = await NativeModules.DocumentScannerModule.detectRectangle(imageUri);
            if (res) return res;
        }
    } catch (e) {
        console.warn('[DocumentScanner] Native detectRectangle failed:', e.message);
    }

    // 2. JS fallback: run ML Kit OCR → union of all text block bounding boxes
    try {
        // Import lazily so that non-scanner screens don't pay the module cost.
        const { runOCR } = require('./ocrService');
        const ocrResult = await runOCR(imageUri);

        if (ocrResult && ocrResult.blocks && ocrResult.blocks.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            ocrResult.blocks.forEach(b => {
                if (!b.bbox) return;
                // bbox fields are already normalised (0–1) by normalizeMLKitResult
                const { x, y, w, h } = b.bbox;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
            });

            // Safety check
            if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY) && minX < maxX && minY < maxY) {
                // Add 2% padding around the text bounding box
                const PAD = 0.025;
                minX = Math.max(0.01, minX - PAD);
                minY = Math.max(0.01, minY - PAD);
                maxX = Math.min(0.99, maxX + PAD);
                maxY = Math.min(0.99, maxY + PAD);

                console.log(`[DocumentScanner] OCR-based detection: (${minX.toFixed(2)},${minY.toFixed(2)}) → (${maxX.toFixed(2)},${maxY.toFixed(2)})`);

                return {
                    topLeft: { x: minX, y: minY },
                    topRight: { x: maxX, y: minY },
                    bottomRight: { x: maxX, y: maxY },
                    bottomLeft: { x: minX, y: maxY },
                };
            }
        }
    } catch (e) {
        console.warn('[DocumentScanner] OCR-based detection failed:', e.message);
    }

    // 3. Last resort: return a comfortable inset rectangle
    return {
        topLeft: { x: 0.08, y: 0.08 },
        topRight: { x: 0.92, y: 0.08 },
        bottomRight: { x: 0.92, y: 0.92 },
        bottomLeft: { x: 0.08, y: 0.92 },
    };
};

// ─── Crop / perspective correction ───────────────────────────────────────────

/**
 * Given an image URI and four normalised corner coordinates, return a new
 * image URI that is cropped to the bounding box defined by those corners.
 *
 * Native modules can perform a true perspective warp; without them we fall
 * back to a simple axis-aligned crop which still gives a clean result.
 */
export const perspectiveCorrect = async (imageUri, corners) => {
    // 1. Try native modules first
    try {
        if (Platform.OS === 'ios' && ReceiptOCRModule?.perspectiveCorrect) {
            return await ReceiptOCRModule.perspectiveCorrect(imageUri, corners);
        } else if (Platform.OS === 'android' && DocumentScannerModule?.perspectiveCorrect) {
            return await DocumentScannerModule.perspectiveCorrect(imageUri, corners);
        }
    } catch (e) {
        console.warn('[DocumentScanner] Native perspectiveCorrect failed:', e.message);
        // Fall through to JS implementation
    }

    // 2. JS fallback: bounding-box crop via expo-image-manipulator
    try {
        const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
        const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];

        const minX = Math.max(0, Math.min(...xs));
        const maxX = Math.min(1, Math.max(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxY = Math.min(1, Math.max(...ys));

        if (minX >= maxX || minY >= maxY) {
            console.warn('[DocumentScanner] Degenerate crop region, returning original');
            return { uri: imageUri };
        }

        // Load original image to get pixel dimensions
        const info = await ImageManipulator.manipulateAsync(imageUri, [], {
            format: ImageManipulator.SaveFormat.JPEG,
        });

        const imgW = info.width;
        const imgH = info.height;

        const originX = Math.floor(minX * imgW);
        const originY = Math.floor(minY * imgH);
        const cropW = Math.floor((maxX - minX) * imgW);
        const cropH = Math.floor((maxY - minY) * imgH);

        if (cropW <= 0 || cropH <= 0) {
            console.warn('[DocumentScanner] Zero-size crop, returning original');
            return { uri: imageUri };
        }

        console.log(`[DocumentScanner] Cropping ${imgW}x${imgH} → origin(${originX},${originY}) size(${cropW}x${cropH})`);

        const cropped = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ crop: { originX, originY, width: cropW, height: cropH } }],
            { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
        );

        return { uri: cropped.uri, width: cropped.width, height: cropped.height };
    } catch (e) {
        console.error('[DocumentScanner] JS perspectiveCorrect failed:', e.message);
        // If even the JS crop fails, return original rather than crash
        return { uri: imageUri };
    }
};
