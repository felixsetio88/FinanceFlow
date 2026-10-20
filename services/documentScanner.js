/**
 * documentScanner.js
 *
 * Receipt/document edge detection and perspective-crop helpers.
 *
 * Strategy:
 *   1. Use expo-image-manipulator to read the EXIF-normalized image dimensions.
 *   2. Run ML Kit OCR (if linked) → compute bounding box of all text blocks.
 *   3. Fall back to an aspect-ratio-aware inset rectangle.
 *
 * All coordinate normalization is done against the EXIF-corrected image so that
 * what the user sees in the preview is pixel-perfect with what gets cropped.
 */
import * as ImageManipulator from 'expo-image-manipulator';

// ─── Availability ────────────────────────────────────────────────────────────

export const isDocumentScannerAvailable = () => true;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize an image URI so that EXIF rotation is baked into the pixel data.
 * Returns { uri, width, height } with the corrected dimensions.
 */
export const normalizeImage = async (imageUri) => {
    const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: result.uri, width: result.width, height: result.height };
};

// ─── Auto edge detection ─────────────────────────────────────────────────────

/**
 * Attempt to detect the four corners of a document/receipt in the image.
 *
 * @param {string} imageUri  — EXIF-normalized URI (from normalizeImage)
 * @param {number} imgW      — pixel width of the normalized image
 * @param {number} imgH      — pixel height of the normalized image
 *
 * Returns normalised coords (0–1 relative to imgW/imgH):
 *   { topLeft, topRight, bottomRight, bottomLeft }  each { x, y }
 */
export const detectRectangle = async (imageUri, imgW, imgH) => {
    // ── 1. ML Kit OCR text-block bounding box ────────────────────────────
    try {
        const ocrService = require('./ocrService');
        if (typeof ocrService.isOCRAvailable === 'function' && ocrService.isOCRAvailable()) {
            const ocrResult = await ocrService.runOCR(imageUri);

            if (ocrResult && ocrResult.blocks && ocrResult.blocks.length > 0) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

                ocrResult.blocks.forEach(b => {
                    if (!b.bbox) return;
                    // bbox fields are already normalised 0–1 by normalizeMLKitResult
                    const { x, y, w, h } = b.bbox;
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x + w);
                    maxY = Math.max(maxY, y + h);
                });

                if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)
                    && minX < maxX && minY < maxY) {
                    // Add 3% padding so handles sit just outside the text edge
                    const PAD = 0.03;
                    minX = Math.max(0.02, minX - PAD);
                    minY = Math.max(0.02, minY - PAD);
                    maxX = Math.min(0.98, maxX + PAD);
                    maxY = Math.min(0.98, maxY + PAD);

                    console.log(`[DocumentScanner] OCR detection: (${minX.toFixed(3)},${minY.toFixed(3)}) → (${maxX.toFixed(3)},${maxY.toFixed(3)})`);
                    return {
                        topLeft: { x: minX, y: minY },
                        topRight: { x: maxX, y: minY },
                        bottomRight: { x: maxX, y: maxY },
                        bottomLeft: { x: minX, y: maxY },
                    };
                }
            }
        }
    } catch (_e) {
        // OCR unavailable or threw — proceed to aspect-aware fallback
    }

    // ── 2. Aspect-ratio-aware automatic inset ────────────────────────────
    // Use the real image aspect ratio (already EXIF-normalized) to compute
    // a tighter or wider inset depending on orientation.
    const aspect = (imgH || 1) / (imgW || 1);

    let minX, maxX, minY, maxY;

    if (aspect >= 1.2) {
        // Portrait: tall receipt — use a tight inset
        minX = 0.05; maxX = 0.95;
        minY = 0.04; maxY = 0.94;
    } else if (aspect <= 0.85) {
        // Landscape: receipt photographed sideways
        minX = 0.07; maxX = 0.93;
        minY = 0.06; maxY = 0.92;
    } else {
        // Square-ish — balanced inset
        minX = 0.06; maxX = 0.94;
        minY = 0.05; maxY = 0.93;
    }

    console.log(`[DocumentScanner] Aspect-aware inset: aspect=${aspect.toFixed(2)} → (${minX},${minY}) (${maxX},${maxY})`);
    return {
        topLeft: { x: minX, y: minY },
        topRight: { x: maxX, y: minY },
        bottomRight: { x: maxX, y: maxY },
        bottomLeft: { x: minX, y: maxY },
    };
};

// ─── Crop / Perspective Correction ───────────────────────────────────────────

/**
 * Apply perspective correction to straighten a tilted document.
 *
 * Priority:
 *  1. Native module (Android Matrix.setPolyToPoly / iOS CIPerspectiveCorrection)
 *  2. JS rotation + crop via expo-image-manipulator (handles common slight tilts)
 *
 * @param {string} imageUri  — EXIF-normalized URI
 * @param {number} imgW      — pixel width of normalized image
 * @param {number} imgH      — pixel height of normalized image
 * @param {object} corners   — { topLeft, topRight, bottomRight, bottomLeft } each { x, y } in 0–1
 */
function getReceiptOCRModule() {
    try {
        const { requireNativeModule } = require('expo-modules-core');
        return requireNativeModule('ReceiptOCRModule');
    } catch {
        return null;
    }
}

export const perspectiveCorrect = async (imageUri, imgW, imgH, corners) => {
    // ── 1. Native perspective warp ────────────────────────────────────────
    try {
        const receiptMod = getReceiptOCRModule();
        if (receiptMod && typeof receiptMod.perspectiveCorrect === 'function') {
            console.log('[DocumentScanner] Running native perspectiveCorrect...');
            const res = await receiptMod.perspectiveCorrect(imageUri, corners);
            if (res && res.uri) {
                console.log('[DocumentScanner] Native warp succeeded:', res.width, 'x', res.height);
                return res;
            }
        }
    } catch (e) {
        console.log('[DocumentScanner] Native perspectiveCorrect fallback:', e?.message || e);
    }

    // ── 2. JS Rotation + Crop fallback ───────────────────────────────────
    // Compute the rotation angle of the receipt from the topLeft → topRight vector,
    // rotate the image to align the receipt horizontally, then crop the aligned quad.
    try {
        const tlX = corners.topLeft.x * imgW;
        const tlY = corners.topLeft.y * imgH;
        const trX = corners.topRight.x * imgW;
        const trY = corners.topRight.y * imgH;
        const brX = corners.bottomRight.x * imgW;
        const brY = corners.bottomRight.y * imgH;
        const blX = corners.bottomLeft.x * imgW;
        const blY = corners.bottomLeft.y * imgH;

        // Angle of the top edge (positive = clockwise tilt)
        const angleRad = Math.atan2(trY - tlY, trX - tlX);
        const angleDeg = angleRad * (180 / Math.PI);

        const needsRotation = Math.abs(angleDeg) > 0.5;

        if (!needsRotation) {
            // Already axis-aligned — simple bounding-box crop
            return await axisCrop(imageUri, imgW, imgH, corners);
        }

        console.log(`[DocumentScanner] Rotating image by ${(-angleDeg).toFixed(1)}° to align receipt`);

        // Rotate the image to align the receipt (expo-image-manipulator expands canvas to fit)
        const rotated = await ImageManipulator.manipulateAsync(
            imageUri,
            [{ rotate: -angleDeg }],
            { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
        );

        const rW = rotated.width;
        const rH = rotated.height;

        // The rotated canvas is (rW x rH); the original (imgW x imgH) was centred in it
        const offsetX = (rW - imgW) / 2;
        const offsetY = (rH - imgH) / 2;

        // Rotate each of the 4 source corners by -angleDeg around the image centre
        const cosA = Math.cos(-angleRad);
        const sinA = Math.sin(-angleRad);
        const cxSrc = imgW / 2;
        const cySrc = imgH / 2;

        function rotPt(px, py) {
            const dx = px - cxSrc;
            const dy = py - cySrc;
            return {
                x: (cxSrc + dx * cosA - dy * sinA + offsetX) / rW,
                y: (cySrc + dx * sinA + dy * cosA + offsetY) / rH,
            };
        }

        const rCorners = {
            topLeft: rotPt(tlX, tlY),
            topRight: rotPt(trX, trY),
            bottomRight: rotPt(brX, brY),
            bottomLeft: rotPt(blX, blY),
        };

        // After rotation the quad should be nearly axis-aligned — do bounding-box crop
        return await axisCrop(rotated.uri, rW, rH, rCorners);
    } catch (e) {
        console.error('[DocumentScanner] perspectiveCorrect JS fallback failed:', e.message);
        return { uri: imageUri, width: imgW, height: imgH };
    }
};

/** Simple axis-aligned bounding-box crop of the four corners. */
async function axisCrop(uri, w, h, corners) {
    const xs = [corners.topLeft.x, corners.topRight.x, corners.bottomRight.x, corners.bottomLeft.x];
    const ys = [corners.topLeft.y, corners.topRight.y, corners.bottomRight.y, corners.bottomLeft.y];

    const minX = Math.max(0, Math.min(...xs));
    const maxX = Math.min(1, Math.max(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxY = Math.min(1, Math.max(...ys));

    if (minX >= maxX || minY >= maxY) return { uri, width: w, height: h };

    const originX = Math.round(minX * w);
    const originY = Math.round(minY * h);
    const cropW = Math.round((maxX - minX) * w);
    const cropH = Math.round((maxY - minY) * h);

    const safeOriginX = Math.max(0, Math.min(w - 2, originX));
    const safeOriginY = Math.max(0, Math.min(h - 2, originY));
    const safeCropW = Math.max(1, Math.min(w - safeOriginX, cropW));
    const safeCropH = Math.max(1, Math.min(h - safeOriginY, cropH));

    const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX: safeOriginX, originY: safeOriginY, width: safeCropW, height: safeCropH } }],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: result.uri, width: result.width, height: result.height };
}

