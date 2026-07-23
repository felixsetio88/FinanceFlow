/**
 * pdf-statement-import.js
 *
 * Dedicated page for importing bank statement PDFs via the on-device local AI.
 *
 * Pipeline:
 *   1. User picks a PDF
 *   2. User optionally configures column mapping (named presets saved per bank)
 *   3. extractTextFromPDF() extracts text and parses transactions
 *   4. Results are shown; each row has a pencil icon to edit individually
 *   5. "Save Transactions" writes selected rows to the database
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Platform, View, Text,
    Alert, ActivityIndicator, StyleSheet, useWindowDimensions,
    TextInput, Modal, KeyboardAvoidingView, Switch, Pressable,
} from 'react-native';
import { ScrollView, TouchableOpacity } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { checkModelStatus, isModelDownloaded, getActiveModelId } from '../services/localAI';
import { extractTextFromPDF } from '../services/pdfProcessor';
import { generateId } from '../utils/helpers';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { spendingCategories, incomeCategories, autoCategorize } from '../utils/categories';

const MAPPING_PRESETS_KEY = 'pdf_import_column_mapping_presets';

const EMPTY_MAPPING = {
    name: '',
    dateCol: '',
    descCol: '',
    amountCol: '',
    typeCol: '',
    balanceCol: '',
    dateFormat: 'international', // 'international' (DD/MM/YY) or 'us' (MM/DD/YY)
};

function makeImportTransactionId(tx) {
    const key = [
        tx.date || '',
        tx.type || '',
        Number(tx.amount || 0).toFixed(2),
        tx.category || '',
        String(tx.description || '').trim().toLowerCase(),
    ].join('|');
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    }
    return `pdf_${(hash >>> 0).toString(36)}`;
}

function mappingToParseHints(mapping) {
    if (!mapping) return null;
    const hasAnyCol = mapping.dateCol || mapping.descCol || mapping.amountCol || mapping.typeCol || mapping.balanceCol;
    if (!hasAnyCol) return null;
    return {
        enabled: true,
        dateFormat: mapping.dateFormat || 'international',
        rowFields: {
            date: !!mapping.dateCol,
            description: !!mapping.descCol,
            amount: !!mapping.amountCol,
            transactionType: !!mapping.typeCol,
            totalBalance: !!mapping.balanceCol,
        },
        columns: {
            date: parseInt(mapping.dateCol, 10) || 0,
            description: parseInt(mapping.descCol, 10) || 0,
            amount: parseInt(mapping.amountCol, 10) || 0,
            transactionType: parseInt(mapping.typeCol, 10) || 0,
            totalBalance: parseInt(mapping.balanceCol, 10) || 0,
        },
    };
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function PdfStatementImport() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { bulkAddTransactions, loadData, currency, assets } = useApp();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    // ── Core state ──────────────────────────────────────────────────────────────
    const [pdfFile, setPdfFile] = useState(null);
    const [status, setStatus] = useState('idle');
    const [statusMsg, setStatusMsg] = useState('');
    const [transactions, setTransactions] = useState([]);
    const [saving, setSaving] = useState(false);
    const [selectedAssetId, setSelectedAssetId] = useState(null);

    // ── Column mapping state ────────────────────────────────────────────────────
    const [mappingOpen, setMappingOpen] = useState(false);
    const [mapping, setMapping] = useState({ ...EMPTY_MAPPING });
    const [presets, setPresets] = useState([]); // [{ id, ...EMPTY_MAPPING }]
    const [activePresetId, setActivePresetId] = useState(null);
    const [presetNameInput, setPresetNameInput] = useState('');

    // ── Edit modal state ────────────────────────────────────────────────────────
    const [editingTx, setEditingTx] = useState(null); // tx being edited
    const [editFields, setEditFields] = useState(null);

    const cancelledRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        loadPresets();
        return () => { mountedRef.current = false; };
    }, []);

    // ── Presets ──────────────────────────────────────────────────────────────────
    const loadPresets = async () => {
        try {
            const raw = await AsyncStorage.getItem(MAPPING_PRESETS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setPresets(parsed);
            }
        } catch { }
    };

    const savePresets = async (nextPresets) => {
        try {
            await AsyncStorage.setItem(MAPPING_PRESETS_KEY, JSON.stringify(nextPresets));
        } catch { }
    };

    const handleSavePreset = () => {
        const name = presetNameInput.trim() || mapping.name?.trim() || '';
        if (!name) {
            Alert.alert('Name Required', 'Enter a name for this preset (e.g. "BCA", "Mandiri").');
            return;
        }
        const preset = { ...mapping, name, id: activePresetId || generateId() };
        let nextPresets;
        if (activePresetId) {
            nextPresets = presets.map(p => p.id === activePresetId ? preset : p);
        } else {
            nextPresets = [...presets, preset];
            setActivePresetId(preset.id);
        }
        setPresets(nextPresets);
        setMapping(preset);
        savePresets(nextPresets);
        setPresetNameInput('');
        Alert.alert('Preset Saved', `Mapping "${name}" saved.`);
    };

    const handleSelectPreset = (preset) => {
        setMapping({ ...preset });
        setActivePresetId(preset.id);
        setPresetNameInput('');
    };

    const handleDeletePreset = (id) => {
        Alert.alert('Delete Preset', 'Remove this saved mapping?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: () => {
                    const next = presets.filter(p => p.id !== id);
                    setPresets(next);
                    savePresets(next);
                    if (activePresetId === id) {
                        setActivePresetId(null);
                        setMapping({ ...EMPTY_MAPPING });
                    }
                }
            },
        ]);
    };

    const handleClearMapping = () => {
        setMapping({ ...EMPTY_MAPPING });
        setActivePresetId(null);
    };

    // ── Pick PDF ─────────────────────────────────────────────────────────────────
    const handlePickPdf = async () => {
        if (status === 'scanning') return;
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;
            const asset = result.assets[0];
            setPdfFile({ name: asset.name || 'statement.pdf', uri: asset.uri });
            setTransactions([]);
            setStatus('idle');
            setStatusMsg('');
        } catch (err) {
            Alert.alert('Error', err?.message || 'Could not open file picker.');
        }
    };

    // ── Scan ──────────────────────────────────────────────────────────────────────
    const handleScan = async () => {
        if (!pdfFile?.uri) return;

        if (Platform.OS === 'web') {
            Alert.alert('Not Supported', 'PDF import requires a native iOS or Android build.');
            return;
        }

        try {
            await checkModelStatus();
            const modelId = await getActiveModelId();
            const ready = await isModelDownloaded(modelId);
            if (!ready) {
                Alert.alert(
                    'AI Model Required',
                    'Please download a local AI model in Settings → Local AI Models first.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Go to Settings', onPress: () => router.back() },
                    ]
                );
                return;
            }
        } catch (err) {
            Alert.alert('Model Check Failed', err?.message || 'Could not verify AI model.');
            return;
        }

        cancelledRef.current = false;
        setStatus('scanning');
        setStatusMsg('Extracting text from PDF…');
        setTransactions([]);

        try {
            const parseHints = mappingToParseHints(mapping);
            const fileMeta = {
                name: pdfFile.name,
                forceAI: !parseHints,
                preferAIFallback: !parseHints,
                enforceMappedColumns: false,
                ...(parseHints && { parseHints }),
            };

            setStatusMsg('AI is reading transactions… this may take a minute');
            const rawTransactions = await extractTextFromPDF(pdfFile.uri, fileMeta);

            if (cancelledRef.current || !mountedRef.current) {
                setStatus('idle');
                return;
            }

            if (!rawTransactions || rawTransactions.length === 0) {
                setStatus('error');
                setStatusMsg(
                    'No transactions found. Make sure the PDF is a text-based bank statement ' +
                    '(not a scanned image). Try setting the column mapping or exporting the PDF from your banking app.'
                );
                return;
            }

            const enriched = rawTransactions.map(tx => ({
                ...tx,
                id: generateId(),
                assetId: selectedAssetId || tx.assetId || undefined,
                selected: true,
            }));

            setTransactions(enriched);
            setStatus('done');
            setStatusMsg('');
        } catch (err) {
            if (!mountedRef.current) return;
            const msg = err?.message || 'An unexpected error occurred.';
            let userMsg = msg;
            if (msg.includes('expo-pdf-text-extract') || msg.includes('unavailable') || msg.includes('is not a function')) {
                userMsg = 'PDF text extraction requires a native build.\n\nRun: npx expo run:ios  or  npx expo run:android\n\nExpo Go does not support this feature.';
            } else if (msg.includes('not downloaded') || msg.includes('Model not ready')) {
                userMsg = 'Please download an AI model from Settings → Local AI Models first.';
            }
            setStatus('error');
            setStatusMsg(userMsg);
        }
    };

    const handleCancel = () => {
        cancelledRef.current = true;
        setStatus('idle');
        setStatusMsg('');
    };

    // ── Row selection ─────────────────────────────────────────────────────────────
    const toggleOne = useCallback((id) => {
        setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, selected: !tx.selected } : tx));
    }, []);

    const toggleAll = useCallback((value) => {
        setTransactions(prev => prev.map(tx => ({ ...tx, selected: value })));
    }, []);

    // ── Edit modal ────────────────────────────────────────────────────────────────
    const openEditModal = (tx) => {
        setEditingTx(tx);
        setEditFields({
            description: tx.description || '',
            date: tx.date ? tx.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
            amount: String(tx.amount || '0'),
            type: tx.type || 'spending',
            category: tx.category || 'other_spending',
        });
    };

    const closeEditModal = () => {
        setEditingTx(null);
        setEditFields(null);
    };

    const saveEditModal = () => {
        if (!editingTx || !editFields) return;
        const amount = parseFloat(String(editFields.amount).replace(/[^0-9.]/g, '')) || 0;
        const isoDate = (() => {
            try {
                const d = new Date(editFields.date);
                return isNaN(d.getTime()) ? editingTx.date : d.toISOString();
            } catch { return editingTx.date; }
        })();
        setTransactions(prev => prev.map(tx =>
            tx.id === editingTx.id
                ? { ...tx, description: editFields.description.trim() || tx.description, date: isoDate, amount, type: editFields.type, category: editFields.category }
                : tx
        ));
        closeEditModal();
    };

    // ── Save ──────────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        const toSave = transactions.filter(tx => tx.selected);
        if (toSave.length === 0) {
            Alert.alert('Nothing Selected', 'Select at least one transaction to save.');
            return;
        }
        setSaving(true);
        try {
            const rows = toSave.map(({ selected, ...rest }) => ({ ...rest, id: makeImportTransactionId(rest) }));
            await bulkAddTransactions(rows);
            await loadData();
            Alert.alert(
                'Import Complete',
                `${toSave.length} transaction${toSave.length !== 1 ? 's' : ''} saved successfully.`,
                [{ text: 'Done', onPress: () => router.back() }]
            );
        } catch (err) {
            Alert.alert('Save Failed', err?.message || 'Could not save transactions.');
        } finally {
            setSaving(false);
        }
    };

    // ── Derived values ─────────────────────────────────────────────────────────────
    const isScanning = status === 'scanning';
    const selectedCount = transactions.filter(tx => tx.selected).length;
    const allSelected = transactions.length > 0 && selectedCount === transactions.length;
    const incomeSelected = transactions.filter(tx => tx.selected && tx.type === 'income');
    const spendSelected = transactions.filter(tx => tx.selected && tx.type === 'spending');
    const incomeTotal = incomeSelected.reduce((s, tx) => s + (tx.amount || 0), 0);
    const spendTotal = spendSelected.reduce((s, tx) => s + (tx.amount || 0), 0);

    const fmt = (n) => n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const txColor = (type) => type === 'income' ? colors.emerald : colors.rose;

    const allCategories = editFields?.type === 'income' ? incomeCategories : spendingCategories;
    const hasMappingSet = mapping.dateCol || mapping.descCol || mapping.amountCol || mapping.typeCol || mapping.balanceCol;

    // ── Render ──────────────────────────────────────────────────────────────────────
    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Gradient background */}
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bg" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bg)" />
            </Svg>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>PDF Bank Import</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                scrollEnabled={!isScanning}
                keyboardShouldPersistTaps="handled"
            >
                {/* ── Upload card ── */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.cardHeaderRow}>
                        <View style={[styles.cardIcon, { backgroundColor: isDark ? 'rgba(30,201,142,0.18)' : 'rgba(30,201,142,0.1)' }]}>
                            <Ionicons name="document-text" size={22} color={colors.emerald} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Select PDF Statement</Text>
                            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                                Local AI reads the text layer of your PDF — fully offline
                            </Text>
                        </View>
                    </View>

                    {/* File picker row */}
                    <TouchableOpacity
                        style={[
                            styles.fileRow,
                            { backgroundColor: colors.inputBg, borderColor: pdfFile ? colors.emerald : colors.border },
                            isScanning && { opacity: 0.5 },
                        ]}
                        onPress={handlePickPdf}
                        disabled={isScanning}
                        activeOpacity={0.82}
                    >
                        <Ionicons
                            name={pdfFile ? 'document-attach' : 'folder-open-outline'}
                            size={18}
                            color={pdfFile ? colors.emerald : colors.textMuted}
                        />
                        <Text
                            style={[styles.fileName, { color: pdfFile ? colors.textPrimary : colors.textMuted }]}
                            numberOfLines={1}
                        >
                            {pdfFile ? pdfFile.name : 'Tap to choose a PDF…'}
                        </Text>
                        {pdfFile && !isScanning && (
                            <TouchableOpacity
                                onPress={() => { setPdfFile(null); setTransactions([]); setStatus('idle'); setStatusMsg(''); }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>

                    {/* Account Selector */}
                    {pdfFile && !isScanning && (
                        <View style={{ marginTop: Spacing.md, marginBottom: Spacing.md }}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>
                                Link to Account{' '}
                                <Text style={{ color: colors.textMuted, fontFamily: 'Poppins_400Regular' }}>
                                    (optional)
                                </Text>
                            </Text>
                            {!assets || assets.length === 0 ? (
                                <Text style={[styles.noAssetsHint, { color: colors.textMuted }]}>
                                    No accounts found. Add one in Settings → Assets.
                                </Text>
                            ) : (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View style={styles.paymentRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.paymentChip,
                                                { backgroundColor: colors.inputBg, borderColor: colors.border },
                                                selectedAssetId === null && [
                                                    styles.paymentChipActive,
                                                    { backgroundColor: isDark ? 'rgba(255,102,0,0.2)' : 'rgba(255,102,0,0.1)', borderColor: colors.primary },
                                                ],
                                            ]}
                                            onPress={() => requestAnimationFrame(() => setSelectedAssetId(null))}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name="close-circle-outline" size={14} color={selectedAssetId === null ? colors.primary : colors.textMuted} />
                                            <Text style={[
                                                styles.paymentChipText,
                                                { color: colors.textSecondary },
                                                selectedAssetId === null && [styles.paymentChipTextActive, { color: colors.primary }],
                                            ]}>
                                                None
                                            </Text>
                                        </TouchableOpacity>
                                        {assets.map((a) => (
                                            <TouchableOpacity
                                                key={a.id}
                                                style={[
                                                    styles.paymentChip,
                                                    { backgroundColor: colors.inputBg, borderColor: colors.border },
                                                    selectedAssetId === a.id && [
                                                        styles.paymentChipActive,
                                                        { backgroundColor: isDark ? 'rgba(255,102,0,0.2)' : 'rgba(255,102,0,0.1)', borderColor: colors.primary },
                                                    ],
                                                ]}
                                                onPress={() => setSelectedAssetId(a.id)}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="card-outline" size={14} color={selectedAssetId === a.id ? colors.primary : colors.textMuted} />
                                                <Text style={[
                                                    styles.paymentChipText,
                                                    { color: colors.textSecondary },
                                                    selectedAssetId === a.id && [styles.paymentChipTextActive, { color: colors.primary }],
                                                ]}>
                                                    {a.name}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </ScrollView>
                            )}
                        </View>
                    )}

                    {/* Scan / Re-scan button */}
                    {pdfFile && !isScanning && (
                        <TouchableOpacity
                            style={[
                                styles.scanBtn,
                                transactions.length > 0
                                    ? { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary }
                                    : { backgroundColor: colors.emerald },
                            ]}
                            onPress={handleScan}
                            activeOpacity={0.86}
                        >
                            <Ionicons
                                name={transactions.length > 0 ? 'refresh' : 'sparkles'}
                                size={16}
                                color={transactions.length > 0 ? colors.primary : '#fff'}
                            />
                            <Text style={[styles.scanBtnText, { color: transactions.length > 0 ? colors.primary : '#fff' }]}>
                                {transactions.length > 0 ? 'Re-scan' : 'Scan with Local AI'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* Error state */}
                    {status === 'error' && (
                        <View style={[styles.errorBox, { backgroundColor: isDark ? 'rgba(255,122,135,0.1)' : 'rgba(255,122,135,0.08)', borderColor: colors.rose }]}>
                            <Ionicons name="alert-circle" size={16} color={colors.rose} style={{ marginTop: 1 }} />
                            <Text style={[styles.errorText, { color: colors.rose }]}>{statusMsg}</Text>
                        </View>
                    )}
                </View>

                {/* ── Column Mapping Card ── */}
                <TouchableOpacity
                    style={[styles.card, { backgroundColor: colors.card, borderColor: hasMappingSet ? colors.primary : colors.border }]}
                    onPress={() => setMappingOpen(o => !o)}
                    activeOpacity={0.88}
                >
                    <View style={styles.mappingHeaderRow}>
                        <View style={[styles.cardIcon, { backgroundColor: isDark ? 'rgba(255,102,0,0.18)' : 'rgba(255,102,0,0.1)' }]}>
                            <Ionicons name="grid-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Column Mapping</Text>
                            <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                                {hasMappingSet
                                    ? `Active: ${mapping.name || 'Custom'} · ${Object.entries({ date: mapping.dateCol, desc: mapping.descCol, amt: mapping.amountCol }).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ')}`
                                    : 'Optional: tell AI which column is which for better accuracy'}
                            </Text>
                        </View>
                        <Ionicons name={mappingOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                    </View>
                </TouchableOpacity>

                {mappingOpen && (
                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: -Spacing.md }]}>
                        {/* Preset selector */}
                        {presets.length > 0 && (
                            <View style={styles.presetRow}>
                                <Text style={[styles.label, { color: colors.textSecondary }]}>Saved Presets</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                                    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                                        {presets.map(p => (
                                            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <TouchableOpacity
                                                    style={[styles.presetChip, { backgroundColor: colors.inputBg, borderColor: activePresetId === p.id ? colors.primary : colors.border }, activePresetId === p.id && { backgroundColor: isDark ? 'rgba(255,102,0,0.2)' : 'rgba(255,102,0,0.08)' }]}
                                                    onPress={() => handleSelectPreset(p)}
                                                    activeOpacity={0.8}
                                                >
                                                    <Text style={[styles.presetChipText, { color: activePresetId === p.id ? colors.primary : colors.textSecondary }]}>{p.name}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleDeletePreset(p.id)}
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                >
                                                    <Ionicons name="close-circle" size={15} color={colors.textMuted} />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            </View>
                        )}

                        <View style={[styles.divider, { backgroundColor: colors.border, marginVertical: Spacing.md }]} />

                        {/* Column number inputs */}
                        <Text style={[styles.label, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>Column Numbers (1-based, leave blank to auto-detect)</Text>
                        <View style={styles.colInputGrid}>
                            {[
                                { key: 'dateCol', label: 'Date Col #', icon: 'calendar-outline' },
                                { key: 'descCol', label: 'Description Col #', icon: 'text-outline' },
                                { key: 'amountCol', label: 'Amount Col #', icon: 'cash-outline' },
                                { key: 'typeCol', label: 'DB/CR Col #', icon: 'swap-horizontal-outline' },
                                { key: 'balanceCol', label: 'Balance Col #', icon: 'stats-chart-outline' },
                            ].map(({ key, label, icon }) => (
                                <View key={key} style={styles.colInputItem}>
                                    <Ionicons name={icon} size={13} color={colors.textMuted} style={{ marginBottom: 3 }} />
                                    <Text style={[styles.colLabel, { color: colors.textMuted }]}>{label}</Text>
                                    <TextInput
                                        style={[styles.colInput, { backgroundColor: colors.inputBg, borderColor: mapping[key] ? colors.primary : colors.border, color: colors.textPrimary }]}
                                        value={mapping[key]}
                                        onChangeText={v => setMapping(m => ({ ...m, [key]: v.replace(/[^0-9]/g, '') }))}
                                        keyboardType="number-pad"
                                        placeholder="–"
                                        placeholderTextColor={colors.textMuted}
                                        maxLength={2}
                                    />
                                </View>
                            ))}
                        </View>

                        {/* Date format toggle */}
                        <View style={styles.formatRow}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Date Format</Text>
                            <View style={styles.formatToggle}>
                                {[{ id: 'international', label: 'DD/MM/YY' }, { id: 'us', label: 'MM/DD/YY' }].map(opt => (
                                    <TouchableOpacity
                                        key={opt.id}
                                        style={[styles.formatChip, { backgroundColor: colors.inputBg, borderColor: colors.border }, mapping.dateFormat === opt.id && { backgroundColor: isDark ? 'rgba(255,102,0,0.2)' : 'rgba(255,102,0,0.1)', borderColor: colors.primary }]}
                                        onPress={() => setMapping(m => ({ ...m, dateFormat: opt.id }))}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.formatChipText, { color: mapping.dateFormat === opt.id ? colors.primary : colors.textSecondary }]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Save / clear preset */}
                        <View style={styles.presetActionRow}>
                            <TextInput
                                style={[styles.presetNameInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary, flex: 1 }]}
                                value={presetNameInput}
                                onChangeText={setPresetNameInput}
                                placeholder={activePresetId ? (mapping.name || 'Preset name…') : 'Preset name (e.g. BCA)'}
                                placeholderTextColor={colors.textMuted}
                            />
                            <TouchableOpacity
                                style={[styles.presetSaveBtn, { backgroundColor: colors.primary }]}
                                onPress={handleSavePreset}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="save-outline" size={15} color="#fff" />
                                <Text style={styles.presetSaveBtnText}>{activePresetId ? 'Update' : 'Save'}</Text>
                            </TouchableOpacity>
                            {hasMappingSet && (
                                <TouchableOpacity
                                    style={[styles.presetClearBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                                    onPress={handleClearMapping}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons name="close" size={15} color={colors.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* ── Scanning banner ── */}
                {isScanning && (
                    <View
                        style={[styles.scanBanner, { backgroundColor: isDark ? 'rgba(255,102,0,0.16)' : 'rgba(255,102,0,0.07)', borderColor: colors.primary }]}
                        pointerEvents="box-none"
                    >
                        <ActivityIndicator color={colors.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.scanBannerTitle, { color: colors.primary }]}>{statusMsg}</Text>
                            <Text style={[styles.scanBannerSub, { color: colors.textSecondary }]}>
                                This may take 30–90 s depending on model and statement length
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.cancelBtn, { borderColor: colors.rose, backgroundColor: isDark ? 'rgba(255,122,135,0.12)' : 'rgba(255,122,135,0.07)' }]}
                            onPress={handleCancel}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="close-circle" size={14} color={colors.rose} />
                            <Text style={[styles.cancelBtnText, { color: colors.rose }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Results card ── */}
                {transactions.length > 0 && (
                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

                        {/* Results header */}
                        <View style={styles.resultsHeaderRow}>
                            <View>
                                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                                    {transactions.length} Transaction{transactions.length !== 1 ? 's' : ''} Found
                                </Text>
                                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                                    {selectedCount} of {transactions.length} selected · tap ✏️ to edit
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[
                                    styles.selectAllBtn,
                                    {
                                        borderColor: allSelected ? colors.primary : colors.border,
                                        backgroundColor: allSelected ? colors.primaryLight : colors.inputBg,
                                    },
                                ]}
                                onPress={() => toggleAll(!allSelected)}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name={allSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={14}
                                    color={allSelected ? colors.primary : colors.textMuted}
                                />
                                <Text style={[styles.selectAllText, { color: allSelected ? colors.primary : colors.textMuted }]}>
                                    {allSelected ? 'Deselect all' : 'Select all'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Income / spending summary pills */}
                        {selectedCount > 0 && (
                            <View style={styles.summaryRow}>
                                <View style={[styles.summaryPill, { backgroundColor: isDark ? 'rgba(30,201,142,0.14)' : 'rgba(30,201,142,0.08)', borderColor: isDark ? 'rgba(30,201,142,0.3)' : 'rgba(30,201,142,0.2)' }]}>
                                    <Ionicons name="arrow-down-circle" size={13} color={colors.emerald} />
                                    <Text style={[styles.summaryPillText, { color: colors.emerald }]}>
                                        +{fmt(incomeTotal)}  ·  {incomeSelected.length}
                                    </Text>
                                </View>
                                <View style={[styles.summaryPill, { backgroundColor: isDark ? 'rgba(255,122,135,0.12)' : 'rgba(255,122,135,0.07)', borderColor: isDark ? 'rgba(255,122,135,0.28)' : 'rgba(255,122,135,0.18)' }]}>
                                    <Ionicons name="arrow-up-circle" size={13} color={colors.rose} />
                                    <Text style={[styles.summaryPillText, { color: colors.rose }]}>
                                        -{fmt(spendTotal)}  ·  {spendSelected.length}
                                    </Text>
                                </View>
                            </View>
                        )}

                        <View style={[styles.divider, { backgroundColor: colors.border }]} />

                        {/* Transaction rows */}
                        {transactions.map((tx) => {
                            const col = txColor(tx.type);
                            return (
                                <View
                                    key={tx.id}
                                    style={[
                                        styles.txRow,
                                        {
                                            borderColor: tx.selected ? col : colors.border,
                                            backgroundColor: tx.selected
                                                ? tx.type === 'income'
                                                    ? (isDark ? 'rgba(30,201,142,0.08)' : 'rgba(30,201,142,0.05)')
                                                    : (isDark ? 'rgba(255,122,135,0.09)' : 'rgba(255,122,135,0.05)')
                                                : colors.inputBg,
                                        },
                                    ]}
                                >
                                    {/* Checkbox — toggles selection */}
                                    <TouchableOpacity
                                        onPress={() => toggleOne(tx.id)}
                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                        <View style={[
                                            styles.checkbox,
                                            { borderColor: tx.selected ? col : colors.border },
                                            tx.selected && { backgroundColor: col },
                                        ]}>
                                            {tx.selected && <Ionicons name="checkmark" size={11} color="#fff" />}
                                        </View>
                                    </TouchableOpacity>

                                    {/* Description + date — tapping selects */}
                                    <TouchableOpacity style={{ flex: 1, gap: 2 }} onPress={() => toggleOne(tx.id)} activeOpacity={0.78}>
                                        <Text style={[styles.txDesc, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {tx.description}
                                        </Text>
                                        <Text style={[styles.txMeta, { color: colors.textMuted }]}>
                                            {new Date(tx.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            {'  ·  '}
                                            <Text style={{ color: col, fontFamily: 'Poppins_600SemiBold' }}>
                                                {tx.type === 'income' ? 'Income' : 'Spending'}
                                            </Text>
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Amount */}
                                    <Text style={[styles.txAmount, { color: col }]}>
                                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount || 0)}
                                    </Text>

                                    {/* Edit button */}
                                    <TouchableOpacity
                                        style={[styles.editBtn, { backgroundColor: isDark ? 'rgba(255,102,0,0.18)' : 'rgba(255,102,0,0.08)' }]}
                                        onPress={() => openEditModal(tx)}
                                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                    >
                                        <Ionicons name="create-outline" size={15} color={colors.primary} />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}

                        {/* Save button */}
                        <TouchableOpacity
                            style={[
                                styles.saveBtn,
                                { backgroundColor: colors.primary, shadowColor: colors.primary },
                                (selectedCount === 0 || saving) && styles.saveBtnDisabled,
                            ]}
                            onPress={handleSave}
                            disabled={selectedCount === 0 || saving}
                            activeOpacity={0.86}
                        >
                            {saving
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            }
                            <Text style={styles.saveBtnText}>
                                {saving
                                    ? 'Saving…'
                                    : `Save ${selectedCount} Transaction${selectedCount !== 1 ? 's' : ''}`
                                }
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={{ height: 60 }} />
            </ScrollView>

            {/* ── Edit Transaction Modal ── */}
            <Modal
                visible={!!editingTx}
                animationType="slide"
                transparent
                onRequestClose={closeEditModal}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <Pressable style={styles.modalBackdrop} onPress={closeEditModal} />
                    <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        {/* Modal handle */}
                        <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
                        <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Edit Transaction</Text>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            {/* Description */}
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
                            <TextInput
                                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                                value={editFields?.description ?? ''}
                                onChangeText={v => setEditFields(f => ({ ...f, description: v }))}
                                placeholder="Transaction description"
                                placeholderTextColor={colors.textMuted}
                                multiline
                            />

                            {/* Date */}
                            <Text style={[styles.label, { color: colors.textSecondary, marginTop: Spacing.md }]}>Date (YYYY-MM-DD)</Text>
                            <TextInput
                                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                                value={editFields?.date ?? ''}
                                onChangeText={v => setEditFields(f => ({ ...f, date: v }))}
                                placeholder="2024-01-31"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numbers-and-punctuation"
                            />

                            {/* Amount */}
                            <Text style={[styles.label, { color: colors.textSecondary, marginTop: Spacing.md }]}>Amount</Text>
                            <TextInput
                                style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                                value={editFields?.amount ?? ''}
                                onChangeText={v => setEditFields(f => ({ ...f, amount: v }))}
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="decimal-pad"
                            />

                            {/* Type toggle */}
                            <Text style={[styles.label, { color: colors.textSecondary, marginTop: Spacing.md }]}>Type</Text>
                            <View style={styles.typeToggleRow}>
                                {[
                                    { id: 'spending', label: 'Spending', icon: 'arrow-up-circle', color: colors.rose },
                                    { id: 'income', label: 'Income', icon: 'arrow-down-circle', color: colors.emerald },
                                ].map(opt => (
                                    <TouchableOpacity
                                        key={opt.id}
                                        style={[
                                            styles.typeChip,
                                            { backgroundColor: colors.inputBg, borderColor: colors.border },
                                            editFields?.type === opt.id && { backgroundColor: isDark ? `${opt.color}28` : `${opt.color}12`, borderColor: opt.color },
                                        ]}
                                        onPress={() => setEditFields(f => ({
                                            ...f,
                                            type: opt.id,
                                            category: opt.id === 'income' ? 'other_income' : (f.category === 'other_income' ? 'other_spending' : f.category),
                                        }))}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name={opt.icon} size={15} color={editFields?.type === opt.id ? opt.color : colors.textMuted} />
                                        <Text style={[styles.typeChipText, { color: editFields?.type === opt.id ? opt.color : colors.textSecondary }]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Category */}
                            <Text style={[styles.label, { color: colors.textSecondary, marginTop: Spacing.md }]}>Category</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                                <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: 2 }}>
                                    {allCategories.map(cat => (
                                        <TouchableOpacity
                                            key={cat.id}
                                            style={[
                                                styles.catChip,
                                                { backgroundColor: colors.inputBg, borderColor: colors.border },
                                                editFields?.category === cat.id && { backgroundColor: isDark ? `${cat.color}28` : `${cat.color}12`, borderColor: cat.color },
                                            ]}
                                            onPress={() => setEditFields(f => ({ ...f, category: cat.id }))}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name={cat.icon} size={13} color={editFields?.category === cat.id ? cat.color : colors.textMuted} />
                                            <Text style={[styles.catChipText, { color: editFields?.category === cat.id ? cat.color : colors.textSecondary }]}>{cat.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>
                        </ScrollView>

                        {/* Modal actions */}
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalCancelBtn, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                                onPress={closeEditModal}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalSaveBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                                onPress={saveEditModal}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="checkmark" size={16} color="#fff" />
                                <Text style={styles.modalSaveText}>Apply Changes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 14, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: FontSize.xl, fontFamily: 'Poppins_800ExtraBold' },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

    card: {
        borderRadius: 22, padding: Spacing.lg, borderWidth: 1,
        marginBottom: Spacing.md,
        shadowColor: '#1A1040', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
    cardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    cardSub: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', lineHeight: 17, marginTop: 2 },

    fileRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5,
    },
    fileName: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },

    scanBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, marginTop: Spacing.md,
        paddingVertical: 13, borderRadius: BorderRadius.full,
    },
    scanBtnText: { fontFamily: 'Poppins_700Bold', fontSize: FontSize.md },

    errorBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
        marginTop: Spacing.md, padding: Spacing.md,
        borderRadius: BorderRadius.md, borderWidth: 1,
    },
    errorText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', lineHeight: 18 },

    // ─── Column Mapping ────────────────────────────────────────────────────
    mappingHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    label: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
    presetRow: { marginBottom: Spacing.sm },
    presetChip: {
        paddingHorizontal: Spacing.md, paddingVertical: 6,
        borderRadius: BorderRadius.full, borderWidth: 1,
    },
    presetChipText: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
    colInputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
    colInputItem: { alignItems: 'center', minWidth: 70 },
    colLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginBottom: 3 },
    colInput: {
        width: 56, height: 38, borderRadius: BorderRadius.md, borderWidth: 1.5,
        textAlign: 'center', fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.md,
    },
    formatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
    formatToggle: { flexDirection: 'row', gap: Spacing.sm },
    formatChip: {
        paddingHorizontal: Spacing.md, paddingVertical: 6,
        borderRadius: BorderRadius.full, borderWidth: 1,
    },
    formatChipText: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
    presetActionRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    presetNameInput: {
        height: 40, borderRadius: BorderRadius.md, borderWidth: 1,
        paddingHorizontal: Spacing.md, fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular',
    },
    presetSaveBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: Spacing.md, height: 40, borderRadius: BorderRadius.md,
    },
    presetSaveBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: FontSize.xs },
    presetClearBtn: {
        width: 40, height: 40, borderRadius: BorderRadius.md, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
    },

    // ─── Scan Banner ───────────────────────────────────────────────────────
    scanBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.lg, borderRadius: 18,
        marginBottom: Spacing.md, borderWidth: 1,
    },
    scanBannerTitle: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    scanBannerSub: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 3 },
    cancelBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: Spacing.sm, paddingVertical: 5,
        borderRadius: BorderRadius.full, borderWidth: 1,
    },
    cancelBtnText: { fontSize: FontSize.xs, fontFamily: 'Poppins_700Bold' },

    // ─── Results ───────────────────────────────────────────────────────────
    resultsHeaderRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: Spacing.sm,
    },
    selectAllBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: Spacing.sm, paddingVertical: 6,
        borderRadius: BorderRadius.full, borderWidth: 1, marginTop: 2,
    },
    selectAllText: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },

    summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
    summaryPill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: Spacing.md, paddingVertical: 6,
        borderRadius: BorderRadius.full, borderWidth: 1,
    },
    summaryPillText: { fontSize: FontSize.xs, fontFamily: 'Poppins_700Bold' },

    divider: { height: 1, marginBottom: Spacing.sm },

    txRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md,
        borderWidth: 1.5, marginBottom: Spacing.sm,
    },
    checkbox: {
        width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center',
    },
    txDesc: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    txMeta: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular' },
    txAmount: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    editBtn: {
        width: 30, height: 30, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },

    saveBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, marginTop: Spacing.md,
        paddingVertical: 15, borderRadius: BorderRadius.full,
        shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12,
        elevation: Platform.OS === 'android' ? 0 : 5,
    },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: FontSize.md },

    // ─── Edit Modal ────────────────────────────────────────────────────────
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet: {
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: Spacing.lg, paddingBottom: 36,
        borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
        maxHeight: '88%',
    },
    modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
    modalTitle: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold', marginBottom: Spacing.md },
    modalInput: {
        borderWidth: 1.5, borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: 10,
        fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular',
        marginTop: 4,
    },
    typeToggleRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4, marginBottom: 2 },
    typeChip: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5,
    },
    typeChipText: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    catChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: Spacing.md, paddingVertical: 7,
        borderRadius: BorderRadius.full, borderWidth: 1,
    },
    catChipText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    modalActions: {
        flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md,
    },
    modalCancelBtn: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        paddingVertical: 13, borderRadius: BorderRadius.full, borderWidth: 1,
    },
    modalCancelText: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    modalSaveBtn: {
        flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 13, borderRadius: BorderRadius.full,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 3,
    },
    modalSaveText: { color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: FontSize.sm },
    paymentRow: { flexDirection: 'row', gap: Spacing.sm },
    paymentChip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full, borderWidth: 1,
    },
    paymentChipActive: { borderWidth: 1 },
    paymentChipText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    paymentChipTextActive: { fontFamily: 'Poppins_700Bold' },
    noAssetsHint: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginTop: Spacing.xs },
});
