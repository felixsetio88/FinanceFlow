/**
 * custom-model-quantization.js
 *
 * After selecting a HuggingFace GGUF repo, this page shows available
 * quantization variants and lets the user pick one to download.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, StyleSheet, useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { saveCustomModel, getAllModels } from '../services/localAIConfig';
import { setActiveModelId, downloadModel, checkModelStatus } from '../services/localAI';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

const HF_API = 'https://huggingface.co/api/models';

// Files that should NEVER be offered for download (incompatible / projector files)
const EXCLUDED_PATTERNS = [
    /mmproj/i,
    /\bBF16\b/i,
    /\bF32\b/i,
    /\bF16\b/i,
    /\.mmproj/i,
    /vision/i,
    /projector/i,
    /text-embedding/i,
    /tokenizer/i,
];

function isExcluded(filename) {
    return EXCLUDED_PATTERNS.some(re => re.test(filename));
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return 'Unknown size';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

function extractQuantLabel(filename) {
    // e.g. model-Q4_K_M.gguf → Q4_K_M
    const match = filename.match(/[-._ ]((?:IQ|Q|q)\d[^\s.]*?)\.gguf$/i);
    return match ? match[1].toUpperCase() : filename.replace('.gguf', '');
}

export default function CustomModelQuantization() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { repoId, modelName } = useLocalSearchParams();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (!repoId) return;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const url = `${HF_API}/${repoId}`;
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                });
                if (!response.ok) throw new Error(`API returned ${response.status}`);

                const data = await response.json();
                const siblings = data.siblings || [];

                // Filter to only .gguf files, excluding incompatible ones
                const ggufFiles = siblings
                    .filter(s => s.rfilename && s.rfilename.endsWith('.gguf') && !isExcluded(s.rfilename))
                    .map(s => ({
                        filename: s.rfilename,
                        quantLabel: extractQuantLabel(s.rfilename),
                        size: s.size || null, // may be null
                    }));

                // Try to get file sizes if not present via a second call with blobs
                if (ggufFiles.some(f => !f.size)) {
                    try {
                        const blobUrl = `${HF_API}/${repoId}?blobs=true`;
                        const blobResp = await fetch(blobUrl, {
                            headers: { 'Accept': 'application/json' },
                        });
                        if (blobResp.ok) {
                            const blobData = await blobResp.json();
                            const blobSiblings = blobData.siblings || [];
                            for (const f of ggufFiles) {
                                if (!f.size) {
                                    const match = blobSiblings.find(bs => bs.rfilename === f.filename);
                                    if (match?.size) f.size = match.size;
                                }
                            }
                        }
                    } catch {
                        // Sizes remain unknown — that's fine
                    }
                }

                // Sort by size ascending (smallest first)
                ggufFiles.sort((a, b) => (a.size || Infinity) - (b.size || Infinity));
                setFiles(ggufFiles);
            } catch (err) {
                setError(err.message || 'Failed to load model files');
            } finally {
                setLoading(false);
            }
        })();
    }, [repoId]);

    const handleSelectQuant = useCallback(async (file) => {
        // Check if already added
        const existing = getAllModels().find(m => m.fileName === file.filename);
        if (existing) {
            Alert.alert('Already Added', 'This model variant is already in your model list.');
            return;
        }

        setDownloading(true);
        try {
            const customId = `custom-${repoId.replace(/\//g, '-')}-${file.quantLabel}`.toLowerCase();
            const downloadUrl = `https://huggingface.co/${repoId}/resolve/main/${file.filename}`;

            const modelConfig = {
                id: customId,
                name: `${modelName || repoId.split('/').pop()} ${file.quantLabel}`,
                description: `Custom model from ${repoId} (${file.quantLabel})`,
                fileName: file.filename,
                downloadUrl,
                sizeBytes: file.size || 0,
                sizeLabel: file.size ? `~${formatBytes(file.size)}` : 'Unknown size',
                contextLength: 4096,
                minContextLength: 1024,
                maxContextLength: 32768,
                gpuLayers: 0,
                forceOcrPipeline: false,
                recommendedForChat: true,
                recommendedForReceipt: false,
                recommendedForPdf: true,
                canThink: false,
                isCustom: true,
                hfRepoId: repoId,
            };

            await saveCustomModel(modelConfig);
            await setActiveModelId(customId);

            // Start download
            downloadModel(customId).catch(err => {
                console.warn('Custom model download error:', err?.message);
            });

            await checkModelStatus();

            // Navigate back to settings
            router.dismiss(2); // Go back 2 screens (quantization + search)
        } catch (err) {
            Alert.alert('Error', err.message || 'Failed to add model');
        } finally {
            setDownloading(false);
        }
    }, [repoId, modelName, router]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bgGrad" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGrad)" />
            </Svg>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>Select Quantization</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Model info banner */}
            <View style={[styles.infoBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.bannerIcon, { backgroundColor: isDark ? 'rgba(255,102,0,0.15)' : 'rgba(255,102,0,0.08)' }]}>
                    <Ionicons name="cube" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.bannerName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {modelName || repoId}
                    </Text>
                    <Text style={[styles.bannerRepo, { color: colors.textSecondary }]} numberOfLines={1}>
                        {repoId}
                    </Text>
                </View>
            </View>

            {/* Content */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {loading && (
                    <View style={styles.centerWrap}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.statusText, { color: colors.textSecondary }]}>Loading quantization options…</Text>
                    </View>
                )}

                {error ? (
                    <View style={[styles.errorBox, { backgroundColor: isDark ? 'rgba(255,122,135,0.1)' : 'rgba(255,122,135,0.06)', borderColor: colors.rose }]}>
                        <Ionicons name="alert-circle" size={16} color={colors.rose} />
                        <Text style={[styles.errorText, { color: colors.rose }]}>{error}</Text>
                    </View>
                ) : null}

                {!loading && files.length === 0 && !error && (
                    <View style={styles.centerWrap}>
                        <Ionicons name="warning-outline" size={40} color={colors.gold} />
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No compatible GGUF quantizations found in this repository.</Text>
                    </View>
                )}

                {downloading && (
                    <View style={[styles.downloadBanner, { backgroundColor: isDark ? 'rgba(255,102,0,0.12)' : 'rgba(255,102,0,0.06)', borderColor: colors.primary }]}>
                        <ActivityIndicator color={colors.primary} />
                        <Text style={[styles.downloadBannerText, { color: colors.primary }]}>Adding model and starting download…</Text>
                    </View>
                )}

                {!loading && files.map((file, idx) => {
                    // Determine quant quality tier for visual hint
                    const ql = file.quantLabel.toUpperCase();
                    let tierColor = colors.textMuted;
                    let tierLabel = 'Standard';
                    if (/Q[2-3]|IQ[1-2]/.test(ql)) { tierColor = colors.gold; tierLabel = 'Lightweight'; }
                    else if (/Q4|IQ3|IQ4/.test(ql)) { tierColor = colors.emerald; tierLabel = 'Balanced'; }
                    else if (/Q[5-6]/.test(ql)) { tierColor = colors.blue; tierLabel = 'High Quality'; }
                    else if (/Q8|Q[7-9]/.test(ql)) { tierColor = colors.primary; tierLabel = 'Maximum'; }

                    return (
                        <TouchableOpacity
                            key={`${file.filename}-${idx}`}
                            style={[styles.quantCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                            onPress={() => handleSelectQuant(file)}
                            activeOpacity={0.82}
                            disabled={downloading}
                        >
                            <View style={styles.quantHeader}>
                                <View style={[styles.quantIconWrap, { backgroundColor: `${tierColor}15` }]}>
                                    <Ionicons name="layers" size={18} color={tierColor} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.quantLabel, { color: colors.textPrimary }]}>{file.quantLabel}</Text>
                                    <Text style={[styles.quantFilename, { color: colors.textSecondary }]} numberOfLines={1}>{file.filename}</Text>
                                </View>
                            </View>
                            <View style={styles.quantMeta}>
                                <View style={[styles.tierBadge, { backgroundColor: `${tierColor}12` }]}>
                                    <Text style={[styles.tierText, { color: tierColor }]}>{tierLabel}</Text>
                                </View>
                                <View style={[styles.sizeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                    <Ionicons name="cloud-download-outline" size={12} color={colors.textSecondary} />
                                    <Text style={[styles.sizeText, { color: colors.textSecondary }]}>{formatBytes(file.size)}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                })}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.sm,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: FontSize.xl, fontFamily: 'Poppins_800ExtraBold', flex: 1, textAlign: 'center' },
    infoBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        marginHorizontal: Spacing.lg, padding: Spacing.md,
        borderRadius: 16, borderWidth: 1, marginBottom: Spacing.sm,
    },
    bannerIcon: {
        width: 44, height: 44, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    bannerName: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    bannerRepo: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    centerWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
    statusText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', marginTop: Spacing.sm },
    emptyText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', textAlign: 'center', paddingHorizontal: Spacing.xl },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
        marginBottom: Spacing.md,
    },
    errorText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    downloadBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
        marginBottom: Spacing.md,
    },
    downloadBannerText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    quantCard: {
        borderRadius: 18, padding: Spacing.lg, borderWidth: 1,
        marginBottom: Spacing.md,
        shadowColor: '#1A1040', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    },
    quantHeader: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    },
    quantIconWrap: {
        width: 40, height: 40, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
    },
    quantLabel: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    quantFilename: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    quantMeta: {
        flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md,
    },
    tierBadge: {
        paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: 8,
    },
    tierText: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
    sizeBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: 8,
    },
    sizeText: { fontSize: FontSize.xs, fontFamily: 'Poppins_500Medium' },
});
