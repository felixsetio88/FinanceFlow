import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { filterTransactionsByPeriod, groupByDate, formatDate, formatTime, formatDateShort } from '../../utils/helpers';
import { getCategoryById, spendingCategories, incomeCategories } from '../../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';

export default function Transactions() {
    const { transactions, currency, deleteTransaction } = useApp();
    const [period, setPeriod] = useState('daily');
    const [refDate, setRefDate] = useState(new Date());
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState(null);
    const [expandedId, setExpandedId] = useState(null);

    const navigate = (dir) => {
        const fn = dir === 'next'
            ? period === 'daily' ? addDays : period === 'weekly' ? addWeeks : addMonths
            : period === 'daily' ? subDays : period === 'weekly' ? subWeeks : subMonths;
        setRefDate(fn(refDate, 1));
    };

    const filtered = useMemo(() => {
        let tx = filterTransactionsByPeriod(transactions, period, refDate);
        if (search) {
            const q = search.toLowerCase();
            tx = tx.filter(t =>
                (t.description || '').toLowerCase().includes(q) ||
                getCategoryById(t.category).name.toLowerCase().includes(q)
            );
        }
        if (filterCat) {
            tx = tx.filter(t => t.category === filterCat);
        }
        return tx;
    }, [transactions, period, refDate, search, filterCat]);

    const periodLabel = period === 'daily'
        ? format(refDate, 'MMM dd, yyyy')
        : period === 'weekly'
            ? `Week of ${format(refDate, 'MMM dd')}`
            : format(refDate, 'MMMM yyyy');

    const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalSpending = filtered.filter(t => t.type === 'spending').reduce((s, t) => s + Math.abs(t.amount), 0);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Transaction History</Text>
            </View>

            {/* Period Tabs */}
            <View style={styles.periodTabs}>
                {['daily', 'weekly', 'monthly'].map(p => (
                    <TouchableOpacity
                        key={p}
                        style={[styles.periodTab, period === p && styles.periodTabActive]}
                        onPress={() => { setPeriod(p); setRefDate(new Date()); }}
                    >
                        <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Date Navigation */}
            <View style={styles.dateNav}>
                <TouchableOpacity onPress={() => navigate('prev')}>
                    <Ionicons name="chevron-back" size={22} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.dateLabel}>{periodLabel}</Text>
                <TouchableOpacity onPress={() => navigate('next')}>
                    <Ionicons name="chevron-forward" size={22} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Totals */}
            <View style={styles.totalsRow}>
                <View style={styles.totalItem}>
                    <Text style={[styles.totalAmount, { color: Colors.dark.emerald }]}>+{formatCurrency(totalIncome, currency)}</Text>
                    <Text style={styles.totalLabel}>Income</Text>
                </View>
                <View style={styles.totalDivider} />
                <View style={styles.totalItem}>
                    <Text style={[styles.totalAmount, { color: Colors.dark.red }]}>-{formatCurrency(totalSpending, currency)}</Text>
                    <Text style={styles.totalLabel}>Spending</Text>
                </View>
            </View>

            {/* Search */}
            <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={16} color={Colors.dark.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search transactions..."
                        placeholderTextColor={Colors.dark.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search ? (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={16} color={Colors.dark.textMuted} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* Transaction List */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {filtered.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>📋</Text>
                        <Text style={styles.emptyTitle}>No transactions</Text>
                        <Text style={styles.emptyDesc}>No transactions found for this period</Text>
                    </View>
                ) : (
                    filtered.map(tx => {
                        const cat = getCategoryById(tx.category);
                        const isIncome = tx.type === 'income';
                        const expanded = expandedId === tx.id;
                        return (
                            <TouchableOpacity
                                key={tx.id}
                                style={styles.txCard}
                                onPress={() => setExpandedId(expanded ? null : tx.id)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.txMain}>
                                    <View style={[styles.txIcon, { backgroundColor: cat.color + '20' }]}>
                                        <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                                    </View>
                                    <View style={styles.txInfo}>
                                        <Text style={styles.txName} numberOfLines={1}>{tx.description || cat.name}</Text>
                                        <Text style={styles.txMeta}>{cat.name} · {formatTime(tx.date)}</Text>
                                    </View>
                                    <Text style={[styles.txAmount, { color: isIncome ? Colors.dark.emerald : Colors.dark.red }]}>
                                        {isIncome ? '+' : '-'}{formatCurrency(Math.abs(tx.amount), currency)}
                                    </Text>
                                </View>
                                {expanded && (
                                    <View style={styles.txExpanded}>
                                        <Text style={styles.txDetail}>Date: {formatDate(tx.date)}</Text>
                                        <Text style={styles.txDetail}>Payment: {tx.paymentMethod || 'cash'}</Text>
                                        {(tx.items || []).length > 0 && (
                                            <View style={styles.txItems}>
                                                <Text style={styles.txDetailLabel}>Items:</Text>
                                                {tx.items.map((item, i) => (
                                                    <Text key={i} style={styles.txDetail}>
                                                        · {item.name} ×{item.quantity} = {formatCurrency(item.price * item.quantity, currency)}
                                                    </Text>
                                                ))}
                                            </View>
                                        )}
                                        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteTransaction(tx.id)}>
                                            <Ionicons name="trash" size={14} color={Colors.dark.red} />
                                            <Text style={styles.deleteTxt}>Delete</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.background },
    header: { paddingHorizontal: Spacing.lg, paddingTop: 50, paddingBottom: Spacing.sm },
    title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.dark.text },
    periodTabs: {
        flexDirection: 'row', marginHorizontal: Spacing.lg, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.card, padding: 3,
    },
    periodTab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm },
    periodTabActive: { backgroundColor: Colors.dark.emerald },
    periodText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textMuted },
    periodTextActive: { color: '#fff' },
    dateNav: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    dateLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.text },
    totalsRow: {
        flexDirection: 'row', marginHorizontal: Spacing.lg, padding: Spacing.md,
        borderRadius: BorderRadius.md, backgroundColor: Colors.dark.card,
        marginBottom: Spacing.md,
    },
    totalItem: { flex: 1, alignItems: 'center' },
    totalAmount: { fontSize: FontSize.md, fontWeight: '700' },
    totalLabel: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2 },
    totalDivider: { width: 1, backgroundColor: Colors.dark.border, marginHorizontal: Spacing.md },
    searchRow: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
    searchBox: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        backgroundColor: Colors.dark.card, borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    searchInput: { flex: 1, color: Colors.dark.text, fontSize: FontSize.md },
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: { fontSize: 40, marginBottom: Spacing.md },
    emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text },
    emptyDesc: { fontSize: FontSize.sm, color: Colors.dark.textMuted },
    txCard: {
        marginHorizontal: Spacing.lg, padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.card, marginBottom: Spacing.sm,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    txMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    txIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    txInfo: { flex: 1 },
    txName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.text },
    txMeta: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2 },
    txAmount: { fontSize: FontSize.md, fontWeight: '700' },
    txExpanded: {
        marginTop: Spacing.md, paddingTop: Spacing.md,
        borderTopWidth: 1, borderColor: Colors.dark.border,
    },
    txDetail: { fontSize: FontSize.sm, color: Colors.dark.textSecondary, marginBottom: 2 },
    txDetailLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.text, marginBottom: 4 },
    txItems: { marginTop: Spacing.sm },
    deleteBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        marginTop: Spacing.md, alignSelf: 'flex-end',
    },
    deleteTxt: { fontSize: FontSize.sm, color: Colors.dark.red },
});
