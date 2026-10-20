import React, { useMemo, useState, useEffect } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity, TextInput, Modal, Alert, StyleSheet, useWindowDimensions
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { generateId, formatDate, formatDateTime } from '../../utils/helpers';
import { getSavingsPlan, normalizeSavingHistory } from '../../utils/savings';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import {
    requestPermission,
    scheduleGoalReminder,
    cancelGoalReminder,
} from '../../services/notificationService';


import FastInput from '../../components/FastInput';
// --------------------------------------------


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
        const d = String(safeDay).padStart(2, '0');
        onChange(`${y}-${m}-${d}`);
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

export default function Savings() {
    const { colors, isDark } = useTheme();
    const { savingsGoals, currency, addSavingGoal, updateSavingGoal, deleteSavingGoal } = useApp();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const params = useLocalSearchParams();
    const router = useRouter();

    const [showModal, setShowModal] = useState(false);
    const [editGoal, setEditGoal] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addAmount, setAddAmount] = useState('');
    const [addTarget, setAddTarget] = useState(null);
    const [detailGoalId, setDetailGoalId] = useState(null);
    const [historyEditId, setHistoryEditId] = useState('');
    const [historyEditAmount, setHistoryEditAmount] = useState('');
    const [historyEditDate, setHistoryEditDate] = useState('');
    const [historyEditOriginalAmount, setHistoryEditOriginalAmount] = useState(0);

    const [title, setTitle] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [commitment, setCommitment] = useState('');
    const [notifyEnabled, setNotifyEnabled] = useState(false);

    // Per-goal reminder time
    const [reminderHour, setReminderHour] = useState(9);
    const [reminderMinute, setReminderMinute] = useState(0);

    // Auto-open add to saving modal if navigated from notification
    useEffect(() => {
        if (params.addSavingGoalId && savingsGoals.length > 0) {
            const targetGoal = savingsGoals.find(g => g.id === params.addSavingGoalId);
            if (targetGoal) {
                setAddTarget(targetGoal);
                setShowAddModal(true);
                // Clear param to prevent reopening on re-renders
                router.setParams({ addSavingGoalId: '' });
            }
        }
    }, [params.addSavingGoalId, savingsGoals]);

    const [showTimePicker, setShowTimePicker] = useState(false);
    const [pickerHour, setPickerHour] = useState(9);
    const [pickerMinute, setPickerMinute] = useState(0);

    const formatTime = (h, m) => {
        const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const period = h < 12 ? 'AM' : 'PM';
        return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
    };

    const detailGoal = useMemo(
        () => savingsGoals.find(g => g.id === detailGoalId) || null,
        [savingsGoals, detailGoalId]
    );

    const planningCommitmentLabel = commitment === 'daily' ? 'daily' : commitment === 'weekly' ? 'weekly' : 'monthly';
    const savingPlan = useMemo(() => {
        const amt = parseFloat(targetAmount) || 0;
        return getSavingsPlan({
            targetAmount: amt,
            currentAmount: editGoal?.currentAmount || 0,
            startDate,
            endDate,
            commitment,
        });
    }, [targetAmount, editGoal, startDate, endDate, commitment]);

    const addTargetPlan = useMemo(() => {
        if (!addTarget) return null;
        return getSavingsPlan(addTarget);
    }, [addTarget]);

    const openAdd = () => {
        setEditGoal(null);
        setTitle(''); setTargetAmount(''); setStartDate(''); setEndDate('');
        setCommitment(''); setNotifyEnabled(false);
        setReminderHour(9); setReminderMinute(0);
        setShowModal(true);
    };

    const openEdit = (g) => {
        setEditGoal(g);
        setTitle(g.title); setTargetAmount(g.targetAmount.toString());
        setStartDate(g.startDate || ''); setEndDate(g.endDate || '');
        setCommitment(g.commitment || ''); setNotifyEnabled(g.notifyEnabled || false);
        setReminderHour(g.reminderHour ?? 9); setReminderMinute(g.reminderMinute ?? 0);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!title.trim()) { Alert.alert('Error', 'Enter a title for your goal'); return; }
        const amt = parseFloat(targetAmount);
        if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid target amount'); return; }
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            Alert.alert('Error', 'Start date cannot be later than end date.');
            return;
        }
        if (notifyEnabled && !commitment) {
            Alert.alert('Error', 'Choose a reminder frequency (daily, weekly, or monthly).');
            return;
        }

        const savedGoalId = editGoal?.id || generateId();
        const data = {
            id: savedGoalId,
            title: title.trim(), targetAmount: amt,
            startDate: startDate || null, endDate: endDate || null,
            commitment: notifyEnabled ? commitment : null, notifyEnabled,
            reminderHour: notifyEnabled ? reminderHour : null,
            reminderMinute: notifyEnabled ? reminderMinute : null,
            savingHistory: editGoal?.savingHistory || [],
            isCompleted: editGoal ? editGoal.isCompleted : false,
        };

        if (editGoal) {
            await updateSavingGoal({ ...editGoal, ...data });
        } else {
            await addSavingGoal({ ...data, currentAmount: 0, savingHistory: [] });
        }

        // Schedule or cancel reminder notification
        if (notifyEnabled && data.commitment) {
            const granted = await requestPermission();
            if (granted) {
                await scheduleGoalReminder(data, reminderHour, reminderMinute);
            } else {
                Alert.alert(
                    'Notifications Disabled',
                    'Please enable notifications for FinanceFlow in your iPhone Settings to receive savings reminders.',
                    [{ text: 'OK' }]
                );
            }
        } else {
            await cancelGoalReminder(savedGoalId);
        }

        setShowModal(false);
    };

    const handleAddToSaving = async () => {
        const amt = parseFloat(addAmount);
        if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }
        if (!addTarget) return;
        Alert.alert(
            'Confirm Deposit',
            `Add ${formatCurrency(amt, currency)} to "${addTarget.title}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Add Deposit',
                    onPress: async () => {
                        const now = new Date().toISOString();
                        const historyEntry = {
                            id: generateId(),
                            amount: amt,
                            date: now,
                            createdAt: now,
                        };
                        const updatedHistory = [historyEntry, ...normalizeSavingHistory(addTarget)];
                        await updateSavingGoal({
                            ...addTarget,
                            currentAmount: (addTarget.currentAmount || 0) + amt,
                            savingHistory: updatedHistory,
                        });
                        setShowAddModal(false); setAddAmount(''); setAddTarget(null);
                    },
                },
            ]
        );
    };

    const openHistoryEdit = (entry) => {
        const entryDate = entry?.date || entry?.createdAt || new Date().toISOString();
        const dateOnly = new Date(entryDate).toISOString().split('T')[0];
        setHistoryEditId(entry.id || '');
        setHistoryEditAmount(String(entry.amount || ''));
        setHistoryEditDate(dateOnly);
        setHistoryEditOriginalAmount(parseFloat(entry.amount) || 0);
    };

    const clearHistoryEdit = () => {
        setHistoryEditId('');
        setHistoryEditAmount('');
        setHistoryEditDate('');
        setHistoryEditOriginalAmount(0);
    };

    const handleSaveHistoryEdit = async () => {
        if (!detailGoal) return;
        const amt = parseFloat(historyEditAmount);
        if (!amt || amt <= 0) { Alert.alert('Error', 'Enter a valid amount'); return; }

        const baseHistory = normalizeSavingHistory(detailGoal);
        let replaced = false;
        const updatedHistory = baseHistory.map(entry => {
            const isMatch = historyEditId
                ? entry.id === historyEditId
                : !replaced && (entry.date === historyEditDate || entry.createdAt === historyEditDate);

            if (!isMatch) return entry;
            replaced = true;
            return {
                ...entry,
                amount: amt,
                date: historyEditDate ? new Date(`${historyEditDate}T12:00:00`).toISOString() : (entry.date || entry.createdAt),
            };
        });

        if (!replaced) {
            Alert.alert('Error', 'Unable to update this history entry.');
            return;
        }

        const adjustedCurrentAmount = Math.max(0, (detailGoal.currentAmount || 0) - historyEditOriginalAmount + amt);
        await updateSavingGoal({
            ...detailGoal,
            currentAmount: adjustedCurrentAmount,
            savingHistory: updatedHistory,
        });

        clearHistoryEdit();
    };

    const handleComplete = (goal) => {
        Alert.alert('Mark as Complete', `Mark "${goal.title}" as completed?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Complete',
                onPress: async () => {
                    await updateSavingGoal({ ...goal, isCompleted: true });
                    // Cancel reminders for completed goals
                    await cancelGoalReminder(goal.id);
                },
            },
        ]);
    };

    const handleDelete = (id) => {
        Alert.alert('Delete Goal', 'Are you sure you want to delete this goal?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    await deleteSavingGoal(id);
                    await cancelGoalReminder(id);
                },
            },
        ]);
    };

    const active = savingsGoals.filter(g => !g.isCompleted);
    const completed = savingsGoals.filter(g => g.isCompleted);
    const totalSaved = savingsGoals.reduce((s, g) => s + (g.currentAmount || 0), 0);
    const totalTarget = savingsGoals.reduce((s, g) => s + (g.targetAmount || 0), 0);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Gradient background */}
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

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={[styles.title, { color: colors.textPrimary }]}>Saving Goals</Text>
                    {savingsGoals.length > 0 && (
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {formatCurrency(totalSaved, currency)} of {formatCurrency(totalTarget, currency)} saved
                        </Text>
                    )}
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={styles.addBtnText}>New Goal</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {active.length === 0 && completed.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
                            <Ionicons name="flag-outline" size={40} color={colors.primary} />
                        </View>
                        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No saving goals yet</Text>
                        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>Set a goal and start saving towards it</Text>
                        <TouchableOpacity style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]} onPress={openAdd} activeOpacity={0.85}>
                            <Ionicons name="add" size={16} color="#fff" />
                            <Text style={styles.emptyAddBtnText}>Create Your First Goal</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {active.map(goal => {
                    const pct = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
                    const remaining = goal.targetAmount - goal.currentAmount;
                    const barColor = pct >= 100 ? '#059669' : pct > 60 ? '#F59E0B' : colors.primary;
                    return (
                        <TouchableOpacity key={goal.id} style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDark ? '#000' : '#1A1040' }]} onPress={() => setDetailGoalId(goal.id)} activeOpacity={0.95}>
                            <View style={styles.goalCardInner}>
                                <View style={styles.goalHeader}>
                                    <View style={styles.goalTitleRow}>
                                        <View style={[styles.goalFlagWrap, { backgroundColor: isDark ? `${barColor}33` : `${barColor}18` }]}>
                                            <Ionicons name="flag" size={14} color={barColor} />
                                        </View>
                                        <Text style={[styles.goalTitle, { color: colors.textPrimary }]} numberOfLines={1}>{goal.title}</Text>
                                    </View>
                                    <View style={styles.goalActions}>
                                        <TouchableOpacity onPress={() => openEdit(goal)} style={[styles.iconBtn, { backgroundColor: colors.inputBg }]}>
                                            <Ionicons name="pencil" size={15} color={colors.textSecondary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDelete(goal.id)} style={[styles.iconBtn, { backgroundColor: colors.inputBg }]}>
                                            <Ionicons name="trash" size={15} color={colors.rose} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.amountRow}>
                                    <Text style={[styles.currentAmt, { color: barColor }]}>{formatCurrency(goal.currentAmount || 0, currency)}</Text>
                                    <Text style={[styles.targetAmt, { color: colors.textMuted }]}> / {formatCurrency(goal.targetAmount, currency)}</Text>
                                </View>

                                {/* Progress */}
                                <View style={styles.progressBarWrap}>
                                    <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                                        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                                    </View>
                                    <Text style={[styles.pctBadge, { color: barColor }]}>{pct.toFixed(0)}%</Text>
                                </View>

                                {remaining > 0 && (
                                    <Text style={[styles.remainText, { color: colors.textSecondary }]}>{formatCurrency(remaining, currency)} remaining</Text>
                                )}

                                {(goal.startDate || goal.endDate) && (
                                    <View style={styles.dateRow}>
                                        <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                                        <Text style={[styles.dateMeta, { color: colors.textSecondary }]}>
                                            {goal.startDate ? formatDate(goal.startDate) : '?'}
                                            {' → '}
                                            {goal.endDate ? formatDate(goal.endDate) : '?'}
                                        </Text>
                                    </View>
                                )}

                                {goal.commitment && (
                                    <View style={[styles.commitBadge, { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.1)' }]}>
                                        <Ionicons name="notifications" size={11} color="#F59E0B" />
                                        <Text style={styles.commitText}>
                                            {goal.commitment.charAt(0).toUpperCase() + goal.commitment.slice(1)} commitment
                                            {goal.notifyEnabled ? ' · Reminders on' : ''}
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.goalBtnRow}>
                                    <TouchableOpacity
                                        style={[styles.addSavingBtn, { backgroundColor: barColor }]}
                                        onPress={() => { setAddTarget(goal); setAddAmount(''); setShowAddModal(true); }}
                                        activeOpacity={0.85}
                                    >
                                        <Ionicons name="add" size={16} color="#fff" />
                                        <Text style={styles.addSavingBtnText}>Add Savings</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.completeBtn, { borderColor: barColor }]} onPress={() => handleComplete(goal)} activeOpacity={0.85}>
                                        <Ionicons name="checkmark-circle-outline" size={15} color={barColor} />
                                        <Text style={[styles.completeBtnText, { color: barColor }]}>Complete</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.historyHint}>Tap card to view goal details and add-savings history</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}

                {completed.length > 0 && (
                    <>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="checkmark-circle" size={16} color={colors.emerald} />
                            <Text style={[styles.sectionTitle, { color: colors.emerald }]}>Completed Goals</Text>
                        </View>
                        {completed.map(goal => (
                            <TouchableOpacity key={goal.id} style={[styles.goalCard, styles.goalCardCompleted, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setDetailGoalId(goal.id)} activeOpacity={0.95}>
                                <View style={styles.goalCardInner}>
                                    <View style={styles.goalHeader}>
                                        <View style={styles.goalTitleRow}>
                                            <View style={[styles.goalFlagWrap, { backgroundColor: isDark ? `${colors.emerald}33` : `${colors.emerald}18` }]}>
                                                <Ionicons name="checkmark-circle" size={14} color={colors.emerald} />
                                            </View>
                                            <Text style={[styles.goalTitle, { color: colors.textSecondary }]}>{goal.title}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => handleDelete(goal.id)} style={[styles.iconBtn, { backgroundColor: colors.inputBg }]}>
                                            <Ionicons name="trash" size={15} color={colors.rose} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={styles.completedTag}>
                                        🎉 {formatCurrency(goal.currentAmount || 0, currency)} / {formatCurrency(goal.targetAmount, currency)} · Goal achieved!
                                    </Text>
                                    <Text style={styles.historyHint}>Tap card to view goal details and add-savings history</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </>
                )}

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Add/Edit Goal Modal */}
            <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => { setShowModal(false); setEditGoal(null); }}>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <ScrollView contentContainerStyle={styles.modalScroll}>
                        <View style={[styles.modalBox, { backgroundColor: colors.modalBg }]}>
                            <View style={styles.modalHandle} />
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{editGoal ? 'Edit Goal' : 'New Saving Goal'}</Text>
                                <TouchableOpacity onPress={() => requestAnimationFrame(() => setShowModal(false))} style={[styles.closeBtn, { backgroundColor: colors.inputBg }]}>
                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>What is this saving for?</Text>
                            <FastInput
                                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                                placeholder="e.g. Buy a new PC"
                                placeholderTextColor={colors.textMuted}
                                value={title}
                                onChangeText={setTitle}
                            />

                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Target Amount ({currency})</Text>
                            <FastInput
                                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                value={targetAmount}
                                onChangeText={setTargetAmount}
                                keyboardType="numeric"
                            />

                            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Start Date</Text>
                                    <DatePickerInput label="Start Date" value={startDate} onChange={setStartDate} colors={colors} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>End Date</Text>
                                    <DatePickerInput label="End Date" value={endDate} onChange={setEndDate} colors={colors} />
                                </View>
                            </View>

                            <View style={[styles.commitBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                                <TouchableOpacity style={styles.checkRow} onPress={() => setNotifyEnabled(!notifyEnabled)}>
                                    <View style={[styles.checkbox, { borderColor: colors.border }, notifyEnabled && [styles.checkboxChecked, { backgroundColor: colors.primary, borderColor: colors.primary }]]}>
                                        {notifyEnabled && <Ionicons name="checkmark" size={12} color="#fff" />}
                                    </View>
                                    <Text style={[styles.checkLabel, { color: colors.textSecondary }]}>Enable regular saving reminders</Text>
                                </TouchableOpacity>
                                {notifyEnabled && (
                                    <>
                                        <View style={styles.periodRow}>
                                            {['daily', 'weekly', 'monthly'].map(p => (
                                                <TouchableOpacity
                                                    key={p}
                                                    style={[styles.periodChip, { backgroundColor: colors.card, borderColor: colors.border }, commitment === p && [styles.periodChipActive, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]]}
                                                    onPress={() => setCommitment(p)}
                                                >
                                                    <Text style={[styles.periodChipText, { color: colors.textMuted }, commitment === p && [styles.periodChipTextActive, { color: colors.primary }]]}>
                                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        {/* Per-goal reminder time row */}
                                        <TouchableOpacity
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.card }}
                                            onPress={() => { setPickerHour(reminderHour); setPickerMinute(reminderMinute); setShowTimePicker(true); }}
                                            activeOpacity={0.8}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Ionicons name="alarm-outline" size={14} color={colors.primary} />
                                                <Text style={{ fontSize: FontSize.xs, color: colors.textMuted, fontFamily: 'Poppins_400Regular' }}>Reminder time</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={{ fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold', color: colors.primary }}>
                                                    {formatTime(reminderHour, reminderMinute)}
                                                </Text>
                                                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                                            </View>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>

                            {notifyEnabled && commitment && startDate && endDate && (
                                <View style={[styles.planHintBox, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)' }]}>
                                    <Ionicons name="information-circle" size={15} color={colors.emerald} />
                                    <Text style={[styles.planHintText, { color: colors.emerald }]}>
                                        {savingPlan
                                            ? `You will reach your goal by saving ${formatCurrency(savingPlan.amountPerPeriod, currency)} ${planningCommitmentLabel}.`
                                            : 'End date must be later than start date to calculate your required saving amount.'}
                                    </Text>
                                </View>
                            )}

                            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]} onPress={handleSave} activeOpacity={0.85}>
                                <Text style={styles.saveBtnText}>{editGoal ? 'Update Goal' : 'Create Goal'}</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                    {/* Per-goal reminder time picker OVERLAY */}
                    {showTimePicker && (
                        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' }]}>
                            <View style={{ backgroundColor: colors.modalBg, borderRadius: 22, padding: Spacing.xl, width: '85%', maxWidth: 360, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 }}>
                                <Text style={{ fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold', color: colors.textPrimary, marginBottom: Spacing.lg, textAlign: 'center' }}>
                                    Reminder Time
                                </Text>
                                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl, marginBottom: Spacing.lg }}>
                                    {/* Hour */}
                                    <View style={{ alignItems: 'center', gap: Spacing.sm }}>
                                        <Text style={{ fontSize: FontSize.xs, color: colors.textMuted, fontFamily: 'Poppins_500Medium' }}>HOUR</Text>
                                        <TouchableOpacity onPress={() => setPickerHour(h => h <= 0 ? 23 : h - 1)}>
                                            <Ionicons name="chevron-up" size={26} color={colors.primary} />
                                        </TouchableOpacity>
                                        <Text style={{ fontSize: 36, fontFamily: 'Poppins_700Bold', color: colors.textPrimary, minWidth: 56, textAlign: 'center' }}>
                                            {pickerHour === 0 ? 12 : pickerHour > 12 ? pickerHour - 12 : pickerHour}
                                        </Text>
                                        <TouchableOpacity onPress={() => setPickerHour(h => h >= 23 ? 0 : h + 1)}>
                                            <Ionicons name="chevron-down" size={26} color={colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    <Text style={{ fontSize: 36, fontFamily: 'Poppins_700Bold', color: colors.textPrimary, marginTop: 28 }}>:</Text>
                                    {/* Minute */}
                                    <View style={{ alignItems: 'center', gap: Spacing.sm }}>
                                        <Text style={{ fontSize: FontSize.xs, color: colors.textMuted, fontFamily: 'Poppins_500Medium' }}>MIN</Text>
                                        <TouchableOpacity onPress={() => setPickerMinute(m => m <= 0 ? 55 : m - 5)}>
                                            <Ionicons name="chevron-up" size={26} color={colors.primary} />
                                        </TouchableOpacity>
                                        <Text style={{ fontSize: 36, fontFamily: 'Poppins_700Bold', color: colors.textPrimary, minWidth: 56, textAlign: 'center' }}>
                                            {String(pickerMinute).padStart(2, '0')}
                                        </Text>
                                        <TouchableOpacity onPress={() => setPickerMinute(m => m >= 55 ? 0 : m + 5)}>
                                            <Ionicons name="chevron-down" size={26} color={colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    {/* AM/PM */}
                                    <View style={{ alignItems: 'center', gap: Spacing.sm, justifyContent: 'center', marginTop: 10 }}>
                                        <TouchableOpacity
                                            onPress={() => setPickerHour(h => h < 12 ? h : h - 12)}
                                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: pickerHour < 12 ? colors.primary : colors.inputBg }}
                                        >
                                            <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: FontSize.sm, color: pickerHour < 12 ? '#fff' : colors.textMuted }}>AM</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setPickerHour(h => h >= 12 ? h : h + 12)}
                                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: pickerHour >= 12 ? colors.primary : colors.inputBg }}
                                        >
                                            <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: FontSize.sm, color: pickerHour >= 12 ? '#fff' : colors.textMuted }}>PM</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                                    <TouchableOpacity
                                        style={{ flex: 1, padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
                                        onPress={() => requestAnimationFrame(() => setShowTimePicker(false))}
                                    >
                                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm, color: colors.textSecondary }}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ flex: 1, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: colors.primary, alignItems: 'center' }}
                                        onPress={() => { setReminderHour(pickerHour); setReminderMinute(pickerMinute); setShowTimePicker(false); }}
                                    >
                                        <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: FontSize.sm, color: '#fff' }}>Set Time</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>


            {/* Add to Saving Modal */}
            <Modal visible={showAddModal} animationType="fade" transparent onRequestClose={() => setShowAddModal(false)}>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <View style={[styles.modalBox, { margin: Spacing.xl, backgroundColor: colors.modalBg }]}>
                        <View style={styles.modalHandle} />
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Add to Saving</Text>
                            <TouchableOpacity onPress={() => requestAnimationFrame(() => setShowAddModal(false))} style={[styles.closeBtn, { backgroundColor: colors.inputBg }]}>
                                <Ionicons name="close" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        {addTarget && (
                            <Text style={[styles.addTargetName, { color: colors.textSecondary }]}>🎯 {addTarget.title}</Text>
                        )}
                        {addTargetPlan && (
                            <View style={[styles.planHintBox, { backgroundColor: colors.primaryLight }]}>
                                <Ionicons name="trending-up-outline" size={15} color={colors.primary} />
                                <Text style={[styles.planHintText, { color: colors.primary }]}>
                                    Stay on track by adding around {formatCurrency(addTargetPlan.amountPerPeriod, currency)} {addTargetPlan.commitment}.
                                </Text>
                            </View>
                        )}
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Amount ({currency})</Text>
                        <FastInput
                            style={[styles.input, { fontSize: FontSize.xxxl, fontFamily: 'Poppins_800ExtraBold', textAlign: 'center', color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            value={addAmount}
                            onChangeText={setAddAmount}
                            keyboardType="numeric"
                            autoFocus
                        />
                        <TouchableOpacity style={styles.saveBtn} onPress={handleAddToSaving} activeOpacity={0.85}>
                            <Ionicons name="add-circle" size={18} color="#fff" />
                            <Text style={styles.saveBtnText}>Add to Saving</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Goal Detail + Saving History Modal */}
            <Modal visible={!!detailGoal} animationType="slide" transparent onRequestClose={() => setDetailGoalId(null)}>
                <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
                    <ScrollView contentContainerStyle={styles.modalScroll}>
                        <View style={[styles.modalBox, { backgroundColor: colors.modalBg }]}>
                            <View style={styles.modalHandle} />
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Goal Details</Text>
                                <TouchableOpacity onPress={() => requestAnimationFrame(() => setDetailGoalId(null))} style={[styles.closeBtn, { backgroundColor: colors.inputBg }]}>
                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            {detailGoal && (
                                <>
                                    <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>{detailGoal.title}</Text>
                                    <Text style={[styles.detailAmount, { color: colors.textSecondary }]}>
                                        {formatCurrency(detailGoal.currentAmount || 0, currency)} / {formatCurrency(detailGoal.targetAmount || 0, currency)}
                                    </Text>
                                    <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>
                                        {detailGoal.startDate ? formatDate(detailGoal.startDate) : '?'} {' → '} {detailGoal.endDate ? formatDate(detailGoal.endDate) : '?'}
                                    </Text>
                                    {detailGoal.notifyEnabled && detailGoal.commitment ? (
                                        <Text style={[styles.detailMeta, { color: colors.textSecondary }]}>Reminder: {detailGoal.commitment}</Text>
                                    ) : null}

                                    <View style={styles.historyHeaderRow}>
                                        <Text style={[styles.historyHeader, { color: colors.textPrimary }]}>Add Savings History</Text>
                                    </View>

                                    {normalizeSavingHistory(detailGoal).length === 0 ? (
                                        <Text style={[styles.noHistoryText, { color: colors.textSecondary }]}>No savings added yet.</Text>
                                    ) : (
                                        [...normalizeSavingHistory(detailGoal)]
                                            .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
                                            .map(entry => (
                                                <View key={entry.id || `${entry.date}-${entry.amount}`} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                                                    <View style={styles.historyRowLeft}>
                                                        <Ionicons name="arrow-up-circle" size={16} color={colors.emerald} />
                                                        <Text style={[styles.historyAmount, { color: colors.emerald }]}>+{formatCurrency(entry.amount || 0, currency)}</Text>
                                                    </View>
                                                    <View style={styles.historyRowRight}>
                                                        <Text style={[styles.historyDate, { color: colors.textSecondary }]}>{formatDateTime(entry.date || entry.createdAt)}</Text>
                                                        <TouchableOpacity style={[styles.historyEditBtn, { backgroundColor: colors.inputBg }]} onPress={() => openHistoryEdit(entry)}>
                                                            <Ionicons name="pencil" size={13} color={colors.primary} />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            ))
                                    )}

                                    {!!historyEditId && (
                                        <View style={[styles.historyEditPanel, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                                            <Text style={[styles.historyEditTitle, { color: colors.textPrimary }]}>Edit History Entry</Text>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Date</Text>
                                            <DatePickerInput label="History Date" value={historyEditDate} onChange={setHistoryEditDate} colors={colors} />
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Amount ({currency})</Text>
                                            <FastInput
                                                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                                                placeholder="0"
                                                placeholderTextColor={colors.textMuted}
                                                value={historyEditAmount}
                                                onChangeText={setHistoryEditAmount}
                                                keyboardType="numeric"
                                            />
                                            <View style={styles.historyEditBtnRow}>
                                                <TouchableOpacity style={[styles.historyCancelBtn, { backgroundColor: colors.primaryLight }]} onPress={clearHistoryEdit}>
                                                    <Text style={[styles.historyCancelBtnText, { color: colors.primary }]}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={[styles.historySaveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveHistoryEdit} activeOpacity={0.85}>
                                                    <Ionicons name="save-outline" size={16} color="#fff" />
                                                    <Text style={styles.historySaveBtnText}>Save Changes</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F3F4F6' },

    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: 60,
        paddingBottom: Spacing.md,
    },
    title: {
        fontSize: FontSize.xxl,
        fontFamily: 'Poppins_800ExtraBold',
        color: '#1A1040',
    },
    subtitle: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3B8',
        marginTop: 2,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#ff6600',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 4,
    },
    addBtnText: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.sm,
    },

    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

    emptyState: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: Spacing.xl },
    emptyIconWrap: {
        width: 90,
        height: 90,
        borderRadius: 26,
        backgroundColor: 'rgba(255,102,0,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        marginBottom: 4,
    },
    emptyDesc: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3B8',
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    emptyAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#ff6600',
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 4,
    },
    emptyAddBtnText: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.md,
    },

    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    sectionTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        color: '#059669',
    },

    goalCard: {
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: 22,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.07)',
        overflow: 'hidden',
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: Platform.OS === 'android' ? 0 : 3,
    },
    goalCardCompleted: { opacity: 0.75 },
    goalAccent: {
        height: 4,
        width: '100%',
    },
    goalCardInner: { padding: Spacing.lg },
    goalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    goalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
    goalFlagWrap: {
        width: 28,
        height: 28,
        borderRadius: 9,
        backgroundColor: 'rgba(255,102,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    goalTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        flex: 1,
    },
    goalActions: { flexDirection: 'row', gap: 4 },
    iconBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(83,96,132,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    amountRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: Spacing.sm },
    currentAmt: {
        fontSize: 26,
        fontFamily: 'Poppins_800ExtraBold',
        lineHeight: 34,
    },
    targetAmt: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3B8',
    },
    progressBarWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: 4,
    },
    progressBar: {
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(83,96,132,0.1)',
        overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 4 },
    pctBadge: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_700Bold',
        minWidth: 34,
        textAlign: 'right',
    },
    remainText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3B8',
        marginBottom: Spacing.sm,
    },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
    dateMeta: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3B8',
    },
    commitBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: Spacing.md,
        backgroundColor: 'rgba(245,158,11,0.1)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 5,
        borderRadius: BorderRadius.sm,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.2)',
    },
    commitText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
        color: '#F59E0B',
    },
    goalBtnRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    addSavingBtn: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
    },
    addSavingBtnText: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.sm,
    },
    completeBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        borderWidth: 1.5,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
    },
    completeBtnText: {
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.sm,
    },
    completedTag: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3B8',
        marginTop: 4,
    },
    historyHint: {
        marginTop: Spacing.sm,
        color: '#9CA3B8',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
    },
    planHintBox: {
        marginTop: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(16,185,129,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.22)',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    planHintText: {
        flex: 1,
        color: '#0d9488',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
    },
    detailTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
        marginBottom: 4,
    },
    detailAmount: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4B4570',
        marginBottom: 4,
    },
    detailMeta: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#9CA3B8',
        marginBottom: 4,
    },
    historyHeaderRow: {
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
    },
    historyHeader: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
    },
    noHistoryText: {
        color: '#9CA3B8',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        marginBottom: Spacing.md,
    },
    historyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(83,96,132,0.08)',
    },
    historyRowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    historyRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    historyAmount: {
        color: '#059669',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    historyDate: {
        color: '#9CA3B8',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
    },
    historyEditBtn: {
        width: 28,
        height: 28,
        borderRadius: 9,
        backgroundColor: 'rgba(255,102,0,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyEditPanel: {
        marginTop: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: 'rgba(83,96,132,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.12)',
        padding: Spacing.md,
    },
    historyEditTitle: {
        color: '#1A1040',
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
    },
    historyEditBtnRow: {
        marginTop: Spacing.md,
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    historyCancelBtn: {
        flex: 1,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(83,96,132,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.sm,
    },
    historyCancelBtnText: {
        color: '#4B4570',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    historySaveBtn: {
        flex: 2,
        borderRadius: BorderRadius.full,
        backgroundColor: '#ff6600',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: Spacing.sm,
    },
    historySaveBtnText: {
        color: '#fff',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
    },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(21,26,45,0.4)', justifyContent: 'flex-end' },
    modalScroll: { justifyContent: 'flex-end', minHeight: '100%' },
    modalBox: {
        backgroundColor: '#FDFDFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: Spacing.lg,
        paddingBottom: Platform.OS === 'ios' ? 44 : Spacing.xxl,
    },
    modalHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(83,96,132,0.2)',
        alignSelf: 'center',
        marginBottom: Spacing.md,
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
        color: '#1A1040',
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 11,
        backgroundColor: 'rgba(83,96,132,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addTargetName: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4B4570',
        marginBottom: Spacing.md,
    },
    inputLabel: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        color: '#4B4570',
        marginBottom: Spacing.xs,
        marginTop: Spacing.md,
    },
    input: {
        backgroundColor: 'rgba(83,96,132,0.06)',
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        fontFamily: 'Poppins_500Medium',
        color: '#1A1040',
        fontSize: FontSize.md,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.1)',
    },
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
    commitBox: {
        backgroundColor: 'rgba(83,96,132,0.05)',
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginTop: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.08)',
    },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: 'rgba(83,96,132,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#ff6600',
        borderColor: '#ff6600',
    },
    checkLabel: {
        flex: 1,
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        color: '#4B4570',
        lineHeight: 18,
    },
    periodRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    periodChip: {
        flex: 1,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(83,96,132,0.06)',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.1)',
    },
    periodChipActive: {
        backgroundColor: '#ff6600',
        borderColor: '#ff6600',
    },
    periodChipText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_700Bold',
        color: '#9CA3B8',
    },
    periodChipTextActive: { color: '#fff' },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#ff6600',
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.full,
        marginTop: Spacing.xl,
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: Platform.OS === 'android' ? 0 : 4,
    },
    saveBtnText: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
        fontSize: FontSize.lg,
    },

    // Date picker modal
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
    },
});
