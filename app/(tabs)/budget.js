import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { calculateBudgetUsage, generateId } from '../../utils/helpers';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function Budget() {
    const { budgets, transactions, currency, addBudget, updateBudget, deleteBudget } = useApp();
    const [showModal, setShowModal] = useState(false);
    const [editBudget, setEditBudget] = useState(null);
    const [period, setPeriod] = useState('monthly');
    const [amount, setAmount] = useState('');

    const openAdd = () => {
        setEditBudget(null);
        setPeriod('monthly');
        setAmount('');
        setShowModal(true);
    };

    const openEdit = (b) => {
        setEditBudget(b);
        setPeriod(b.period);
        setAmount(b.amount.toString());
        setShowModal(true);
    };

    const handleSave = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) {
            Alert.alert('Error', 'Please enter a valid amount');
            return;
        }

        if (editBudget) {
            await updateBudget({ ...editBudget, period, amount: amt });
        } else {
            await addBudget({ id: generateId(), period, amount: amt });
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
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Budget Manager</Text>
                <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addBtnText}>Add Budget</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {budgets.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🎯</Text>
                        <Text style={styles.emptyTitle}>No budgets set</Text>
                        <Text style={styles.emptyDesc}>Create a budget to track your spending limits</Text>
                    </View>
                ) : (
                    budgets.map(b => {
                        const usage = calculateBudgetUsage(transactions, b);
                        const pct = Math.min(usage.percentage, 100);
                        const barColor = usage.isOver ? Colors.dark.red : usage.percentage > 80 ? Colors.dark.gold : Colors.dark.emerald;
                        return (
                            <View key={b.id} style={[styles.budgetCard, usage.isOver && styles.budgetCardOver]}>
                                <View style={styles.budgetHeader}>
                                    <View style={styles.budgetPeriodBadge}>
                                        <Text style={styles.budgetPeriodText}>
                                            {b.period.charAt(0).toUpperCase() + b.period.slice(1)}
                                        </Text>
                                    </View>
                                    <View style={styles.budgetActions}>
                                        <TouchableOpacity onPress={() => openEdit(b)} style={styles.actionBtn}>
                                            <Ionicons name="pencil" size={16} color={Colors.dark.textSecondary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDelete(b.id)} style={styles.actionBtn}>
                                            <Ionicons name="trash" size={16} color={Colors.dark.red} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.budgetAmounts}>
                                    <Text style={styles.spentAmount}>{formatCurrency(usage.spent, currency)}</Text>
                                    <Text style={styles.limitAmount}>of {formatCurrency(usage.limit, currency)}</Text>
                                </View>

                                <View style={styles.progressBar}>
                                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                                </View>

                                <View style={styles.budgetFooter}>
                                    <Text style={styles.pctText}>{usage.percentage.toFixed(0)}% used</Text>
                                    {usage.isOver ? (
                                        <View style={styles.overBadge}>
                                            <Ionicons name="warning" size={12} color={Colors.dark.red} />
                                            <Text style={styles.overText}>
                                                Over by {formatCurrency(Math.abs(usage.remaining), currency)}
                                            </Text>
                                        </View>
                                    ) : (
                                        <Text style={styles.remainingText}>
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
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editBudget ? 'Edit Budget' : 'New Budget'}</Text>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>Period</Text>
                        <View style={styles.periodTabs}>
                            {['daily', 'weekly', 'monthly'].map(p => (
                                <TouchableOpacity
                                    key={p}
                                    style={[styles.periodTab, period === p && styles.periodTabActive]}
                                    onPress={() => setPeriod(p)}
                                >
                                    <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.inputLabel}>Budget Limit ({currency})</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter amount"
                            placeholderTextColor={Colors.dark.textMuted}
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="numeric"
                        />

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                            <Text style={styles.saveBtnText}>{editBudget ? 'Update Budget' : 'Create Budget'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.background },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingTop: 50, paddingBottom: Spacing.md,
    },
    title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.dark.text },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: Colors.dark.emerald, paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
    emptyState: { alignItems: 'center', paddingVertical: 80 },
    emptyIcon: { fontSize: 50, marginBottom: Spacing.md },
    emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text },
    emptyDesc: { fontSize: FontSize.sm, color: Colors.dark.textMuted, marginTop: Spacing.xs },
    budgetCard: {
        marginHorizontal: Spacing.lg, marginBottom: Spacing.md, padding: Spacing.lg,
        borderRadius: BorderRadius.lg, backgroundColor: Colors.dark.card,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    budgetCardOver: { borderColor: 'rgba(239,68,68,0.4)' },
    budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
    budgetPeriodBadge: {
        backgroundColor: Colors.dark.emeraldLight, paddingHorizontal: Spacing.md,
        paddingVertical: 4, borderRadius: BorderRadius.sm,
    },
    budgetPeriodText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.dark.emerald },
    budgetActions: { flexDirection: 'row', gap: Spacing.sm },
    actionBtn: { padding: 4 },
    budgetAmounts: { marginBottom: Spacing.md },
    spentAmount: { fontSize: FontSize.xxxl, fontWeight: '800', color: Colors.dark.text },
    limitAmount: { fontSize: FontSize.sm, color: Colors.dark.textMuted, marginTop: 2 },
    progressBar: {
        height: 8, borderRadius: 4, backgroundColor: Colors.dark.inputBg, overflow: 'hidden',
        marginBottom: Spacing.md,
    },
    progressFill: { height: '100%', borderRadius: 4 },
    budgetFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pctText: { fontSize: FontSize.sm, color: Colors.dark.textSecondary },
    overBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    overText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.red },
    remainingText: { fontSize: FontSize.sm, color: Colors.dark.emerald },
    // Modal
    modalOverlay: {
        flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.dark.overlay,
    },
    modalBox: {
        backgroundColor: Colors.dark.modalBg, borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl,
    },
    modalHeader: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    modalTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.dark.text },
    inputLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.md },
    periodTabs: { flexDirection: 'row', borderRadius: BorderRadius.md, backgroundColor: Colors.dark.card, padding: 3 },
    periodTab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.sm },
    periodTabActive: { backgroundColor: Colors.dark.emerald },
    periodTabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textMuted },
    periodTabTextActive: { color: '#fff' },
    input: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        color: Colors.dark.text, fontSize: FontSize.lg, borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    saveBtn: {
        backgroundColor: Colors.dark.emerald, paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.xl,
    },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.lg },
});
