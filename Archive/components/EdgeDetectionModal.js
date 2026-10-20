/**
 * EdgeDetectionModal.js
 *
 * Full-screen modal that:
 *  1. Shows a loading state while running auto-detection
 *  2. Renders EdgeDetectionCropper so the user can adjust corners
 *  3. On "Crop & Continue" → warps and returns the cropped image
 *  4. On "Use Original"  → returns the image unchanged (no crop)
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
import { detectRectangle, perspectiveCorrect } from '../services/documentScanner';
import { useTheme } from '../context/ThemeContext';
import { FontSize, Spacing } from '../constants/theme';

const DEFAULT_CORNERS = {
    topLeft: { x: 0.05, y: 0.05 },
    topRight: { x: 0.95, y: 0.05 },
    bottomRight: { x: 0.95, y: 0.95 },
    bottomLeft: { x: 0.05, y: 0.95 },
};

function isRealDetection(c) {
    if (!c) return false;
    const pts = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
    return pts.some(p => p.x > 0.1 && p.x < 0.9 && p.y > 0.1 && p.y < 0.9);
}

export default function EdgeDetectionModal({ visible, imageAsset, onCancel, onConfirm }) {
    const { colors, isDark } = useTheme();
    const { width: screenW, height: screenH } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [corners, setCorners] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [detected, setDetected] = useState(false);

    useEffect(() => {
        if (!visible || !imageAsset) return;

        let cancelled = false;
        setLoading(true);
        setCorners(null);
        setProcessing(false);
        setDetected(false);

        const run = async () => {
            try {
                const result = await detectRectangle(imageAsset.uri);
                if (!cancelled) {
                    const real = isRealDetection(result);
                    setCorners(result || DEFAULT_CORNERS);
                    setDetected(real);
                }
            } catch (err) {
                console.warn('[EdgeDetectionModal] detectRectangle failed:', err);
                if (!cancelled) {
                    setCorners(DEFAULT_CORNERS);
                    setDetected(false);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [visible, imageAsset]);

    // "Crop & Continue" — apply perspective correction and return
    const handleContinue = async (finalCorners) => {
        setProcessing(true);
        try {
            const corrected = await perspectiveCorrect(
                imageAsset.uri,
                finalCorners,
                imageAsset.width,
                imageAsset.height
            );
            onConfirm({
                uri: corrected.uri,
                width: corrected.width || imageAsset.width,
                height: corrected.height || imageAsset.height,
            });
        } catch (err) {
            console.error('[EdgeDetectionModal] perspectiveCorrect failed:', err);
            Alert.alert('Crop Failed', 'Could not process the image. Please try again.');
            setProcessing(false);
        }
    };

    // "Use Original" — pass the image through unmodified
    const handleUseOriginal = () => {
        onConfirm({
            uri: imageAsset.uri,
            width: imageAsset.width,
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
                {/* Gradient background — matches vehicle page */}
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
                        imageUri={imageAsset.uri}
                        imageWidth={parseFloat(imageAsset.width || '1000')}
                        imageHeight={parseFloat(imageAsset.height || '1000')}
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
