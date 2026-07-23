import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View, Text, ScrollView, FlatList, TouchableOpacity, TextInput, StyleSheet, Modal, Alert, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { filterTransactionsByPeriod, formatDate, formatTime, getDateRange } from '../../utils/helpers';
import { getCategoryById } from '../../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

function DatePickerModal({ visible, value, onConfirm, onClose, colors }) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [month, setMonth] = useState(0);
    const [day, setDay] = useState(1);
    const [year, setYear] = useState(new Date().getFullYear());

    useEffect(() => {
        if (!visible) return;
        const date = value instanceof Date ? value : new Date(value);
        setMonth(date.getMonth());
        setDay(date.getDate());
        setYear(date.getFullYear());
    }, [visible, value]);

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const handleConfirm = () => {
        onConfirm(new Date(year, month, Math.min(day, daysInMonth)));
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={[styles.dpOverlay, { backgroundColor: colors.overlay }]}>
                <View style={[styles.dpBox, { backgroundColor: colors.modalBg }]}>
                    <Text style={[styles.dpTitle, { color: colors.textPrimary }]}>Select Date</Text>
                    <View style={styles.dpRow}>
                        {[
                            { label: 'Month', value: months[month], up: () => setMonth((month + 1) % 12), down: () => setMonth((month + 11) % 12) },
                            { label: 'Day', value: day, up: () => setDay(day >= daysInMonth ? 1 : day + 1), down: () => setDay(day <= 1 ? daysInMonth : day - 1) },
                            { label: 'Year', value: year, up: () => setYear(year + 1), down: () => setYear(year - 1) },
                        ].map((f, i) => (
                            <View key={i} style={styles.dpField}>
                                <Text style={styles.dpFieldLabel}>{f.label}</Text>
                                <TouchableOpacity onPress={f.up}><Ionicons name="chevron-up" size={22} color={colors.primary} /></TouchableOpacity>
                                <Text style={[styles.dpFieldValue, { color: colors.textPrimary }]}>{String(f.value).padStart(2, '0')}</Text>
                                <TouchableOpacity onPress={f.down}><Ionicons name="chevron-down" size={22} color={colors.primary} /></TouchableOpacity>
                            </View>
                        ))}
                    </View>
                    <View style={styles.dpBtnRow}>
                        <TouchableOpacity style={[styles.dpCancel, { backgroundColor: colors.primaryLight }]} onPress={onClose}>
                            <Text style={styles.dpCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.dpConfirm, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
                            <Text style={styles.dpConfirmText}>Confirm</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

export default function Transactions() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { transactions, assets, currency, deleteTransaction, updateAsset } = useApp();
    const [period, setPeriod] = useState('daily');
    const [sortBy, setSortBy] = useState('newest');
    const [refDate, setRefDate] = useState(new Date());
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [showDateModal, setShowDateModal] = useState(false);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const navigate = (direction) => {
        if (period === 'all') return;
        const fn = direction === 'next'
            ? (period === 'daily' ? addDays : period === 'weekly' ? addWeeks : addMonths)
            : (period === 'daily' ? subDays : period === 'weekly' ? subWeeks : subMonths);
        setRefDate(fn(refDate, 1));
    };

    const filtered = useMemo(() => {
        let periodTransactions = period === 'all'
            ? [...transactions]
            : filterTransactionsByPeriod(transactions, period, refDate);

        if (search.trim()) {
            const query = search.trim().toLowerCase();
            periodTransactions = periodTransactions.filter((transaction) => {
                let category = transaction.type === 'move'
                    ? { name: 'Transfer' }
                    : getCategoryById(transaction.category);
                if (transaction.vehicleLogType === 'refuel') category = { ...category, name: 'Car Refuel' };
                if (transaction.vehicleLogType === 'maintenance') category = { ...category, name: 'Car Maintenance' };

                return (
                    (transaction.description || '').toLowerCase().includes(query) ||
                    (category?.name || '').toLowerCase().includes(query) ||
                    (transaction.items || []).some(item => String(item?.name || '').toLowerCase().includes(query))
                );
            });
        }

        const sortedTransactions = [...periodTransactions];
        sortedTransactions.sort((a, b) => {
            const dateA = new Date(a?.date).getTime() || 0;
            const dateB = new Date(b?.date).getTime() || 0;
            const amountA = Math.abs(Number(a?.amount) || 0);
            const amountB = Math.abs(Number(b?.amount) || 0);
            if (sortBy === 'oldest') return dateA - dateB;
            if (sortBy === 'amount_high') return amountB - amountA;
            if (sortBy === 'amount_low') return amountA - amountB;
            return dateB - dateA;
        });

        return sortedTransactions;
    }, [transactions, period, refDate, search, sortBy]);

    const periodLabel = useMemo(() => {
        if (period === 'all') return 'All time';
        if (period === 'daily') return format(refDate, 'MMM dd, yyyy');
        const { start, end } = getDateRange(period, refDate);
        return `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`;
    }, [period, refDate]);

    const sortOptions = [
        { value: 'newest', label: 'Newest' },
        { value: 'oldest', label: 'Oldest' },
        { value: 'amount_high', label: 'Highest' },
        { value: 'amount_low', label: 'Lowest' },
    ];

    const totalIncome = filtered
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalSpending = filtered
        .filter((t) => t.type === 'spending')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const confirmDelete = (transaction) => {
        if (transaction.type === 'move' && transaction.fromAssetId && transaction.toAssetId) {
            const fromAsset = assets.find(a => a.id === transaction.fromAssetId);
            const toAsset = assets.find(a => a.id === transaction.toAssetId);
            if (fromAsset && toAsset) {
                Alert.alert(
                    'Delete Transfer',
                    `Do you want to reverse this transfer and return ${formatCurrency(Math.abs(transaction.amount), currency)} from "${toAsset.name}" back to "${fromAsset.name}"?`,
                    [
                        { text: 'No, just delete', style: 'default', onPress: () => deleteTransaction(transaction.id) },
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Yes, reverse transfer',
                            style: 'default',
                            onPress: async () => {
                                await deleteTransaction(transaction.id);
                                await updateAsset({ ...fromAsset, balance: (fromAsset.balance || 0) + Math.abs(transaction.amount) });
                                await updateAsset({ ...toAsset, balance: (toAsset.balance || 0) - Math.abs(transaction.amount) });
                            },
                        },
                    ]
                );
                return;
            }
        }

        const linkedAsset = transaction.assetId ? assets.find(a => a.id === transaction.assetId) : null;

        if (linkedAsset) {
            // Transaction was paid from/to an asset — ask about reversal
            const isSpending = transaction.type === 'spending';
            const verb = isSpending ? 'return' : 'deduct';
            const direction = isSpending ? 'back to' : 'from';
            Alert.alert(
                'Delete Transaction',
                `Do you want to ${verb} ${formatCurrency(Math.abs(transaction.amount), currency)} ${direction} "${linkedAsset.name}"?`,
                [
                    {
                        text: 'No, just delete',
                        style: 'default',
                        onPress: () => deleteTransaction(transaction.id),
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                    {
                        text: 'Yes, restore',
                        style: 'default',
                        onPress: async () => {
                            await deleteTransaction(transaction.id);
                            // Restore: spending → add back, income → deduct
                            const delta = isSpending ? Math.abs(transaction.amount) : -Math.abs(transaction.amount);
                            await updateAsset({ ...linkedAsset, balance: (linkedAsset.balance || 0) + delta });
                        },
                    },
                ]
            );
        } else {
            Alert.alert('Delete Transaction', 'Delete this transaction?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(transaction.id) },
            ]);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Gradient background */}
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
                <Text style={[styles.title, { color: colors.textPrimary }]}>Transaction History</Text>
            </View>

            {/* Period Tabs */}
            <View style={styles.periodTabsWrap}>
                <View style={[styles.periodTabs, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {['daily', 'weekly', 'monthly', 'all'].map((tabPeriod) => (
                        <TouchableOpacity
                            key={tabPeriod}
                            style={[
                                styles.periodTab,
                                period === tabPeriod && [styles.periodTabActive, { backgroundColor: colors.primary, shadowColor: colors.primary }]
                            ]}
                            onPress={() => { setPeriod(tabPeriod); setRefDate(new Date()); }}
                            activeOpacity={0.75}
                        >
                            <Text style={[
                                styles.periodText,
                                { color: colors.textMuted },
                                period === tabPeriod && styles.periodTextActive
                            ]}>
                                {tabPeriod === 'all' ? 'All Time' : tabPeriod.charAt(0).toUpperCase() + tabPeriod.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Date Navigator */}
            {period === 'all' ? (
                <View style={styles.allTimeBanner}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.allTimeText, { color: colors.textSecondary }]}>Showing all transactions</Text>
                </View>
            ) : (
                <View style={styles.dateNav}>
                    <TouchableOpacity style={[styles.navArrow, { backgroundColor: colors.primaryLight }]} onPress={() => navigate('prev')}>
                        <Ionicons name="chevron-back" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.dateLabelWrap, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setShowDateModal(true)}>
                        <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>{periodLabel}</Text>
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.navArrow, { backgroundColor: colors.primaryLight }]} onPress={() => navigate('next')}>
                        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Totals Card */}
            <View style={[styles.totalsCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                <View style={styles.totalItem}>
                    <Text style={styles.totalAmountIncome}>+{formatCurrency(totalIncome, currency)}</Text>
                    <Text style={styles.totalLabel}>Income</Text>
                </View>
                <View style={styles.totalDivider} />
                <View style={styles.totalItem}>
                    <Text style={styles.totalAmountSpending}>-{formatCurrency(totalSpending, currency)}</Text>
                    <Text style={styles.totalLabel}>Spending</Text>
                </View>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
                <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="search" size={16} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        placeholder="Search transactions..."
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search ? (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* Sort Chips */}
            <View style={styles.sortRow}>
                <Text style={[styles.sortLabel, { color: colors.textSecondary }]}>Sort:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortChipRow}>
                    {sortOptions.map((option) => (
                        <TouchableOpacity
                            key={option.value}
                            style={[
                                styles.sortChip,
                                { backgroundColor: colors.card, borderColor: colors.border },
                                sortBy === option.value && [styles.sortChipActive, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]
                            ]}
                            onPress={() => setSortBy(option.value)}
                        >
                            <Text style={[
                                styles.sortChipText,
                                { color: colors.textSecondary },
                                sortBy === option.value && [styles.sortChipTextActive, { color: colors.primary }]
                            ]}>
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Transaction List */}
            {filtered.length === 0 ? (
                <View style={[styles.emptyState, { paddingBottom: 120, paddingHorizontal: Spacing.lg }]}>
                    <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="receipt-outline" size={36} color={colors.primary} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No transactions</Text>
                    <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>No transactions found for this period</Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: Spacing.lg }}
                    initialNumToRender={15}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    renderItem={({ item: transaction }) => {
                        const isMove = transaction.type === 'move';
                        let category = isMove
                            ? { name: 'Transfer', icon: 'swap-horizontal', color: '#6A6FF8' }
                            : getCategoryById(transaction.category);
                        if (transaction.vehicleLogType === 'refuel') category = { ...category, name: 'Car Refuel' };
                        if (transaction.vehicleLogType === 'maintenance') category = { ...category, name: 'Car Maintenance' };
                        const isIncome = transaction.type === 'income';
                        const expanded = expandedId === transaction.id;
                        const asset = transaction.assetId ? assets.find(a => a.id === transaction.assetId) : null;

                        return (
                            <TouchableOpacity
                                style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDark ? '#000' : '#1A1040' }]}
                                onPress={() => setExpandedId(expanded ? null : transaction.id)}
                                activeOpacity={0.82}
                            >
                                <View style={styles.txMain}>
                                    <View style={[styles.txIcon, { backgroundColor: isDark ? `${category.color}33` : `${category.color}18` }]}>
                                        <Ionicons name={category.icon} size={20} color={category.color} />
                                    </View>
                                    <View style={styles.txInfo}>
                                        <Text style={[styles.txName, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {transaction.description || category.name}
                                        </Text>
                                        <Text style={[styles.txMeta, { color: colors.textSecondary }]}>{category.name} · {formatTime(transaction.date)}</Text>
                                    </View>
                                    <Text style={[styles.txAmount, {
                                        color: isMove ? colors.blue : isIncome ? colors.emerald : colors.rose
                                    }]}>
                                        {isMove ? '⇄ ' : isIncome ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount), currency)}
                                    </Text>
                                </View>

                                {expanded && (
                                    <View style={styles.txExpanded}>
                                        <View style={[styles.txExpandedDivider, { backgroundColor: colors.border }]} />
                                        <Text style={[styles.txDetail, { color: colors.textSecondary }]}>📅 {formatDate(transaction.date)}</Text>
                                        {(isMove || (transaction.paymentMethod === 'asset' && asset)) && (
                                            <Text style={[styles.txDetail, { color: colors.textSecondary }]}>
                                                {isMove ? '💱 Transfer between accounts' : `💳 ${asset ? asset.name : 'Account'}`}
                                            </Text>
                                        )}
                                        {(transaction.items || []).length > 0 && (
                                            <View style={styles.txItems}>
                                                <Text style={[styles.txDetailLabel, { color: colors.textPrimary }]}>Items:</Text>
                                                {transaction.items.map((item, index) => (
                                                    <Text key={`${transaction.id}-${index}`} style={[styles.txDetail, { color: colors.textSecondary }]}>
                                                        · {item.name} ×{item.quantity || 1} = {formatCurrency((item.price || 0) * (item.quantity || 1), currency)}
                                                    </Text>
                                                ))}
                                            </View>
                                        )}
                                        <View style={styles.txActions}>
                                            <TouchableOpacity
                                                style={styles.editBtn}
                                                onPress={() => router.push({ pathname: '/add-transaction', params: { editId: transaction.id } })}
                                            >
                                                <Ionicons name="pencil" size={13} color="#6A6FF8" />
                                                <Text style={styles.editTxt}>Edit</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDelete(transaction)}>
                                                <Ionicons name="trash" size={13} color="#dc2626" />
                                                <Text style={styles.deleteTxt}>Delete</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                />
            )}

            <DatePickerModal
                visible={showDateModal}
                value={refDate}
                onConfirm={setRefDate}
                onClose={() => setShowDateModal(false)}
                colors={colors}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },

    header: {
        paddingHorizontal: Spacing.lg,
        paddingTop: 60,
        paddingBottom: Spacing.md,
    },
    title: {
        fontSize: FontSize.xxl,
        fontFamily: 'Poppins_800ExtraBold',
        color: '#1A1040',
    },

    periodTabsWrap: {
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
    },
    periodTabs: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: BorderRadius.full,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.08)',
    },
    periodTab: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        borderRadius: BorderRadius.full,
    },
    periodTabActive: {
        backgroundColor: '#ff6600',
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 4,
    },
    periodText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#8B7CC8',
    },
    periodTextActive: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
    },

    allTimeBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    allTimeText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#8B7CC8',
    },

    dateNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
    },
    navArrow: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,102,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateLabelWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.8)',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.1)',
    },
    dateLabel: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1A1040',
    },

    totalsCard: {
        flexDirection: 'row',
        marginHorizontal: Spacing.lg,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.08)',
        marginBottom: Spacing.md,
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    totalItem: { flex: 1, alignItems: 'center' },
    totalAmountIncome: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#059669',
    },
    totalAmountSpending: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#dc2626',
    },
    totalLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
        marginTop: 2,
    },
    totalDivider: {
        width: 1,
        backgroundColor: 'rgba(83,96,132,0.12)',
        marginVertical: 4,
    },

    searchRow: {
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderRadius: BorderRadius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.1)',
    },
    searchInput: {
        flex: 1,
        fontSize: FontSize.md,
        fontFamily: 'Poppins_400Regular',
        color: '#1A1040',
    },

    sortRow: {
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    sortLabel: {
        color: '#8B7CC8',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    sortChipRow: { flexDirection: 'row', gap: 8 },
    sortChip: {
        backgroundColor: 'rgba(255,255,255,0.75)',
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.12)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
    },
    sortChipActive: {
        backgroundColor: 'rgba(255,102,0,0.12)',
        borderColor: '#ff6600',
    },
    sortChipText: {
        color: '#8B7CC8',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
    },
    sortChipTextActive: { color: '#ff6600' },

    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: 'rgba(255,102,0,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        marginBottom: 4,
    },
    emptyDesc: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
    },

    txCard: {
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.sm,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.07)',
        overflow: 'hidden',
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    txMain: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        gap: Spacing.md,
    },
    txIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    txInfo: { flex: 1 },
    txName: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1A1040',
    },
    txMeta: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
        marginTop: 1,
    },
    txAmount: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
    },
    txExpanded: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
    txExpandedDivider: {
        height: 1,
        backgroundColor: 'rgba(83,96,132,0.09)',
        marginBottom: Spacing.md,
    },
    txDetail: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        color: '#4B4570',
        marginBottom: 3,
    },
    txDetailLabel: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1A1040',
        marginBottom: 4,
        marginTop: Spacing.sm,
    },
    txItems: { marginTop: Spacing.xs },
    txActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.md,
        marginTop: Spacing.md,
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(106,111,248,0.1)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
    },
    editTxt: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6A6FF8',
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(220,38,38,0.08)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
    },
    deleteTxt: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        color: '#dc2626',
    },

    // Modal
    dpOverlay: { flex: 1, backgroundColor: 'rgba(21,26,45,0.4)', justifyContent: 'center', alignItems: 'center' },
    dpBox: {
        backgroundColor: '#FDFDFF',
        borderRadius: 24,
        padding: Spacing.xl,
        width: '85%',
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: Platform.OS === 'android' ? 0 : 12,
    },
    dpTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        textAlign: 'center',
        marginBottom: Spacing.lg,
    },
    dpRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.lg },
    dpField: { alignItems: 'center', gap: 6 },
    dpFieldLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3B8',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    dpFieldValue: {
        fontSize: FontSize.xl,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        minWidth: 44,
        textAlign: 'center',
    },
    dpBtnRow: { flexDirection: 'row', gap: Spacing.md },
    dpCancel: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255,102,0,0.08)',
        alignItems: 'center',
    },
    dpCancelText: {
        fontFamily: 'Poppins_600SemiBold',
        color: '#ff6600',
        fontSize: FontSize.md,
    },
    dpConfirm: {
        flex: 2,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: '#ff6600',
        alignItems: 'center',
    },
    dpConfirmText: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.md,
    },
});
