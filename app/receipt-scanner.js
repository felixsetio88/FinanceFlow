import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../context/AppContext';
import { scanReceipt, receiptToTransaction } from '../services/aiReceiptScanner';
import { spendingCategories } from '../utils/categories';
import { formatCurrency } from '../utils/currencies';
import { generateId } from '../utils/helpers';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function ReceiptScanner() {
    const router = useRouter();
    const { addTransaction, currency, aiApiKey, aiEndpoint } = useApp();
    const [image, setImage] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [receiptData, setReceiptData] = useState(null);

    // Editable fields
    const [storeName, setStoreName] = useState('');
    const [date, setDate] = useState('');
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState('');
    const [category, setCategory] = useState('food');
    const [paymentMethod, setPaymentMethod] = useState('cash');

    const pickImage = async (useCamera) => {
        const permResult = useCamera
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permResult.granted) {
            Alert.alert('Permission needed', 'Please grant camera/gallery permission.');
            return;
        }

        const result = useCamera
            ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false })
            : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: false });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
            setReceiptData(null);
        }
    };

    const handleScan = async () => {
        if (!image) return;
        if (!aiApiKey) {
            Alert.alert('API Key Required', 'Please configure your AI API key in Settings first.');
            return;
        }

        setScanning(true);
        try {
            const base64 = await FileSystem.readAsStringAsync(image, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const data = await scanReceipt(base64, aiApiKey, aiEndpoint);
            setReceiptData(data);

            // Fill editable fields
            setStoreName(data.storeName || '');
            setDate(data.date || new Date().toISOString().slice(0, 10));
            setItems(data.items || []);
            setTotal(data.total?.toString() || '0');
            setCategory(data.items?.[0]?.category || 'food');
            setPaymentMethod(data.paymentMethod || 'cash');
        } catch (err) {
            Alert.alert('Scan Error', err.message);
        }
        setScanning(false);
    };

    const updateItem = (idx, field, value) => {
        const updated = [...items];
        updated[idx] = { ...updated[idx], [field]: field === 'price' || field === 'quantity' ? parseFloat(value) || 0 : value };
        setItems(updated);
        // Recalculate total
        const sum = updated.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
        setTotal(sum.toFixed(2));
    };

    const removeItem = (idx) => {
        const updated = items.filter((_, i) => i !== idx);
        setItems(updated);
        const sum = updated.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
        setTotal(sum.toFixed(2));
    };

    const handleSave = async () => {
        const amt = parseFloat(total);
        if (!amt || amt <= 0) {
            Alert.alert('Error', 'No valid amount to save.');
            return;
        }

        const tx = {
            id: generateId(),
            type: 'spending',
            amount: amt,
            category,
            description: storeName || 'Receipt Scan',
            date: date ? new Date(date).toISOString() : new Date().toISOString(),
            items: items.map(i => ({ name: i.name, quantity: i.quantity || 1, price: i.price || 0 })),
            photos: [image],
            paymentMethod,
            currency,
        };

        await addTransaction(tx);
        Alert.alert('Saved!', 'Transaction saved successfully.');
        router.back();
    };

    return (
        <View style={styles.container}>
            <View style={styles.handle} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.title}>📸 Scan Receipt</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* Image Selection */}
                {!image ? (
                    <View style={styles.pickArea}>
                        <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage(true)}>
                            <Ionicons name="camera" size={36} color={Colors.dark.emerald} />
                            <Text style={styles.pickBtnText}>Take Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.pickBtn} onPress={() => pickImage(false)}>
                            <Ionicons name="images" size={36} color={Colors.dark.blue} />
                            <Text style={styles.pickBtnText}>Pick from Gallery</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View>
                        <Image source={{ uri: image }} style={styles.receiptImage} />
                        <View style={styles.imageActions}>
                            <TouchableOpacity style={styles.retakeBtn} onPress={() => { setImage(null); setReceiptData(null); }}>
                                <Ionicons name="refresh" size={16} color={Colors.dark.textSecondary} />
                                <Text style={styles.retakeBtnText}>Retake</Text>
                            </TouchableOpacity>
                            {!receiptData && (
                                <TouchableOpacity style={styles.scanActionBtn} onPress={handleScan} disabled={scanning}>
                                    {scanning ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="sparkles" size={16} color="#fff" />
                                            <Text style={styles.scanActionBtnText}>AI Scan</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {scanning && (
                    <View style={styles.scanningBanner}>
                        <ActivityIndicator color={Colors.dark.emerald} />
                        <Text style={styles.scanningText}>AI is analyzing your receipt...</Text>
                    </View>
                )}

                {/* Editable Form (after scan) */}
                {receiptData && (
                    <View style={styles.formSection}>
                        <Text style={styles.formTitle}>✅ Receipt Scanned — Review & Edit</Text>

                        <Text style={styles.label}>Store Name</Text>
                        <TextInput style={styles.input} value={storeName} onChangeText={setStoreName} placeholderTextColor={Colors.dark.textMuted} />

                        <Text style={styles.label}>Date</Text>
                        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.dark.textMuted} />

                        <Text style={styles.label}>Category</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                            <View style={styles.catRow}>
                                {spendingCategories.map(c => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[styles.catChip, category === c.id && { backgroundColor: c.color + '30', borderColor: c.color }]}
                                        onPress={() => setCategory(c.id)}
                                    >
                                        <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                                        <Text style={[styles.catChipText, category === c.id && { color: c.color }]}>{c.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <Text style={styles.label}>Items</Text>
                        {items.map((item, i) => (
                            <View key={i} style={styles.itemRow}>
                                <TextInput
                                    style={[styles.input, { flex: 2 }]}
                                    value={item.name}
                                    onChangeText={(v) => updateItem(i, 'name', v)}
                                    placeholder="Item"
                                    placeholderTextColor={Colors.dark.textMuted}
                                />
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    value={(item.price || 0).toString()}
                                    onChangeText={(v) => updateItem(i, 'price', v)}
                                    keyboardType="numeric"
                                    placeholder="Price"
                                    placeholderTextColor={Colors.dark.textMuted}
                                />
                                <TouchableOpacity onPress={() => removeItem(i)}>
                                    <Ionicons name="close-circle" size={20} color={Colors.dark.red} />
                                </TouchableOpacity>
                            </View>
                        ))}

                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Total</Text>
                            <TextInput
                                style={[styles.input, styles.totalInput]}
                                value={total}
                                onChangeText={setTotal}
                                keyboardType="numeric"
                            />
                        </View>

                        <Text style={styles.label}>Payment Method</Text>
                        <View style={styles.paymentRow}>
                            {['cash', 'bank', 'ewallet'].map(pm => (
                                <TouchableOpacity
                                    key={pm}
                                    style={[styles.paymentChip, paymentMethod === pm && styles.paymentChipActive]}
                                    onPress={() => setPaymentMethod(pm)}
                                >
                                    <Text style={[styles.paymentChipText, paymentMethod === pm && styles.paymentChipTextActive]}>
                                        {pm.charAt(0).toUpperCase() + pm.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                            <Text style={styles.saveBtnText}>Save Transaction</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
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
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
    pickArea: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.xl },
    pickBtn: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        padding: Spacing.xxxl, borderRadius: BorderRadius.lg,
        backgroundColor: Colors.dark.card, borderWidth: 2,
        borderColor: Colors.dark.border, borderStyle: 'dashed', gap: Spacing.sm,
    },
    pickBtnText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.dark.textSecondary },
    receiptImage: { width: '100%', height: 300, borderRadius: BorderRadius.lg, resizeMode: 'cover' },
    imageActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    retakeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
        padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.card, borderWidth: 1, borderColor: Colors.dark.border,
    },
    retakeBtnText: { color: Colors.dark.textSecondary, fontWeight: '600' },
    scanActionBtn: {
        flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
        padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.dark.emerald,
    },
    scanActionBtnText: { color: '#fff', fontWeight: '700' },
    scanningBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.lg, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.emeraldLight, marginVertical: Spacing.lg,
    },
    scanningText: { color: Colors.dark.emerald, fontWeight: '600' },
    formSection: { marginTop: Spacing.lg },
    formTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.emerald, marginBottom: Spacing.lg },
    label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
    input: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        color: Colors.dark.text, fontSize: FontSize.md,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    catRow: { flexDirection: 'row', gap: Spacing.sm },
    catChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full, backgroundColor: Colors.dark.card,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    catChipText: { fontSize: FontSize.sm, color: Colors.dark.textMuted },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
    totalRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderColor: Colors.dark.border,
    },
    totalLabel: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.dark.text },
    totalInput: { width: 120, textAlign: 'right', fontSize: FontSize.lg, fontWeight: '800' },
    paymentRow: { flexDirection: 'row', gap: Spacing.sm },
    paymentChip: {
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.md, backgroundColor: Colors.dark.inputBg,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    paymentChipActive: { borderColor: Colors.dark.emerald, backgroundColor: Colors.dark.emeraldLight },
    paymentChipText: { fontSize: FontSize.sm, color: Colors.dark.textMuted },
    paymentChipTextActive: { color: Colors.dark.emerald },
    saveBtn: {
        backgroundColor: Colors.dark.emerald, paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.xl,
    },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.lg },
});
