/**
 * EdgeDetectionCropper.js
 *
 * Document-crop UI matching FinanceFlow Scan Receipt design:
 *  - Transparent header, ExtraBold XL "Crop Receipt" title
 *  - Top-left back button (arrow-back) → "Use Original"
 *  - Draggable orange corner handles on the image
 *  - "Use Original" (left) + "Crop & Continue" (right) buttons
 */
import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    StyleSheet,
    PanResponder,
    Dimensions,
    TouchableOpacity,
    Text,
    Image,
    ActivityIndicator,
} from 'react-native';
import Svg, { Polygon, Line } from 'react-native-svg';
import { FontSize, Spacing, BorderRadius } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

const HANDLE_RADIUS = 22;
const DOT_RADIUS    = 14;

const EdgeDetectionCropper = ({
    imageUri,
    imageWidth,
    imageHeight,
    initialCorners,
    onContinue,
    onUseOriginal,
    processing,
    colors,
    insets = { top: 0, bottom: 0 },
}) => {
    const { width: screenW, height: screenH } = Dimensions.get('window');

    // ── Layout: fit image to screen while preserving aspect ratio ────────
    const MAX_IMG_H = screenH * 0.60;
    let imgRenderW = screenW - Spacing.xl * 2;
    let imgRenderH = (imageHeight / imageWidth) * imgRenderW;

    if (imgRenderH > MAX_IMG_H) {
        imgRenderH = MAX_IMG_H;
        imgRenderW = (imageWidth / imageHeight) * imgRenderH;
    }

    const vW = imgRenderW;
    const vH = imgRenderH;

    // Convert normalised (0–1) corners → pixel positions on-screen
    const toLocal = useCallback(
        (pt) => ({ x: pt.x * vW, y: pt.y * vH }),
        [vW, vH],
    );

    // ── Corner state ──────────────────────────────────────────────────────
    const [corners, setCorners] = useState(() => ({
        topLeft:     toLocal(initialCorners.topLeft),
        topRight:    toLocal(initialCorners.topRight),
        bottomRight: toLocal(initialCorners.bottomRight),
        bottomLeft:  toLocal(initialCorners.bottomLeft),
    }));

    React.useEffect(() => {
        if (initialCorners && initialCorners.topLeft) {
            setCorners({
                topLeft:     toLocal(initialCorners.topLeft),
                topRight:    toLocal(initialCorners.topRight),
                bottomRight: toLocal(initialCorners.bottomRight),
                bottomLeft:  toLocal(initialCorners.bottomLeft),
            });
        }
    }, [initialCorners, toLocal]);

    const cornersRef = useRef(corners);
    cornersRef.current = corners;

    // ── PanResponder: captures start pos so drag is perfectly smooth ─────
    const createPanResponder = useCallback((key) => {
        const startPos = { x: 0, y: 0 };
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder:  () => true,
            onPanResponderGrant: () => {
                startPos.x = cornersRef.current[key].x;
                startPos.y = cornersRef.current[key].y;
            },
            onPanResponderMove: (_evt, g) => {
                const newX = Math.max(0, Math.min(vW, startPos.x + g.dx));
                const newY = Math.max(0, Math.min(vH, startPos.y + g.dy));
                setCorners(prev => ({ ...prev, [key]: { x: newX, y: newY } }));
            },
        });
    }, [vW, vH]);

    const responders = useRef({
        topLeft:     createPanResponder('topLeft'),
        topRight:    createPanResponder('topRight'),
        bottomRight: createPanResponder('bottomRight'),
        bottomLeft:  createPanResponder('bottomLeft'),
    }).current;

    // ── Continue: normalise back to 0–1 and call parent ──────────────────
    const handleContinue = () => {
        const c = cornersRef.current;
        onContinue({
            topLeft:     { x: c.topLeft.x     / vW, y: c.topLeft.y     / vH },
            topRight:    { x: c.topRight.x     / vW, y: c.topRight.y    / vH },
            bottomRight: { x: c.bottomRight.x  / vW, y: c.bottomRight.y / vH },
            bottomLeft:  { x: c.bottomLeft.x   / vW, y: c.bottomLeft.y  / vH },
        });
    };

    const getPoints = () => {
        const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners;
        return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
    };

    const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners;

    const cardBg  = colors.card;
    const border  = colors.border;
    const primary = colors.primary;

    return (
        <View style={styles.root}>
            {/* ── Header — matches Scan Receipt style ───────────────── */}
            <View style={styles.header}>
                {/* Back button */}
                <TouchableOpacity
                    onPress={onUseOriginal}
                    style={[styles.backBtn, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}
                    activeOpacity={0.75}
                >
                    <Ionicons name="arrow-back" size={20} color={primary} />
                </TouchableOpacity>

                <Text style={[styles.title, { color: colors.textPrimary }]}>Crop Receipt</Text>

                {/* Right spacer mirrors back button */}
                <View style={styles.backBtn} />
            </View>

            {/* ── Image + overlay ──────────────────────────────────────── */}
            <View style={[styles.imageWrapper, { width: vW, height: vH, borderColor: border }]}>
                <Image
                    source={{ uri: imageUri }}
                    style={{ width: vW, height: vH }}
                    resizeMode="stretch"
                />

                {/* SVG overlay */}
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Svg height={vH} width={vW}>
                        {/* Tinted selection quad */}
                        <Polygon
                            points={getPoints()}
                            fill="rgba(255,102,0,0.15)"
                            stroke="#ff6600"
                            strokeWidth="2.5"
                        />
                        {/* Edge lines */}
                        <Line x1={tl.x} y1={tl.y} x2={tr.x} y2={tr.y} stroke="#ff6600" strokeWidth="1.5" opacity="0.9" />
                        <Line x1={tr.x} y1={tr.y} x2={br.x} y2={br.y} stroke="#ff6600" strokeWidth="1.5" opacity="0.9" />
                        <Line x1={br.x} y1={br.y} x2={bl.x} y2={bl.y} stroke="#ff6600" strokeWidth="1.5" opacity="0.9" />
                        <Line x1={bl.x} y1={bl.y} x2={tl.x} y2={tl.y} stroke="#ff6600" strokeWidth="1.5" opacity="0.9" />
                    </Svg>
                </View>

                {/* Draggable corner handles */}
                {Object.keys(corners).map(key => (
                    <View
                        key={key}
                        {...responders[key].panHandlers}
                        style={[styles.handle, {
                            left: corners[key].x - HANDLE_RADIUS,
                            top:  corners[key].y - HANDLE_RADIUS,
                        }]}
                    >
                        <View style={styles.handleDot}>
                            <View style={styles.handleCenter} />
                        </View>
                    </View>
                ))}
            </View>

            {/* ── Action buttons ────────────────────────────────────────── */}
            <View style={styles.btnRow}>
                {/* Use Original */}
                <TouchableOpacity
                    style={[styles.secondaryBtn, { backgroundColor: cardBg, borderColor: border }]}
                    onPress={onUseOriginal}
                    activeOpacity={0.8}
                    disabled={processing}
                >
                    <Ionicons name="image-outline" size={16} color={colors.textSecondary} />
                    <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                        Use Original
                    </Text>
                </TouchableOpacity>

                {/* Crop & Continue */}
                <TouchableOpacity
                    style={[styles.primaryBtn, processing && styles.primaryBtnDisabled]}
                    onPress={handleContinue}
                    disabled={processing}
                    activeOpacity={0.85}
                >
                    {processing ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <>
                            <Text style={styles.primaryBtnText}>Crop & Continue</Text>
                            <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        alignItems: 'center',
    },

    // Header — matches Scan Receipt page exactly
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: FontSize.xl,
        fontFamily: 'Poppins_800ExtraBold',
    },

    imageWrapper: {
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        borderWidth: 1,
        position: 'relative',
    },

    handle: {
        position: 'absolute',
        width:  HANDLE_RADIUS * 2,
        height: HANDLE_RADIUS * 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    handleDot: {
        width:  DOT_RADIUS * 2,
        height: DOT_RADIUS * 2,
        borderRadius: DOT_RADIUS,
        backgroundColor: '#ff6600',
        borderWidth: 3,
        borderColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.45,
        shadowRadius: 4,
        elevation: 6,
    },
    handleCenter: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#fff',
    },

    // Buttons
    btnRow: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.xl,
        paddingHorizontal: Spacing.lg,
        width: '100%',
    },
    secondaryBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
    },
    secondaryBtnText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: FontSize.sm,
    },
    primaryBtn: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: '#ff6600',
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 6,
    },
    primaryBtnDisabled: {
        backgroundColor: 'rgba(255,102,0,0.5)',
        shadowOpacity: 0,
        elevation: 0,
    },
    primaryBtnText: {
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.sm,
        color: '#fff',
    },
});

export default EdgeDetectionCropper;
