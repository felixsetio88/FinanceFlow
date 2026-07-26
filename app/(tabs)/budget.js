import FastInput from '../../components/FastInput';
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { calculateBudgetUsage, generateId } from '../../utils/helpers';
import { getCategoryById, spendingCategories } from '../../utils/categories';
import { Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

export default function Budget() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { budgets, transactions, currency, addBudget, updateBudget, deleteBudget, currentDateKey } = useApp();
    const [showModal, setShowModal] = useState(false);
    const [editBudget, setEditBudget] = useState(null);
    const [period, setPeriod] = useState('monthly');
    const [category, setCategory] = useState('all');
    const [amount, setAmount] = useState('');
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const budgetCategories = useMemo(
        () => [{ id: 'all', name: 'All Spending', icon: 'wallet-outline', color: colors.primary }, ...spendingCategories],
        [colors.primary]
    );

    const budgetSnapshots = useMemo(
        () => budgets.map((budget) => ({ budget, usage: calculateBudgetUsage(transactions, budget, new Date(currentDateKey)) })),
        [budgets, transactions, currentDateKey]
    );

    const openAdd = () => {
        setEditBudget(null);
        setPeriod('monthly');
        setCategory('all');
        setAmount('');
        setShowModal(true);
    };

    const openEdit = (b) => {
        setEditBudget(b);
        setPeriod(b.period);
        setCategory(b.category || 'all');
        setAmount(b.amount.toString());
        setShowModal(true);
    };

    const handleSave = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) {
            Alert.alert('Error', 'Please enter a valid amount');
            return;
        }

        const budgetCategory = category || 'all';
        if (editBudget) {
            await updateBudget({ ...editBudget, period, category: budgetCategory, amount: amt });
        } else {
            const existingBudget = budgets.find(b => b.period === period && (b.category || 'all') === budgetCategory);
            if (existingBudget) {
                await updateBudget({ ...existingBudget, amount: amt });
            } else {
                await addBudget({ id: generateId(), period, category: budgetCategory, amount: amt });
            }
        }
        setShowModal(false);
    };

    const handleDelete = (id) => {
        Alert.alert('Delete Budget', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteBudget(id) },
        ]);
    };

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

            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.textPrimary }]}>Budget Manager</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.addBtnText}>New Budget</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {budgets.length === 0 ? (
                    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? `${colors.primary}33` : `${colors.primary}18` }]}>
                            <Ionicons name="pie-chart-outline" size={30} color={colors.primary} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No budgets set</Text>
                        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>Create a budget to track your spending limits with daily, weekly, or monthly goals.</Text>
                        <TouchableOpacity style={[styles.emptyCtaBtn, { backgroundColor: colors.primary }]} onPress={openAdd} activeOpacity={0.85}>
                            <Ionicons name="add" size={16} color="#fff" />
                            <Text style={styles.emptyCtaText}>Create Budget</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    budgetSnapshots.map(({ budget: b, usage }) => {
                        const pct = Math.min(usage.percentage, 100);
                        const barColor = usage.isOver ? colors.rose : usage.percentage > 80 ? '#d97706' : colors.emerald;
                        const budgetCategory = b.category && b.category !== 'all'
                            ? getCategoryById(b.category)
                            : { name: 'All Spending', icon: 'wallet-outline', color: colors.primary };
                        return (
                            <View key={b.id} style={[styles.budgetCard, { backgroundColor: colors.card, borderColor: usage.isOver ? colors.rose : colors.border }]}>
                                <View style={styles.budgetHeader}>
                                    <View style={styles.budgetBadges}>
                                        <View style={[styles.budgetPeriodBadge, { backgroundColor: colors.primaryLight }]}>
                                            <Text style={[styles.budgetPeriodText, { color: colors.primary }]}>
                                                {b.period.charAt(0).toUpperCase() + b.period.slice(1)}
                                            </Text>
                                        </View>
                                        <View style={[styles.budgetCategoryBadge, { backgroundColor: `${budgetCategory.color}18` }]}>
                                            <Ionicons name={budgetCategory.icon} size={13} color={budgetCategory.color} />
                                            <Text style={[styles.budgetCategoryText, { color: budgetCategory.color }]} numberOfLines={1}>
                                                {budgetCategory.name}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.budgetActions}>
                                        <TouchableOpacity onPress={() => openEdit(b)} style={[styles.actionBtn, { backgroundColor: colors.inputBg }]}>
                                            <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDelete(b.id)} style={[styles.actionBtn, { backgroundColor: colors.inputBg }]}>
                                            <Ionicons name="trash" size={16} color={colors.rose} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.budgetAmounts}>
                                    <Text style={[styles.spentAmount, { color: colors.textPrimary }]}>{formatCurrency(usage.spent, currency)}</Text>
                                    <Text style={[styles.limitAmount, { color: colors.textSecondary }]}>of {formatCurrency(usage.limit, currency)}</Text>
                                </View>

                                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                                </View>

                                <View style={styles.budgetFooter}>
                                    <Text style={[styles.pctText, { color: colors.textSecondary }]}>{usage.percentage.toFixed(0)}% used</Text>
                                    {usage.isOver ? (
                                        <View style={styles.overBadge}>
                                            <Ionicons name="warning" size={12} color={colors.rose} />
                                            <Text style={[styles.overText, { color: colors.rose }]}>
                                                Over by {formatCurrency(Math.abs(usage.remaining), currency)}
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={[styles.remainingText, { color: colors.emerald }]}>
                                            {formatCurrency(usage.remaining, currency)} remaining
                                        </Text>
                                    )}
                                </View>
                            </View>
                        );
                    })
                )}
            </ScrollView>

            {/* Add/Edit Modal */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalBox, { backgroundColor: colors.modalBg }]}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editBudget ? 'Edit Budget' : 'New Budget'}</Text>
                            <TouchableOpacity onPress={() => requestAnimationFrame(() => setShowModal(false))} style={[styles.closeBtn, { backgroundColor: colors.inputBg }]}>
                                <Ionicons name="close" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Period</Text>
                        <View style={[styles.periodTabs, { backgroundColor: colors.inputBg }]}>
                            {['daily', 'weekly', 'monthly'].map(p => (
                                <TouchableOpacity
                                    key={p}
                                    style={[styles.periodTab, period === p && [styles.periodTabActive, { backgroundColor: colors.primary }]]}
                                    onPress={() => setPeriod(p)}
                                >
                                    <Text style={[styles.periodTabText, { color: colors.textSecondary }, period === p && styles.periodTabTextActive]}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPicker}>
                            {budgetCategories.map(cat => {
                                const active = category === cat.id;
                                return (
                                    <TouchableOpacity
                                        key={cat.id}
                                        style={[
                                            styles.categoryChip,
                                            { backgroundColor: active ? `${cat.color}18` : colors.inputBg, borderColor: active ? cat.color : colors.border },
                                        ]}
                                        onPress={() => setCategory(cat.id)}
                                        activeOpacity={0.75}
                                    >
                                        <Ionicons name={cat.icon} size={15} color={active ? cat.color : colors.textSecondary} />
                                        <Text style={[styles.categoryChipText, { color: active ? cat.color : colors.textSecondary }]}>{cat.name}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Budget Limit ({currency})</Text>
                        <FastInput
                            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                            placeholder="Enter amount"
                            placeholderTextColor={colors.textMuted}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                        />

                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                            <Ionicons name="save-outline" size={18} color="#fff" />
                            <Text style={styles.saveBtnText}>{editBudget ? 'Update Budget' : 'Create Budget'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F2F3F5' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingTop: 52, paddingBottom: Spacing.md,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    backBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(255,102,0,0.14)',
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: FontSize.xxl, fontFamily: 'Poppins_700Bold', color: '#1A1040' },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#ff6600', paddingHorizontal: Spacing.md,
        paddingVertical: 9, borderRadius: BorderRadius.full,
    },
    addBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: FontSize.sm },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },
    emptyState: {
        alignItems: 'center',
        borderRadius: BorderRadius.xl,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: 'rgba(83,96,132,0.12)',
        paddingVertical: Spacing.xl,
        paddingHorizontal: Spacing.lg,
        marginTop: Spacing.md,
    },
    emptyIconWrap: {
        width: 66,
        height: 66,
        borderRadius: 33,
        backgroundColor: 'rgba(255,102,0,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
    },
    emptyTitle: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold', color: '#1A1040' },
    emptyDesc: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        color: '#5C6275',
        marginTop: Spacing.xs,
        textAlign: 'center',
    },
    emptyCtaBtn: {
        marginTop: Spacing.lg,
        borderRadius: BorderRadius.full,
        backgroundColor: '#ff6600',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    emptyCtaText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    budgetCard: {
        marginTop: Spacing.md,
        marginBottom: Spacing.sm,
        padding: Spacing.lg,
        borderRadius: BorderRadius.xl,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: 'rgba(83,96,132,0.14)',
    },
    budgetCardOver: { borderColor: 'rgba(220,38,38,0.34)' },
    budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md, gap: Spacing.sm },
    budgetBadges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    budgetPeriodBadge: {
        backgroundColor: 'rgba(255,102,0,0.10)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
        borderRadius: BorderRadius.full,
    },
    budgetPeriodText: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold', color: '#ff6600' },
    budgetCategoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 5,
        borderRadius: BorderRadius.full,
        maxWidth: '100%',
    },
    budgetCategoryText: { fontSize: FontSize.xs, fontFamily: 'Poppins_700Bold' },
    budgetActions: { flexDirection: 'row', gap: Spacing.sm },
    actionBtn: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: 'rgba(83,96,132,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    budgetAmounts: { marginBottom: Spacing.md },
    spentAmount: { fontSize: FontSize.xxxl, fontFamily: 'Poppins_700Bold', color: '#1A1040' },
    limitAmount: { fontSize: FontSize.sm, color: '#5C6275', marginTop: 2, fontFamily: 'Poppins_400Regular' },
    progressBar: {
        height: 10, borderRadius: 6, backgroundColor: 'rgba(83,96,132,0.12)', overflow: 'hidden',
        marginBottom: Spacing.md,
    },
    progressFill: { height: '100%', borderRadius: 6 },
    budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pctText: { fontSize: FontSize.sm, color: '#4B5570', fontFamily: 'Poppins_500Medium' },
    overBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    overText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#dc2626' },
    remainingText: { fontSize: FontSize.sm, color: '#059669', fontFamily: 'Poppins_600SemiBold' },
    // Modal
    modalOverlay: {
        flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(22,16,40,0.32)',
    },
    modalBox: {
        backgroundColor: '#fff',
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
        padding: Spacing.xl,
    },
    modalHandle: {
        alignSelf: 'center',
        width: 46,
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(83,96,132,0.22)',
        marginBottom: Spacing.md,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    modalTitle: { fontSize: FontSize.xl, fontFamily: 'Poppins_700Bold', color: '#1A1040' },
    closeBtn: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: 'rgba(83,96,132,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputLabel: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4B5570',
        marginBottom: Spacing.sm,
        marginTop: Spacing.md,
    },
    periodTabs: {
        flexDirection: 'row',
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(83,96,132,0.10)',
        padding: 3,
    },
    periodTab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm },
    periodTabActive: { backgroundColor: '#ff6600' },
    periodTabText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#7B8496' },
    periodTabTextActive: { color: '#fff', fontFamily: 'Poppins_700Bold' },
    categoryPicker: {
        gap: Spacing.sm,
        paddingRight: Spacing.md,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
    },
    categoryChipText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    input: {
        backgroundColor: '#F8F9FC', borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        color: '#1A1040',
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_600SemiBold',
        borderWidth: 1,
        borderColor: 'rgba(83,96,132,0.22)',
    },
    saveBtn: {
        backgroundColor: '#ff6600',
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Spacing.xl,
        flexDirection: 'row',
        gap: 6,
    },
    saveBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: FontSize.lg },
});
