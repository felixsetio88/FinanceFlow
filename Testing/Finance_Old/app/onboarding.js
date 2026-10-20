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
import { formatCurrency } from '../utils/currencies';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { importFromJSON, applyImport } from '../services/dataExport';

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

export default function Onboarding() {
    const router = useRouter();
    const { addAsset, addBudget, addSavingGoal, setOnboardingCompleted, currency, loadData } = useApp();

    const [step, setStep] = useState(0);
    const [choice, setChoice] = useState(null); // 'new' or 'backup'
    const [importing, setImporting] = useState(false);
    const [assets, setAssets] = useState([]);
    const [assetName, setAssetName] = useState('');
    const [assetType, setAssetType] = useState('bank');
    const [assetBalance, setAssetBalance] = useState('');
    const [showAssetForm, setShowAssetForm] = useState(false);
    const [budgetPeriod, setBudgetPeriod] = useState('monthly');
    const [budgetAmount, setBudgetAmount] = useState('');
    const [wantGoal, setWantGoal] = useState(null);
    const [goalTitle, setGoalTitle] = useState('');
    const [goalAmount, setGoalAmount] = useState('');
    const [goalStart, setGoalStart] = useState('');
    const [goalEnd, setGoalEnd] = useState('');
    const [goalCommitment, setGoalCommitment] = useState('');
    const [goalNotify, setGoalNotify] = useState(false);

    const addLocalAsset = () => {
        if (!assetName.trim()) { Alert.alert('Error', 'Enter account name'); return; }
        const bal = parseFloat(assetBalance) || 0;
        setAssets([...assets, { id: generateId(), name: assetName.trim(), type: assetType, balance: bal }]);
        setAssetName(''); setAssetBalance(''); setAssetType('bank'); setShowAssetForm(false);
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
            if (wantGoal === 'yes' && goalTitle.trim() && parseFloat(goalAmount) > 0) {
                if (goalStart && goalEnd && new Date(goalStart) > new Date(goalEnd)) {
                    Alert.alert('Error', 'Start date cannot be later than end date.'); return;
                }
                if (goalNotify && !goalCommitment) { Alert.alert('Error', 'Please choose a reminder frequency.'); return; }
                await addSavingGoal({
                    id: generateId(), title: goalTitle.trim(), targetAmount: parseFloat(goalAmount),
                    currentAmount: 0, startDate: goalStart || null, endDate: goalEnd || null,
                    commitment: goalCommitment || null, notifyEnabled: goalNotify, savingHistory: [], isCompleted: false,
                });
            }
            await setOnboardingCompleted();
            router.replace('/(tabs)');
        } catch (e) { console.error(e); Alert.alert('Error', 'Something went wrong. Please try again.'); }
    };

    const canNext = () => {
        if (step === 0) return true;
        if (step === 1) return choice === 'new';
        return true;
    };

    const nextStep = () => {
        if (step === 1 && choice === 'backup') {
            Alert.alert('Import Backup', 'Please import your backup file below to restore your data, or select "I\'m New Here" to start fresh.');
            return;
        }
        if (!canNext()) { Alert.alert('', 'Please make a selection'); return; }
        if (step < 4) setStep(step + 1); else handleFinish();
    };

    return (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Svg style={StyleSheet.absoluteFillObject}>
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

                {/* ── Step 1: Getting Started Choice ── */}
                {step === 1 && (
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

                {/* ── Step 2: Accounts ── */}
                {step === 2 && (
                    <View>
                        <Text style={s.heading}>Add Your Accounts</Text>
                        <Text style={s.sub}>Add your bank accounts, wallets, and cash to get started.</Text>
                        {assets.map(a => {
                            const at = getAccountTypeById(a.type);
                            return (
                                <View key={a.id} style={s.assetRow}>
                                    <View style={[s.assetIconWrap, { backgroundColor: P + '18' }]}>
                                        <Ionicons name={at.icon} size={20} color={P} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.assetName}>{a.name}</Text>
                                        <Text style={s.assetMeta}>{at.name} · {formatCurrency(a.balance, currency)}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => removeLocalAsset(a.id)}>
                                        <Ionicons name="close-circle" size={20} color="#FF7A87" />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                        {!showAssetForm ? (
                            <TouchableOpacity style={s.addBtn} onPress={() => setShowAssetForm(true)}>
                                <Ionicons name="add-circle-outline" size={20} color={E} />
                                <Text style={[s.addBtnText, { color: E }]}>Add Account</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={s.formCard}>
                                <Text style={s.inputLabel}>Account Name</Text>
                                <TextInput style={s.input} placeholder="e.g. Savings Account" placeholderTextColor={MUTED}
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
                                <Text style={s.inputLabel}>Balance ({currency})</Text>
                                <TextInput style={s.input} placeholder="0" placeholderTextColor={MUTED}
                                    value={assetBalance} onChangeText={setAssetBalance} keyboardType="numeric" />
                                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
                                    <TouchableOpacity style={[s.formBtn, { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER }]}
                                        onPress={() => setShowAssetForm(false)}>
                                        <Text style={{ color: TEXT2, fontFamily: 'Poppins_600SemiBold' }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.formBtn, { flex: 2, backgroundColor: E }]} onPress={addLocalAsset}>
                                        <Text style={{ color: '#fff', fontFamily: 'Poppins_700Bold' }}>Add Account</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                        <Text style={s.skipNote}>You can add more accounts later in the Assets tab.</Text>
                    </View>
                )}

                {/* ── Step 3: Budget ── */}
                {step === 3 && (
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
                        <TextInput style={[s.input, s.bigInput]} placeholder="0" placeholderTextColor={MUTED}
                            value={budgetAmount} onChangeText={setBudgetAmount} keyboardType="numeric" />
                        <Text style={s.skipNote}>You can skip this and set a budget later in the Budget tab.</Text>
                    </View>
                )}

                {/* ── Step 4: Saving Goals ── */}
                {step === 4 && (
                    <View>
                        <Text style={s.heading}>Create a Saving Goal?</Text>
                        <Text style={s.sub}>Start working towards something meaningful.</Text>
                        <View style={s.yesnoRow}>
                            <TouchableOpacity style={[s.yesnoBtn, wantGoal === 'yes' && { borderColor: E, backgroundColor: E + '18' }]}
                                onPress={() => setWantGoal('yes')}>
                                <Ionicons name="checkmark-circle" size={28} color={wantGoal === 'yes' ? E : MUTED} />
                                <Text style={[s.yesnoBtnText, wantGoal === 'yes' && { color: E }]}>Yes, Let's Go!</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.yesnoBtn, wantGoal === 'no' && { borderColor: BORDER }]}
                                onPress={() => setWantGoal('no')}>
                                <Ionicons name="time-outline" size={28} color={wantGoal === 'no' ? TEXT2 : MUTED} />
                                <Text style={[s.yesnoBtnText, wantGoal === 'no' && { color: TEXT2 }]}>Maybe Later</Text>
                            </TouchableOpacity>
                        </View>
                        {wantGoal === 'yes' && (
                            <View style={s.formCard}>
                                <Text style={s.inputLabel}>What is this saving for?</Text>
                                <TextInput style={s.input} placeholder="e.g. Buy a new PC" placeholderTextColor={MUTED}
                                    value={goalTitle} onChangeText={setGoalTitle} />
                                <Text style={s.inputLabel}>Target Amount ({currency})</Text>
                                <TextInput style={s.input} placeholder="0" placeholderTextColor={MUTED}
                                    value={goalAmount} onChangeText={setGoalAmount} keyboardType="numeric" />
                                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.inputLabel}>Start Date</Text>
                                        <TextInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={MUTED}
                                            value={goalStart} onChangeText={setGoalStart} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.inputLabel}>End Date</Text>
                                        <TextInput style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={MUTED}
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
                    <Text style={s.nextBtnText}>{step === 4 ? 'Get Started' : 'Next'}</Text>
                    <Ionicons name={step === 4 ? 'checkmark' : 'chevron-forward'} size={18} color="#fff" />
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
        borderWidth: 1, borderColor: BORDER,
        shadowColor: '#1A1040', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 6, elevation: Platform.OS === 'android' ? 0 : 2,
    },
    featureIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    featureTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold', color: TEXT },
    featureDesc: { fontSize: FontSize.sm, color: TEXT2, fontFamily: 'Poppins_400Regular', marginTop: 2, lineHeight: 18 },

    choiceContainer: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.lg },
    choiceCard: {
        flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg,
        backgroundColor: CARD, borderWidth: 2, borderColor: BORDER,
        alignItems: 'center', position: 'relative', minHeight: 160,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: Platform.OS === 'android' ? 0 : 2,
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
        backgroundColor: 'rgba(30,201,142,0.1)', borderWidth: 1.5,
        borderColor: 'rgba(30,201,142,0.3)', marginTop: Spacing.sm,
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
    typeChipActive: { borderColor: E, backgroundColor: E },
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
