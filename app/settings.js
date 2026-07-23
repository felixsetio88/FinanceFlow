import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, useWindowDimensions, Switch, Modal, TextInput } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { currencies } from '../utils/currencies';
import { exportToJSON, exportToExcel, importFromJSON, importFromExcel, applyImport } from '../services/dataExport';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import * as DocumentPicker from 'expo-document-picker';
import { LOCAL_MODELS, getAllModels, loadCustomModels, getCachedCustomModels, removeCustomModel } from '../services/localAIConfig';
import { addStatusListener, checkModelStatus, deleteModel, downloadModel, setActiveModelId, getModelState, setModelContextLength, getContextPresets } from '../services/localAI';
import { taskManager, TaskStatus } from '../services/backgroundTaskManager';
import { useTheme } from '../context/ThemeContext';
import { formatDate } from '../utils/helpers';

function DatePickerInput({ label, value, onChange, colors }) {
    const [show, setShow] = useState(false);
    const d = value ? new Date(value) : new Date();
    const [month, setMonth] = useState(d.getMonth());
    const [day, setDay] = useState(d.getDate());
    const [year, setYear] = useState(d.getFullYear());
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const open = () => {
        const cur = value ? new Date(value) : new Date();
        setMonth(cur.getMonth()); setDay(cur.getDate()); setYear(cur.getFullYear());
        setShow(true);
    };
    const confirm = () => {
        const daysInM = new Date(year, month + 1, 0).getDate();
        const safeDay = Math.min(day, daysInM);
        const y = year;
        const m = String(month + 1).padStart(2, '0');
        const dt = String(safeDay).padStart(2, '0');
        onChange(`${y}-${m}-${dt}`);
        setShow(false);
    };
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return (
        <>
            <TouchableOpacity onPress={open} style={[styles.dateField, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={value ? [styles.dateFieldText, { color: colors.textPrimary }] : [styles.dateFieldPlaceholder, { color: colors.textMuted }]}>
                    {value ? formatDate(value) : `Select ${label}`}
                </Text>
            </TouchableOpacity>
            <Modal visible={show} transparent animationType="fade">
                <View style={[styles.dpOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.dpBox, { backgroundColor: colors.modalBg }]}>
                        <Text style={[styles.dpTitle, { color: colors.textPrimary }]}>Select {label}</Text>
                        <View style={styles.dpRow}>
                            {[
                                { label: 'Month', value: monthNames[month], up: () => setMonth((month + 1) % 12), down: () => setMonth((month + 11) % 12) },
                                { label: 'Day', value: day, up: () => setDay(day >= daysInMonth ? 1 : day + 1), down: () => setDay(day <= 1 ? daysInMonth : day - 1) },
                                { label: 'Year', value: year, up: () => setYear(year + 1), down: () => setYear(year - 1) },
                            ].map((f, i) => (
                                <View key={i} style={styles.dpField}>
                                    <Text style={styles.dpFieldLabel}>{f.label}</Text>
                                    <TouchableOpacity onPress={f.up}><Ionicons name="chevron-up" size={22} color={colors.primary} /></TouchableOpacity>
                                    <Text style={[styles.dpFieldValue, { color: colors.textPrimary }]}>{String(f.value).padStart(2, '0')}</Text>
                                    <TouchableOpacity onPress={f.down}><Ionicons name="chevron-down" size={22} color={colors.primary} /></TouchableOpacity>
                                </View>
                            ))}
                        </View>
                        <View style={styles.dpBtnRow}>
                            <TouchableOpacity onPress={() => requestAnimationFrame(() => setShow(false))} style={[styles.dpCancel, { backgroundColor: colors.primaryLight }]}><Text style={styles.dpCancelText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={confirm} style={[styles.dpConfirm, { backgroundColor: colors.primary }]}><Text style={styles.dpConfirmText}>Confirm</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

export default function Settings() {
    const router = useRouter();
    const { currency, setCurrency, loadData } = useApp();
    const { colors, themeMode, setThemeMode, isDark } = useTheme();
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const [showExportModal, setShowExportModal] = useState(false);
    const [exportPeriod, setExportPeriod] = useState('all'); // 'daily', 'weekly', 'monthly', 'all', 'custom'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    const [modelState, setModelState] = useState(getModelState());
    const [savingCtx, setSavingCtx] = useState(false);
    const [thinkingEnabled, setThinkingEnabled] = useState(false);
    const [thinkingLoading, setThinkingLoading] = useState(true);
    const [hasActiveTask, setHasActiveTask] = useState(() => {
        const active = taskManager.getActiveTasks();
        return active.some(t => t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING);
    });

    const [customModels, setCustomModels] = useState([]);

    React.useEffect(() => {
        const unsubscribe = addStatusListener((state) => {
            setModelState(state);
            // Refresh custom models list whenever model state changes
            // (e.g. after a custom model is added from the search flow)
            loadCustomModels().then(m => setCustomModels(m));
        });
        checkModelStatus();
        loadCustomModels().then(m => setCustomModels(m));
        return unsubscribe;
    }, []);

    const THINK_PREF_KEY = '@financeflow_ai_thinking_prefs_v1';

    const loadThinkingPref = async (modelId) => {
        try {
            const raw = await AsyncStorage.getItem(THINK_PREF_KEY);
            const map = raw ? JSON.parse(raw) : {};
            return !!map[modelId];
        } catch { return false; }
    };

    const saveThinkingPref = async (modelId, value) => {
        try {
            const raw = await AsyncStorage.getItem(THINK_PREF_KEY);
            const map = raw ? JSON.parse(raw) : {};
            map[modelId] = !!value;
            await AsyncStorage.setItem(THINK_PREF_KEY, JSON.stringify(map));
        } catch { }
    };

    useEffect(() => {
        let mounted = true;
        (async () => {
            setThinkingLoading(true);
            try {
                const currentModelId = modelState?.activeModelId;
                if (currentModelId) {
                    const v = await loadThinkingPref(currentModelId);
                    if (mounted) setThinkingEnabled(v);
                }
            } catch { }
            if (mounted) setThinkingLoading(false);
        })();
        return () => { mounted = false; };
    }, [modelState.activeModelId]);

    useEffect(() => {
        const unsubscribe = taskManager.onTaskUpdate((_id, status) => {
            const active = taskManager.getActiveTasks();
            const running = active.some(t => t.status === TaskStatus.RUNNING || t.status === TaskStatus.PENDING);
            setHasActiveTask(running);
        });
        return unsubscribe;
    }, []);

    const handleSetContextLength = async (value) => {
        if (hasActiveTask) {
            Alert.alert('AI Task Running', 'Please wait for the current AI task to finish before changing context length.');
            return;
        }
        try {
            setSavingCtx(true);
            await setModelContextLength(modelState.activeModelId, value);
            await checkModelStatus();
        } catch (err) {
            Alert.alert('Context Length Error', err.message);
        } finally {
            setSavingCtx(false);
        }
    };

    const handleExportJSON = async () => {
        setExporting(true);
        try { await exportToJSON(); } catch (err) { Alert.alert('Error', err.message); }
        setExporting(false);
    };

    const handleExportExcel = async () => {
        if (exportPeriod === 'custom') {
            if (!customStartDate || !customEndDate) {
                Alert.alert('Error', 'Please select both start and end dates.');
                return;
            }
            const start = new Date(customStartDate);
            const end = new Date(customEndDate);
            const now = new Date();

            // Allow selecting up to today's date, but prevent dates in the future
            if (start > end) {
                Alert.alert('Error', 'Start date cannot be later than end date.');
                return;
            }

            // Only check date part for future validation
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            if (start > today || end > today) {
                Alert.alert('Error', 'Start and end dates cannot be in the future.');
                return;
            }
        }

        setExporting(true);
        setShowExportModal(false);
        try { await exportToExcel({ period: exportPeriod, start: customStartDate, end: customEndDate }, currency); } catch (err) { Alert.alert('Error', err.message); }
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
            const importData = type === 'json' ? await importFromJSON(file.uri) : await importFromExcel(file.uri);

            let summary = `Found:\n• ${importData.transactions?.length || 0} transactions\n• ${importData.budgets?.length || 0} budgets\n• ${importData.assets?.length || 0} assets`;
            if (importData.vehicles?.length > 0) summary += `\n• ${importData.vehicles.length} vehicles`;
            if (importData.savingsGoals?.length > 0) summary += `\n• ${importData.savingsGoals.length} savings goals`;
            if (importData.chatSessions?.length > 0) summary += `\n• ${importData.chatSessions.length} chat sessions`;
            if (type === 'json' && importData.settings) summary += `\n• Application appearance & configurations`;
            summary += `\n\nDo you want to import this data?`;

            Alert.alert('Import Preview', summary, [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Import',
                    onPress: async () => {
                        const counts = await applyImport(importData, type === 'json');
                        await loadData();
                        let doneMsg = `Imported ${counts.transactions} transactions, ${counts.budgets} budgets, ${counts.assets} assets.`;
                        if (counts.vehicles > 0) doneMsg += `\n${counts.vehicles} vehicles restored.`;
                        if (counts.savingsGoals > 0 || counts.chatSessions > 0)
                            doneMsg += `\nIncluded ${counts.savingsGoals || 0} savings goals and ${counts.chatSessions || 0} chat sessions.`;
                        if (type === 'json')
                            doneMsg += `\n\nSettings and appearance preferences have been successfully restored! Please restart the application for theme and model changes to take full effect.`;
                        Alert.alert('Done', doneMsg);
                    },
                },
            ]);
        } catch (err) {
            Alert.alert('Error', err.message);
        } finally {
            setImporting(false);
        }
    };

    const SectionHeader = ({ icon, color, title }) => (
        <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: `${color}15` }]}>
                <Ionicons name={icon} size={18} color={color} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
        </View>
    );

    const NavRow = ({ icon, iconBg, iconColor, label, sublabel, onPress }) => (
        <TouchableOpacity
            style={[styles.navRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
            onPress={onPress}
            activeOpacity={0.82}
        >
            <View style={[styles.navIconWrap, { backgroundColor: iconBg }]}>
                <Ionicons name={icon} size={19} color={iconColor} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.navLabel, { color: colors.textPrimary }]}>{label}</Text>
                {sublabel ? <Text style={[styles.navSublabel, { color: colors.textSecondary }]}>{sublabel}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bgGrad" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGrad)" />
            </Svg>

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Appearance */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <SectionHeader icon="color-palette" color={colors.primary} title="Appearance" />
                    <Text style={[styles.helperText, { color: colors.textMuted }]}>Choose how the app looks</Text>
                    <View style={styles.themeRow}>
                        {[
                            { key: 'light', icon: 'sunny-outline', label: 'Light' },
                            { key: 'dark', icon: 'moon-outline', label: 'Dark' },
                            { key: 'system', icon: 'phone-portrait-outline', label: 'System' },
                        ].map(opt => (
                            <TouchableOpacity
                                key={opt.key}
                                style={[
                                    styles.themeChip,
                                    { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(83,96,132,0.05)' },
                                    themeMode === opt.key && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                                ]}
                                onPress={() => setThemeMode(opt.key)}
                                activeOpacity={0.8}
                            >
                                <Ionicons name={opt.icon} size={20} color={themeMode === opt.key ? colors.primary : colors.textMuted} />
                                <Text style={[styles.themeChipText, { color: themeMode === opt.key ? colors.primary : colors.textMuted }, themeMode === opt.key && { fontFamily: 'Poppins_700Bold' }]}>{opt.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Finance Management */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <SectionHeader icon="grid" color={colors.primary} title="Finance Management" />
                    <View style={styles.manageGrid}>
                        {[
                            { icon: 'wallet-outline', color: colors.blue, label: 'Assets', desc: 'Manage accounts & balances', route: '/assets' },
                            { icon: 'pie-chart-outline', color: colors.emerald, label: 'Budget', desc: 'Set spending limits', route: '/budget' },
                        ].map((item) => (
                            <TouchableOpacity key={item.label} style={[styles.manageCard, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => router.push(item.route)} activeOpacity={0.82}>
                                <View style={[styles.manageIconWrap, { backgroundColor: `${item.color}12` }]}>
                                    <Ionicons name={item.icon} size={20} color={item.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.manageTitle, { color: colors.textPrimary }]}>{item.label}</Text>
                                    <Text style={[styles.manageDesc, { color: colors.textSecondary }]}>{item.desc}</Text>
                                </View>
                                <View style={[styles.chevronWrap, { backgroundColor: colors.inputBg }]}>
                                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Currency */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <SectionHeader icon="cash" color={colors.emerald} title="Currency" />
                    <View style={styles.currencyGrid}>
                        {currencies.map(c => (
                            <TouchableOpacity
                                key={c.code}
                                style={[styles.currencyOption, { backgroundColor: colors.inputBg, borderColor: colors.border }, currency === c.code && [styles.currencyActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]]}
                                onPress={() => setCurrency(c.code)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.currencyCode, { color: colors.textSecondary }, currency === c.code && [styles.currencyCodeActive, { color: colors.primary }]]}>{c.code}</Text>
                                <Text style={[styles.currencySymbol, { color: colors.textMuted }, currency === c.code && [styles.currencySymbolActive, { color: colors.primary }]]}>{c.symbol}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Local AI Models */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <SectionHeader icon="hardware-chip" color={colors.blue} title="Local AI Models" />
                    {hasActiveTask && (
                        <View style={[styles.taskBanner, { backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.05)', borderColor: isDark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.15)' }]}>
                            <ActivityIndicator size="small" color={colors.gold} />
                            <Text style={[styles.taskBannerText, { color: colors.gold }]}>AI task running — model changes are locked until it completes.</Text>
                        </View>
                    )}
                    <Text style={[styles.helperText, { color: colors.textMuted }]}>
                        Run AI features entirely on-device for total privacy. Recommended: GLM-OCR 0.9B, Qwen3 VL 2B IQ4_XS (lightest Qwen3 VL), LightOnOCR 1B, or Qwen2.5 VL 2B Q4 for vision receipt/PDF extraction, Moondream Vision as alternate VLM, and Qwen 3.5 0.8B Q4 for lightweight text workflows. Downloads continue when leaving this screen and auto-resume after app restarts. Not supported on web.
                    </Text>

                    {LOCAL_MODELS.map(model => {
                        const isActive = modelState.activeModelId === model.id;
                        const isDownloading = isActive && modelState.status === 'downloading';
                        const isReady = isActive && (modelState.status === 'downloaded' || modelState.status === 'ready');
                        return (
                            <View key={model.id} style={[styles.modelCard, { backgroundColor: colors.inputBg, borderColor: colors.border }, isActive && [styles.modelCardActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]]}>
                                <View style={styles.modelHeader}>
                                    <Text style={[styles.modelName, { color: colors.textPrimary }]}>{model.name}</Text>
                                    <View style={[styles.modelBadge, isActive && styles.modelBadgeActive]}>
                                        <Text style={[styles.modelBadgeText, { color: colors.textSecondary }, isActive && [styles.modelBadgeTextActive, { color: colors.primary }]]}>{model.sizeLabel}</Text>
                                    </View>
                                </View>
                                <Text style={[styles.modelDesc, { color: colors.textSecondary }]}>{model.description}</Text>

                                {isDownloading && (
                                    <View style={styles.progressBarBg}>
                                        <View style={[styles.progressBarFill, { width: `${modelState.downloadProgress}%` }]} />
                                        <Text style={[styles.progressText, { color: '#fff' }]}>{modelState.downloadProgress}%</Text>
                                    </View>
                                )}

                                <View style={styles.modelActions}>
                                    {isActive ? (
                                        <>
                                            {isReady ? (
                                                <TouchableOpacity
                                                    style={styles.deleteBtn}
                                                    onPress={() => {
                                                        Alert.alert('Delete Model', 'Remove this model from device?', [
                                                            { text: 'Cancel', style: 'cancel' },
                                                            { text: 'Delete', style: 'destructive', onPress: () => deleteModel(model.id) }
                                                        ]);
                                                    }}
                                                >
                                                    <Ionicons name="trash" size={14} color="#dc2626" />
                                                    <Text style={styles.deleteBtnText}>Delete</Text>
                                                </TouchableOpacity>
                                            ) : null}
                                            {modelState.status === 'idle' && (
                                                <TouchableOpacity style={styles.downloadBtn} onPress={() => downloadModel(model.id)}>
                                                    <Ionicons name="cloud-download" size={14} color="#fff" />
                                                    <Text style={styles.downloadBtnText}>Download</Text>
                                                </TouchableOpacity>
                                            )}
                                            {modelState.status === 'error' && (
                                                <TouchableOpacity style={styles.downloadBtn} onPress={() => downloadModel(model.id)}>
                                                    <Ionicons name="refresh" size={14} color="#fff" />
                                                    <Text style={styles.downloadBtnText}>Retry</Text>
                                                </TouchableOpacity>
                                            )}
                                            {modelState.status === 'downloading' && (
                                                <TouchableOpacity style={[styles.downloadBtn, { backgroundColor: 'rgba(83,96,132,0.1)' }]} disabled>
                                                    <ActivityIndicator size="small" color="#ff6600" />
                                                    <Text style={[styles.downloadBtnText, { color: '#ff6600' }]}>Downloading...</Text>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    ) : (
                                        <TouchableOpacity
                                            style={[styles.activateBtn, hasActiveTask && styles.activateBtnDisabled]}
                                            disabled={hasActiveTask}
                                            onPress={async () => {
                                                if (hasActiveTask) {
                                                    Alert.alert('AI Task Running', 'Please wait for the current AI task to finish before switching models.');
                                                    return;
                                                }
                                                await setActiveModelId(model.id);
                                            }}
                                        >
                                            <Text style={styles.activateBtnText}>Set Active</Text>
                                        </TouchableOpacity>
                                    )}
                                    {isReady && (
                                        <View style={styles.activeTag}>
                                            <Ionicons name="checkmark-circle" size={14} color="#059669" />
                                            <Text style={styles.activeTagText}>Ready</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}

                    {/* Custom models */}
                    {customModels.length > 0 && (
                        <View style={{ marginTop: Spacing.sm }}>
                            <Text style={[styles.helperText, { color: colors.textMuted, marginBottom: Spacing.sm }]}>Custom Models</Text>
                            {customModels.map(model => {
                                const isActive = modelState.activeModelId === model.id;
                                const isDownloading = isActive && modelState.status === 'downloading';
                                const isReady = isActive && (modelState.status === 'downloaded' || modelState.status === 'ready');
                                return (
                                    <View key={model.id} style={[styles.modelCard, { backgroundColor: colors.inputBg, borderColor: colors.border }, isActive && [styles.modelCardActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]]}>
                                        <View style={styles.modelHeader}>
                                            <Text style={[styles.modelName, { color: colors.textPrimary }]}>{model.name}</Text>
                                            <View style={[styles.modelBadge, { backgroundColor: 'rgba(255,102,0,0.12)' }]}>
                                                <Text style={[styles.modelBadgeText, { color: colors.primary }]}>Custom Model</Text>
                                            </View>
                                        </View>
                                        <Text style={[styles.modelDesc, { color: colors.textSecondary }]}>{model.description}</Text>
                                        {model.sizeLabel ? <Text style={[styles.modelDesc, { color: colors.textMuted, fontSize: FontSize.xs, marginTop: -6 }]}>{model.sizeLabel}</Text> : null}

                                        {isDownloading && (
                                            <View style={styles.progressBarBg}>
                                                <View style={[styles.progressBarFill, { width: `${modelState.downloadProgress}%` }]} />
                                                <Text style={[styles.progressText, { color: '#fff' }]}>{modelState.downloadProgress}%</Text>
                                            </View>
                                        )}

                                        <View style={styles.modelActions}>
                                            {isActive ? (
                                                <>
                                                    {isReady ? (
                                                        <TouchableOpacity
                                                            style={styles.deleteBtn}
                                                            onPress={() => {
                                                                Alert.alert('Delete Custom Model', 'Remove this model from device and list?', [
                                                                    { text: 'Cancel', style: 'cancel' },
                                                                    {
                                                                        text: 'Delete', style: 'destructive', onPress: async () => {
                                                                            await deleteModel(model.id);
                                                                            await removeCustomModel(model.id);
                                                                            setCustomModels(getCachedCustomModels());
                                                                        }
                                                                    }
                                                                ]);
                                                            }}
                                                        >
                                                            <Ionicons name="trash" size={14} color="#dc2626" />
                                                            <Text style={styles.deleteBtnText}>Delete</Text>
                                                        </TouchableOpacity>
                                                    ) : null}
                                                    {modelState.status === 'idle' && (
                                                        <TouchableOpacity style={styles.downloadBtn} onPress={() => downloadModel(model.id)}>
                                                            <Ionicons name="cloud-download" size={14} color="#fff" />
                                                            <Text style={styles.downloadBtnText}>Download</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    {modelState.status === 'error' && (
                                                        <TouchableOpacity style={styles.downloadBtn} onPress={() => downloadModel(model.id)}>
                                                            <Ionicons name="refresh" size={14} color="#fff" />
                                                            <Text style={styles.downloadBtnText}>Retry</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    {modelState.status === 'downloading' && (
                                                        <TouchableOpacity style={[styles.downloadBtn, { backgroundColor: 'rgba(83,96,132,0.1)' }]} disabled>
                                                            <ActivityIndicator size="small" color="#ff6600" />
                                                            <Text style={[styles.downloadBtnText, { color: '#ff6600' }]}>Downloading...</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <TouchableOpacity
                                                        style={[styles.activateBtn, hasActiveTask && styles.activateBtnDisabled]}
                                                        disabled={hasActiveTask}
                                                        onPress={async () => {
                                                            if (hasActiveTask) {
                                                                Alert.alert('AI Task Running', 'Please wait for the current AI task to finish before switching models.');
                                                                return;
                                                            }
                                                            await setActiveModelId(model.id);
                                                        }}
                                                    >
                                                        <Text style={styles.activateBtnText}>Set Active</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[styles.deleteBtn, { marginLeft: 'auto' }]}
                                                        onPress={() => {
                                                            Alert.alert('Remove Custom Model', 'Remove this model from list?', [
                                                                { text: 'Cancel', style: 'cancel' },
                                                                {
                                                                    text: 'Remove', style: 'destructive', onPress: async () => {
                                                                        await deleteModel(model.id);
                                                                        await removeCustomModel(model.id);
                                                                        setCustomModels(getCachedCustomModels());
                                                                    }
                                                                }
                                                            ]);
                                                        }}
                                                    >
                                                        <Ionicons name="trash" size={14} color="#dc2626" />
                                                        <Text style={styles.deleteBtnText}>Remove</Text>
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                            {isReady && (
                                                <View style={styles.activeTag}>
                                                    <Ionicons name="checkmark-circle" size={14} color="#059669" />
                                                    <Text style={styles.activeTagText}>Ready</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}

                    {/* Add Custom Model button */}
                    <NavRow
                        icon="add-circle-outline"
                        iconBg={isDark ? 'rgba(255,102,0,0.18)' : 'rgba(255,102,0,0.10)'}
                        iconColor={colors.primary}
                        label="Add Custom AI Model"
                        sublabel="Search & download GGUF models from Hugging Face"
                        onPress={() => {
                            loadCustomModels().then(m => setCustomModels(m));
                            router.push('/custom-model-search');
                        }}
                    />

                    <View style={styles.contextBox}>
                        <Text style={[styles.contextTitle, { color: colors.textPrimary }]}>Context Length</Text>
                        <Text style={[styles.contextHint, { color: colors.textMuted }]}>
                            Adjust how much text the model can process. Lower values reduce RAM usage.
                        </Text>
                        <View style={styles.contextRow}>
                            {getContextPresets(getModelState()).map(preset => {
                                const isActivePreset = Math.abs(modelState.contextLength - preset.value) < 1;
                                return (
                                    <TouchableOpacity
                                        key={preset.label}
                                        style={[styles.contextChip, { backgroundColor: colors.inputBg, borderColor: colors.border }, isActivePreset && [styles.contextChipActive, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]]}
                                        disabled={savingCtx}
                                        onPress={() => handleSetContextLength(preset.value)}
                                    >
                                        <Text style={[styles.contextChipText, { color: colors.textSecondary }, isActivePreset && [styles.contextChipTextActive, { color: colors.primary }]]}>{preset.label}</Text>
                                        <Text style={[styles.contextChipLabel, { color: colors.textMuted }, isActivePreset && [styles.contextChipLabelActive, { color: colors.primary }]]}>{preset.value}t</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={[styles.contextValueText, { color: colors.textSecondary }]}>Current: {modelState.contextLength} tokens</Text>
                        {savingCtx && <ActivityIndicator style={{ marginTop: 8 }} color="#ff6600" />}

                        {(() => {
                            const activeModel = getAllModels().find(m => m.id === modelState.activeModelId) || LOCAL_MODELS[0];
                            if (!activeModel?.canThink) return null;
                            return (
                                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.contextTitle, { color: colors.textPrimary, fontSize: FontSize.sm }]}>Enable AI Thinking</Text>
                                        <Text style={[styles.contextHint, { color: colors.textMuted, marginTop: 4 }]}>When enabled, the model may perform internal reasoning before responding (can be slower).</Text>
                                    </View>
                                    <Switch
                                        value={thinkingEnabled}
                                        onValueChange={async (v) => {
                                            setThinkingEnabled(v);
                                            setThinkingLoading(true);
                                            try {
                                                await saveThinkingPref(modelState.activeModelId, v);
                                                // Release model so initLlama is called again with/without reasoning_budget
                                                const { releaseModel } = require('../services/localAI');
                                                await releaseModel();
                                            } catch { }
                                            setThinkingLoading(false);
                                        }}
                                        disabled={thinkingLoading}
                                    />
                                </View>
                            );
                        })()}
                    </View>
                </View>

                {/* Export */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <SectionHeader icon="download" color={colors.gold} title="Export Data" />
                    <View style={styles.btnRow}>
                        <TouchableOpacity style={[styles.exportBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={handleExportJSON} disabled={exporting} activeOpacity={0.82}>
                            <Ionicons name="code-slash" size={18} color={colors.blue} />
                            <Text style={[styles.exportBtnText, { color: colors.textPrimary }]}>JSON</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.exportBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => setShowExportModal(true)} disabled={exporting} activeOpacity={0.82}>
                            <Ionicons name="grid" size={18} color={colors.emerald} />
                            <Text style={[styles.exportBtnText, { color: colors.textPrimary }]}>Excel</Text>
                        </TouchableOpacity>
                    </View>
                    {exporting && <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />}
                </View>

                {/* Import */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <SectionHeader icon="cloud-upload" color={colors.blue} title="Import Data" />
                    <View style={styles.btnRow}>
                        <TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => handleImport('json')} disabled={importing} activeOpacity={0.82}>
                            <Ionicons name="code-slash" size={18} color={colors.gold} />
                            <Text style={[styles.importBtnText, { color: colors.textPrimary }]}>JSON</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => handleImport('excel')} disabled={importing} activeOpacity={0.82}>
                            <Ionicons name="grid" size={18} color={colors.gold} />
                            <Text style={[styles.importBtnText, { color: colors.textPrimary }]}>Excel</Text>
                        </TouchableOpacity>
                    </View>

                    {/* PDF Bank Statement — navigates to dedicated page */}
                    <NavRow
                        icon="document-text-outline"
                        iconBg={isDark ? 'rgba(30,201,142,0.18)' : 'rgba(30,201,142,0.12)'}
                        iconColor={colors.emerald}
                        label="PDF Bank Statement Import"
                        sublabel="Local AI reads your statement — fully offline"
                        onPress={() => router.push('/pdf-statement-import')}
                    />

                    {/* Financial Health */}
                    <NavRow
                        icon="heart-outline"
                        iconBg={isDark ? 'rgba(255,102,0,0.18)' : 'rgba(255,102,0,0.10)'}
                        iconColor={colors.primary}
                        label="Financial Health"
                        onPress={() => router.push('/financial-health')}
                    />

                    {importing && <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />}
                </View>

                {/* About */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <SectionHeader icon="information-circle" color={colors.primary} title="About" />
                    <View style={styles.aboutRow}>
                        <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>App</Text>
                        <Text style={[styles.aboutValue, { color: colors.textPrimary }]}>FinanceFlow Preview v1.0</Text>
                    </View>
                    <View style={styles.aboutRow}>
                        <Text style={[styles.aboutLabel, { color: colors.textSecondary }]}>Copyright © 2026</Text>
                        <Text style={[styles.aboutValue, { color: colors.textPrimary }]}>By Felix</Text>
                    </View>
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>

            {/* Export Modal */}
            <Modal visible={showExportModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                        <View style={styles.modalHeader}>
                            <View style={[styles.sectionIconWrap, { backgroundColor: `${colors.gold}15` }]}>
                                <Ionicons name="download" size={20} color={colors.gold} />
                            </View>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Export Options</Text>
                            <TouchableOpacity onPress={() => requestAnimationFrame(() => setShowExportModal(false))} style={[styles.modalClose, { backgroundColor: colors.inputBg }]}>
                                <Ionicons name="close" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Select Period</Text>
                        <View style={styles.periodTabsWrap}>
                            <View style={[styles.periodTabs, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                                {['daily', 'weekly', 'monthly', 'all', 'custom'].map(p => (
                                    <TouchableOpacity
                                        key={p}
                                        style={[
                                            styles.periodTab,
                                            exportPeriod === p && [styles.periodTabActive, { backgroundColor: colors.primary, shadowColor: colors.primary }]
                                        ]}
                                        onPress={() => setExportPeriod(p)}
                                    >
                                        <Text style={[
                                            styles.periodText,
                                            { color: colors.textMuted },
                                            exportPeriod === p && styles.periodTextActive
                                        ]}>
                                            {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {exportPeriod === 'custom' && (
                            <View style={{ marginTop: Spacing.sm, flexDirection: 'row', gap: Spacing.sm }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Start Date</Text>
                                    <DatePickerInput label="Start Date" value={customStartDate} onChange={setCustomStartDate} colors={colors} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>End Date</Text>
                                    <DatePickerInput label="End Date" value={customEndDate} onChange={setCustomEndDate} colors={colors} />
                                </View>
                            </View>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.border }]} onPress={() => requestAnimationFrame(() => setShowExportModal(false))}>
                                <Text style={[styles.saveTxt, { color: colors.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: exporting ? 0.7 : 1 }]}
                                onPress={handleExportExcel}
                                disabled={exporting}
                            >
                                <Ionicons name="grid" size={16} color="#fff" />
                                <Text style={[styles.saveTxt, { color: '#fff' }]}>{exporting ? 'Wait...' : 'Export'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: FontSize.xl, fontFamily: 'Poppins_800ExtraBold' },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
    section: {
        borderRadius: 22, padding: Spacing.lg, borderWidth: 1,
        marginBottom: Spacing.md,
        shadowColor: '#1A1040', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    sectionIconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    sectionTitle: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    helperText: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginBottom: Spacing.md, lineHeight: 18 },
    themeRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    themeChip: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5, gap: 6 },
    themeChipText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    manageGrid: { gap: Spacing.sm },
    manageCard: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md, borderWidth: 1,
    },
    manageIconWrap: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    manageTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    manageDesc: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    chevronWrap: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    currencyOption: {
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
        borderWidth: 1, alignItems: 'center', minWidth: 60,
    },
    currencyActive: { borderColor: '#ff6600' },
    currencyCode: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    currencyCodeActive: { color: '#ff6600' },
    currencySymbol: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    currencySymbolActive: { color: '#ff6600' },
    taskBanner: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1,
    },
    taskBannerText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', lineHeight: 18 },
    modelCard: {
        borderRadius: BorderRadius.md, padding: Spacing.md,
        marginBottom: Spacing.md, borderWidth: 1,
    },
    modelCardActive: { borderColor: '#ff6600' },
    modelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    modelName: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold', flex: 1 },
    modelBadge: { backgroundColor: 'rgba(83,96,132,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    modelBadgeActive: { backgroundColor: 'rgba(255,102,0,0.12)' },
    modelBadgeText: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
    modelBadgeTextActive: { color: '#ff6600' },
    modelDesc: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginBottom: Spacing.md, lineHeight: 18 },
    modelActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    activateBtn: {
        backgroundColor: 'rgba(255,102,0,0.08)', paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm, borderRadius: BorderRadius.full,
        borderWidth: 1, borderColor: 'rgba(255,102,0,0.15)',
    },
    activateBtnDisabled: { opacity: 0.4 },
    activateBtnText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#ff6600' },
    downloadBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#ff6600', paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm, borderRadius: BorderRadius.full,
    },
    downloadBtnText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
    deleteBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(220,38,38,0.08)', paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm, borderRadius: BorderRadius.full,
        borderWidth: 1, borderColor: 'rgba(220,38,38,0.15)',
    },
    deleteBtnText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#dc2626' },
    activeTag: {
        flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
        backgroundColor: 'rgba(5,150,105,0.1)', paddingHorizontal: Spacing.sm,
        paddingVertical: 4, borderRadius: BorderRadius.full,
    },
    activeTagText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#059669' },
    progressBarBg: {
        height: 14, borderRadius: 7, overflow: 'hidden',
        marginBottom: Spacing.md, position: 'relative', justifyContent: 'center',
        backgroundColor: 'rgba(83,96,132,0.08)',
    },
    progressBarFill: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: '#ff6600', borderRadius: 7 },
    progressText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: '#fff', textAlign: 'center' },
    contextBox: { marginTop: Spacing.sm, paddingTop: Spacing.md, borderTopWidth: 1, borderColor: 'rgba(83,96,132,0.1)' },
    contextTitle: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    contextHint: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 3, marginBottom: Spacing.sm, lineHeight: 16 },
    contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    contextChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.md, borderWidth: 1, alignItems: 'center' },
    contextChipActive: { borderColor: '#ff6600' },
    contextChipText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    contextChipTextActive: { color: '#ff6600', fontFamily: 'Poppins_700Bold' },
    contextChipLabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    contextChipLabelActive: { color: '#ff6600', fontFamily: 'Poppins_500Medium' },
    contextValueText: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: Spacing.sm },
    btnRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
    exportBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
    },
    exportBtnText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    importBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1,
    },
    importBtnText: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    navRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        paddingHorizontal: Spacing.md, paddingVertical: 12,
        borderRadius: BorderRadius.md, borderWidth: 1, marginTop: Spacing.sm,
    },
    navIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    navLabel: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    navSublabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    aboutRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(83,96,132,0.08)',
    },
    aboutLabel: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular' },
    aboutValue: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
    modalBox: { width: '100%', borderRadius: 24, padding: Spacing.lg },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
    modalTitle: { flex: 1, fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    modalClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    inputLabel: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', marginBottom: 6 },
    typeToggle: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: BorderRadius.md, borderWidth: 1, padding: 4, gap: 4 },
    typeBtn: { flex: 1, minWidth: '30%', paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.sm },
    typeTxt: { fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
    textInput: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular' },
    modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl },
    saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: BorderRadius.full },
    saveTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },

    // Period Tabs
    periodTabsWrap: {
        marginBottom: Spacing.sm,
    },
    periodTabs: {
        flexDirection: 'row',
        borderRadius: BorderRadius.full,
        padding: 4,
        borderWidth: 1,
    },
    periodTab: {
        flex: 1,
        paddingVertical: 6,
        alignItems: 'center',
        borderRadius: BorderRadius.full,
    },
    periodTabActive: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 4,
    },
    periodText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
    },
    periodTextActive: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
    },

    // DatePicker
    dateField: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: 'rgba(83,96,132,0.06)',
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.1)',
    },
    dateFieldText: {
        fontFamily: 'Poppins_500Medium',
        color: '#1A1040',
        fontSize: FontSize.sm,
    },
    dateFieldPlaceholder: {
        fontFamily: 'Poppins_400Regular',
        color: '#B0A8C8',
        fontSize: FontSize.sm,
    },
    dpOverlay: { flex: 1, backgroundColor: 'rgba(21,26,45,0.4)', justifyContent: 'center', alignItems: 'center' },
    dpBox: {
        backgroundColor: '#FDFDFF',
        borderRadius: 24,
        padding: Spacing.xl,
        width: '85%',
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: Platform.OS === 'android' ? 0 : 12,
    },
    dpTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        textAlign: 'center',
        marginBottom: Spacing.lg,
    },
    dpRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.lg },
    dpField: { alignItems: 'center', gap: 6 },
    dpFieldLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
        color: '#9CA3B8',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    dpFieldValue: {
        fontSize: FontSize.xl,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        minWidth: 44,
        textAlign: 'center',
    },
    dpBtnRow: { flexDirection: 'row', gap: Spacing.md },
    dpCancel: {
        flex: 1,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255,102,0,0.08)',
        alignItems: 'center',
    },
    dpCancelText: {
        fontFamily: 'Poppins_600SemiBold',
        color: '#ff6600',
        fontSize: FontSize.md,
    },
    dpConfirm: {
        flex: 2,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: '#ff6600',
        alignItems: 'center',
    },
    dpConfirmText: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.md,
    }
});