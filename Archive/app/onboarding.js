import React, { useState } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, KeyboardAvoidingView
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../context/AppContext';
import { generateId } from '../utils/helpers';
import { accountTypes, getAccountTypeById } from '../utils/categories';
import { formatCurrency, currencies, getTopCurrencies } from '../utils/currencies';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { importFromJSON, applyImport } from '../services/dataExport';
import FastInput from '../components/FastInput';

// Accent colours (not theme-dependent — onboarding is always light-ish)
const P = '#ff6600';
const E = '#1EC98E';
const CARD = 'rgba(255,255,255,0.90)';
const BG_TOP = '#F7F7F8';
const BG_BOT = '#ECEEF1';
const TEXT = '#151A2D';
const TEXT2 = '#4E566E';
const MUTED = '#8E95AB';
const BORDER = 'rgba(83,96,132,0.14)';

const FEATURES = [
    { icon: 'wallet-outline', color: '#ff6600', title: 'Track Everything', desc: 'Monitor assets, cash, bank accounts, and balances in one central place.' },
    { icon: 'calculator-outline', color: '#1EC98E', title: 'Smart Budgeting', desc: 'Set custom spending limits and keep your budgets perfectly in check.' },
    { icon: 'trending-up-outline', color: '#F59E0B', title: 'Saving Goals', desc: 'Define your saving targets and follow your contribution history visually.' },
    { icon: 'sparkles-outline', color: '#EF4444', title: 'Private Local AI', desc: 'Get intelligent offline financial insights powered by fully secure on-device AI.' },
];

const CARD_COLORS = [
    '#ff6600', '#3B82F6', '#1E293B', '#0F4C75',
    '#059669', '#D97706', '#DC2626', '#DB2777',
    '#7C3AED', '#0891B2', '#9D174D', '#1E3A5F',
];
const DEFAULT_COLORS = ['#ff6600', '#1E3A8A', '#1E293B', '#0F4C75', '#7C3AED', '#9D174D'];
function getCardColor(asset, index) {
    return asset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export default function Onboarding() {
    const router = useRouter();
    const { addAsset, addBudget, addSavingGoal, setOnboardingCompleted, currency, setCurrency, loadData } = useApp();

    const [step, setStep] = useState(0);
    const [choice, setChoice] = useState(null); // 'new' or 'backup'
    const [selectedCurrency, setSelectedCurrency] = useState(currency || 'USD');
    const [importing, setImporting] = useState(false);
    const [assets, setAssets] = useState([]);
    const [assetName, setAssetName] = useState('');
    const [assetType, setAssetType] = useState('bank');
    const [assetBalance, setAssetBalance] = useState('');
    const [assetColor, setAssetColor] = useState('#ff6600');
    const [assetCurrency, setAssetCurrency] = useState(currency || 'USD');
    const [showAssetForm, setShowAssetForm] = useState(false);
    const [showAllCurrencies, setShowAllCurrencies] = useState(false);
    const [budgetPeriod, setBudgetPeriod] = useState('monthly');
    const [budgetAmount, setBudgetAmount] = useState('');
    const [goals, setGoals] = useState([]);
    const [showGoalForm, setShowGoalForm] = useState(false);
    const [goalTitle, setGoalTitle] = useState('');
    const [goalAmount, setGoalAmount] = useState('');
    const [goalStart, setGoalStart] = useState('');
    const [goalEnd, setGoalEnd] = useState('');
    const [goalCommitment, setGoalCommitment] = useState('');
    const [goalNotify, setGoalNotify] = useState(false);

    const addLocalGoal = () => {
        if (!goalTitle.trim() || parseFloat(goalAmount) <= 0) {
            Alert.alert('Error', 'Please enter a valid goal title and target amount.');
            return;
        }
        if (goalStart && goalEnd && new Date(goalStart) > new Date(goalEnd)) {
            Alert.alert('Error', 'Start date cannot be later than end date.'); return;
        }
        if (goalNotify && !goalCommitment) { Alert.alert('Error', 'Please choose a reminder frequency.'); return; }

        setGoals([...goals, {
            id: generateId(), title: goalTitle.trim(), targetAmount: parseFloat(goalAmount),
            currentAmount: 0, startDate: goalStart || null, endDate: goalEnd || null,
            commitment: goalCommitment || null, notifyEnabled: goalNotify, savingHistory: [], isCompleted: false,
        }]);
        setGoalTitle(''); setGoalAmount(''); setGoalStart(''); setGoalEnd(''); setGoalCommitment(''); setGoalNotify(false); setShowGoalForm(false);
    };

    const removeLocalGoal = (id) => setGoals(goals.filter(g => g.id !== id));

    const addLocalAsset = () => {
        if (!assetName.trim()) { Alert.alert('Error', 'Enter account name'); return; }
        const bal = parseFloat(assetBalance) || 0;
        setAssets([...assets, { id: generateId(), name: assetName.trim(), type: assetType, balance: bal, color: assetColor, currency: assetCurrency }]);
        setAssetName(''); setAssetBalance(''); setAssetType('bank'); setAssetColor('#ff6600'); setAssetCurrency(selectedCurrency); setShowAllCurrencies(false); setShowAssetForm(false);
    };

    const removeLocalAsset = (id) => setAssets(assets.filter(a => a.id !== id));

    const handleImportBackup = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
            });
            if (result.canceled) return;
            setImporting(true);
            const file = result.assets[0];
            const importData = await importFromJSON(file.uri);

            let summary = `Found:\n• ${importData.transactions?.length || 0} transactions\n• ${importData.budgets?.length || 0} budgets\n• ${importData.assets?.length || 0} assets`;
            if (importData.savingsGoals?.length > 0) {
                summary += `\n• ${importData.savingsGoals.length} savings goals`;
            }
            if (importData.chatSessions?.length > 0) {
                summary += `\n• ${importData.chatSessions.length} chat sessions`;
            }
            if (importData.settings) {
                summary += `\n• Application appearance & configurations`;
            }
            summary += `\n\nDo you want to import this backup and complete setup?`;

            Alert.alert('Import Backup', summary, [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Import & Go',
                    onPress: async () => {
                        try {
                            const counts = await applyImport(importData, true);
                            await loadData();
                            await setOnboardingCompleted();

                            let doneMsg = `Imported ${counts.transactions} transactions, ${counts.budgets} budgets, ${counts.assets} assets.`;
                            if (counts.savingsGoals > 0 || counts.chatSessions > 0) {
                                doneMsg += `\nIncluded ${counts.savingsGoals || 0} savings goals and ${counts.chatSessions || 0} chat sessions.`;
                            }
                            doneMsg += `\n\nSettings and data restored successfully!`;

                            Alert.alert('Done', doneMsg, [
                                {
                                    text: 'Awesome',
                                    onPress: () => {
                                        router.replace('/(tabs)');
                                    }
                                }
                            ]);
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Error', 'Failed to restore backup: ' + e.message);
                        }
                    },
                },
            ]);
        } catch (err) {
            Alert.alert('Error', err.message);
        } finally {
            setImporting(false);
        }
    };

    const handleFinish = async () => {
        try {
            for (const a of assets) await addAsset(a);
            const amt = parseFloat(budgetAmount);
            if (amt > 0) await addBudget({ id: generateId(), period: budgetPeriod, amount: amt });
            for (const g of goals) {
                await addSavingGoal(g);
            }
            await setOnboardingCompleted();
            router.replace('/(tabs)');
        } catch (e) { console.error(e); Alert.alert('Error', 'Something went wrong. Please try again.'); }
    };

    const canNext = () => {
        if (step <= 1) return true; // Welcome and Privacy screens
        if (step === 2) return choice === 'new'; // Choice screen
        if (step === 3) return !!selectedCurrency; // Currency
        return true;
    };

    const nextStep = () => {
        if (step === 2 && choice === 'backup') {
            Alert.alert('Import Backup', 'Please import your backup file below to restore your data, or select "I\'m New Here" to start fresh.');
            return;
        }
        if (!canNext()) { Alert.alert('', 'Please make a selection'); return; }

        if (step === 3) {
            setCurrency(selectedCurrency);
        }

        if (step < 6) setStep(step + 1); else handleFinish();
    };

    return (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bg" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={BG_TOP} stopOpacity="1" />
                        <Stop offset="1" stopColor={BG_BOT} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
            </Svg>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                {/* ── Step 0: Welcome ── */}
                {step === 0 && (
                    <View>
                        <View style={s.logoWrap}>
                            <View style={s.logoCircle}>
                                <Ionicons name="trending-up" size={36} color="#fff" />
                            </View>
                        </View>
                        <Text style={s.heading}>Welcome to FinanceFlow</Text>
                        <Text style={s.sub}>Your all-in-one private personal finance tracker.</Text>

                        <View style={s.featuresList}>
                            {FEATURES.map((f, i) => (
                                <View key={i} style={s.featureRow}>
                                    <View style={[s.featureIconWrap, { backgroundColor: f.color + '18' }]}>
                                        <Ionicons name={f.icon} size={24} color={f.color} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.featureTitle}>{f.title}</Text>
                                        <Text style={s.featureDesc}>{f.desc}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Step 1: Privacy & Offline Notice ── */}
                {step === 1 && (
                    <View>
                        <Text style={s.heading}>Before We Start</Text>
                        <Text style={s.sub}>FinanceFlow is designed with strict privacy in mind.</Text>

                        <View style={s.featuresList}>
                            <View style={s.featureRow}>
                                <View style={[s.featureIconWrap, { backgroundColor: '#10B98118' }]}>
                                    <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.featureTitle}>100% Offline Data</Text>
                                    <Text style={s.featureDesc}>All your financial data, accounts, and transactions are stored entirely on this device. Your data never leaves your phone.</Text>
                                </View>
                            </View>
                            <View style={s.featureRow}>
                                <View style={[s.featureIconWrap, { backgroundColor: '#F59E0B18' }]}>
                                    <Ionicons name="globe-outline" size={24} color="#F59E0B" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.featureTitle}>Internet Usage</Text>
                                    <Text style={s.featureDesc}>The app only requires an internet connection for live currency conversion rates and downloading local AI models for the first time.</Text>
                                </View>
                            </View>
                            <View style={s.featureRow}>
                                <View style={[s.featureIconWrap, { backgroundColor: '#8B5CF618' }]}>
                                    <Ionicons name="document-text" size={24} color="#8B5CF6" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.featureTitle}>Privacy Policy</Text>
                                    <Text style={s.featureDesc}>We do not collect, sell, or analyze your personal financial information. It is yours, completely local and private.</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* ── Step 2: Getting Started Choice ── */}
                {step === 2 && (
                    <View>
                        <Text style={s.heading}>How would you like to start?</Text>
                        <Text style={s.sub}>Choose whether you are starting fresh or restoring an existing backup file.</Text>

                        <View style={s.choiceContainer}>
                            <TouchableOpacity
                                style={[s.choiceCard, choice === 'new' && { borderColor: P, backgroundColor: P + '08' }]}
                                onPress={() => setChoice('new')}
                                activeOpacity={0.8}>
                                <View style={[s.choiceHeader, { backgroundColor: P + '12' }]}>
                                    <Ionicons name="sparkles" size={24} color={P} />
                                </View>
                                <Text style={s.choiceTitle}>I'm New Here</Text>
                                <Text style={s.choiceDesc}>Set up your accounts, set budgets, and savings goals step-by-step.</Text>
                                {choice === 'new' && (
                                    <View style={s.activeBadge}>
                                        <Ionicons name="checkmark-circle" size={20} color={P} />
                                    </View>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[s.choiceCard, choice === 'backup' && { borderColor: E, backgroundColor: E + '08' }]}
                                onPress={() => setChoice('backup')}
                                activeOpacity={0.8}>
                                <View style={[s.choiceHeader, { backgroundColor: E + '12' }]}>
                                    <Ionicons name="cloud-upload" size={24} color={E} />
                                </View>
                                <Text style={s.choiceTitle}>Restore Backup</Text>
                                <Text style={s.choiceDesc}>Instantly import a backup file to restore all your data and settings.</Text>
                                {choice === 'backup' && (
                                    <View style={s.activeBadge}>
                                        <Ionicons name="checkmark-circle" size={20} color={E} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>

                        {choice === 'new' && (
                            <View style={s.infoBox}>
                                <Ionicons name="information-circle" size={20} color={P} style={{ marginTop: 2 }} />
                                <Text style={s.infoText}>
                                    Great choice! Let's get you set up. Tap <Text style={{ fontFamily: 'Poppins_700Bold' }}>Next</Text> to start adding your bank accounts and assets.
                                </Text>
                            </View>
                        )}

                        {choice === 'backup' && (
                            <View style={s.importBox}>
                                <Text style={s.importText}>
                                    Import your <Text style={{ fontFamily: 'Poppins_700Bold' }}>JSON backup file</Text> to recover transactions, assets, budgets, savings goals, chat history, and settings.
                                </Text>
                                <TouchableOpacity style={s.importBtn} onPress={handleImportBackup} disabled={importing} activeOpacity={0.85}>
                                    <Ionicons name="document-text" size={20} color="#fff" />
                                    <Text style={s.importBtnText}>
                                        {importing ? 'Importing Backup...' : 'Select Backup File'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {/* ── Step 3: Currency Selection ── */}
                {step === 3 && (
                    <View>
                        <Text style={s.heading}>Select Default Currency</Text>
                        <Text style={s.sub}>Choose the primary currency you'd like to use in FinanceFlow. You can change this later in Settings.</Text>

                        <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
                            {currencies.map(c => (
                                <TouchableOpacity key={c.code}
                                    style={[s.choiceCard, { minHeight: 'auto', flexDirection: 'row', justifyContent: 'flex-start' }, selectedCurrency === c.code && { borderColor: P, backgroundColor: P + '08' }]}
                                    onPress={() => setSelectedCurrency(c.code)}
                                    activeOpacity={0.8}>
                                    <View style={[s.choiceHeader, { marginBottom: 0, marginRight: Spacing.md, backgroundColor: selectedCurrency === c.code ? P : CARD, borderWidth: selectedCurrency === c.code ? 0 : 1, borderColor: BORDER }]}>
                                        <Text style={{ fontSize: 18, color: selectedCurrency === c.code ? '#fff' : TEXT }}>{c.symbol}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.choiceTitle, { textAlign: 'left', marginBottom: 0 }]}>{c.code}</Text>
                                        <Text style={[s.choiceDesc, { textAlign: 'left' }]}>{c.name}</Text>
                                    </View>
                                    {selectedCurrency === c.code && <Ionicons name="checkmark-circle" size={20} color={P} />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Step 4: Accounts ── */}
                {step === 4 && (
                    <View>
                        <Text style={s.heading}>Add Your Accounts</Text>
                        <Text style={s.sub}>Add your bank accounts, wallets, and cash to get started.</Text>
                        {assets.map((a, index) => {
                            const at = getAccountTypeById(a.type);




                            const cardColor = getCardColor(a, index);
                            return (
                                <View key={a.id} style={[s.atmCard, { backgroundColor: cardColor, shadowColor: '#1A1040' }]}>
                                    <View style={s.atmCardTop}>
                                        <View style={s.chip}>
                                            <View style={s.chipLine} />
                                            <View style={s.chipLine} />
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                            <Ionicons name={at.icon} size={22} color="rgba(255,255,255,0.55)" />
                                            <TouchableOpacity onPress={() => removeLocalAsset(a.id)} style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: 4 }}>
                                                <Ionicons name="close" size={16} color="#fff" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <Text style={s.atmCardName} numberOfLines={1}>{a.name}</Text>
                                    <Text style={[s.atmCardBalance, { color: a.balance >= 0 ? '#fff' : '#FFB3BA' }]}>
                                        {formatCurrency(a.balance, a.currency || currency)}
                                    </Text>
                                </View>
                            );
                        })}
                        {!showAssetForm ? (
                            <TouchableOpacity style={s.addBtn} onPress={() => { setAssetCurrency(selectedCurrency); setShowAllCurrencies(false); setShowAssetForm(true); }}>
                                <Ionicons name="add-circle-outline" size={20} color={P} />
                                <Text style={[s.addBtnText, { color: P }]}>Add Account</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={s.formCard}>
                                {/* Preview Card */}
                                <View style={[s.cardPreview, { backgroundColor: assetColor }]}>
                                    <View style={s.previewTop}>
                                        <View style={s.chip}>
                                            <View style={s.chipLine} />
                                            <View style={s.chipLine} />
                                        </View>
                                        <Ionicons name={getAccountTypeById(assetType).icon} size={20} color="rgba(255,255,255,0.55)" />
                                    </View>
                                    <Text style={s.previewName} numberOfLines={1}>
                                        {assetName || 'Account Name'}
                                    </Text>
                                    <Text style={s.previewBalance}>
                                        {formatCurrency(parseFloat(assetBalance) || 0, assetCurrency)}
                                    </Text>
                                    <Text style={s.previewType}>{getAccountTypeById(assetType).name}</Text>
                                </View>

                                <Text style={s.inputLabel}>Account Name</Text>
                                <FastInput style={s.input} placeholder="e.g. Savings Account" placeholderTextColor={MUTED}
                                    value={assetName} onChangeText={setAssetName} />
                                <Text style={s.inputLabel}>Type</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                                    {accountTypes.map(t => (
                                        <TouchableOpacity key={t.id}
                                            style={[s.typeChip, assetType === t.id && s.typeChipActive]}
                                            onPress={() => setAssetType(t.id)}>
                                            <Ionicons name={t.icon} size={14} color={assetType === t.id ? '#fff' : P} />
                                            <Text style={[s.typeChipText, assetType === t.id && { color: '#fff' }]}>{t.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                                <Text style={s.inputLabel}>Card Color</Text>
                                <View style={s.colorPicker}>
                                    {CARD_COLORS.map(c => (
                                        <TouchableOpacity
                                            key={c}
                                            style={[s.colorSwatch, { backgroundColor: c }, assetColor === c && s.colorSwatchSelected]}
                                            onPress={() => setAssetColor(c)}
                                        />
                                    ))}
                                </View>
                                <Text style={s.inputLabel}>Account Currency</Text>
                                <View style={s.currencyGrid}>
                                    {(showAllCurrencies ? currencies : getTopCurrencies(selectedCurrency, assetCurrency)).map(c => (
                                        <TouchableOpacity
                                            key={c.code}
                                            style={[
                                                s.currencyOption,
                                                { backgroundColor: CARD, borderColor: BORDER },
                                                assetCurrency === c.code && [s.currencyActive, { borderColor: P, backgroundColor: P + '18' }],
                                            ]}
                                            onPress={() => setAssetCurrency(c.code)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[s.currencyCode, { color: TEXT2 }, assetCurrency === c.code && [s.currencyCodeActive, { color: P }]]}>{c.code}</Text>
                                            <Text style={[s.currencySymbol, { color: MUTED }, assetCurrency === c.code && [s.currencySymbolActive, { color: P }]]}>{c.symbol}</Text>
                                        </TouchableOpacity>
                                    ))}
                                    {!showAllCurrencies && (
                                        <TouchableOpacity
                                            style={[s.currencyOption, { backgroundColor: CARD, borderColor: BORDER }]}
                                            onPress={() => setShowAllCurrencies(true)}>
                                            <Ionicons name="ellipsis-horizontal" size={20} color={TEXT2} />
                                            <Text style={[s.currencySymbol, { color: MUTED }]}>Other</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <Text style={s.inputLabel}>Balance ({assetCurrency})</Text>
                                <FastInput style={s.input} placeholder="0" placeholderTextColor={MUTED}
                                    value={assetBalance} onChangeText={setAssetBalance} keyboardType="numeric" />
                                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
                                    <TouchableOpacity style={[s.formBtn, { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }]}
                                        onPress={() => requestAnimationFrame(() => setShowAssetForm(false))}>
                                        <Text style={{ color: TEXT2, fontFamily: 'Poppins_600SemiBold' }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.formBtn, { flex: 2, backgroundColor: P }]} onPress={addLocalAsset}>
                                        <Text style={{ color: '#fff', fontFamily: 'Poppins_700Bold' }}>Add Account</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                        <Text style={s.skipNote}>You can add more accounts later in the Assets tab.</Text>
                    </View>
                )}

                {/* ── Step 5: Budget ── */}
                {step === 5 && (
                    <View>
                        <Text style={s.heading}>Set Your Budget</Text>
                        <Text style={s.sub}>Set a spending limit to keep your finances on track.</Text>
                        <Text style={s.inputLabel}>Budget Period</Text>
                        <View style={s.periodRow}>
                            {['daily', 'weekly', 'monthly'].map(p => (
                                <TouchableOpacity key={p}
                                    style={[s.periodChip, budgetPeriod === p && s.periodChipActive]}
                                    onPress={() => setBudgetPeriod(p)}>
                                    <Text style={[s.periodChipText, budgetPeriod === p && { color: '#fff' }]}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={s.inputLabel}>Spending Limit ({currency})</Text>
                        <FastInput style={[s.input, s.bigInput]} placeholder="0" placeholderTextColor={MUTED}
                            value={budgetAmount} onChangeText={setBudgetAmount} keyboardType="numeric" />
                        <Text style={s.skipNote}>You can skip this and set a budget later in the Budget tab.</Text>
                    </View>
                )}

                {/* ── Step 6: Saving Goals ── */}
                {step === 6 && (
                    <View>
                        <Text style={s.heading}>Create Saving Goals</Text>
                        <Text style={s.sub}>Start working towards something meaningful. Add your financial targets.</Text>

                        {goals.map((g, index) => (
                            <View key={g.id} style={[s.atmCard, { backgroundColor: getCardColor(g, index), shadowColor: '#1A1040', marginBottom: 12 }]}>
                                <View style={s.atmCardTop}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                        <Ionicons name="flag" size={22} color="rgba(255,255,255,0.7)" />
                                        <Text style={[s.atmCardName, { marginLeft: 0 }]} numberOfLines={1}>{g.title}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => removeLocalGoal(g.id)} style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: 4 }}>
                                        <Ionicons name="close" size={16} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={s.atmCardBalance}>
                                    {formatCurrency(g.targetAmount, currency)}
                                </Text>
                                {g.endDate && (
                                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Poppins_500Medium', marginTop: 4 }}>
                                        Target: {g.endDate}
                                    </Text>
                                )}
                            </View>
                        ))}

                        {!showGoalForm ? (
                            <TouchableOpacity style={s.addBtn} onPress={() => setShowGoalForm(true)}>
                                <Ionicons name="add-circle-outline" size={20} color={P} />
                                <Text style={[s.addBtnText, { color: P }]}>Add New Goal</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={s.formCard}>
                                <Text style={s.inputLabel}>What is this saving for?</Text>
                                <FastInput style={s.input} placeholder="e.g. Buy a new PC" placeholderTextColor={MUTED}
                                    value={goalTitle} onChangeText={setGoalTitle} />
                                <Text style={s.inputLabel}>Target Amount ({currency})</Text>
                                <FastInput style={s.input} placeholder="0" placeholderTextColor={MUTED}
                                    value={goalAmount} onChangeText={setGoalAmount} keyboardType="numeric" />
                                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.inputLabel}>Start Date</Text>
                                        <FastInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={MUTED}
                                            value={goalStart} onChangeText={setGoalStart} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.inputLabel}>End Date</Text>
                                        <FastInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={MUTED}
                                            value={goalEnd} onChangeText={setGoalEnd} />
                                    </View>
                                </View>
                                <View style={s.commitBox}>
                                    <TouchableOpacity style={s.checkRow} onPress={() => setGoalNotify(!goalNotify)}>
                                        <View style={[s.checkbox, goalNotify && { backgroundColor: E, borderColor: E }]}>
                                            {goalNotify && <Ionicons name="checkmark" size={12} color="#fff" />}
                                        </View>
                                        <Text style={s.checkLabel}>I commit to add savings regularly — send me reminders</Text>
                                    </TouchableOpacity>
                                    {goalNotify && (
                                        <View style={[s.periodRow, { marginTop: Spacing.sm }]}>
                                            {['daily', 'weekly', 'monthly'].map(p => (
                                                <TouchableOpacity key={p}
                                                    style={[s.periodChip, goalCommitment === p && s.periodChipActive]}
                                                    onPress={() => setGoalCommitment(p)}>
                                                    <Text style={[s.periodChipText, goalCommitment === p && { color: '#fff' }]}>
                                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                                    <TouchableOpacity style={[s.formBtn, { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }]}
                                        onPress={() => requestAnimationFrame(() => setShowGoalForm(false))}>
                                        <Text style={{ color: TEXT2, fontFamily: 'Poppins_600SemiBold' }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.formBtn, { flex: 2, backgroundColor: P }]} onPress={addLocalGoal}>
                                        <Text style={{ color: '#fff', fontFamily: 'Poppins_700Bold' }}>Save Goal</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* Navigation */}
            <View style={s.nav}>
                {step > 0 ? (
                    <TouchableOpacity style={s.backBtn} onPress={() => setStep(step - 1)}>
                        <Ionicons name="chevron-back" size={18} color={TEXT2} />
                        <Text style={s.backBtnText}>Back</Text>
                    </TouchableOpacity>
                ) : <View style={{ flex: 1 }} />}
                <TouchableOpacity
                    style={[s.nextBtn, !canNext() && { opacity: 0.5 }]}
                    onPress={nextStep}>
                    <Text style={s.nextBtnText}>{step === 6 ? 'Get Started' : 'Next'}</Text>
                    <Ionicons name={step === 6 ? 'checkmark' : 'chevron-forward'} size={18} color="#fff" />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Platform.OS === 'ios' ? 64 : 40, paddingBottom: 32 },
    logoWrap: { alignItems: 'center', marginBottom: Spacing.lg, marginTop: Spacing.sm },
    logoCircle: {
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: P, alignItems: 'center', justifyContent: 'center',
        shadowColor: P, shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4, shadowRadius: 16, elevation: Platform.OS === 'android' ? 0 : 10,
    },
    heading: {
        fontSize: FontSize.xxl, fontFamily: 'Poppins_800ExtraBold',
        color: TEXT, marginBottom: Spacing.sm, textAlign: 'center',
    },
    sub: {
        fontSize: FontSize.md, color: TEXT2, fontFamily: 'Poppins_400Regular',
        marginBottom: Spacing.xl, lineHeight: 22, textAlign: 'center',
    },

    featuresList: { marginTop: Spacing.md, gap: Spacing.md },
    featureRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, backgroundColor: CARD, borderRadius: BorderRadius.lg,
    },
    featureIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    featureTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold', color: TEXT },
    featureDesc: { fontSize: FontSize.sm, color: TEXT2, fontFamily: 'Poppins_400Regular', marginTop: 2, lineHeight: 18 },

    choiceContainer: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.lg },
    choiceCard: {
        flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg,
        backgroundColor: CARD, borderWidth: 2, borderColor: 'transparent',
        alignItems: 'center', position: 'relative', minHeight: 160,
    },
    choiceHeader: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
    choiceTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold', color: TEXT, textAlign: 'center', marginBottom: Spacing.xs },
    choiceDesc: { fontSize: FontSize.xs, color: MUTED, textAlign: 'center', fontFamily: 'Poppins_400Regular', lineHeight: 15 },
    activeBadge: { position: 'absolute', top: 8, right: 8 },

    infoBox: {
        flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md,
        backgroundColor: 'rgba(255,102,0,0.08)', borderRadius: BorderRadius.md,
        borderWidth: 1, borderColor: 'rgba(255,102,0,0.15)', marginTop: Spacing.xs,
    },
    infoText: { flex: 1, fontSize: FontSize.sm, color: TEXT2, fontFamily: 'Poppins_400Regular', lineHeight: 18 },

    importBox: {
        padding: Spacing.lg, backgroundColor: 'rgba(30,201,142,0.08)',
        borderRadius: BorderRadius.md, borderWidth: 1, borderColor: 'rgba(30,201,142,0.15)',
        alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xs,
    },
    importText: { fontSize: FontSize.sm, color: TEXT2, textAlign: 'center', fontFamily: 'Poppins_400Regular', lineHeight: 18 },
    importBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
        paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.md,
        backgroundColor: E, shadowColor: E, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25, shadowRadius: 6, elevation: Platform.OS === 'android' ? 0 : 3,
    },
    importBtnText: { color: '#fff', fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },

    assetRow: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md,
        backgroundColor: CARD, borderRadius: BorderRadius.md, marginBottom: Spacing.sm,
        borderWidth: 1, borderColor: BORDER,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: Platform.OS === 'android' ? 0 : 1,
    },
    assetIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    assetName: { fontSize: FontSize.md, fontFamily: 'Poppins_600SemiBold', color: TEXT },
    assetMeta: { fontSize: FontSize.xs, color: MUTED, marginTop: 2, fontFamily: 'Poppins_400Regular' },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
        padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(255,102,0,0.1)', borderWidth: 1.5,
        borderColor: 'rgba(255,102,0,0.3)', marginTop: Spacing.sm,
    },
    addBtnText: { fontFamily: 'Poppins_700Bold', fontSize: FontSize.md },
    formCard: {
        backgroundColor: CARD, borderRadius: BorderRadius.lg,
        padding: Spacing.lg, marginTop: Spacing.sm,
        borderWidth: 1, borderColor: BORDER,
        shadowColor: '#1A1040', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07, shadowRadius: 10, elevation: Platform.OS === 'android' ? 0 : 3,
    },
    inputLabel: {
        fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold',
        color: TEXT2, marginBottom: Spacing.xs, marginTop: Spacing.md,
    },
    input: {
        backgroundColor: '#F9FAFB', borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        color: TEXT, fontSize: FontSize.md, fontFamily: 'Poppins_400Regular',
        borderWidth: 1, borderColor: BORDER,
    },
    bigInput: { fontSize: FontSize.xxl, fontFamily: 'Poppins_700Bold', textAlign: 'center', paddingVertical: Spacing.lg },
    typeChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.lg, backgroundColor: CARD,
        borderWidth: 1, borderColor: BORDER, marginRight: Spacing.sm,
    },
    typeChipActive: { borderColor: P, backgroundColor: P },
    typeChipText: { fontSize: FontSize.sm, color: TEXT2, fontFamily: 'Poppins_600SemiBold' },
    formBtn: {
        paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
        alignItems: 'center', justifyContent: 'center',
    },
    periodRow: { flexDirection: 'row', gap: Spacing.sm },
    periodChip: {
        flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: CARD, alignItems: 'center',
        borderWidth: 1, borderColor: BORDER,
    },
    periodChipActive: { backgroundColor: P, borderColor: P },
    periodChipText: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold', color: MUTED },
    skipNote: { fontSize: FontSize.xs, color: MUTED, textAlign: 'center', marginTop: Spacing.lg, fontFamily: 'Poppins_400Regular' },
    yesnoRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
    yesnoBtn: {
        flex: 1, padding: Spacing.lg, borderRadius: BorderRadius.lg,
        backgroundColor: CARD, borderWidth: 2, borderColor: BORDER,
        alignItems: 'center', gap: Spacing.sm,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: Platform.OS === 'android' ? 0 : 2,
    },
    yesnoBtnText: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold', color: MUTED },
    commitBox: {
        backgroundColor: '#F9FAFB', borderRadius: BorderRadius.md,
        padding: Spacing.md, marginTop: Spacing.md, borderWidth: 1, borderColor: BORDER,
    },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    checkbox: {
        width: 22, height: 22, borderRadius: 6, borderWidth: 2,
        borderColor: BORDER, alignItems: 'center', justifyContent: 'center',
    },
    checkLabel: { flex: 1, fontSize: FontSize.sm, color: TEXT2, lineHeight: 18, fontFamily: 'Poppins_400Regular' },

    // ATM card
    atmCard: {
        borderRadius: 20,
        padding: Spacing.xl,
        minHeight: 160,
        justifyContent: 'space-between',
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
        elevation: Platform.OS === 'android' ? 0 : 8,
        marginBottom: Spacing.md,
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

    // Currency picker
    currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
    currencyOption: {
        width: '31%', padding: Spacing.md, borderRadius: BorderRadius.md,
        borderWidth: 1, alignItems: 'center', justifyContent: 'center'
    },
    currencyActive: { borderColor: P },
    currencyCode: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    currencyCodeActive: { color: P },
    currencySymbol: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    currencySymbolActive: { color: P },

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

    nav: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        paddingTop: Spacing.md, borderTopWidth: 1, borderColor: BORDER,
        backgroundColor: 'rgba(255,255,255,0.95)', gap: Spacing.md,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg },
    backBtnText: { fontSize: FontSize.md, color: TEXT2, fontFamily: 'Poppins_600SemiBold' },
    nextBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, backgroundColor: P, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
        shadowColor: P, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: Platform.OS === 'android' ? 0 : 6,
    },
    nextBtnText: { color: '#fff', fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
});
