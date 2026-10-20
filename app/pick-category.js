import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    TextInput, Platform, useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { spendingCategories, incomeCategories } from '../utils/categories';
import { pickerStore } from '../utils/pickerStore';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function PickCategoryPage() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: screenW, height: screenH } = useWindowDimensions();

    const { transactionType, currentCategory, returnKey } = useLocalSearchParams();
    const categories = transactionType === 'income' ? incomeCategories : spendingCategories;

    const [search, setSearch] = useState('');

    const filtered = search.trim()
        ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
        : categories;

    const handleSelect = useCallback((cat) => {
        pickerStore.setSelection(returnKey || 'category', cat.id);
        router.back();
    }, [router, returnKey]);

    const renderItem = ({ item: cat }) => {
        const isSelected = cat.id === currentCategory;
        return (
            <TouchableOpacity
                style={[
                    styles.row,
                    { backgroundColor: colors.card },
                    isSelected && {
                        borderColor: cat.color,
                        borderWidth: 1.5,
                        backgroundColor: isDark ? `${cat.color}22` : `${cat.color}10`,
                    },
                ]}
                onPress={() => handleSelect(cat)}
                activeOpacity={0.75}
            >
                {/* Colored icon badge */}
                <View style={[styles.iconBadge, { backgroundColor: isDark ? `${cat.color}28` : `${cat.color}18` }]}>
                    <Ionicons name={cat.icon} size={24} color={cat.color} />
                </View>

                {/* Category name - flat font */}
                <Text style={[
                    styles.rowName,
                    { color: isSelected ? cat.color : colors.textPrimary },
                ]}>
                    {cat.name}
                </Text>

                {/* Checkmark on selected */}
                {isSelected
                    ? <Ionicons name="checkmark-circle" size={22} color={cat.color} style={styles.checkmark} />
                    : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={styles.checkmark} />
                }
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Gradient background */}
            <Svg style={StyleSheet.absoluteFillObject} width={screenW} height={screenH} pointerEvents="none">
                <Defs>
                    <SvgGrad id="pickCatBg" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenW} height={screenH} fill="url(#pickCatBg)" />
            </Svg>

            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + (Platform.OS === 'android' ? 12 : 6) }]}>
                <TouchableOpacity
                    style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.back()}
                    activeOpacity={0.75}
                >
                    <Ionicons name="close" size={20} color={colors.primary} />
                </TouchableOpacity>

                <View style={styles.titleBlock}>
                    <Text style={[styles.title, { color: colors.textPrimary }]}>Select Category</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {transactionType === 'income' ? 'Income categories' : 'Spending categories'}
                    </Text>
                </View>

                {/* Mirror spacer */}
                <View style={{ width: 40 }} />
            </View>

            {/* Search */}
            <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                    style={[styles.searchInput, { color: colors.textPrimary }]}
                    placeholder="Search categories…"
                    placeholderTextColor={colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    autoCorrect={false}
                />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Count pill */}
            <View style={styles.countRow}>
                <Text style={[styles.countText, { color: colors.textMuted }]}>
                    {filtered.length} {filtered.length === 1 ? 'category' : 'categories'}
                </Text>
            </View>

            {/* List */}
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                        <Ionicons name="search-outline" size={48} color={colors.textMuted} />
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                            No categories match "{search}"
                        </Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1,
    },
    titleBlock: { alignItems: 'center' },
    title: {
        fontSize: FontSize.xl, fontFamily: 'Poppins_800ExtraBold',
    },
    subtitle: {
        fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1,
    },

    searchWrap: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full, borderWidth: 1,
    },
    searchInput: {
        flex: 1, fontSize: FontSize.md, fontFamily: 'Poppins_400Regular', paddingVertical: 2,
    },

    countRow: {
        paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    },
    countText: {
        fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular',
    },

    list: {
        paddingHorizontal: Spacing.lg,
    },
    separator: { height: Spacing.sm },

    row: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, borderRadius: BorderRadius.lg,
    },
    iconBadge: {
        width: 50, height: 50, borderRadius: BorderRadius.md,
        alignItems: 'center', justifyContent: 'center',
    },
    rowName: {
        flex: 1, fontSize: FontSize.md, fontFamily: 'Poppins_400Regular',
    },
    checkmark: { marginLeft: 'auto' },

    emptyWrap: {
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 60, gap: Spacing.md,
    },
    emptyText: {
        fontSize: FontSize.md, fontFamily: 'Poppins_400Regular', textAlign: 'center',
    },
});
