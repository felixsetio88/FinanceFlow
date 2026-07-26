import React, { useState, useMemo } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet, KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { formatCurrency, currencies, getTopCurrencies } from '../utils/currencies';
import { generateId } from '../utils/helpers';
import { accountTypes, getAccountTypeById } from '../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import DonutChart from '../components/DonutChart';

// ── Color palette users can pick for their cards ──────────────
const CARD_COLORS = [
    '#ff6600', '#3B82F6', '#1E293B', '#0F4C75',
    '#059669', '#D97706', '#DC2626', '#DB2777',
    '#7C3AED', '#0891B2', '#9D174D', '#1E3A5F',
];

const DEFAULT_COLORS = ['#ff6600', '#1E3A8A', '#1E293B', '#0F4C75', '#7C3AED', '#9D174D'];

function getCardColor(asset, index) {
    return asset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export default function Assets() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { assets, currency, addAsset, updateAsset, deleteAsset, exchangeRates, convertCurrency } = useApp();

    const [showModal, setShowModal] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [editAsset, setEditAsset] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [showBreakdownModal, setShowBreakdownModal] = useState(false);
    const [showAllCurrencies, setShowAllCurrencies] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [type, setType] = useState('bank');
    const [balance, setBalance] = useState('');
    const [color, setColor] = useState('#ff6600');
    const [assetCurrency, setAssetCurrency] = useState(currency);

    // Transfer state
    const [fromId, setFromId] = useState('');
    const [toId, setToId] = useState('');
    const [transferAmount, setTransferAmount] = useState('');

    const totalBalance = assets.reduce((s, a) => s + convertCurrency(a.balance || 0, a.currency || currency, currency, exchangeRates), 0);

    // Per-currency subtotals for the breakdown chips
    const currencyBreakdown = useMemo(() => {
        const groups = {};
        assets.forEach(a => {
            const cur = a.currency || currency;
            if (!groups[cur]) groups[cur] = 0;
            groups[cur] += a.balance || 0;
        });
        return Object.entries(groups)
            .map(([cur, total]) => ({
                cur,
                originalTotal: total,
                convertedTotal: convertCurrency(total, cur, currency, exchangeRates),
            }))
            .sort((a, b) => b.convertedTotal - a.convertedTotal);
    }, [assets, currency, exchangeRates]);
    const hasMixedCurrencies = currencyBreakdown.length > 1;

    const [showAllocation, setShowAllocation] = useState(false);

    const assetPieData = useMemo(() => {
        return [...assets].sort((a, b) => b.balance - a.balance).map((a, i) => ({
            label: a.name,
            value: Math.max(convertCurrency(a.balance || 0, a.currency || currency, currency, exchangeRates), 0),
            color: getCardColor(a, i),
            id: a.id
        })).filter(x => x.value > 0);
    }, [assets, currency, exchangeRates]);

    const openAdd = () => {
        setEditAsset(null);
        setName('');
        setType('bank');
        setBalance('');
        setColor('#ff6600');
        setAssetCurrency(currency);
        setShowAllCurrencies(false);
        setShowModal(true);
    };

    const openEdit = (a) => {
        setEditAsset(a);
        setName(a.name);
        setType(a.type);
        setBalance(String(a.balance || 0));
        setColor(a.color || '#ff6600');
        setAssetCurrency(a.currency || currency);
        setShowAllCurrencies(false);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!name.trim()) {
            Alert.alert('Error', 'Please enter an account name');
            return;
        }
        const bal = parseFloat(balance) || 0;
        const cur = (assetCurrency || currency).trim().toUpperCase();
        if (editAsset) {
            await updateAsset({ ...editAsset, name, type, balance: bal, color, currency: cur });
        } else {
            await addAsset({ id: generateId(), name, type, balance: bal, color, currency: cur });
        }
        setShowModal(false);
    };

    const handleTransfer = async () => {
        const amt = parseFloat(transferAmount);
        if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
        if (!fromId || !toId || fromId === toId) { Alert.alert('Error', 'Select two different accounts'); return; }
        const from = assets.find(a => a.id === fromId);
        const to = assets.find(a => a.id === toId);
        if (!from || !to) return;
        await updateAsset({ ...from, balance: from.balance - amt });
        await updateAsset({ ...to, balance: to.balance + amt });
        setShowTransfer(false);
        setTransferAmount('');
        setFromId('');
        setToId('');
    };

    const handleDelete = (id) => {
        Alert.alert('Delete Account', 'Are you sure you want to delete this account?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { deleteAsset(id); setSelectedId(null); } },
        ]);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.inputBg, borderColor: 'transparent' }]} onPress={() => router.back()}>
                        <Ionicons name="chevron-down" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.textPrimary }]}>Assets</Text>
                </View>
                <View style={styles.headerBtns}>
                    {assets.length >= 2 && (
                        <TouchableOpacity style={[styles.transferBtn, { backgroundColor: colors.primaryLight }]} onPress={() => setShowTransfer(true)}>
                            <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
                            <Text style={[styles.transferBtnText, { color: colors.primary }]}>Transfer</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primaryLight }]} onPress={openAdd}>
                        <Ionicons name="add" size={20} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Total card */}
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowAllocation(!showAllocation)} style={[styles.totalCard, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total Balance</Text>
                    {hasMixedCurrencies && (
                        <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); setShowBreakdownModal(true); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.totalAmount, { color: colors.textPrimary }]}>{formatCurrency(totalBalance, currency)}</Text>
                    <Ionicons name={showAllocation ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} style={{ marginTop: 4 }} />
                </View>
            </TouchableOpacity>

            {showAllocation && assetPieData.length > 0 && (
                <View style={styles.allocationContainer}>
                    <DonutChart
                        data={assetPieData}
                        size={180}
                        strokeWidth={28}
                        centerLabel="Total Assets"
                        centerValue={formatCurrency(totalBalance, currency)}
                        colors={colors}
                    />
                    <View style={styles.allocationLegend}>
                        {assetPieData.map((item) => {
                            const pct = ((item.value / totalBalance) * 100).toFixed(1);
                            return (
                                <View key={item.id} style={[styles.allocationLegendRow, { borderBottomColor: colors.border }]}>
                                    <View style={styles.allocationLegendLeft}>
                                        <View style={[styles.allocationDot, { backgroundColor: item.color }]} />
                                        <Text style={[styles.allocationLegendName, { color: colors.textPrimary }]}>{item.label}</Text>
                                    </View>
                                    <View style={styles.allocationLegendRight}>
                                        <Text style={[styles.allocationLegendVal, { color: colors.textPrimary }]}>{formatCurrency(item.value, currency)}</Text>
                                        <Text style={[styles.allocationLegendPct, { color: colors.textSecondary }]}>{pct}%</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </View>
            )}

            {/* Asset cards list */}
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
            >
                {assets.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="card-outline" size={52} color={colors.textMuted} />
                        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No accounts yet</Text>
                        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>Add your bank accounts, wallets, and more</Text>
                    </View>
                ) : (
                    assets.map((a, index) => {
                        const at = getAccountTypeById(a.type);
                        const cardColor = getCardColor(a, index);
                        const isSelected = selectedId === a.id;

                        return (
                            <TouchableOpacity
                                key={a.id}
                                activeOpacity={0.88}
                                onPress={() => setSelectedId(isSelected ? null : a.id)}
                                style={[styles.atmCard, { backgroundColor: cardColor, shadowColor: isDark ? '#000' : '#1A1040' }]}
                            >
                                {/* Chip + type icon row */}
                                <View style={styles.atmCardTop}>
                                    <View style={styles.chip}>
                                        <View style={styles.chipLine} />
                                        <View style={styles.chipLine} />
                                    </View>
                                    <Ionicons name={at.icon} size={22} color="rgba(255,255,255,0.55)" />
                                </View>

                                {/* Name */}
                                <Text style={styles.atmCardName} numberOfLines={1}>{a.name}</Text>

                                {/* Balance */}
                                <Text style={[styles.atmCardBalance, { color: a.balance >= 0 ? '#fff' : '#FFB3BA' }]}>
                                    {formatCurrency(a.balance, a.currency || currency)}
                                </Text>

                                {/* Footer: type + actions (visible when selected) */}
                                <View style={styles.atmCardFooter}>
                                    <Text style={styles.atmCardType}>{at.name}</Text>
                                    {isSelected && (
                                        <View style={styles.atmActions}>
                                            <TouchableOpacity style={styles.atmActionBtn} onPress={() => openEdit(a)}>
                                                <Ionicons name="create-outline" size={13} color="#fff" />
                                                <Text style={styles.atmActionTxt}>Edit</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.atmActionBtn, { backgroundColor: 'rgba(220,38,38,0.75)' }]}
                                                onPress={() => handleDelete(a.id)}
                                            >
                                                <Ionicons name="trash-outline" size={13} color="#fff" />
                                                <Text style={styles.atmActionTxt}>Delete</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* ── Add / Edit Modal ──────────────────────────────────── */}
            <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                        <View style={[styles.modalBox, { backgroundColor: colors.modalBg }]}>
                            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                                {/* Modal header */}
                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editAsset ? 'Edit Account' : 'New Account'}</Text>
                                    <TouchableOpacity onPress={() => requestAnimationFrame(() => setShowModal(false))}>
                                        <Ionicons name="close" size={24} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>

                                {/* Account name */}
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Account Name</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                                    placeholder="e.g. BCA Savings"
                                    placeholderTextColor={colors.textMuted}
                                    value={name}
                                    onChangeText={setName}
                                />

                                {/* Account type */}
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Account Type</Text>
                                <View style={styles.typeGrid}>
                                    {accountTypes.map(t => (
                                        <TouchableOpacity
                                            key={t.id}
                                            style={[styles.typeOption, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, type === t.id && [styles.typeOptionActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]]}
                                            onPress={() => setType(t.id)}
                                        >
                                            <Ionicons
                                                name={t.icon}
                                                size={22}
                                                color={type === t.id ? colors.primary : colors.textMuted}
                                            />
                                            <Text style={[styles.typeText, { color: colors.textMuted }, type === t.id && [styles.typeTextActive, { color: colors.primary }]]}>
                                                {t.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Account Currency Picker */}
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Account Currency</Text>
                                <View style={styles.currencyGrid}>
                                    {(showAllCurrencies ? currencies : getTopCurrencies(currency, assetCurrency)).map(c => (
                                        <TouchableOpacity
                                            key={c.code}
                                            style={[
                                                styles.currencyOption,
                                                { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                                                assetCurrency === c.code && [styles.currencyActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }],
                                            ]}
                                            onPress={() => setAssetCurrency(c.code)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.currencyCode, { color: colors.textSecondary }, assetCurrency === c.code && [styles.currencyCodeActive, { color: colors.primary }]]}>{c.code}</Text>
                                            <Text style={[styles.currencySymbol, { color: colors.textMuted }, assetCurrency === c.code && [styles.currencySymbolActive, { color: colors.primary }]]}>{c.symbol}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {!showAllCurrencies && (
                                        <TouchableOpacity
                                            style={[styles.currencyOption, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                                            onPress={() => setShowAllCurrencies(true)}>
                                            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                                            <Text style={[styles.currencySymbol, { color: colors.textMuted }]}>Other</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {/* Balance */}
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Balance ({assetCurrency})</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                    value={balance}
                                    onChangeText={setBalance}
                                    keyboardType="numeric"
                                />

                                {/* Card color */}
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Card Color</Text>
                                <View style={styles.colorPicker}>
                                    {CARD_COLORS.map(c => (
                                        <TouchableOpacity
                                            key={c}
                                            style={[
                                                styles.colorSwatch,
                                                { backgroundColor: c },
                                                color === c && [styles.colorSwatchSelected, { borderColor: isDark ? '#fff' : '#1A1040' }],
                                            ]}
                                            onPress={() => setColor(c)}
                                        >
                                            {color === c && (
                                                <Ionicons name="checkmark" size={16} color="#fff" />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Preview */}
                                <View style={[styles.cardPreview, { backgroundColor: color }]}>
                                    <View style={styles.previewTop}>
                                        <View style={styles.chip}>
                                            <View style={styles.chipLine} />
                                            <View style={styles.chipLine} />
                                        </View>
                                        <Ionicons name={getAccountTypeById(type).icon} size={20} color="rgba(255,255,255,0.55)" />
                                    </View>
                                    <Text style={styles.previewName} numberOfLines={1}>
                                        {name || 'Account Name'}
                                    </Text>
                                    <Text style={styles.previewBalance}>
                                        {formatCurrency(parseFloat(balance) || 0, assetCurrency || currency)}
                                    </Text>
                                    <Text style={styles.previewType}>{getAccountTypeById(type).name}</Text>
                                </View>

                                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
                                    <Text style={styles.saveBtnText}>{editAsset ? 'Update Account' : 'Add Account'}</Text>
                                </TouchableOpacity>

                                <View style={{ height: 24 }} />
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ── Transfer Modal ────────────────────────────────────── */}
            <Modal visible={showTransfer} animationType="slide" transparent onRequestClose={() => setShowTransfer(false)}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                        <View style={[styles.modalBox, { backgroundColor: colors.modalBg, maxHeight: '90%' }]}>
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Transfer Funds</Text>
                                <TouchableOpacity onPress={() => requestAnimationFrame(() => setShowTransfer(false))}>
                                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>

                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>From</Text>
                                <View style={styles.accountPicker}>
                                    {assets.map(a => (
                                        <TouchableOpacity
                                            key={a.id}
                                            style={[styles.accountOption, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, fromId === a.id && [styles.accountOptionActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]]}
                                            onPress={() => setFromId(a.id)}
                                        >
                                            <Text style={[styles.accountOptionText, { color: colors.textPrimary }]}>{a.name}</Text>
                                            <Text style={[styles.accountOptionBal, { color: colors.textSecondary }]}>{formatCurrency(a.balance, a.currency || currency)}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>To</Text>
                                <View style={styles.accountPicker}>
                                    {assets.filter(a => a.id !== fromId).map(a => (
                                        <TouchableOpacity
                                            key={a.id}
                                            style={[styles.accountOption, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }, toId === a.id && [styles.accountOptionActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]]}
                                            onPress={() => setToId(a.id)}
                                        >
                                            <Text style={[styles.accountOptionText, { color: colors.textPrimary }]}>{a.name}</Text>
                                            <Text style={[styles.accountOptionBal, { color: colors.textSecondary }]}>{formatCurrency(a.balance, a.currency || currency)}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Amount ({currency})</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.textPrimary }]}
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                    value={transferAmount}
                                    onChangeText={setTransferAmount}
                                    keyboardType="numeric"
                                />

                                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleTransfer}>
                                    <Text style={styles.saveBtnText}>Transfer</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Currency Breakdown Modal */}
            <Modal visible={showBreakdownModal} transparent animationType="fade" onRequestClose={() => setShowBreakdownModal(false)}>
                <View style={styles.smOverlay}>
                    <View style={[styles.smBox, { backgroundColor: colors.card }]}>

                        {/* Header */}
                        <View style={styles.smHeader}>
                            <View style={[styles.smIconWrap, { backgroundColor: 'rgba(255,102,0,0.12)' }]}>
                                <Ionicons name="wallet" size={20} color={colors.primary} />
                            </View>
                            <Text style={[styles.smTitle, { color: colors.textPrimary }]}>Balance Breakdown</Text>
                            <TouchableOpacity
                                onPress={() => setShowBreakdownModal(false)}
                                style={[styles.smClose, { backgroundColor: colors.inputBg }]}
                            >
                                <Ionicons name="close" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Per-currency rows */}
                        {currencyBreakdown.map((item) => (
                            <View key={item.cur} style={[styles.smRow, { borderColor: colors.border }]}>
                                <View style={[styles.smCurBadge, { backgroundColor: colors.inputBg }]}>
                                    <Text style={[styles.smCurCode, { color: colors.primary }]}>{item.cur}</Text>
                                </View>
                                <View style={styles.smAmounts}>
                                    <Text style={[styles.smOriginal, { color: colors.textPrimary }]}>
                                        {formatCurrency(item.originalTotal, item.cur)}
                                    </Text>
                                    {item.cur !== currency && (
                                        <View style={styles.smConvRow}>
                                            <Ionicons name="return-down-forward" size={13} color={colors.textMuted} />
                                            <Text style={[styles.smConverted, { color: colors.textSecondary }]}>
                                                {formatCurrency(item.convertedTotal, currency)}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        ))}

                        {/* Total */}
                        <View style={[styles.smTotalRow, { borderTopColor: colors.border }]}>
                            <Text style={[styles.smTotalLabel, { color: colors.textSecondary }]}>Total in {currency}</Text>
                            <Text style={[styles.smTotalVal, { color: colors.primary }]}>
                                {formatCurrency(totalBalance, currency)}
                            </Text>
                        </View>

                        {/* Done button */}
                        <View style={styles.smActions}>
                            <TouchableOpacity
                                style={[styles.smDoneBtn, { backgroundColor: colors.primary }]}
                                onPress={() => setShowBreakdownModal(false)}
                            >
                                <Text style={styles.smDoneTxt}>Done</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: 52,
        paddingBottom: Spacing.sm,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: Colors.dark.inputBg,
        borderWidth: 0,
        borderColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: FontSize.xxl,
        fontWeight: '800',
        color: Colors.dark.text,
        fontFamily: 'Poppins_800ExtraBold',
    },
    headerBtns: {
        flexDirection: 'row',
        gap: Spacing.sm,
        alignItems: 'center',
    },
    transferBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.dark.blueLight,
        paddingHorizontal: Spacing.md,
        height: 40,
        borderRadius: 14,
    },
    transferBtnText: {
        color: Colors.dark.blue,
        fontWeight: '600',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    addBtn: {
        backgroundColor: Colors.dark.emerald,
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Total summary card
    totalCard: {
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
        padding: Spacing.xl,
        borderRadius: BorderRadius.lg,
        backgroundColor: 'transparent',
        borderWidth: 0,
        borderColor: 'transparent',
        alignItems: 'center',
    },
    totalLabel: {
        fontSize: FontSize.sm,
        color: Colors.dark.textSecondary,
        fontFamily: 'Poppins_400Regular',
    },
    totalAmount: {
        fontSize: FontSize.display,
        fontFamily: 'Poppins_800ExtraBold',
        color: Colors.dark.text,
        marginTop: 4,
    },

    // Multi-currency breakdown chips
    // Currency breakdown modal (matches transaction history sm* style)
    smOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
    },
    smBox: {
        width: '100%',
        borderRadius: 24,
        padding: Spacing.xl,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
        elevation: Platform.OS === 'android' ? 0 : 10,
    },
    smHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.xl,
    },
    smIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    smTitle: {
        flex: 1,
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
    },
    smClose: {
        width: 32, height: 32,
        borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    smRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    smCurBadge: {
        minWidth: 52,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 6,
        borderRadius: 8,
        alignItems: 'center',
    },
    smCurCode: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    smAmounts: {
        flex: 1,
        alignItems: 'flex-end',
    },
    smOriginal: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
    },
    smConvRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 3,
    },
    smConverted: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
    },
    smTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        marginBottom: Spacing.xl,
    },
    smTotalLabel: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    smTotalVal: {
        fontSize: FontSize.xl,
        fontFamily: 'Poppins_700Bold',
    },
    smActions: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    smDoneBtn: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
    },
    smDoneTxt: {
        color: '#fff',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
    },

    // Allocation Chart
    allocationContainer: {
        marginHorizontal: Spacing.lg,
        marginBottom: Spacing.xl,
        alignItems: 'center',
    },
    allocationLegend: {
        width: '100%',
        marginTop: Spacing.xl,
    },
    allocationLegendRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    allocationLegendLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    allocationDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    allocationLegendName: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
    },
    allocationLegendRight: {
        alignItems: 'flex-end',
    },
    allocationLegendVal: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    allocationLegendPct: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },

    // List
    listContent: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 120,
        gap: Spacing.md,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 80,
        gap: Spacing.sm,
    },
    emptyTitle: {
        fontSize: FontSize.lg,
        fontWeight: '700',
        color: Colors.dark.text,
        fontFamily: 'Poppins_700Bold',
    },
    emptyDesc: {
        fontSize: FontSize.sm,
        color: Colors.dark.textMuted,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },

    // ATM card
    atmCard: {
        borderRadius: 20,
        padding: Spacing.xl,
        minHeight: 160,
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
        elevation: Platform.OS === 'android' ? 0 : 8,
    },
    atmCardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    chip: {
        width: 34,
        height: 26,
        backgroundColor: 'rgba(255,218,90,0.85)',
        borderRadius: 5,
        justifyContent: 'space-evenly',
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    chipLine: {
        height: 1.5,
        backgroundColor: 'rgba(160,110,0,0.55)',
        borderRadius: 2,
    },
    atmCardName: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    atmCardBalance: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        marginBottom: Spacing.md,
    },
    atmCardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    atmCardType: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        letterSpacing: 0.5,
    },
    atmActions: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    atmActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.22)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
    },
    atmActionTxt: {
        color: '#fff',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: Colors.dark.overlay,
    },
    modalBox: {
        backgroundColor: Colors.dark.modalBg,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: Spacing.xl,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    modalTitle: {
        fontSize: FontSize.xl,
        fontFamily: 'Poppins_800ExtraBold',
        color: Colors.dark.text,
    },
    inputLabel: {
        fontSize: FontSize.sm,
        fontWeight: '600',
        color: Colors.dark.textSecondary,
        marginBottom: Spacing.sm,
        marginTop: Spacing.md,
        fontFamily: 'Poppins_600SemiBold',
    },
    input: {
        backgroundColor: Colors.dark.inputBg,
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        color: Colors.dark.text,
        fontSize: FontSize.md,
        borderWidth: 1,
        borderColor: Colors.dark.inputBorder,
        fontFamily: 'Poppins_400Regular',
    },

    // Type grid
    typeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
    },
    typeOption: {
        width: '30%',
        padding: Spacing.sm,
        alignItems: 'center',
        gap: 4,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.inputBg,
        borderWidth: 1,
        borderColor: Colors.dark.inputBorder,
    },
    typeOptionActive: {
        borderColor: Colors.dark.purple,
        backgroundColor: Colors.dark.purpleLight,
    },
    typeText: {
        fontSize: FontSize.xs,
        color: Colors.dark.textMuted,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
    typeTextActive: {
        color: Colors.dark.purple,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Color picker
    colorPicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    colorSwatch: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    colorSwatchSelected: {
        borderWidth: 3,
        borderColor: '#fff',
    },

    // Card preview
    cardPreview: {
        borderRadius: 18,
        padding: Spacing.xl,
        minHeight: 150,
        justifyContent: 'space-between',
        marginVertical: Spacing.md,
    },
    previewTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    previewName: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    previewBalance: {
        color: '#FFFFFF',
        fontSize: 24,
        fontFamily: 'Poppins_700Bold',
    },
    previewType: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        letterSpacing: 0.5,
    },

    saveBtn: {
        backgroundColor: Colors.dark.purple,
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        marginTop: Spacing.md,
    },
    saveBtnText: {
        color: '#fff',
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
    },

    // Transfer modal
    accountPicker: {
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    accountOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.inputBg,
        borderWidth: 1,
        borderColor: Colors.dark.inputBorder,
    },
    accountOptionActive: {
        borderColor: Colors.dark.purple,
        backgroundColor: Colors.dark.purpleLight,
    },
    accountOptionText: {
        fontSize: FontSize.md,
        color: Colors.dark.text,
        fontFamily: 'Poppins_500Medium',
    },
    accountOptionBal: {
        fontSize: FontSize.md,
        color: Colors.dark.textMuted,
        fontFamily: 'Poppins_400Regular',
    },
    currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    currencyOption: {
        width: '31%', padding: Spacing.md, borderRadius: BorderRadius.md,
        borderWidth: 1, alignItems: 'center', justifyContent: 'center'
    },
    currencyActive: { borderColor: '#ff6600' },
    currencyCode: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    currencyCodeActive: { color: '#ff6600' },
    currencySymbol: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    currencySymbolActive: { color: '#ff6600' },
});
