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
import { useApp } from '../context/AppContext';
import { getAccountTypeById } from '../utils/categories';
import { formatCurrency } from '../utils/currencies';
import { pickerStore } from '../utils/pickerStore';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function PickAccountPage() {
    const { colors } = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width: screenW, height: screenH } = useWindowDimensions();
    const { assets, currency: globalCurrency } = useApp();

    const { currentAssetId, label, returnKey, allowClear } = useLocalSearchParams();

    const [search, setSearch] = useState('');

    const filtered = search.trim()
        ? assets.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
        : assets;

    const pageLabel = label === 'from' ? 'From Account'
        : label === 'to' ? 'To Account'
        : label === 'receive' ? 'Receive into Account'
        : 'Pay from Account';

    const handleSelect = useCallback((assetId) => {
        pickerStore.setSelection(returnKey || 'assetId', assetId);
        router.back();
    }, [router, returnKey]);

    const renderItem = ({ item: asset }) => {
        const accountType = getAccountTypeById(asset.type);
        const isSelected = asset.id === currentAssetId;
        const balStr = formatCurrency(asset.balance, asset.currency || globalCurrency);

        return (
            <TouchableOpacity
                style={[
                    styles.row,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    isSelected && {
                        borderColor: colors.primary,
                        backgroundColor: 'rgba(255,102,0,0.07)',
                    },
                ]}
                onPress={() => handleSelect(asset.id)}
                activeOpacity={0.75}
            >
                {/* Icon badge */}
                <View style={[
                    styles.iconBadge,
                    { backgroundColor: 'rgba(255,102,0,0.12)' },
                ]}>
                    <Ionicons
                        name={accountType.icon}
                        size={24}
                        color={colors.primary}
                    />
                </View>

                {/* Name + balance - flat font */}
                <View style={styles.textCol}>
                    <Text style={[
                        styles.assetName,
                        { color: isSelected ? colors.primary : colors.textPrimary },
                    ]}>
                        {asset.name}
                    </Text>
                    <Text style={[styles.assetBalance, { color: colors.textSecondary }]}>
                        {balStr}
                    </Text>
                </View>

                {/* Indicator */}
                {isSelected
                    ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    : <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                }
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Gradient background */}
            <Svg style={StyleSheet.absoluteFillObject} width={screenW} height={screenH} pointerEvents="none">
                <Defs>
                    <SvgGrad id="pickAccBg" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenW} height={screenH} fill="url(#pickAccBg)" />
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
                    <Text style={[styles.title, { color: colors.textPrimary }]}>{pageLabel}</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {assets.length} {assets.length === 1 ? 'account' : 'accounts'} available
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
                    placeholder="Search accounts…"
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

            {/* "None" option — only shown when allowClear is 'true' */}
            {allowClear === 'true' && (
                <TouchableOpacity
                    style={[
                        styles.noneRow,
                        { backgroundColor: colors.card, borderColor: colors.border },
                        !currentAssetId && {
                            borderColor: colors.primary,
                            backgroundColor: 'rgba(255,102,0,0.07)',
                        },
                    ]}
                    onPress={() => handleSelect('')}
                    activeOpacity={0.75}
                >
                    <View style={[styles.iconBadge, { backgroundColor: 'rgba(255,102,0,0.12)' }]}>
                        <Ionicons name="close-outline" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.textCol}>
                        <Text style={[styles.assetName, { color: colors.textSecondary }]}>No Account (Cash)</Text>
                        <Text style={[styles.assetBalance, { color: colors.textMuted }]}>Transaction not linked to any account</Text>
                    </View>
                    {!currentAssetId
                        ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                        : <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                    }
                </TouchableOpacity>
            )}

            {/* Divider between none-row and list */}
            {allowClear === 'true' && filtered.length > 0 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
            )}

            {/* Account list */}
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                        <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
                        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                            {search
                                ? `No accounts match "${search}"`
                                : 'No accounts yet.\nAdd one in Assets.'}
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

    noneRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
        borderRadius: BorderRadius.lg, borderWidth: 1.5,
    },
    divider: {
        height: 1, marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    },

    list: {
        paddingHorizontal: Spacing.lg,
    },
    separator: { height: Spacing.sm },

    row: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5,
    },
    iconBadge: {
        width: 50, height: 50, borderRadius: BorderRadius.md,
        alignItems: 'center', justifyContent: 'center',
    },
    textCol: { flex: 1 },
    assetName: {
        fontSize: FontSize.md, fontFamily: 'Poppins_400Regular', marginBottom: 2,
    },
    assetBalance: {
        fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular',
    },

    emptyWrap: {
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 60, gap: Spacing.md,
    },
    emptyText: {
        fontSize: FontSize.md, fontFamily: 'Poppins_400Regular',
        textAlign: 'center', lineHeight: 22,
    },
});
