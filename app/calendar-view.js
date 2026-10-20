import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay } from 'date-fns';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/currencies';
import { formatTime } from '../utils/helpers';
import { getCategoryById } from '../utils/categories';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getHeatColor(amount, maxAmount, colors, isDark) {
    if (amount === 0) return 'transparent';
    const intensity = Math.min(amount / (maxAmount || 1), 1);
    if (intensity < 0.25) return isDark ? 'rgba(35,212,153,0.25)' : 'rgba(16,185,129,0.18)';
    if (intensity < 0.5) return isDark ? 'rgba(240,224,96,0.3)' : 'rgba(245,158,11,0.2)';
    if (intensity < 0.75) return isDark ? 'rgba(255,133,148,0.35)' : 'rgba(249,115,22,0.25)';
    return isDark ? 'rgba(255,102,0,0.45)' : 'rgba(239,68,68,0.3)';
}

export default function CalendarView() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { transactions, currency, exchangeRates, convertCurrency } = useApp();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const cellSize = useMemo(() => Math.floor((screenWidth - Spacing.lg * 2 - 12) / 7), [screenWidth]);

    // Build calendar grid
    const calendarData = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

        // Index transactions by day
        const dailyTotals = {};
        transactions.forEach(t => {
            if (t.type !== 'spending') return;
            const dayKey = format(new Date(t.date), 'yyyy-MM-dd');
            if (!dailyTotals[dayKey]) dailyTotals[dayKey] = { spending: 0, income: 0, count: 0, transactions: [] };
            dailyTotals[dayKey].spending += Math.abs(convertCurrency(t.amount, t.currency || currency, currency, exchangeRates));
            dailyTotals[dayKey].count += 1;
            dailyTotals[dayKey].transactions.push(t);
        });
        transactions.forEach(t => {
            if (t.type !== 'income') return;
            const dayKey = format(new Date(t.date), 'yyyy-MM-dd');
            if (!dailyTotals[dayKey]) dailyTotals[dayKey] = { spending: 0, income: 0, count: 0, transactions: [] };
            dailyTotals[dayKey].income += Math.abs(convertCurrency(t.amount, t.currency || currency, currency, exchangeRates));
            dailyTotals[dayKey].count += 1;
            dailyTotals[dayKey].transactions.push(t);
        });

        const weeks = [];
        let day = calStart;
        let maxSpend = 0;

        while (day <= calEnd) {
            const week = [];
            for (let i = 0; i < 7; i++) {
                const dayKey = format(day, 'yyyy-MM-dd');
                const data = dailyTotals[dayKey] || { spending: 0, income: 0, count: 0, transactions: [] };
                if (data.spending > maxSpend) maxSpend = data.spending;
                week.push({
                    date: new Date(day),
                    dayKey,
                    dayNum: day.getDate(),
                    isCurrentMonth: isSameMonth(day, currentMonth),
                    isToday: isSameDay(day, new Date()),
                    ...data,
                });
                day = addDays(day, 1);
            }
            weeks.push(week);
        }

        return { weeks, maxSpend, dailyTotals };
    }, [currentMonth, transactions, currency, exchangeRates]);

    // Monthly summary
    const monthSummary = useMemo(() => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);
        let income = 0, spending = 0;
        transactions.forEach(t => {
            const d = new Date(t.date);
            if (d >= monthStart && d <= monthEnd) {
                const amt = Math.abs(convertCurrency(t.amount, t.currency || currency, currency, exchangeRates));
                if (t.type === 'income') income += amt;
                else if (t.type === 'spending') spending += amt;
            }
        });
        return { income, spending, net: income - spending };
    }, [currentMonth, transactions, currency, exchangeRates]);

    const selectedDayData = selectedDay
        ? calendarData.weeks.flat().find(d => d.dayKey === selectedDay)
        : null;

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

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Spending Calendar</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Month Summary */}
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.summaryItem}>
                        <Text style={[styles.summaryAmount, { color: colors.emerald }]}>+{formatCurrency(monthSummary.income, currency)}</Text>
                        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Income</Text>
                    </View>
                    <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.summaryItem}>
                        <Text style={[styles.summaryAmount, { color: colors.rose }]}>-{formatCurrency(monthSummary.spending, currency)}</Text>
                        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Spending</Text>
                    </View>
                    <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.summaryItem}>
                        <Text style={[styles.summaryAmount, { color: monthSummary.net >= 0 ? colors.emerald : colors.rose }]}>
                            {monthSummary.net >= 0 ? '+' : ''}{formatCurrency(monthSummary.net, currency)}
                        </Text>
                        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Net</Text>
                    </View>
                </View>

                {/* Month Navigator */}
                <View style={styles.monthNav}>
                    <TouchableOpacity style={[styles.navArrow, { backgroundColor: colors.primaryLight }]} onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                        <Ionicons name="chevron-back" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
                        {format(currentMonth, 'MMMM yyyy')}
                    </Text>
                    <TouchableOpacity style={[styles.navArrow, { backgroundColor: colors.primaryLight }]} onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Calendar Grid */}
                <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {/* Weekday Headers */}
                    <View style={styles.weekdayRow}>
                        {WEEKDAYS.map(day => (
                            <View key={day} style={[styles.weekdayCell, { width: cellSize }]}>
                                <Text style={[styles.weekdayText, { color: colors.textMuted }]}>{day}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Day Cells */}
                    {calendarData.weeks.map((week, wi) => (
                        <View key={wi} style={styles.weekRow}>
                            {week.map(day => {
                                const isSelected = selectedDay === day.dayKey;
                                const heatColor = getHeatColor(day.spending, calendarData.maxSpend, colors, isDark);
                                return (
                                    <TouchableOpacity
                                        key={day.dayKey}
                                        style={[
                                            styles.dayCell,
                                            { width: cellSize, height: cellSize },
                                            day.isCurrentMonth && heatColor !== 'transparent' && { backgroundColor: heatColor },
                                            isSelected && { borderColor: colors.primary, borderWidth: 2 },
                                            day.isToday && !isSelected && { borderColor: colors.primary, borderWidth: 1 },
                                        ]}
                                        onPress={() => setSelectedDay(isSelected ? null : day.dayKey)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[
                                            styles.dayNum,
                                            { color: day.isCurrentMonth ? colors.textPrimary : colors.textMuted },
                                            day.isToday && { color: colors.primary, fontFamily: 'Poppins_700Bold' },
                                        ]}>
                                            {day.dayNum}
                                        </Text>
                                        {day.spending > 0 && day.isCurrentMonth && (
                                            <Text style={[styles.dayAmount, { color: colors.rose }]} numberOfLines={1}>
                                                {Math.abs(day.spending) >= 1000 ? `${(day.spending / 1000).toFixed(0)}k` : Math.round(day.spending)}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </View>

                {/* Legend */}
                <View style={styles.legendRow}>
                    <Text style={[styles.legendLabel, { color: colors.textMuted }]}>Low</Text>
                    <View style={[styles.legendBox, { backgroundColor: isDark ? 'rgba(35,212,153,0.25)' : 'rgba(16,185,129,0.18)' }]} />
                    <View style={[styles.legendBox, { backgroundColor: isDark ? 'rgba(240,224,96,0.3)' : 'rgba(245,158,11,0.2)' }]} />
                    <View style={[styles.legendBox, { backgroundColor: isDark ? 'rgba(255,133,148,0.35)' : 'rgba(249,115,22,0.25)' }]} />
                    <View style={[styles.legendBox, { backgroundColor: isDark ? 'rgba(255,102,0,0.45)' : 'rgba(239,68,68,0.3)' }]} />
                    <Text style={[styles.legendLabel, { color: colors.textMuted }]}>High</Text>
                </View>

                {/* Selected Day Detail */}
                {selectedDayData && selectedDayData.transactions.length > 0 && (
                    <View style={[styles.dayDetailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.dayDetailHeader}>
                            <Text style={[styles.dayDetailTitle, { color: colors.textPrimary }]}>
                                {format(selectedDayData.date, 'EEEE, MMM dd')}
                            </Text>
                            <Text style={[styles.dayDetailCount, { color: colors.textMuted }]}>
                                {selectedDayData.transactions.length} transaction{selectedDayData.transactions.length !== 1 ? 's' : ''}
                            </Text>
                        </View>

                        <View style={[styles.dayDetailSummary, { borderColor: colors.border }]}>
                            {selectedDayData.income > 0 && (
                                <Text style={[styles.dayDetailStat, { color: colors.emerald }]}>+{formatCurrency(selectedDayData.income, currency)}</Text>
                            )}
                            {selectedDayData.spending > 0 && (
                                <Text style={[styles.dayDetailStat, { color: colors.rose }]}>-{formatCurrency(selectedDayData.spending, currency)}</Text>
                            )}
                        </View>

                        {selectedDayData.transactions
                            .sort((a, b) => new Date(b.date) - new Date(a.date))
                            .map(tx => {
                                const cat = tx.type === 'move'
                                    ? { name: 'Transfer', icon: 'swap-horizontal', color: '#6A6FF8' }
                                    : getCategoryById(tx.category);
                                const isIncome = tx.type === 'income';
                                return (
                                    <View key={tx.id} style={[styles.dayTxRow, { borderColor: colors.border }]}>
                                        <View style={[styles.dayTxIcon, { backgroundColor: isDark ? `${cat.color}33` : `${cat.color}18` }]}>
                                            <Ionicons name={cat.icon} size={16} color={cat.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.dayTxName, { color: colors.textPrimary }]} numberOfLines={1}>
                                                {tx.description || cat.name}
                                            </Text>
                                            <Text style={[styles.dayTxTime, { color: colors.textMuted }]}>{formatTime(tx.date)}</Text>
                                        </View>
                                        <Text style={[styles.dayTxAmount, { color: isIncome ? colors.emerald : colors.rose }]}>
                                            {isIncome ? '+' : '-'}{formatCurrency(Math.abs(tx.amount), tx.currency || currency)}
                                        </Text>
                                    </View>
                                );
                            })}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingTop: 60,
        paddingBottom: Spacing.md,
        gap: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    title: {
        flex: 1,
        fontSize: FontSize.xxl,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
    },

    summaryCard: {
        flexDirection: 'row',
        marginHorizontal: Spacing.lg,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        marginBottom: Spacing.md,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryAmount: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    summaryLabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    summaryDivider: { width: 1, marginVertical: 4 },

    monthNav: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.md,
    },
    navArrow: {
        width: 36, height: 36, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    monthLabel: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
    },

    calendarCard: {
        marginHorizontal: Spacing.lg,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        padding: 6,
        marginBottom: Spacing.md,
    },
    weekdayRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 4,
    },
    weekdayCell: { alignItems: 'center', paddingVertical: 4 },
    weekdayText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold', textTransform: 'uppercase' },

    weekRow: { flexDirection: 'row', justifyContent: 'space-around' },
    dayCell: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        marginVertical: 1,
    },
    dayNum: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
    dayAmount: { fontSize: 8, fontFamily: 'Poppins_600SemiBold', marginTop: -1 },

    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginBottom: Spacing.lg,
        paddingHorizontal: Spacing.lg,
    },
    legendLabel: { fontSize: 10, fontFamily: 'Poppins_500Medium' },
    legendBox: { width: 20, height: 12, borderRadius: 3 },

    dayDetailCard: {
        marginHorizontal: Spacing.lg,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        padding: Spacing.md,
    },
    dayDetailHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    dayDetailTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    dayDetailCount: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular' },
    dayDetailSummary: {
        flexDirection: 'row',
        gap: Spacing.lg,
        paddingBottom: Spacing.sm,
        marginBottom: Spacing.sm,
        borderBottomWidth: 1,
    },
    dayDetailStat: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },

    dayTxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dayTxIcon: {
        width: 34, height: 34, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    dayTxName: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    dayTxTime: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
    dayTxAmount: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
});
