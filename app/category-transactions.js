import React, { useState, useMemo, useEffect } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity,
    StyleSheet, Modal, Alert, useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/currencies';
import { filterTransactionsByPeriod, getDateRange, formatTime } from '../utils/helpers';
import { getCategoryById, normalizeCategoryId } from '../utils/categories';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

/* ─── Date Picker Modal ─── */
function DatePickerModal({ visible, value, onConfirm, onClose, colors }) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [month, setMonth] = useState(0);
    const [day, setDay] = useState(1);
    const [year, setYear] = useState(new Date().getFullYear());

    useEffect(() => {
        if (!visible) return;
        const date = value instanceof Date ? value : new Date(value);
        setMonth(date.getMonth());
        setDay(date.getDate());
        setYear(date.getFullYear());
    }, [visible, value]);

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const handleConfirm = () => {
        const safeDay = Math.min(day, daysInMonth);
        onConfirm(new Date(year, month, safeDay));
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
                <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onStartShouldSetResponder={() => true}>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Select Date</Text>

                    {/* Year Selector */}
                    <View style={styles.pickerRow}>
                        <TouchableOpacity onPress={() => setYear(y => y - 1)} style={[styles.stepBtn, { backgroundColor: colors.inputBg }]}>
                            <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[styles.pickerValueText, { color: colors.textPrimary }]}>{year}</Text>
                        <TouchableOpacity onPress={() => setYear(y => y + 1)} style={[styles.stepBtn, { backgroundColor: colors.inputBg }]}>
                            <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {/* Month Grid */}
                    <View style={styles.monthGrid}>
                        {months.map((m, idx) => (
                            <TouchableOpacity
                                key={m}
                                onPress={() => setMonth(idx)}
                                style={[
                                    styles.monthCell,
                                    { backgroundColor: month === idx ? colors.primary : colors.inputBg },
                                ]}
                            >
                                <Text style={[styles.monthCellText, { color: month === idx ? '#fff' : colors.textPrimary }]}>{m}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Day Selector */}
                    <View style={styles.pickerRow}>
                        <TouchableOpacity onPress={() => setDay(d => Math.max(1, d - 1))} style={[styles.stepBtn, { backgroundColor: colors.inputBg }]}>
                            <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[styles.pickerValueText, { color: colors.textPrimary }]}>Day {Math.min(day, daysInMonth)}</Text>
                        <TouchableOpacity onPress={() => setDay(d => Math.min(daysInMonth, d + 1))} style={[styles.stepBtn, { backgroundColor: colors.inputBg }]}>
                            <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
                        </TouchableOpacity>
                    </View>

                    {/* Modal Buttons */}
                    <View style={styles.modalBtnRow}>
                        <TouchableOpacity onPress={onClose} style={[styles.modalBtn, { backgroundColor: colors.inputBg }]}>
                            <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleConfirm} style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                            <Text style={[styles.modalBtnText, { color: '#fff' }]}>Confirm</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

export default function CategoryTransactionsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const {
        transactions, currency, assets, exchangeRates,
        convertCurrency, deleteTransaction
    } = useApp();

    const rawCategoryParam = Array.isArray(params?.category) ? params.category[0] : params?.category;
    const initialPeriod = (Array.isArray(params?.period) ? params.period[0] : params?.period) || 'monthly';
    const initialRefDate = (Array.isArray(params?.refDate) ? params.refDate[0] : params?.refDate);

    const [period, setPeriod] = useState(initialPeriod);
    const [refDate, setRefDate] = useState(initialRefDate ? new Date(initialRefDate) : new Date());
    const [showDateModal, setShowDateModal] = useState(false);
    const [expandedId, setExpandedId] = useState(null);

    useEffect(() => {
        if (params?.period) {
            const p = Array.isArray(params.period) ? params.period[0] : params.period;
            if (['daily', 'weekly', 'monthly', 'all'].includes(p)) {
                setPeriod(p);
            }
        }
    }, [params?.period]);

    useEffect(() => {
        if (params?.refDate) {
            const r = Array.isArray(params.refDate) ? params.refDate[0] : params.refDate;
            const parsed = new Date(r);
            if (!isNaN(parsed.getTime())) {
                setRefDate(parsed);
            }
        }
    }, [params?.refDate]);

    // Resolved category details
    const categoryInfo = useMemo(() => {
        return getCategoryById(rawCategoryParam);
    }, [rawCategoryParam]);

    const targetCatId = useMemo(() => {
        return normalizeCategoryId(categoryInfo.id);
    }, [categoryInfo]);

    // Period date navigation
    const navigate = (direction) => {
        if (period === 'all') return;
        const fn = direction === 'next'
            ? (period === 'daily' ? addDays : period === 'weekly' ? addWeeks : addMonths)
            : (period === 'daily' ? subDays : period === 'weekly' ? subWeeks : subMonths);
        setRefDate(fn(refDate, 1));
    };

    // Filter transactions for active period
    const periodTransactions = useMemo(() => {
        return filterTransactionsByPeriod(transactions, period, refDate);
    }, [transactions, period, refDate]);

    // Overall spending for the period across all categories
    const totalPeriodSpending = useMemo(() => {
        return periodTransactions
            .filter(t => t.type === 'spending')
            .reduce((sum, t) => sum + Math.abs(convertCurrency(t.amount, t.currency || currency, currency, exchangeRates)), 0);
    }, [periodTransactions, currency, exchangeRates, convertCurrency]);

    // Matching transactions for this category
    const categoryTransactions = useMemo(() => {
        return periodTransactions.filter(t => {
            if (t.type !== 'spending') return false;

            // Check if transaction has splits
            if (Array.isArray(t.splits) && t.splits.length > 0) {
                return t.splits.some(s => normalizeCategoryId(s.category) === targetCatId);
            }

            const catNormalized = normalizeCategoryId(t.category);
            if (catNormalized === targetCatId) return true;

            // Fallback for vehicle expenses if target is transport ('Car')
            if (targetCatId === 'transport' && t.vehicleId) return true;

            return false;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [periodTransactions, targetCatId]);

    // Category summary statistics
    const stats = useMemo(() => {
        let total = 0;
        categoryTransactions.forEach(t => {
            if (Array.isArray(t.splits) && t.splits.length > 0) {
                const matchingSplits = t.splits.filter(s => normalizeCategoryId(s.category) === targetCatId);
                const splitSum = matchingSplits.reduce((acc, s) => acc + Math.abs(s.amount || 0), 0);
                total += convertCurrency(splitSum, t.currency || currency, currency, exchangeRates);
            } else {
                total += Math.abs(convertCurrency(t.amount, t.currency || currency, currency, exchangeRates));
            }
        });

        const count = categoryTransactions.length;
        const avg = count > 0 ? total / count : 0;
        const percentage = totalPeriodSpending > 0 ? (total / totalPeriodSpending) * 100 : 0;

        return { total, count, avg, percentage };
    }, [categoryTransactions, targetCatId, totalPeriodSpending, currency, exchangeRates, convertCurrency]);

    // Formatted period label for navigation bar
    const periodLabel = useMemo(() => {
        if (period === 'all') return 'All Time';
        if (period === 'daily') return format(refDate, 'MMM dd, yyyy');
        const { start, end } = getDateRange(period, refDate);
        return `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`;
    }, [period, refDate]);

    // Confirm deletion
    const confirmDeleteTx = (tx) => {
        Alert.alert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () => deleteTransaction(tx.id),
            },
        ]);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            {/* SVG Gradient Background */}
            <Svg
                key={colors.background}
                style={StyleSheet.absoluteFillObject}
                width={screenWidth}
                height={screenHeight}
                pointerEvents="none"
            >
                <Defs>
                    <SvgGrad id="bgGradCatTx" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGradCatTx)" />
            </Svg>

            {/* Modal Drag Handle */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* ── Top Header ── */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => {
                        if (router.canDismiss?.()) {
                            router.dismiss();
                        } else {
                            router.back();
                        }
                    }}
                    style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    activeOpacity={0.7}
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <View style={[styles.categoryHeaderBadge, { backgroundColor: categoryInfo.color }]}>
                        <Ionicons name={categoryInfo.icon} size={15} color="#fff" />
                    </View>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {categoryInfo.name} Spending
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                        {stats.count} transaction{stats.count !== 1 ? 's' : ''}
                    </Text>
                </View>

                <View style={styles.headerSpacer} />
            </View>

            {/* ── Period Selector Tabs ── */}
            <View style={styles.periodTabsWrap}>
                <View style={[styles.periodTabs, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    {['daily', 'weekly', 'monthly', 'all'].map(p => {
                        const isActive = period === p;
                        return (
                            <TouchableOpacity
                                key={p}
                                style={[
                                    styles.periodTab,
                                    isActive && [styles.periodTabActive, { backgroundColor: colors.primary, shadowColor: colors.primary }],
                                ]}
                                onPress={() => { setPeriod(p); setRefDate(new Date()); }}
                                activeOpacity={0.75}
                            >
                                <Text
                                    style={[
                                        styles.periodText,
                                        { color: colors.textSecondary },
                                        isActive && styles.periodTextActive,
                                    ]}
                                >
                                    {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* ── Date Navigator ── */}
            {period === 'all' ? (
                <View style={styles.allTimeBanner}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.allTimeText, { color: colors.textSecondary }]}>
                        Showing all transactions
                    </Text>
                </View>
            ) : (
                <View style={styles.dateNav}>
                    <TouchableOpacity
                        style={[styles.navArrow, { backgroundColor: colors.primaryLight }]}
                        onPress={() => navigate('prev')}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chevron-back" size={18} color={colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.dateLabelWrap, { backgroundColor: colors.card, borderColor: colors.border }]}
                        onPress={() => setShowDateModal(true)}
                        activeOpacity={0.7}
                    >
                        <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>{periodLabel}</Text>
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.navArrow, { backgroundColor: colors.primaryLight }]}
                        onPress={() => navigate('next')}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* ── Summary KPI Banner ── */}
                <View style={styles.summarySection}>
                    <View style={styles.summaryTopRow}>
                        <View>
                            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total {categoryInfo.name} Spent</Text>
                            <Text style={[styles.summaryAmount, { color: categoryInfo.color }]}>
                                {formatCurrency(stats.total, currency)}
                            </Text>
                        </View>
                        <View style={[styles.summaryIconCircle, { backgroundColor: `${categoryInfo.color}15` }]}>
                            <Ionicons name={categoryInfo.icon} size={28} color={categoryInfo.color} />
                        </View>
                    </View>

                    {/* Stats Metric Pills */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statPill, { backgroundColor: colors.card }]}>
                            <Text style={[styles.statPillVal, { color: colors.textPrimary }]}>
                                {stats.percentage.toFixed(1)}%
                            </Text>
                            <Text style={[styles.statPillLbl, { color: colors.textMuted }]}>of Spending</Text>
                        </View>
                        <View style={[styles.statPill, { backgroundColor: colors.card }]}>
                            <Text style={[styles.statPillVal, { color: colors.textPrimary }]}>
                                {stats.count}
                            </Text>
                            <Text style={[styles.statPillLbl, { color: colors.textMuted }]}>Transactions</Text>
                        </View>
                        <View style={[styles.statPill, { backgroundColor: colors.card }]}>
                            <Text style={[styles.statPillVal, { color: colors.textPrimary }]}>
                                {formatCurrency(stats.avg, currency)}
                            </Text>
                            <Text style={[styles.statPillLbl, { color: colors.textMuted }]}>Average / Tx</Text>
                        </View>
                    </View>
                </View>

                {/* ── Transaction List Section ── */}
                <View style={styles.listSection}>
                    <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                        Transactions ({categoryTransactions.length})
                    </Text>

                    {categoryTransactions.length === 0 ? (
                        <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
                            <View style={[styles.emptyIconWrap, { backgroundColor: `${categoryInfo.color}14` }]}>
                                <Ionicons name={categoryInfo.icon} size={36} color={categoryInfo.color} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                                No {categoryInfo.name} Transactions
                            </Text>
                            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                                There are no spending records for {categoryInfo.name} in {period === 'all' ? 'your all-time history' : `this ${period === 'monthly' ? 'month' : period === 'weekly' ? 'week' : 'day'}`}.
                            </Text>
                        </View>
                    ) : (
                        categoryTransactions.map(tx => {
                            const isExpanded = expandedId === tx.id;
                            const asset = (assets || []).find(a => a.id === tx.assetId);
                            const rawAmount = Math.abs(tx.amount || 0);
                            const convertedAmt = convertCurrency(rawAmount, tx.currency || currency, currency, exchangeRates);
                            const isDiffCurrency = tx.currency && tx.currency !== currency;

                            const formattedDate = new Date(tx.date).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                            });

                            return (
                                <TouchableOpacity
                                    key={tx.id}
                                    style={[styles.txCard, { backgroundColor: colors.card }]}
                                    activeOpacity={0.85}
                                    onPress={() => setExpandedId(isExpanded ? null : tx.id)}
                                >
                                    <View style={styles.txMain}>
                                        <View style={[styles.txIconCircle, { backgroundColor: `${categoryInfo.color}18` }]}>
                                            <Ionicons
                                                name={tx.vehicleLogType === 'refuel' ? 'water-outline' : tx.vehicleLogType === 'maintenance' ? 'build-outline' : categoryInfo.icon}
                                                size={20}
                                                color={categoryInfo.color}
                                            />
                                        </View>

                                        <View style={styles.txInfoCol}>
                                            <Text style={[styles.txDesc, { color: colors.textPrimary }]} numberOfLines={1}>
                                                {tx.description || categoryInfo.name}
                                            </Text>
                                            <View style={styles.txMetaRow}>
                                                <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                                                    {formattedDate} · {formatTime(tx.date)}
                                                </Text>
                                                {asset && (
                                                    <View style={[styles.assetPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                                        <Text style={[styles.assetPillText, { color: colors.textSecondary }]}>{asset.name}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>

                                        <View style={styles.txAmountCol}>
                                            <Text style={[styles.txAmountText, { color: '#dc2626' }]}>
                                                -{formatCurrency(convertedAmt, currency)}
                                            </Text>
                                            {isDiffCurrency && (
                                                <Text style={[styles.txOrigAmountText, { color: colors.textMuted }]}>
                                                    ({formatCurrency(rawAmount, tx.currency)})
                                                </Text>
                                            )}
                                            <Ionicons
                                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                                size={14}
                                                color={colors.textMuted}
                                                style={{ marginTop: 2 }}
                                            />
                                        </View>
                                    </View>

                                    {/* Expanded Details Section */}
                                    {isExpanded && (
                                        <View style={styles.txExpanded}>
                                            <View style={[styles.txDivider, { backgroundColor: colors.border }]} />

                                            {/* Vehicle Specific Info */}
                                            {tx.vehicleOdometer != null && (
                                                <View style={styles.detailRow}>
                                                    <Ionicons name="speedometer-outline" size={14} color={colors.primary} />
                                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Odometer:</Text>
                                                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>{tx.vehicleOdometer.toLocaleString()} km</Text>
                                                </View>
                                            )}
                                            {tx.vehicleVolume != null && (
                                                <View style={styles.detailRow}>
                                                    <Ionicons name="water-outline" size={14} color="#059669" />
                                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Volume:</Text>
                                                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>{tx.vehicleVolume} L</Text>
                                                </View>
                                            )}
                                            {tx.vehicleMaintenanceItems && (
                                                <View style={styles.detailRow}>
                                                    <Ionicons name="build-outline" size={14} color="#f59e0b" />
                                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Service:</Text>
                                                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>{tx.vehicleMaintenanceItems}</Text>
                                                </View>
                                            )}

                                            {/* Notes */}
                                            {tx.notes ? (
                                                <View style={styles.detailRow}>
                                                    <Ionicons name="document-text-outline" size={14} color={colors.textSecondary} />
                                                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Notes:</Text>
                                                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>{tx.notes}</Text>
                                                </View>
                                            ) : null}

                                            {/* Actions: Edit & Delete buttons matching Vehicle Dashboard sizing */}
                                            <View style={styles.txActions}>
                                                <TouchableOpacity
                                                    style={styles.editBtn}
                                                    onPress={() => router.push({ pathname: '/add-transaction', params: { editId: tx.id } })}
                                                    activeOpacity={0.75}
                                                >
                                                    <Ionicons name="pencil" size={14} color="#6A6FF8" />
                                                    <Text style={styles.editTxt}>Edit</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={styles.deleteBtn}
                                                    onPress={() => confirmDeleteTx(tx)}
                                                    activeOpacity={0.75}
                                                >
                                                    <Ionicons name="trash" size={14} color="#dc2626" />
                                                    <Text style={styles.deleteTxt}>Delete</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            <DatePickerModal
                visible={showDateModal}
                value={refDate}
                onConfirm={setRefDate}
                onClose={() => setShowDateModal(false)}
                colors={colors}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },

    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 8,
        marginBottom: Spacing.xs,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.sm,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    headerSpacer: {
        width: 38,
        height: 38,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.xs,
    },
    categoryHeaderBadge: {
        width: 28,
        height: 28,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 3,
    },
    headerTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },

    // Period selector tabs - identical to Charts & Analytics and History
    periodTabsWrap: {
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
    },
    periodTabs: {
        flexDirection: 'row',
        borderRadius: BorderRadius.full,
        padding: 4,
        borderWidth: 1,
    },
    periodTab: {
        flex: 1,
        paddingVertical: Spacing.sm,
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
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
    },
    periodTextActive: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
    },

    // Date navigator - identical to Charts & Analytics and History
    allTimeBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xs,
        marginBottom: Spacing.md,
    },
    allTimeText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
    },
    dateNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
    },
    navArrow: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateLabelWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
    },
    dateLabel: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
    },

    scrollContent: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xxl * 1.5,
    },

    // Summary Section (No enclosing card container)
    summarySection: {
        marginBottom: Spacing.lg,
        paddingTop: Spacing.xs,
    },
    summaryTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    summaryLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 2,
    },
    summaryAmount: {
        fontSize: FontSize.xxl,
        fontFamily: 'Poppins_700Bold',
    },
    summaryIconCircle: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    statPill: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: BorderRadius.lg,
        alignItems: 'center',
    },
    statPillVal: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
    },
    statPillLbl: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        marginTop: 2,
    },

    // Transactions list
    listSection: {
        marginTop: Spacing.xs,
    },
    sectionHeading: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        marginBottom: Spacing.sm,
    },
    txCard: {
        borderRadius: BorderRadius.lg,
        marginBottom: Spacing.sm,
        overflow: 'hidden',
    },
    txMain: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        gap: Spacing.md,
    },
    txIconCircle: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    txInfoCol: {
        flex: 1,
    },
    txDesc: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    txMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        flexWrap: 'wrap',
    },
    txDate: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    assetPill: {
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
    },
    assetPillText: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
    },
    txAmountCol: {
        alignItems: 'flex-end',
    },
    txAmountText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
    },
    txOrigAmountText: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        marginTop: 1,
    },

    // Expanded details
    txExpanded: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
    },
    txDivider: {
        height: 1,
        marginBottom: Spacing.sm,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    detailLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    detailVal: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    txActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.md,
        marginTop: Spacing.sm,
    },
    editBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(106,111,248,0.1)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
    },
    editTxt: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        color: '#6A6FF8',
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(220,38,38,0.08)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 6,
        borderRadius: BorderRadius.full,
    },
    deleteTxt: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        color: '#dc2626',
    },

    // Empty state
    emptyCard: {
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        alignItems: 'center',
        marginTop: Spacing.sm,
    },
    emptyIconWrap: {
        width: 68,
        height: 68,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
    },
    emptyTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
        textAlign: 'center',
    },
    emptyBody: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 0,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.lg,
    },
    modalCard: {
        width: '100%',
        maxWidth: 340,
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        borderWidth: 1,
    },
    modalTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: Spacing.md,
    },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    stepBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pickerValueText: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
    },
    monthGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: Spacing.md,
    },
    monthCell: {
        width: '23%',
        paddingVertical: 8,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    monthCellText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    modalBtnRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginTop: Spacing.xs,
    },
    modalBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBtnText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
});
