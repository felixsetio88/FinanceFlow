import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { filterTransactionsByPeriod, groupByCategory } from '../../utils/helpers';
import { getCategoryById } from '../../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function Charts() {
    const { transactions, currency } = useApp();
    const [period, setPeriod] = useState('monthly');
    const screenWidth = Dimensions.get('window').width - Spacing.lg * 2;

    const periodTx = useMemo(() => filterTransactionsByPeriod(transactions, period), [transactions, period]);
    const spendingTx = periodTx.filter(t => t.type === 'spending');
    const incomeTx = periodTx.filter(t => t.type === 'income');
    const totalSpending = spendingTx.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalIncome = incomeTx.reduce((s, t) => s + Math.abs(t.amount), 0);

    const catGroups = groupByCategory(spendingTx);
    const categoryData = Object.entries(catGroups)
        .map(([id, data]) => ({ ...getCategoryById(id), total: data.total, count: data.count }))
        .sort((a, b) => b.total - a.total);
    const maxCatTotal = categoryData.length > 0 ? categoryData[0].total : 1;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Charts & Analytics</Text>
            </View>

            {/* Period Tabs */}
            <View style={styles.periodTabs}>
                {['daily', 'weekly', 'monthly'].map(p => (
                    <TouchableOpacity
                        key={p}
                        style={[styles.periodTab, period === p && styles.periodTabActive]}
                        onPress={() => setPeriod(p)}
                    >
                        <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* Income vs Spending Overview */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Income vs Spending</Text>
                    <View style={styles.barChartContainer}>
                        {/* Income Bar */}
                        <View style={styles.barRow}>
                            <Text style={styles.barLabel}>Income</Text>
                            <View style={styles.barTrack}>
                                <View style={[styles.barFill, {
                                    width: `${totalIncome > 0 ? Math.min((totalIncome / Math.max(totalIncome, totalSpending)) * 100, 100) : 0}%`,
                                    backgroundColor: Colors.dark.emerald
                                }]} />
                            </View>
                            <Text style={[styles.barAmount, { color: Colors.dark.emerald }]}>
                                {formatCurrency(totalIncome, currency)}
                            </Text>
                        </View>
                        {/* Spending Bar */}
                        <View style={styles.barRow}>
                            <Text style={styles.barLabel}>Spending</Text>
                            <View style={styles.barTrack}>
                                <View style={[styles.barFill, {
                                    width: `${totalSpending > 0 ? Math.min((totalSpending / Math.max(totalIncome, totalSpending)) * 100, 100) : 0}%`,
                                    backgroundColor: Colors.dark.red
                                }]} />
                            </View>
                            <Text style={[styles.barAmount, { color: Colors.dark.red }]}>
                                {formatCurrency(totalSpending, currency)}
                            </Text>
                        </View>
                        {/* Net */}
                        <View style={styles.netRow}>
                            <Text style={styles.netLabel}>Net</Text>
                            <Text style={[styles.netAmount, { color: totalIncome - totalSpending >= 0 ? Colors.dark.emerald : Colors.dark.red }]}>
                                {formatCurrency(totalIncome - totalSpending, currency)}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Spending by Category */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Spending by Category</Text>
                    {categoryData.length === 0 ? (
                        <View style={styles.noData}>
                            <Text style={styles.noDataText}>No spending data for this period</Text>
                        </View>
                    ) : (
                        <View>
                            {/* Visual Donut Representation */}
                            <View style={styles.donutContainer}>
                                {categoryData.slice(0, 6).map((cat, i) => {
                                    const pct = totalSpending > 0 ? (cat.total / totalSpending * 100) : 0;
                                    return (
                                        <View key={cat.id} style={styles.donutItem}>
                                            <View style={styles.donutRow}>
                                                <View style={[styles.donutDot, { backgroundColor: cat.color }]} />
                                                <Text style={styles.donutIcon}>{cat.icon}</Text>
                                                <Text style={styles.donutName}>{cat.name}</Text>
                                                <Text style={styles.donutPct}>{pct.toFixed(1)}%</Text>
                                            </View>
                                            <View style={styles.donutBar}>
                                                <View style={[styles.donutFill, {
                                                    width: `${pct}%`,
                                                    backgroundColor: cat.color,
                                                }]} />
                                            </View>
                                            <Text style={styles.donutAmount}>{formatCurrency(cat.total, currency)}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                            {/* Full Category Bars */}
                            <View style={styles.catBars}>
                                {categoryData.map((cat) => (
                                    <View key={cat.id} style={styles.catBarRow}>
                                        <Text style={styles.catBarIcon}>{cat.icon}</Text>
                                        <View style={styles.catBarInfo}>
                                            <View style={styles.catBarHeader}>
                                                <Text style={styles.catBarName} numberOfLines={1}>{cat.name}</Text>
                                                <Text style={styles.catBarAmount}>{formatCurrency(cat.total, currency)}</Text>
                                            </View>
                                            <View style={styles.catBarTrack}>
                                                <View style={[styles.catBarFill, {
                                                    width: `${(cat.total / maxCatTotal) * 100}%`,
                                                    backgroundColor: cat.color,
                                                }]} />
                                            </View>
                                            <View style={styles.catBarFooter}>
                                                <Text style={styles.catBarCount}>{cat.count} transaction{cat.count > 1 ? 's' : ''}</Text>
                                                <Text style={styles.catBarPct}>
                                                    {totalSpending > 0 ? ((cat.total / totalSpending) * 100).toFixed(1) : 0}%
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>

                {/* Stats */}
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>Quick Stats</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{periodTx.length}</Text>
                            <Text style={styles.statLabel}>Transactions</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{categoryData.length}</Text>
                            <Text style={styles.statLabel}>Categories</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {periodTx.length > 0 ? formatCurrency(totalSpending / Math.max(spendingTx.length, 1), currency) : formatCurrency(0, currency)}
                            </Text>
                            <Text style={styles.statLabel}>Avg per Expense</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={[styles.statValue, { color: totalIncome > totalSpending ? Colors.dark.emerald : Colors.dark.red }]}>
                                {totalIncome > 0 ? ((totalSpending / totalIncome) * 100).toFixed(0) : 0}%
                            </Text>
                            <Text style={styles.statLabel}>Spending Rate</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.background },
    header: { paddingHorizontal: Spacing.lg, paddingTop: 50, paddingBottom: Spacing.sm },
    title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.dark.text },
    periodTabs: {
        flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: Spacing.lg,
        borderRadius: BorderRadius.md, backgroundColor: Colors.dark.card, padding: 3,
    },
    periodTab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm },
    periodTabActive: { backgroundColor: Colors.dark.emerald },
    periodText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textMuted },
    periodTextActive: { color: '#fff' },
    chartCard: {
        marginHorizontal: Spacing.lg, marginBottom: Spacing.lg,
        padding: Spacing.lg, borderRadius: BorderRadius.lg,
        backgroundColor: Colors.dark.card, borderWidth: 1, borderColor: Colors.dark.border,
    },
    chartTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text, marginBottom: Spacing.md },
    barChartContainer: { gap: Spacing.md },
    barRow: { gap: 4 },
    barLabel: { fontSize: FontSize.sm, color: Colors.dark.textSecondary },
    barTrack: { height: 20, borderRadius: 10, backgroundColor: Colors.dark.inputBg, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 10 },
    barAmount: { fontSize: FontSize.sm, fontWeight: '700', textAlign: 'right' },
    netRow: {
        flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.md,
        borderTopWidth: 1, borderColor: Colors.dark.border,
    },
    netLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.dark.text },
    netAmount: { fontSize: FontSize.md, fontWeight: '700' },
    noData: { alignItems: 'center', paddingVertical: Spacing.xxxl },
    noDataText: { color: Colors.dark.textMuted, fontSize: FontSize.md },
    donutContainer: { gap: Spacing.md, marginBottom: Spacing.lg },
    donutItem: { gap: 4 },
    donutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    donutDot: { width: 10, height: 10, borderRadius: 5 },
    donutIcon: { fontSize: 16 },
    donutName: { flex: 1, fontSize: FontSize.md, color: Colors.dark.text },
    donutPct: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.dark.textSecondary },
    donutBar: { height: 6, borderRadius: 3, backgroundColor: Colors.dark.inputBg, overflow: 'hidden' },
    donutFill: { height: '100%', borderRadius: 3 },
    donutAmount: { fontSize: FontSize.xs, color: Colors.dark.textMuted, textAlign: 'right' },
    catBars: { gap: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderColor: Colors.dark.border },
    catBarRow: { flexDirection: 'row', gap: Spacing.md },
    catBarIcon: { fontSize: 20, width: 28 },
    catBarInfo: { flex: 1 },
    catBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    catBarName: { fontSize: FontSize.md, color: Colors.dark.text, flex: 1 },
    catBarAmount: { fontSize: FontSize.md, fontWeight: '700', color: Colors.dark.text },
    catBarTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.dark.inputBg, overflow: 'hidden' },
    catBarFill: { height: '100%', borderRadius: 3, minWidth: 4 },
    catBarFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    catBarCount: { fontSize: FontSize.xs, color: Colors.dark.textMuted },
    catBarPct: { fontSize: FontSize.xs, color: Colors.dark.textMuted },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
    statItem: {
        width: '47%', backgroundColor: Colors.dark.surface, padding: Spacing.md,
        borderRadius: BorderRadius.md, alignItems: 'center',
    },
    statValue: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.dark.text },
    statLabel: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 4 },
});
