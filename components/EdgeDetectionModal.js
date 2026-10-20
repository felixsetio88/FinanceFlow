/**
 * EdgeDetectionModal.js
 *
 * Full-screen modal that:
 *  1. Normalizes EXIF orientation via expo-image-manipulator (once, upfront)
 *  2. Runs auto edge detection against the normalized image
 *  3. Renders EdgeDetectionCropper so the user can adjust corners
 *  4. On "Crop & Continue" → crops and returns the cropped image
 *  5. On "Use Original"  → returns the image unchanged (no crop)
 *
 * Key invariant: normalizedUri / normalizedW / normalizedH are shared between
 * the preview <Image> in EdgeDetectionCropper and the perspectiveCorrect crop,
 * so what you see is exactly what you get.
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Modal,
    Text,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import EdgeDetectionCropper from './EdgeDetectionCropper';
import { normalizeImage, detectRectangle, perspectiveCorrect } from '../services/documentScanner';
import { useTheme } from '../context/ThemeContext';
import { FontSize, Spacing } from '../constants/theme';

const DEFAULT_CORNERS = {
    topLeft:     { x: 0.05, y: 0.05 },
    topRight:    { x: 0.95, y: 0.05 },
    bottomRight: { x: 0.95, y: 0.95 },
    bottomLeft:  { x: 0.05, y: 0.95 },
};

export default function EdgeDetectionModal({ visible, imageAsset, onCancel, onConfirm }) {
    const { colors } = useTheme();
    const { width: screenW, height: screenH } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // normalizedImage holds { uri, width, height } after EXIF correction
    const [normalizedImage, setNormalizedImage] = useState(null);
    const [corners, setCorners]       = useState(null);
    const [loading, setLoading]       = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!visible || !imageAsset) return;

        let cancelled = false;
        setLoading(true);
        setNormalizedImage(null);
        setCorners(null);
        setProcessing(false);

        const run = async () => {
            try {
                // Step 1: normalize EXIF orientation — this is the single source of truth
                // for both the preview image and the crop math.
                const norm = await normalizeImage(imageAsset.uri);
                if (cancelled) return;

                // Step 2: run edge detection using the normalized URI + real dimensions
                const detected = await detectRectangle(norm.uri, norm.width, norm.height);
                if (cancelled) return;

                setNormalizedImage(norm);
                setCorners(detected || DEFAULT_CORNERS);
            } catch (err) {
                console.warn('[EdgeDetectionModal] setup failed:', err);
                if (!cancelled) {
                    // Safe fallback: use the original uri with guessed dimensions
                    setNormalizedImage({
                        uri:    imageAsset.uri,
                        width:  parseFloat(imageAsset.width)  || 1000,
                        height: parseFloat(imageAsset.height) || 1000,
                    });
                    setCorners(DEFAULT_CORNERS);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [visible, imageAsset]);

    // "Crop & Continue" — crop using the same normalized image + its exact pixel dims
    const handleContinue = async (finalCorners) => {
        setProcessing(true);
        try {
            const { uri, width, height } = normalizedImage;
            const cropped = await perspectiveCorrect(uri, width, height, finalCorners);
            onConfirm({
                uri:    cropped.uri,
                width:  cropped.width,
                height: cropped.height,
            });
        } catch (err) {
            console.error('[EdgeDetectionModal] crop failed:', err);
            Alert.alert('Crop Failed', 'Could not process the image. Please try again.');
            setProcessing(false);
        }
    };

    // "Use Original" — pass the original image through unmodified
    const handleUseOriginal = () => {
        onConfirm({
            uri:    imageAsset.uri,
            width:  imageAsset.width,
            height: imageAsset.height,
        });
    };

    if (!imageAsset) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onCancel}
            onDismiss={onCancel}
        >
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                {/* Gradient background */}
                <Svg
                    style={StyleSheet.absoluteFillObject}
                    width={screenW}
                    height={screenH}
                    pointerEvents="none"
                >
                    <Defs>
                        <SvgGrad id="cropBg" x1="0.2" y1="0" x2="0.8" y2="1">
                            <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                            <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                            <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                        </SvgGrad>
                    </Defs>
                    <Rect x="0" y="0" width={screenW} height={screenH} fill="url(#cropBg)" />
                </Svg>

                {/* Drag handle */}
                <View style={[styles.dragHandle, { paddingTop: Platform.OS === 'android' ? insets.top + 8 : 16 }]}>
                    <View style={[styles.dragBar, { backgroundColor: colors.textSecondary }]} />
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                            Detecting receipt edges…
                        </Text>
                        <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>
                            Analysing document boundaries
                        </Text>
                    </View>
                ) : (
                    <EdgeDetectionCropper
                        imageUri={normalizedImage.uri}
                        imageWidth={normalizedImage.width}
                        imageHeight={normalizedImage.height}
                        initialCorners={corners || DEFAULT_CORNERS}
                        onContinue={handleContinue}
                        onUseOriginal={handleUseOriginal}
                        processing={processing}
                        colors={colors}
                        insets={insets}
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    dragHandle: {
        alignItems: 'center',
        paddingBottom: 4,
    },
    dragBar: {
        width: 36,
        height: 4,
        borderRadius: 2,
        opacity: 0.35,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    loadingTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: FontSize.md,
        marginTop: Spacing.sm,
    },
    loadingSubtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: FontSize.sm,
    },
});
