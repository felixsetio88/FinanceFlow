import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { generateId } from '../../utils/helpers';
import { accountTypes, getAccountTypeById } from '../../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function Assets() {
    const { assets, currency, addAsset, updateAsset, deleteAsset } = useApp();
    const [showModal, setShowModal] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [editAsset, setEditAsset] = useState(null);

    const [name, setName] = useState('');
    const [type, setType] = useState('bank');
    const [balance, setBalance] = useState('');

    const [fromId, setFromId] = useState('');
    const [toId, setToId] = useState('');
    const [transferAmount, setTransferAmount] = useState('');

    const totalBalance = assets.reduce((s, a) => s + a.balance, 0);

    const openAdd = () => {
        setEditAsset(null);
        setName('');
        setType('bank');
        setBalance('');
        setShowModal(true);
    };

    const openEdit = (a) => {
        setEditAsset(a);
        setName(a.name);
        setType(a.type);
        setBalance(a.balance.toString());
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter a name');
            return;
        }
        const bal = parseFloat(balance) || 0;

        if (editAsset) {
            await updateAsset({ ...editAsset, name, type, balance: bal });
        } else {
            await addAsset({ id: generateId(), name, type, balance: bal });
        }
        setShowModal(false);
    };

    const handleTransfer = async () => {
        const amt = parseFloat(transferAmount);
        if (!amt || amt <= 0) {
            Alert.alert('Error', 'Enter a valid amount');
            return;
        }
        if (!fromId || !toId || fromId === toId) {
            Alert.alert('Error', 'Select different accounts');
            return;
        }
        const from = assets.find(a => a.id === fromId);
        const to = assets.find(a => a.id === toId);
        if (!from || !to) return;

        await updateAsset({ ...from, balance: from.balance - amt });
        await updateAsset({ ...to, balance: to.balance + amt });
        setShowTransfer(false);
        setTransferAmount('');
    };

    const handleDelete = (id) => {
        Alert.alert('Delete Account', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteAsset(id) },
        ]);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Assets</Text>
                <View style={styles.headerBtns}>
                    {assets.length >= 2 && (
                        <TouchableOpacity style={styles.transferBtn} onPress={() => setShowTransfer(true)}>
                            <Ionicons name="swap-horizontal" size={16} color={Colors.dark.blue} />
                            <Text style={styles.transferBtnText}>Transfer</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
                        <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Total */}
            <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total Assets</Text>
                <Text style={styles.totalAmount}>{formatCurrency(totalBalance, currency)}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {assets.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>🏦</Text>
                        <Text style={styles.emptyTitle}>No accounts yet</Text>
                        <Text style={styles.emptyDesc}>Add your bank accounts, wallets, and more</Text>
                    </View>
                ) : (
                    assets.map(a => {
                        const at = getAccountTypeById(a.type);
                        return (
                            <TouchableOpacity key={a.id} style={styles.assetCard} onPress={() => openEdit(a)} activeOpacity={0.7}>
                                <View style={styles.assetIcon}>
                                    <Text style={{ fontSize: 24 }}>{at.icon}</Text>
                                </View>
                                <View style={styles.assetInfo}>
                                    <Text style={styles.assetName}>{a.name}</Text>
                                    <Text style={styles.assetType}>{at.name}</Text>
                                </View>
                                <View style={styles.assetRight}>
                                    <Text style={[styles.assetBalance, { color: a.balance >= 0 ? Colors.dark.emerald : Colors.dark.red }]}>
                                        {formatCurrency(a.balance, currency)}
                                    </Text>
                                    <TouchableOpacity onPress={() => handleDelete(a.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                        <Ionicons name="trash-outline" size={14} color={Colors.dark.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* Add/Edit Modal */}
            <Modal visible={showModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editAsset ? 'Edit Account' : 'New Account'}</Text>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>Account Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. BCA Savings"
                            placeholderTextColor={Colors.dark.textMuted}
                            value={name}
                            onChangeText={setName}
                        />

                        <Text style={styles.inputLabel}>Type</Text>
                        <View style={styles.typeGrid}>
                            {accountTypes.map(t => (
                                <TouchableOpacity
                                    key={t.id}
                                    style={[styles.typeOption, type === t.id && styles.typeOptionActive]}
                                    onPress={() => setType(t.id)}
                                >
                                    <Text style={{ fontSize: 20 }}>{t.icon}</Text>
                                    <Text style={[styles.typeText, type === t.id && styles.typeTextActive]}>{t.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.inputLabel}>Balance ({currency})</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0"
                            placeholderTextColor={Colors.dark.textMuted}
                            value={balance}
                            onChangeText={setBalance}
                            keyboardType="numeric"
                        />

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                            <Text style={styles.saveBtnText}>{editAsset ? 'Update' : 'Add Account'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Transfer Modal */}
            <Modal visible={showTransfer} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Transfer Funds</Text>
                            <TouchableOpacity onPress={() => setShowTransfer(false)}>
                                <Ionicons name="close" size={24} color={Colors.dark.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.inputLabel}>From</Text>
                        <View style={styles.accountPicker}>
                            {assets.map(a => (
                                <TouchableOpacity
                                    key={a.id}
                                    style={[styles.accountOption, fromId === a.id && styles.accountOptionActive]}
                                    onPress={() => setFromId(a.id)}
                                >
                                    <Text style={styles.accountOptionText}>{a.name}</Text>
                                    <Text style={styles.accountOptionBal}>{formatCurrency(a.balance, currency)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.inputLabel}>To</Text>
                        <View style={styles.accountPicker}>
                            {assets.filter(a => a.id !== fromId).map(a => (
                                <TouchableOpacity
                                    key={a.id}
                                    style={[styles.accountOption, toId === a.id && styles.accountOptionActive]}
                                    onPress={() => setToId(a.id)}
                                >
                                    <Text style={styles.accountOptionText}>{a.name}</Text>
                                    <Text style={styles.accountOptionBal}>{formatCurrency(a.balance, currency)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.inputLabel}>Amount ({currency})</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0"
                            placeholderTextColor={Colors.dark.textMuted}
                            value={transferAmount}
                            onChangeText={setTransferAmount}
                            keyboardType="numeric"
                        />

                        <TouchableOpacity style={styles.saveBtn} onPress={handleTransfer}>
                            <Text style={styles.saveBtnText}>Transfer</Text>
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
        paddingHorizontal: Spacing.lg, paddingTop: 50, paddingBottom: Spacing.sm,
    },
    title: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.dark.text },
    headerBtns: { flexDirection: 'row', gap: Spacing.sm },
    addBtn: {
        backgroundColor: Colors.dark.emerald, width: 36, height: 36,
        borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    },
    transferBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: Colors.dark.blueLight, paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    },
    transferBtnText: { color: Colors.dark.blue, fontWeight: '600', fontSize: FontSize.sm },
    totalCard: {
        marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, padding: Spacing.xl,
        borderRadius: BorderRadius.lg, backgroundColor: Colors.dark.card,
        borderWidth: 1, borderColor: Colors.dark.border, alignItems: 'center',
    },
    totalLabel: { fontSize: FontSize.md, color: Colors.dark.textSecondary },
    totalAmount: { fontSize: FontSize.display, fontWeight: '800', color: Colors.dark.text, marginTop: 4 },
    emptyState: { alignItems: 'center', paddingVertical: 80 },
    emptyIcon: { fontSize: 50, marginBottom: Spacing.md },
    emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text },
    emptyDesc: { fontSize: FontSize.sm, color: Colors.dark.textMuted, marginTop: Spacing.xs },
    assetCard: {
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, padding: Spacing.lg,
        borderRadius: BorderRadius.lg, backgroundColor: Colors.dark.card,
        borderWidth: 1, borderColor: Colors.dark.border,
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    },
    assetIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.dark.inputBg, alignItems: 'center', justifyContent: 'center' },
    assetInfo: { flex: 1 },
    assetName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.dark.text },
    assetType: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2 },
    assetRight: { alignItems: 'flex-end', gap: Spacing.sm },
    assetBalance: { fontSize: FontSize.lg, fontWeight: '700' },
    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.dark.overlay },
    modalBox: {
        backgroundColor: Colors.dark.modalBg, borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, maxHeight: '80%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
    modalTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.dark.text },
    inputLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.md },
    input: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        color: Colors.dark.text, fontSize: FontSize.lg, borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    typeOption: {
        width: '30%', padding: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.inputBg, borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    typeOptionActive: { borderColor: Colors.dark.emerald, backgroundColor: Colors.dark.emeraldLight },
    typeText: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 4 },
    typeTextActive: { color: Colors.dark.emerald },
    accountPicker: { gap: Spacing.sm },
    accountOption: {
        flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md,
        borderRadius: BorderRadius.md, backgroundColor: Colors.dark.inputBg,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    accountOptionActive: { borderColor: Colors.dark.emerald, backgroundColor: Colors.dark.emeraldLight },
    accountOptionText: { fontSize: FontSize.md, color: Colors.dark.text },
    accountOptionBal: { fontSize: FontSize.md, color: Colors.dark.textMuted },
    saveBtn: {
        backgroundColor: Colors.dark.emerald, paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.xl,
    },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.lg },
});
