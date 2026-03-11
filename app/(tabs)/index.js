import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { filterTransactionsByPeriod, groupByCategory, calculateBudgetUsage, formatTime, formatDate } from '../../utils/helpers';
import { getCategoryById } from '../../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius, Breakpoints } from '../../constants/theme';

export default function Dashboard() {
    const { transactions, budgets, assets, currency, loading } = useApp();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isTablet = width >= Breakpoints.tablet;

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </View>
        );
    }

    const monthlyTx = filterTransactionsByPeriod(transactions, 'monthly');
    const totalIncome = monthlyTx.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalSpending = monthlyTx.filter(t => t.type === 'spending').reduce((s, t) => s + Math.abs(t.amount), 0);
    const balance = totalIncome - totalSpending;

    const todayTx = filterTransactionsByPeriod(transactions, 'daily');
    const todaySpending = todayTx.filter(t => t.type === 'spending').reduce((s, t) => s + Math.abs(t.amount), 0);

    const spendingTx = monthlyTx.filter(t => t.type === 'spending');
    const catGroups = groupByCategory(spendingTx);
    const topCategories = Object.entries(catGroups)
        .map(([id, data]) => ({ ...getCategoryById(id), total: data.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    const maxCatTotal = topCategories.length > 0 ? topCategories[0].total : 1;

    const recentTransactions = transactions.slice(0, 8);
    const overBudgets = budgets.filter(b => calculateBudgetUsage(transactions, b).isOver);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.appName}>💎 FinanceFlow</Text>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => router.push('/chatbot')} style={styles.headerBtn}>
                        <Ionicons name="chatbubble-ellipses" size={22} color={Colors.dark.emerald} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push('/settings')} style={styles.headerBtn}>
                        <Ionicons name="settings-outline" size={22} color={Colors.dark.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* Summary Cards */}
                <View style={[styles.summaryRow, isTablet && styles.summaryRowTablet]}>
                    <View style={[styles.summaryCard, { borderColor: 'rgba(16,185,129,0.3)' }]}>
                        <Text style={[styles.summaryLabel, { color: Colors.dark.emerald }]}>📈 INCOME</Text>
                        <Text style={styles.summaryAmount}>{formatCurrency(totalIncome, currency)}</Text>
                    </View>
                    <View style={[styles.summaryCard, { borderColor: 'rgba(239,68,68,0.3)' }]}>
                        <Text style={[styles.summaryLabel, { color: Colors.dark.red }]}>📉 SPENDING</Text>
                        <Text style={styles.summaryAmount}>{formatCurrency(totalSpending, currency)}</Text>
                    </View>
                    <View style={[styles.summaryCard, { borderColor: 'rgba(59,130,246,0.3)' }]}>
                        <Text style={[styles.summaryLabel, { color: Colors.dark.blue }]}>BALANCE</Text>
                        <Text style={[styles.summaryAmount, { color: balance >= 0 ? Colors.dark.emerald : Colors.dark.red }]}>
                            {formatCurrency(balance, currency)}
                        </Text>
                    </View>
                </View>

                {/* Over Budget Warnings */}
                {overBudgets.map(b => {
                    const usage = calculateBudgetUsage(transactions, b);
                    return (
                        <View key={b.id} style={styles.warningBanner}>
                            <Ionicons name="warning" size={16} color={Colors.dark.red} />
                            <Text style={styles.warningText}>
                                {b.period} budget exceeded by {formatCurrency(Math.abs(usage.remaining), currency)}
                            </Text>
                        </View>
                    );
                })}

                {/* Today's Spending */}
                <View style={styles.todayCard}>
                    <Text style={styles.todayLabel}>Today's Spending</Text>
                    <Text style={[styles.todayAmount, { color: todaySpending > 0 ? Colors.dark.red : Colors.dark.textMuted }]}>
                        {formatCurrency(todaySpending, currency)}
                    </Text>
                </View>

                {/* Top Categories */}
                {topCategories.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Top Categories</Text>
                            <TouchableOpacity onPress={() => router.push('/charts')}>
                                <Text style={styles.seeAll}>View Charts →</Text>
                            </TouchableOpacity>
                        </View>
                        {topCategories.map(cat => (
                            <View key={cat.id} style={styles.categoryRow}>
                                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                                <View style={styles.categoryInfo}>
                                    <View style={styles.categoryLabel}>
                                        <Text style={styles.categoryName}>{cat.name}</Text>
                                        <Text style={styles.categoryAmount}>{formatCurrency(cat.total, currency)}</Text>
                                    </View>
                                    <View style={styles.progressBar}>
                                        <View style={[styles.progressFill, {
                                            width: `${(cat.total / maxCatTotal) * 100}%`,
                                            backgroundColor: cat.color,
                                        }]} />
                                    </View>
                                    <Text style={styles.categoryPct}>
                                        {totalSpending > 0 ? ((cat.total / totalSpending) * 100).toFixed(1) : 0}%
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Recent Transactions */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Transactions</Text>
                        <TouchableOpacity onPress={() => router.push('/transactions')}>
                            <Text style={styles.seeAll}>See All →</Text>
                        </TouchableOpacity>
                    </View>
                    {recentTransactions.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>📝</Text>
                            <Text style={styles.emptyTitle}>No transactions yet</Text>
                            <Text style={styles.emptyDesc}>Tap the + button to add your first income or expense</Text>
                        </View>
                    ) : (
                        recentTransactions.map(tx => {
                            const cat = getCategoryById(tx.category);
                            const isIncome = tx.type === 'income';
                            return (
                                <View key={tx.id} style={styles.txCard}>
                                    <View style={[styles.txIcon, { backgroundColor: cat.color + '20' }]}>
                                        <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                                    </View>
                                    <View style={styles.txInfo}>
                                        <Text style={styles.txName} numberOfLines={1}>{tx.description || cat.name}</Text>
                                        <Text style={styles.txCategory}>{cat.name}</Text>
                                    </View>
                                    <View style={styles.txAmountWrap}>
                                        <Text style={[styles.txAmount, { color: isIncome ? Colors.dark.emerald : Colors.dark.red }]}>
                                            {isIncome ? '+' : '-'}{formatCurrency(Math.abs(tx.amount), currency)}
                                        </Text>
                                        <Text style={styles.txTime}>{formatTime(tx.date)}</Text>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>

                {/* Quick Actions */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Quick Actions</Text>
                    <View style={styles.quickActions}>
                        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/receipt-scanner')}>
                            <View style={[styles.quickIcon, { backgroundColor: Colors.dark.purpleLight }]}>
                                <Ionicons name="camera" size={20} color={Colors.dark.purple} />
                            </View>
                            <Text style={styles.quickLabel}>Scan Receipt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/pdf-import')}>
                            <View style={[styles.quickIcon, { backgroundColor: Colors.dark.blueLight }]}>
                                <Ionicons name="document-text" size={20} color={Colors.dark.blue} />
                            </View>
                            <Text style={styles.quickLabel}>Import PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/chatbot')}>
                            <View style={[styles.quickIcon, { backgroundColor: Colors.dark.emeraldLight }]}>
                                <Ionicons name="chatbubble-ellipses" size={20} color={Colors.dark.emerald} />
                            </View>
                            <Text style={styles.quickLabel}>AI Chat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.quickAction} onPress={() => router.push('/settings')}>
                            <View style={[styles.quickIcon, { backgroundColor: Colors.dark.goldLight }]}>
                                <Ionicons name="download" size={20} color={Colors.dark.gold} />
                            </View>
                            <Text style={styles.quickLabel}>Export</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.background },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { color: Colors.dark.textMuted, fontSize: FontSize.lg },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingTop: 50, paddingBottom: Spacing.md,
        backgroundColor: Colors.dark.background,
    },
    appName: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.dark.text },
    headerRight: { flexDirection: 'row', gap: Spacing.sm },
    headerBtn: { padding: Spacing.xs },
    scrollContent: { paddingHorizontal: Spacing.lg },
    summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
    summaryRowTablet: { gap: Spacing.lg },
    summaryCard: {
        flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg,
        backgroundColor: Colors.dark.card, borderWidth: 1,
        alignItems: 'center',
    },
    summaryLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
    summaryAmount: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.dark.text, marginTop: 4 },
    warningBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.redLight, marginBottom: Spacing.md,
    },
    warningText: { fontSize: FontSize.sm, color: Colors.dark.red, fontWeight: '600', flex: 1 },
    todayCard: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: Spacing.lg, borderRadius: BorderRadius.lg,
        backgroundColor: Colors.dark.card, marginBottom: Spacing.lg,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    todayLabel: { fontSize: FontSize.md, color: Colors.dark.textSecondary },
    todayAmount: { fontSize: FontSize.lg, fontWeight: '700' },
    section: { marginBottom: Spacing.xl },
    sectionHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: Spacing.md,
    },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text },
    seeAll: { fontSize: FontSize.sm, color: Colors.dark.emerald, fontWeight: '600' },
    categoryRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    categoryIcon: { fontSize: 22 },
    categoryInfo: { flex: 1 },
    categoryLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    categoryName: { fontSize: FontSize.md, color: Colors.dark.text },
    categoryAmount: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.text },
    progressBar: {
        height: 4, borderRadius: 2, backgroundColor: Colors.dark.inputBg, overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 2 },
    categoryPct: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2, textAlign: 'right' },
    emptyState: { alignItems: 'center', paddingVertical: Spacing.xxxl },
    emptyIcon: { fontSize: 40, marginBottom: Spacing.md },
    emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text },
    emptyDesc: { fontSize: FontSize.sm, color: Colors.dark.textMuted, textAlign: 'center', marginTop: Spacing.xs },
    txCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        paddingVertical: Spacing.md, borderBottomWidth: 1, borderColor: Colors.dark.border,
    },
    txIcon: {
        width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    },
    txInfo: { flex: 1 },
    txName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.text },
    txCategory: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2 },
    txAmountWrap: { alignItems: 'flex-end' },
    txAmount: { fontSize: FontSize.md, fontWeight: '700' },
    txTime: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2 },
    quickActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
    quickAction: { flex: 1, alignItems: 'center', gap: Spacing.sm },
    quickIcon: {
        width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    },
    quickLabel: { fontSize: FontSize.xs, color: Colors.dark.textSecondary, fontWeight: '600' },
});
