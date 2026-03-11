import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { currencies } from '../utils/currencies';
import { exportToJSON, exportToExcel, importFromJSON, importFromExcel, applyImport } from '../services/dataExport';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import * as DocumentPicker from 'expo-document-picker';
import { LOCAL_MODELS } from '../services/localAIConfig';
import { addStatusListener, checkModelStatus, deleteModel, downloadModel, setActiveModelId, getModelState } from '../services/localAI';

export default function Settings() {
    const router = useRouter();
    const { currency, setCurrency, aiApiKey, aiEndpoint, setAiConfig, loadData } = useApp();
    const [apiKey, setApiKey] = useState(aiApiKey || '');
    const [endpoint, setEndpoint] = useState(aiEndpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    
    // Local AI status
    const [modelState, setModelState] = useState(getModelState());

    React.useEffect(() => {
        const unsubscribe = addStatusListener(setModelState);
        checkModelStatus();
        return unsubscribe;
    }, []);

    const handleSaveAI = async () => {
        await setAiConfig(apiKey, endpoint);
        Alert.alert('Saved', 'AI configuration saved successfully.');
    };

    const handleExportJSON = async () => {
        setExporting(true);
        try {
            await exportToJSON();
        } catch (err) {
            Alert.alert('Error', err.message);
        }
        setExporting(false);
    };

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            await exportToExcel();
        } catch (err) {
            Alert.alert('Error', err.message);
        }
        setExporting(false);
    };

    const handleImport = async (type) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: type === 'json'
                    ? 'application/json'
                    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });

            if (result.canceled) return;
            setImporting(true);

            const file = result.assets[0];
            const importData = type === 'json'
                ? await importFromJSON(file.uri)
                : await importFromExcel(file.uri);

            const summary = `Found:\n• ${importData.transactions.length} transactions\n• ${importData.budgets.length} budgets\n• ${importData.assets.length} assets\n\nDo you want to import this data?`;

            Alert.alert('Import Preview', summary, [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Import',
                    onPress: async () => {
                        const counts = await applyImport(importData);
                        await loadData();
                        Alert.alert('Done', `Imported ${counts.transactions} transactions, ${counts.budgets} budgets, ${counts.assets} assets.`);
                    },
                },
            ]);
        } catch (err) {
            Alert.alert('Error', err.message);
        } finally {
            setImporting(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.handle} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.title}>Settings</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Currency */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="cash" size={20} color={Colors.dark.emerald} />
                        <Text style={styles.sectionTitle}>Currency</Text>
                    </View>
                    <View style={styles.currencyGrid}>
                        {currencies.map(c => (
                            <TouchableOpacity
                                key={c.code}
                                style={[styles.currencyOption, currency === c.code && styles.currencyActive]}
                                onPress={() => setCurrency(c.code)}
                            >
                                <Text style={[styles.currencyCode, currency === c.code && styles.currencyCodeActive]}>{c.code}</Text>
                                <Text style={[styles.currencySymbol, currency === c.code && styles.currencyCodeActive]}>{c.symbol}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* AI Configuration */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="sparkles" size={20} color={Colors.dark.purple} />
                        <Text style={styles.sectionTitle}>AI Configuration</Text>
                    </View>
                    <Text style={styles.helperText}>
                        Set your Alibaba DashScope API key for AI features (receipt scanning, chatbot, PDF parsing).
                    </Text>
                    <Text style={styles.inputLabel}>API Key</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="sk-..."
                        placeholderTextColor={Colors.dark.textMuted}
                        value={apiKey}
                        onChangeText={setApiKey}
                        secureTextEntry
                    />
                    <Text style={styles.inputLabel}>API Endpoint</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="https://..."
                        placeholderTextColor={Colors.dark.textMuted}
                        value={endpoint}
                        onChangeText={setEndpoint}
                    />
                    <TouchableOpacity style={styles.saveAiBtn} onPress={handleSaveAI}>
                        <Text style={styles.saveAiBtnText}>Save AI Config</Text>
                    </TouchableOpacity>
                </View>

                {/* Local AI Models */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="hardware-chip" size={20} color={Colors.dark.blue} />
                        <Text style={styles.sectionTitle}>Local AI Models</Text>
                    </View>
                    <Text style={styles.helperText}>
                        Run AI features entirely on-device for total privacy. Requires downloading models. (Not supported on web).
                    </Text>

                    {LOCAL_MODELS.map(model => {
                        const isActive = modelState.activeModelId === model.id;
                        const isDownloading = isActive && modelState.status === 'downloading';
                        return (
                            <View key={model.id} style={[styles.modelCard, isActive && styles.modelCardActive]}>
                                <View style={styles.modelHeader}>
                                    <Text style={styles.modelName}>{model.name}</Text>
                                    <View style={styles.modelBadge}>
                                        <Text style={styles.modelBadgeText}>{model.sizeLabel}</Text>
                                    </View>
                                </View>
                                <Text style={styles.modelDesc}>{model.description}</Text>
                                
                                {isDownloading && (
                                    <View style={styles.progressBarBg}>
                                        <View style={[styles.progressBarFill, { width: `${modelState.downloadProgress}%` }]} />
                                        <Text style={styles.progressText}>{modelState.downloadProgress}%</Text>
                                    </View>
                                )}

                                <View style={styles.modelActions}>
                                    {isActive ? (
                                        <>
                                            {modelState.status === 'downloaded' || modelState.status === 'ready' || modelState.status === 'idle' ? (
                                                <TouchableOpacity 
                                                    style={styles.deleteBtn} 
                                                    onPress={() => {
                                                        Alert.alert('Delete Model', 'Remove this model from device?', [
                                                            {text: 'Cancel', style: 'cancel'},
                                                            {text: 'Delete', style: 'destructive', onPress: () => deleteModel(model.id)}
                                                        ]);
                                                    }}>
                                                    <Ionicons name="trash" size={16} color={Colors.dark.red} />
                                                    <Text style={styles.deleteBtnText}>Delete</Text>
                                                </TouchableOpacity>
                                            ) : null}
                                            
                                            {modelState.status === 'idle' && (
                                                <TouchableOpacity style={styles.downloadBtn} onPress={() => downloadModel(model.id)}>
                                                    <Ionicons name="cloud-download" size={16} color="#fff" />
                                                    <Text style={styles.downloadBtnText}>Download</Text>
                                                </TouchableOpacity>
                                            )}
                                            {modelState.status === 'downloading' && (
                                                <TouchableOpacity style={[styles.downloadBtn, {backgroundColor: Colors.dark.card}]} disabled>
                                                    <ActivityIndicator size="small" color={Colors.dark.emerald} />
                                                    <Text style={styles.downloadBtnText}>Downloading...</Text>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    ) : (
                                        <TouchableOpacity style={styles.activateBtn} onPress={() => setActiveModelId(model.id)}>
                                            <Text style={styles.activateBtnText}>Set Active</Text>
                                        </TouchableOpacity>
                                    )}
                                    {isActive && (modelState.status === 'downloaded' || modelState.status === 'ready') && (
                                        <View style={styles.activeTag}>
                                            <Ionicons name="checkmark-circle" size={16} color={Colors.dark.emerald} />
                                            <Text style={styles.activeTagText}>Ready to use</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* Export */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="download" size={20} color={Colors.dark.gold} />
                        <Text style={styles.sectionTitle}>Export Data</Text>
                    </View>
                    <View style={styles.btnRow}>
                        <TouchableOpacity style={styles.exportBtn} onPress={handleExportJSON} disabled={exporting}>
                            <Ionicons name="code-slash" size={18} color={Colors.dark.blue} />
                            <Text style={styles.exportBtnText}>Export JSON</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.exportBtn} onPress={handleExportExcel} disabled={exporting}>
                            <Ionicons name="grid" size={18} color={Colors.dark.emerald} />
                            <Text style={styles.exportBtnText}>Export Excel</Text>
                        </TouchableOpacity>
                    </View>
                    {exporting && <ActivityIndicator style={{ marginTop: 8 }} color={Colors.dark.emerald} />}
                </View>

                {/* Import */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="push" size={20} color={Colors.dark.blue} />
                        <Text style={styles.sectionTitle}>Import Data</Text>
                    </View>
                    <View style={styles.btnRow}>
                        <TouchableOpacity style={styles.importBtn} onPress={() => handleImport('json')} disabled={importing}>
                            <Ionicons name="code-slash" size={18} color={Colors.dark.gold} />
                            <Text style={styles.importBtnText}>Import JSON</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.importBtn} onPress={() => handleImport('excel')} disabled={importing}>
                            <Ionicons name="grid" size={18} color={Colors.dark.gold} />
                            <Text style={styles.importBtnText}>Import Excel</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.pdfBtn} onPress={() => router.push('/pdf-import')}>
                        <Ionicons name="document-text" size={18} color={Colors.dark.purple} />
                        <Text style={styles.pdfBtnText}>Import Bank PDF Statement</Text>
                    </TouchableOpacity>
                    {importing && <ActivityIndicator style={{ marginTop: 8 }} color={Colors.dark.blue} />}
                </View>

                {/* About */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="information-circle" size={20} color={Colors.dark.textMuted} />
                        <Text style={styles.sectionTitle}>About</Text>
                    </View>
                    <Text style={styles.aboutText}>FinanceFlow v2.0</Text>
                    <Text style={styles.aboutText}>AI-powered personal finance manager</Text>
                    <Text style={styles.aboutText}>Built with Expo React Native + Qwen AI</Text>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.background },
    handle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border,
        alignSelf: 'center', marginTop: Spacing.md,
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        borderBottomWidth: 1, borderColor: Colors.dark.border,
    },
    title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.dark.text },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
    section: {
        marginBottom: Spacing.xl, padding: Spacing.lg, borderRadius: BorderRadius.lg,
        backgroundColor: Colors.dark.card, borderWidth: 1, borderColor: Colors.dark.border,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.dark.text },
    helperText: { fontSize: FontSize.sm, color: Colors.dark.textMuted, marginBottom: Spacing.md, lineHeight: 18 },
    currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    currencyOption: {
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.inputBg, borderWidth: 1, borderColor: Colors.dark.inputBorder,
        alignItems: 'center', minWidth: 60,
    },
    currencyActive: { borderColor: Colors.dark.emerald, backgroundColor: Colors.dark.emeraldLight },
    currencyCode: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.dark.textSecondary },
    currencyCodeActive: { color: Colors.dark.emerald },
    currencySymbol: { fontSize: FontSize.xs, color: Colors.dark.textMuted, marginTop: 2 },
    inputLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.md },
    input: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        color: Colors.dark.text, fontSize: FontSize.md,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    saveAiBtn: {
        backgroundColor: Colors.dark.purple, paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md, alignItems: 'center', marginTop: Spacing.lg,
    },
    saveAiBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.md },
    modelCard: {
        backgroundColor: Colors.dark.inputBg, borderRadius: BorderRadius.md,
        padding: Spacing.md, marginBottom: Spacing.md,
        borderWidth: 1, borderColor: Colors.dark.inputBorder,
    },
    modelCardActive: { borderColor: Colors.dark.blue, backgroundColor: 'rgba(59,130,246,0.05)' },
    modelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    modelName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.dark.text },
    modelBadge: { backgroundColor: Colors.dark.card, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    modelBadgeText: { fontSize: 10, color: Colors.dark.textMuted },
    modelDesc: { fontSize: FontSize.sm, color: Colors.dark.textSecondary, marginBottom: Spacing.md },
    modelActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    activateBtn: { backgroundColor: Colors.dark.card, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dark.border },
    activateBtnText: { fontSize: FontSize.sm, color: Colors.dark.textSecondary },
    downloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.dark.emerald, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
    downloadBtnText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '600' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(239,68,68,0.1)', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
    deleteBtnText: { fontSize: FontSize.sm, color: Colors.dark.red },
    activeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    activeTagText: { fontSize: FontSize.sm, color: Colors.dark.emerald, fontWeight: '600' },
    progressBarBg: { height: 16, backgroundColor: Colors.dark.card, borderRadius: 8, overflow: 'hidden', marginBottom: Spacing.md, position: 'relative', justifyContent: 'center' },
    progressBarFill: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: Colors.dark.emerald },
    progressText: { fontSize: 10, color: '#fff', textAlign: 'center', fontWeight: 'bold' },
    btnRow: { flexDirection: 'row', gap: Spacing.sm },
    exportBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.inputBg, borderWidth: 1, borderColor: Colors.dark.border,
    },
    exportBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.text },
    importBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.inputBg, borderWidth: 1, borderColor: Colors.dark.border,
    },
    importBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.text },
    pdfBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.purpleLight, marginTop: Spacing.sm,
        borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)',
    },
    pdfBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.dark.purple },
    aboutText: { fontSize: FontSize.sm, color: Colors.dark.textMuted, marginBottom: 4 },
});
