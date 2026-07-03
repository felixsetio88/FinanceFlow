/**
 * custom-model-search.js
 *
 * Search Hugging Face for GGUF models.
 * Displays results with download counts, lets user pick one to view quantizations.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, StyleSheet, useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

const HF_API = 'https://huggingface.co/api/models';

function formatDownloads(n) {
    if (!n || n < 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

export default function CustomModelSearch() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState('');
    const debounceRef = useRef(null);

    const searchModels = useCallback(async (searchText) => {
        const trimmed = (searchText || '').trim();
        if (trimmed.length < 2) {
            setResults([]);
            setSearched(false);
            return;
        }

        setLoading(true);
        setError('');
        setSearched(true);

        try {
            const url = `${HF_API}?filter=gguf&search=${encodeURIComponent(trimmed)}&sort=downloads&direction=-1&limit=25`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`HuggingFace API returned ${response.status}`);
            }

            const data = await response.json();

            // The filter=gguf parameter already ensures these are GGUF repos.
            // Siblings (file list) are NOT included in search results — they're
            // only available when fetching a single model's details, which happens
            // on the quantization page. So we use results directly.
            setResults(data);
        } catch (err) {
            setError(err.message || 'Failed to search models');
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleQueryChange = useCallback((text) => {
        setQuery(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchModels(text), 500);
    }, [searchModels]);

    const handleSelect = useCallback((model) => {
        router.push({
            pathname: '/custom-model-quantization',
            params: { repoId: model.id, modelName: model.id.split('/').pop() || model.id },
        });
    }, [router]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight}>
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
                <Text style={[styles.title, { color: colors.textPrimary }]}>Add Custom Model</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Search Bar */}
            <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                    placeholder="Search GGUF models on Hugging Face…"
                    placeholderTextColor={colors.textMuted}
                    value={query}
                    onChangeText={handleQueryChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={() => searchModels(query)}
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Results */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {loading && (
                    <View style={styles.centerWrap}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.statusText, { color: colors.textSecondary }]}>Searching Hugging Face…</Text>
                    </View>
                )}

                {error ? (
                    <View style={[styles.errorBox, { backgroundColor: isDark ? 'rgba(255,122,135,0.1)' : 'rgba(255,122,135,0.06)', borderColor: colors.rose }]}>
                        <Ionicons name="alert-circle" size={16} color={colors.rose} />
                        <Text style={[styles.errorText, { color: colors.rose }]}>{error}</Text>
                    </View>
                ) : null}

                {!loading && searched && results.length === 0 && !error && (
                    <View style={styles.centerWrap}>
                        <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No GGUF models found for "{query}"</Text>
                    </View>
                )}

                {!loading && !searched && (
                    <View style={styles.centerWrap}>
                        <Ionicons name="sparkles-outline" size={48} color={colors.primary} style={{ opacity: 0.5 }} />
                        <Text style={[styles.hintTitle, { color: colors.textPrimary }]}>Search for AI Models</Text>
                        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                            Search for GGUF models on Hugging Face.{'\n'}Try "Qwen", "Llama", "Gemma", or "Phi".
                        </Text>
                    </View>
                )}

                {results.map((model) => {
                    return (
                        <TouchableOpacity
                            key={model.id}
                            style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                            onPress={() => handleSelect(model)}
                            activeOpacity={0.82}
                        >
                            <View style={styles.resultHeader}>
                                <View style={[styles.modelIconWrap, { backgroundColor: isDark ? 'rgba(255,102,0,0.15)' : 'rgba(255,102,0,0.08)' }]}>
                                    <Ionicons name="cube-outline" size={20} color={colors.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                                        {model.id.split('/').pop()}
                                    </Text>
                                    <Text style={[styles.resultAuthor, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {model.author || model.id.split('/')[0]}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                            </View>

                            <View style={styles.resultMeta}>
                                <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(30,201,142,0.12)' : 'rgba(30,201,142,0.08)' }]}>
                                    <Ionicons name="download-outline" size={12} color={colors.emerald} />
                                    <Text style={[styles.metaText, { color: colors.emerald }]}>{formatDownloads(model.downloads)}</Text>
                                </View>
                                <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(106,111,248,0.12)' : 'rgba(106,111,248,0.08)' }]}>
                                    <Ionicons name="layers-outline" size={12} color={colors.blue} />
                                    <Text style={[styles.metaText, { color: colors.blue }]}>GGUF</Text>
                                </View>
                                {model.likes > 0 && (
                                    <View style={[styles.metaBadge, { backgroundColor: isDark ? 'rgba(228,216,77,0.12)' : 'rgba(228,216,77,0.08)' }]}>
                                        <Ionicons name="heart-outline" size={12} color={colors.gold} />
                                        <Text style={[styles.metaText, { color: colors.gold }]}>{formatDownloads(model.likes)}</Text>
                                    </View>
                                )}
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
        paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: FontSize.xl, fontFamily: 'Poppins_800ExtraBold' },
    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        marginHorizontal: Spacing.lg, paddingHorizontal: Spacing.md,
        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
        borderRadius: 16, borderWidth: 1,
    },
    searchInput: {
        flex: 1, fontSize: FontSize.md, fontFamily: 'Poppins_400Regular',
        paddingVertical: 0,
    },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
    centerWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
    statusText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', marginTop: Spacing.sm },
    emptyText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', textAlign: 'center' },
    hintTitle: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold', marginTop: Spacing.sm },
    hintText: {
        fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular',
        textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.xl,
    },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
        marginBottom: Spacing.md,
    },
    errorText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    resultCard: {
        borderRadius: 18, padding: Spacing.lg, borderWidth: 1,
        marginBottom: Spacing.md,
        shadowColor: '#1A1040', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    },
    resultHeader: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    },
    modelIconWrap: {
        width: 42, height: 42, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    resultName: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    resultAuthor: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    resultMeta: {
        flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, flexWrap: 'wrap',
    },
    metaBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: 8,
    },
    metaText: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
});
