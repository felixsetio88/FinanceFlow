import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { spendingCategories, incomeCategories } from '../utils/categories';
import { generateId } from '../utils/helpers';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function AddTransaction() {
    const router = useRouter();
    const { addTransaction, currency } = useApp();
    const [type, setType] = useState('spending');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [items, setItems] = useState([]);
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');

    const categories = type === 'spending' ? spendingCategories : incomeCategories;

    const addItem = () => {
        if (!itemName.trim() || !itemPrice) return;
        setItems([...items, { name: itemName, quantity: 1, price: parseFloat(itemPrice) || 0 }]);
        setItemName('');
        setItemPrice('');
    };

    const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

    const handleSave = async () => {
        const total = items.length > 0
            ? items.reduce((s, i) => s + i.price * i.quantity, 0)
            : parseFloat(amount);

        if (!total || total <= 0) {
            Alert.alert('Error', 'Please enter an amount or add items.');
            return;
        }
        if (!category) {
            Alert.alert('Error', 'Please select a category.');
            return;
        }

        const tx = {
            id: generateId(),
            type,
            amount: total,
            category,
            description: description || categories.find(c => c.id === category)?.name || '',
            date: new Date().toISOString(),
            items: type === 'spending' ? items : [],
            photos: [],
            paymentMethod: 'cash',
            currency,
        };

        await addTransaction(tx);
        router.back();
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="close" size={26} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.title}>Add Transaction</Text>
                <View style={{ width: 26 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* Type Toggle */}
                <View style={styles.typeToggle}>
                    <TouchableOpacity
                        style={[styles.typeBtn, type === 'income' && styles.typeBtnIncomeActive]}
                        onPress={() => { setType('income'); setCategory(''); }}
                    >
                        <Ionicons name="arrow-down" size={16} color={type === 'income' ? '#fff' : Colors.dark.emerald} />
                        <Text style={[styles.typeBtnText, type === 'income' && { color: '#fff' }]}>Income</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.typeBtn, type === 'spending' && styles.typeBtnSpendingActive]}
                        onPress={() => { setType('spending'); setCategory(''); }}
                    >
                        <Ionicons name="arrow-up" size={16} color={type === 'spending' ? '#fff' : Colors.dark.red} />
                        <Text style={[styles.typeBtnText, type === 'spending' && { color: '#fff' }]}>Spending</Text>
                    </TouchableOpacity>
                </View>

                {/* Amount */}
                <Text style={styles.label}>Amount ({currency})</Text>
                <TextInput
                    style={styles.amountInput}
                    placeholder="0"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                />

                {/* Category */}
                <Text style={styles.label}>Category</Text>
                <View style={styles.catGrid}>
                    {categories.map(c => (
                        <TouchableOpacity
                            key={c.id}
                            style={[styles.catItem, category === c.id && { borderColor: c.color, backgroundColor: c.color + '15' }]}
                            onPress={() => setCategory(c.id)}
                        >
                            <Text style={{ fontSize: 22 }}>{c.icon}</Text>
                            <Text style={[styles.catName, category === c.id && { color: c.color }]}>{c.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Description */}
                <Text style={styles.label}>Description</Text>
                <TextInput
                    style={styles.input}
                    placeholder="What was this for?"
                    placeholderTextColor={Colors.dark.textMuted}
                    value={description}
                    onChangeText={setDescription}
                />

                {/* Items (for spending) */}
                {type === 'spending' && (
                    <View style={styles.itemsSection}>
                        <Text style={styles.label}>Items (Optional)</Text>
                        {items.map((item, i) => (
                            <View key={i} style={styles.itemRow}>
                                <Text style={styles.itemText}>{item.name}</Text>
                                <Text style={styles.itemPrice}>{currency} {item.price.toFixed(2)}</Text>
                                <TouchableOpacity onPress={() => removeItem(i)}>
                                    <Ionicons name="close-circle" size={18} color={Colors.dark.red} />
                                </TouchableOpacity>
                            </View>
                        ))}
                        <View style={styles.addItemRow}>
                            <TextInput
                                style={[styles.input, { flex: 2 }]}
                                placeholder="Item name"
                                placeholderTextColor={Colors.dark.textMuted}
                                value={itemName}
                                onChangeText={setItemName}
                            />
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Price"
                                placeholderTextColor={Colors.dark.textMuted}
                                value={itemPrice}
                                onChangeText={setItemPrice}
                                keyboardType="numeric"
                            />
                            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
                                <Ionicons name="add" size={18} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Quick Actions */}
                <View style={styles.quickRow}>
                    <TouchableOpacity
                        style={styles.scanBtn}
                        onPress={() => router.push('/receipt-scanner')}
                    >
                        <Ionicons name="camera" size={18} color={Colors.dark.purple} />
                        <Text style={styles.scanBtnText}>Scan Receipt</Text>
                    </TouchableOpacity>
                </View>

                {/* Save */}
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                    <Text style={styles.saveBtnText}>Save Transaction</Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.modalBg },
    handle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border,
        alignSelf: 'center', marginTop: Spacing.md,
    },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.dark.text },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
    typeToggle: {
        flexDirection: 'row', borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.card, padding: 3, marginBottom: Spacing.lg,
    },
    typeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: Spacing.md, borderRadius: BorderRadius.sm,
    },
    typeBtnIncomeActive: { backgroundColor: Colors.dark.emerald },
    typeBtnSpendingActive: { backgroundColor: Colors.dark.red },
    typeBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.dark.textMuted },
    label: {
        fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textSecondary,
        marginBottom: Spacing.sm, marginTop: Spacing.md,
    },
    amountInput: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg,
        color: Colors.dark.text, fontSize: FontSize.xxxl, fontWeight: '800',
        textAlign: 'center', borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    catItem: {
        width: '22%', minWidth: 70, padding: Spacing.sm, alignItems: 'center',
        borderRadius: BorderRadius.md, backgroundColor: Colors.dark.card,
        borderWidth: 1.5, borderColor: Colors.dark.border, gap: 4,
    },
    catName: { fontSize: FontSize.xs, color: Colors.dark.textMuted, textAlign: 'center' },
    input: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        color: Colors.dark.text, fontSize: FontSize.md,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    itemsSection: { marginTop: Spacing.sm },
    itemRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.dark.border,
    },
    itemText: { flex: 1, fontSize: FontSize.md, color: Colors.dark.text },
    itemPrice: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.text },
    addItemRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    addItemBtn: {
        backgroundColor: Colors.dark.emerald, width: 44, borderRadius: BorderRadius.md,
        alignItems: 'center', justifyContent: 'center',
    },
    quickRow: { marginTop: Spacing.lg, flexDirection: 'row', gap: Spacing.sm },
    scanBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.purpleLight,
        borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    },
    scanBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.purple },
    saveBtn: {
        backgroundColor: Colors.dark.emerald, paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.xl,
    },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.lg },
});
