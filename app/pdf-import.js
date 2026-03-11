import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../context/AppContext';
import { extractTextFromPDF } from '../services/pdfProcessor';
import { formatCurrency } from '../utils/currencies';
import { getCategoryById, spendingCategories, incomeCategories } from '../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function PDFImport() {
    const router = useRouter();
    const { bulkAddTransactions, currency, aiApiKey, aiEndpoint } = useApp();
    const [loading, setLoading] = useState(false);
    const [parsedTx, setParsedTx] = useState([]);
    const [selected, setSelected] = useState({});
    const [editingIdx, setEditingIdx] = useState(null);
    const [fileName, setFileName] = useState('');

    const pickPDF = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setFileName(file.name);
            setLoading(true);

            const transactions = await extractTextFromPDF(file.uri, aiApiKey, aiEndpoint);

            if (transactions.length === 0) {
                Alert.alert('No Data', 'Could not extract transactions from this PDF. Please make sure it\'s a bank statement.');
                setLoading(false);
                return;
            }

            setParsedTx(transactions);
            // Select all by default
            const sel = {};
            transactions.forEach((_, i) => sel[i] = true);
            setSelected(sel);
        } catch (err) {
            Alert.alert('Error', err.message);
        }
        setLoading(false);
    };

    const toggleSelect = (idx) => {
        setSelected(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const toggleAll = () => {
        const allSelected = Object.values(selected).every(Boolean);
        const newSel = {};
        parsedTx.forEach((_, i) => newSel[i] = !allSelected);
        setSelected(newSel);
    };

    const updateTx = (idx, field, value) => {
        const updated = [...parsedTx];
        if (field === 'amount') {
            updated[idx] = { ...updated[idx], amount: parseFloat(value) || 0 };
        } else {
            updated[idx] = { ...updated[idx], [field]: value };
        }
        setParsedTx(updated);
    };

    const handleImport = async () => {
        const toImport = parsedTx.filter((_, i) => selected[i]);
        if (toImport.length === 0) {
            Alert.alert('Nothing Selected', 'Please select transactions to import.');
            return;
        }

        Alert.alert(
            'Confirm Import',
            `Import ${toImport.length} transactions?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Import',
                    onPress: async () => {
                        try {
                            await bulkAddTransactions(toImport);
                            Alert.alert('Success', `${toImport.length} transactions imported!`);
                            router.back();
                        } catch (err) {
                            Alert.alert('Error', err.message);
                        }
                    },
                },
            ]
        );
    };

    const selectedCount = Object.values(selected).filter(Boolean).length;
    const selectedTotal = parsedTx
        .filter((_, i) => selected[i])
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const allCategories = [...spendingCategories, ...incomeCategories];

    return (
        <View style={styles.container}>
            <View style={styles.handle} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.title}>📄 PDF Import</Text>
                <View style={{ width: 24 }} />
            </View>

            {parsedTx.length === 0 ? (
                <View style={styles.uploadArea}>
                    <TouchableOpacity style={styles.uploadBtn} onPress={pickPDF} disabled={loading}>
                        {loading ? (
                            <>
                                <ActivityIndicator size="large" color={Colors.dark.emerald} />
                                <Text style={styles.uploadText}>Processing PDF...</Text>
                                <Text style={styles.uploadSubtext}>AI is extracting transactions</Text>
                            </>
                        ) : (
                            <>
                                <Ionicons name="document-text" size={48} color={Colors.dark.blue} />
                                <Text style={styles.uploadText}>Select Bank Statement PDF</Text>
                                <Text style={styles.uploadSubtext}>Supports BCA and other bank formats</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    {!aiApiKey && (
                        <View style={styles.warningBanner}>
                            <Ionicons name="warning" size={16} color={Colors.dark.gold} />
                            <Text style={styles.warningText}>
                                AI extraction works best with an API key. Set one in Settings for optimal results.
                            </Text>
                        </View>
                    )}
                </View>
            ) : (
                <>
                    {/* Summary Bar */}
                    <View style={styles.summaryBar}>
                        <View>
                            <Text style={styles.summaryLabel}>Found {parsedTx.length} transactions from</Text>
                            <Text style={styles.summaryFile}>{fileName}</Text>
                        </View>
                        <View style={styles.summaryRight}>
                            <Text style={styles.summaryCount}>{selectedCount} selected</Text>
                            <Text style={styles.summaryTotal}>{formatCurrency(selectedTotal, currency)}</Text>
                        </View>
                    </View>

                    {/* Select All */}
                    <TouchableOpacity style={styles.selectAllRow} onPress={toggleAll}>
                        <Ionicons
                            name={selectedCount === parsedTx.length ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={Colors.dark.emerald}
                        />
                        <Text style={styles.selectAllText}>Select All</Text>
                    </TouchableOpacity>

                    {/* Transaction List */}
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                        {parsedTx.map((tx, i) => {
                            const cat = getCategoryById(tx.category);
                            const isEditing = editingIdx === i;
                            const isIncome = tx.type === 'income';
                            return (
                                <View key={i} style={[styles.txCard, !selected[i] && styles.txCardDisabled]}>
                                    <View style={styles.txHeader}>
                                        <TouchableOpacity onPress={() => toggleSelect(i)}>
                                            <Ionicons
                                                name={selected[i] ? 'checkbox' : 'square-outline'}
                                                size={22}
                                                color={selected[i] ? Colors.dark.emerald : Colors.dark.textMuted}
                                            />
                                        </TouchableOpacity>
                                        <View style={styles.txInfo}>
                                            <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                                            <Text style={styles.txMeta}>
                                                {cat.icon} {cat.name} · {new Date(tx.date).toLocaleDateString()}
                                            </Text>
                                        </View>
                                        <View style={styles.txRight}>
                                            <Text style={[styles.txAmount, { color: isIncome ? Colors.dark.emerald : Colors.dark.red }]}>
                                                {isIncome ? '+' : '-'}{formatCurrency(tx.amount, currency)}
                                            </Text>
                                            <TouchableOpacity onPress={() => setEditingIdx(isEditing ? null : i)}>
                                                <Ionicons name={isEditing ? 'chevron-up' : 'pencil'} size={14} color={Colors.dark.textMuted} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {isEditing && (
                                        <View style={styles.editSection}>
                                            <View style={styles.editRow}>
                                                <Text style={styles.editLabel}>Type</Text>
                                                <View style={styles.editTypeRow}>
                                                    <TouchableOpacity
                                                        style={[styles.typeChip, tx.type === 'income' && styles.typeChipIncome]}
                                                        onPress={() => updateTx(i, 'type', 'income')}
                                                    >
                                                        <Text style={[styles.typeChipText, tx.type === 'income' && { color: Colors.dark.emerald }]}>Income</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.typeChip, tx.type === 'spending' && styles.typeChipSpending]}
                                                        onPress={() => updateTx(i, 'type', 'spending')}
                                                    >
                                                        <Text style={[styles.typeChipText, tx.type === 'spending' && { color: Colors.dark.red }]}>Spending</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>

                                            <View style={styles.editRow}>
                                                <Text style={styles.editLabel}>Amount</Text>
                                                <TextInput
                                                    style={styles.editInput}
                                                    value={tx.amount.toString()}
                                                    onChangeText={(v) => updateTx(i, 'amount', v)}
                                                    keyboardType="numeric"
                                                />
                                            </View>

                                            <View style={styles.editRow}>
                                                <Text style={styles.editLabel}>Description</Text>
                                                <TextInput
                                                    style={styles.editInput}
                                                    value={tx.description}
                                                    onChangeText={(v) => updateTx(i, 'description', v)}
                                                />
                                            </View>

                                            <View style={styles.editRow}>
                                                <Text style={styles.editLabel}>Category</Text>
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                    <View style={styles.editCatRow}>
                                                        {allCategories.map(c => (
                                                            <TouchableOpacity
                                                                key={c.id}
                                                                style={[styles.editCatChip, tx.category === c.id && { borderColor: c.color, backgroundColor: c.color + '20' }]}
                                                                onPress={() => updateTx(i, 'category', c.id)}
                                                            >
                                                                <Text style={{ fontSize: 12 }}>{c.icon}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                </ScrollView>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </ScrollView>

                    {/* Import Button */}
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.importBtnText}>Import {selectedCount} Transactions</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.background },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border, alignSelf: 'center', marginTop: Spacing.md },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.dark.text },
    uploadArea: { flex: 1, paddingHorizontal: Spacing.lg, justifyContent: 'center' },
    uploadBtn: {
        alignItems: 'center', padding: Spacing.xxxl, borderRadius: BorderRadius.xl,
        backgroundColor: Colors.dark.card, borderWidth: 2,
        borderColor: Colors.dark.border, borderStyle: 'dashed', gap: Spacing.md,
    },
    uploadText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text },
    uploadSubtext: { fontSize: FontSize.sm, color: Colors.dark.textMuted },
    warningBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.goldLight, marginTop: Spacing.lg,
    },
    warningText: { flex: 1, fontSize: FontSize.sm, color: Colors.dark.gold },
    summaryBar: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        backgroundColor: Colors.dark.card, borderBottomWidth: 1, borderColor: Colors.dark.border,
    },
    summaryLabel: { fontSize: FontSize.xs, color: Colors.dark.textMuted },
    summaryFile: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.text, marginTop: 2 },
    summaryRight: { alignItems: 'flex-end' },
    summaryCount: { fontSize: FontSize.xs, color: Colors.dark.textMuted },
    summaryTotal: { fontSize: FontSize.md, fontWeight: '700', color: Colors.dark.text },
    selectAllRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        borderBottomWidth: 1, borderColor: Colors.dark.border,
    },
    selectAllText: { fontSize: FontSize.md, color: Colors.dark.text, fontWeight: '600' },
    txCard: {
        marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, padding: Spacing.md,
        borderRadius: BorderRadius.md, backgroundColor: Colors.dark.card,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    txCardDisabled: { opacity: 0.5 },
    txHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    txInfo: { flex: 1 },
    txDesc: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.text },
    txMeta: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2 },
    txRight: { alignItems: 'flex-end', gap: 4 },
    txAmount: { fontSize: FontSize.md, fontWeight: '700' },
    editSection: {
        marginTop: Spacing.md, paddingTop: Spacing.md,
        borderTopWidth: 1, borderColor: Colors.dark.border,
    },
    editRow: { marginBottom: Spacing.md },
    editLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.dark.textMuted, marginBottom: 4 },
    editInput: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.sm,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        color: Colors.dark.text, fontSize: FontSize.md,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    editTypeRow: { flexDirection: 'row', gap: Spacing.sm },
    typeChip: {
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.sm, backgroundColor: Colors.dark.inputBg,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    typeChipIncome: { borderColor: Colors.dark.emerald, backgroundColor: Colors.dark.emeraldLight },
    typeChipSpending: { borderColor: Colors.dark.red, backgroundColor: Colors.dark.redLight },
    typeChipText: { fontSize: FontSize.sm, color: Colors.dark.textMuted },
    editCatRow: { flexDirection: 'row', gap: 4 },
    editCatChip: {
        width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
        backgroundColor: Colors.dark.inputBg, borderWidth: 1, borderColor: Colors.dark.border,
    },
    footer: {
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        backgroundColor: Colors.dark.surface, borderTopWidth: 1, borderColor: Colors.dark.border,
    },
    importBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
        backgroundColor: Colors.dark.emerald, paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md,
    },
    importBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.lg },
});
