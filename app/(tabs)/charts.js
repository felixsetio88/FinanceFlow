import React, { useState, useMemo, useEffect } from 'react';
import { Platform, View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect, Circle, G, Path, Line } from 'react-native-svg';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { useApp } from '../../context/AppContext';
import { formatCurrency } from '../../utils/currencies';
import { filterTransactionsByPeriod, groupByCategory, getDateRange } from '../../utils/helpers';
import { getCategoryById } from '../../utils/categories';
import { Colors, Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import DonutChart from '../../components/DonutChart';

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
        onConfirm(new Date(year, month, Math.min(day, daysInMonth)));
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={[styles.dpOverlay, { backgroundColor: colors.overlay }]}>
                <View style={[styles.dpBox, { backgroundColor: colors.modalBg }]}>
                    <Text style={[styles.dpTitle, { color: colors.textPrimary }]}>Select Date</Text>
                    <View style={styles.dpRow}>
                        {[
                            { label: 'Month', value: months[month], up: () => setMonth((month + 1) % 12), down: () => setMonth((month + 11) % 12) },
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
                        <TouchableOpacity style={[styles.dpCancel, { backgroundColor: colors.primaryLight }]} onPress={onClose}>
                            <Text style={styles.dpCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.dpConfirm, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
                            <Text style={styles.dpConfirmText}>Confirm</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function MonthlyTrendChart({ data, colors, currency }) {
    const maxValue = Math.max(
        ...data.flatMap(item => [item.income, item.spending]),
        1
    );

    return (
        <View style={styles.trendWrap}>
            <View style={styles.trendLegend}>
                <View style={styles.trendLegendItem}>
                    <View style={[styles.trendDot, { backgroundColor: colors.emerald }]} />
                    <Text style={[styles.trendLegendText, { color: colors.textSecondary }]}>Income</Text>
                </View>
                <View style={styles.trendLegendItem}>
                    <View style={[styles.trendDot, { backgroundColor: colors.rose }]} />
                    <Text style={[styles.trendLegendText, { color: colors.textSecondary }]}>Spending</Text>
                </View>
            </View>
            <View style={styles.trendChart}>
                {data.map(item => {
                    const incomeHeight = item.income > 0 ? Math.max((item.income / maxValue) * 100, 4) : 0;
                    const spendingHeight = item.spending > 0 ? Math.max((item.spending / maxValue) * 100, 4) : 0;
                    return (
                        <View key={item.key} style={styles.trendMonth}>
                            <View style={styles.trendBars}>
                                <View style={styles.trendBarPair}>
                                    <View style={[styles.trendBar, { height: incomeHeight, backgroundColor: colors.emerald }]} />
                                    <View style={[styles.trendBar, { height: spendingHeight, backgroundColor: colors.rose }]} />
                                </View>
                            </View>
                            <Text style={[styles.trendLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                        </View>
                    );
                })}
            </View>
            <View style={[styles.trendTotalRow, { borderColor: colors.border }]}>
                <Text style={[styles.trendTotalText, { color: colors.textSecondary }]}>
                    6-month spending
                </Text>
                <Text style={[styles.trendTotalAmount, { color: colors.rose }]}>
                    {formatCurrency(data.reduce((sum, item) => sum + item.spending, 0), currency)}
                </Text>
            </View>
        </View>
    );
}

function AssetsTrendChart({ data, colors, currency, width }) {
    const chartHeight = 120;
    const paddingX = 10;
    const paddingY = 15;
    
    const chartWidth = width - 68; // available width inside card
    
    const values = data.map(item => item.value);
    let maxVal = Math.max(...values, 100);
    let minVal = Math.min(...values, 0);

    if (values.length > 0) {
        const actualMax = Math.max(...values);
        const actualMin = Math.min(...values);
        if (actualMax === actualMin) {
            maxVal = actualMax + (Math.abs(actualMax) * 0.1 || 10);
            minVal = actualMin - (Math.abs(actualMin) * 0.1 || 10);
        } else {
            const padding = (actualMax - actualMin) * 0.15; // 15% padding
            maxVal = actualMax + padding;
            minVal = actualMin - padding;
        }
    }
    const range = maxVal - minVal;

    const points = data.map((item, idx) => {
        const x = paddingX + (idx * (chartWidth - 2 * paddingX)) / 5;
        const y = chartHeight - paddingY - ((item.value - minVal) / (range || 1)) * (chartHeight - 2 * paddingY);
        return { x, y, label: item.label, value: item.value };
    });

    const [selectedIndex, setSelectedIndex] = useState(points.length - 1);
    
    React.useEffect(() => {
        setSelectedIndex(points.length - 1);
    }, [points.length]);

    const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = points.length > 0
        ? `${pathD} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`
        : '';

    return (
        <View style={styles.assetsChartWrap}>
            <View style={{ height: chartHeight, width: chartWidth }}>
                <Svg width={chartWidth} height={chartHeight}>
                    <Defs>
                        <SvgGrad id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                            <Stop offset="0" stopColor={colors.primary} />
                            <Stop offset="1" stopColor="#F59E0B" />
                        </SvgGrad>
                        <SvgGrad id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={colors.primary} stopOpacity="0.28" />
                            <Stop offset="1" stopColor={colors.primary} stopOpacity="0.00" />
                        </SvgGrad>
                    </Defs>
                    {/* Area under the line */}
                    {areaD ? <Path d={areaD} fill="url(#areaGrad)" /> : null}
                    
                    {/* Line stroke */}
                    {pathD ? <Path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth={3} /> : null}
                    
                    {/* Selected vertical indicator line */}
                    {points.map((p, idx) => {
                        if (idx !== selectedIndex) return null;
                        return (
                            <Line
                                key={`line-${idx}`}
                                x1={p.x}
                                y1={paddingY}
                                x2={p.x}
                                y2={chartHeight - paddingY}
                                stroke={colors.primary}
                                strokeDasharray="3 3"
                                strokeWidth={1.5}
                                opacity={0.6}
                            />
                        );
                    })}
                    
                    {/* Data point circles */}
                    {points.map((p, idx) => {
                        const isSelected = idx === selectedIndex;
                        return (
                            <Circle
                                key={idx}
                                cx={p.x}
                                cy={p.y}
                                r={isSelected ? 6 : 4}
                                fill={isSelected ? colors.primary : "#FFFFFF"}
                                stroke={colors.primary}
                                strokeWidth={2}
                            />
                        );
                    })}

                    {/* Touch targets */}
                    {points.map((p, idx) => (
                        <Circle
                            key={`touch-${idx}`}
                            cx={p.x}
                            cy={p.y}
                            r={24}
                            fill="transparent"
                            onPress={() => setSelectedIndex(idx)}
                        />
                    ))}
                </Svg>
            </View>
            {/* X-axis Labels */}
            <View style={[styles.assetsChartLabels, { width: chartWidth }]}>
                {points.map((p, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                        <TouchableOpacity key={idx} onPress={() => setSelectedIndex(idx)}>
                            <Text style={[
                                styles.assetsChartLabelText, 
                                { color: colors.textSecondary },
                                isSelected && { color: colors.primary, fontFamily: 'Poppins_700Bold' }
                            ]}>
                                {p.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {/* Selected balance info row */}
            <View style={[styles.trendTotalRow, { borderColor: colors.border, marginTop: Spacing.sm }]}>
                <Text style={[styles.trendTotalText, { color: colors.textSecondary }]}>
                    Assets balance in {points[selectedIndex]?.label}
                </Text>
                <Text style={[styles.trendTotalAmount, { color: colors.primary }]}>
                    {formatCurrency(points[selectedIndex]?.value || 0, currency)}
                </Text>
            </View>
        </View>
    );
}

export default function Charts() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { transactions, currency, currentDateKey, assets, exchangeRates, convertCurrency } = useApp();
    const [period, setPeriod] = useState('monthly');
    const [refDate, setRefDate] = useState(new Date());
    const [showDateModal, setShowDateModal] = useState(false);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const navigate = (direction) => {
        if (period === 'all') return;
        const fn = direction === 'next'
            ? (period === 'daily' ? addDays : period === 'weekly' ? addWeeks : addMonths)
            : (period === 'daily' ? subDays : period === 'weekly' ? subWeeks : subMonths);
        setRefDate(fn(refDate, 1));
    };

    const periodTx = useMemo(
        () => filterTransactionsByPeriod(transactions, period, refDate),
        [transactions, period, refDate]
    );
    const monthlyTrend = useMemo(() => {
        const referenceDate = new Date(currentDateKey);
        return Array.from({ length: 6 }, (_, index) => {
            const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - (5 - index), 1);
            const month = monthDate.getMonth();
            const year = monthDate.getFullYear();
            const monthTransactions = transactions.filter(transaction => {
                const transactionDate = new Date(transaction.date);
                return transactionDate.getFullYear() === year && transactionDate.getMonth() === month;
            });
            return {
                key: `${year}-${month}`,
                label: monthDate.toLocaleString('en-US', { month: 'short' }),
                income: monthTransactions
                    .filter(transaction => transaction.type === 'income')
                    .reduce((sum, transaction) => sum + Math.abs(convertCurrency(transaction.amount, transaction.currency || currency, currency, exchangeRates)), 0),
                spending: monthTransactions
                    .filter(transaction => transaction.type === 'spending')
                    .reduce((sum, transaction) => sum + Math.abs(convertCurrency(transaction.amount, transaction.currency || currency, currency, exchangeRates)), 0),
            };
        });
    }, [transactions, currentDateKey, currency, exchangeRates]);

    const assetsTrend = useMemo(() => {
        const referenceDate = new Date(currentDateKey);
        
        const currentBalances = {};
        (assets || []).forEach(a => {
            currentBalances[a.id] = a.balance || 0;
        });

        const sortedTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

        const monthlyBalances = [];
        let txIndex = 0;

        for (let i = 5; i >= 0; i--) {
            const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - (5 - i), 1);
            const endOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

            while (txIndex < sortedTx.length) {
                const tx = sortedTx[txIndex];
                const txDate = new Date(tx.date);
                if (txDate <= endOfMonth) {
                    break;
                }
                
                const rawAmount = Math.abs(tx.amount || 0);
                if (tx.type === 'income' && tx.assetId && currentBalances[tx.assetId] !== undefined) {
                    const asset = (assets || []).find(a => a.id === tx.assetId);
                    const assetCur = asset?.currency || currency;
                    const amount = convertCurrency(rawAmount, tx.currency || assetCur, assetCur, exchangeRates);
                    currentBalances[tx.assetId] -= amount;
                } else if (tx.type === 'spending' && tx.assetId && currentBalances[tx.assetId] !== undefined) {
                    const asset = (assets || []).find(a => a.id === tx.assetId);
                    const assetCur = asset?.currency || currency;
                    const amount = convertCurrency(rawAmount, tx.currency || assetCur, assetCur, exchangeRates);
                    currentBalances[tx.assetId] += amount;
                } else if (tx.type === 'move') {
                    if (tx.fromAssetId && currentBalances[tx.fromAssetId] !== undefined) {
                        const fromAsset = (assets || []).find(a => a.id === tx.fromAssetId);
                        const fromCur = fromAsset?.currency || tx.currency || currency;
                        const amount = convertCurrency(rawAmount, tx.currency || fromCur, fromCur, exchangeRates);
                        currentBalances[tx.fromAssetId] += amount;
                    }
                    if (tx.toAssetId && currentBalances[tx.toAssetId] !== undefined) {
                        const toAsset = (assets || []).find(a => a.id === tx.toAssetId);
                        const toCur = toAsset?.currency || currency;
                        const fromCur = (assets || []).find(a => a.id === tx.fromAssetId)?.currency || tx.currency || currency;
                        const destAmount = convertCurrency(rawAmount, fromCur, toCur, exchangeRates);
                        currentBalances[tx.toAssetId] -= destAmount;
                    }
                }
                txIndex++;
            }

            let totalVal = 0;
            (assets || []).forEach(a => {
                const assetCreatedAt = new Date(a.createdAt || new Date().toISOString());
                // Only include this asset's balance if it was created before or during this month
                if (assetCreatedAt <= endOfMonth) {
                    totalVal += convertCurrency(currentBalances[a.id] || 0, a.currency || currency, currency, exchangeRates);
                }
            });
            
            monthlyBalances[i] = {
                key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
                label: monthDate.toLocaleString('en-US', { month: 'short' }),
                value: totalVal,
            };
        }
        
        return monthlyBalances;
    }, [transactions, assets, currentDateKey, currency, exchangeRates]);

    const spendingTx = periodTx.filter(t => t.type === 'spending');
    const incomeTx = periodTx.filter(t => t.type === 'income');
    const totalSpending = spendingTx.reduce((s, t) => s + Math.abs(convertCurrency(t.amount, t.currency || currency, currency, exchangeRates)), 0);
    const totalIncome = incomeTx.reduce((s, t) => s + Math.abs(convertCurrency(t.amount, t.currency || currency, currency, exchangeRates)), 0);
    const netBalance = totalIncome - totalSpending;

    const catGroups = groupByCategory(spendingTx, (t) => convertCurrency(t.amount, t.currency || currency, currency, exchangeRates));
    const categoryData = Object.entries(catGroups)
        .map(([id, data]) => ({ ...getCategoryById(id), id, total: data.total, count: data.count }))
        .sort((a, b) => b.total - a.total);
    const maxCatTotal = categoryData.length > 0 ? categoryData[0].total : 1;

    const incomeSpendingPieData = [
        { label: 'Income', value: totalIncome, color: '#059669' },
        { label: 'Spending', value: totalSpending, color: '#dc2626' },
    ];

    const topCategoryPie = categoryData.slice(0, 5).map(cat => ({
        label: cat.name,
        value: cat.total,
        color: cat.color,
    }));
    const remainingCategoryTotal = categoryData.slice(5).reduce((sum, cat) => sum + cat.total, 0);
    const categoryPieData = remainingCategoryTotal > 0
        ? [...topCategoryPie, { label: 'Other', value: remainingCategoryTotal, color: '#94a3b8' }]
        : topCategoryPie;

    const periodLabel = useMemo(() => {
        if (period === 'all') return 'All time';
        if (period === 'daily') return format(refDate, 'MMM dd, yyyy');
        const { start, end } = getDateRange(period, refDate);
        return `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`;
    }, [period, refDate]);

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
                <Text style={[styles.title, { color: colors.textPrimary }]}>Charts & Analytics</Text>
            </View>

            {/* Period Tabs */}
            <View style={styles.periodTabsWrap}>
                <View style={[styles.periodTabs, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    {['daily', 'weekly', 'monthly', 'all'].map(p => (
                        <TouchableOpacity
                            key={p}
                            style={[styles.periodTab, period === p && [styles.periodTabActive, { backgroundColor: colors.primary, shadowColor: colors.primary }]]}
                            onPress={() => { setPeriod(p); setRefDate(new Date()); }}
                            activeOpacity={0.75}
                        >
                            <Text style={[styles.periodText, { color: colors.textSecondary }, period === p && styles.periodTextActive]}>
                                {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Date Navigator */}
            {period === 'all' ? (
                <View style={styles.allTimeBanner}>
                    <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                    <Text style={[styles.allTimeText, { color: colors.textSecondary }]}>Showing all transactions</Text>
                </View>
            ) : (
                <View style={styles.dateNav}>
                    <TouchableOpacity style={[styles.navArrow, { backgroundColor: colors.primaryLight }]} onPress={() => navigate('prev')}>
                        <Ionicons name="chevron-back" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.dateLabelWrap, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => setShowDateModal(true)}>
                        <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>{periodLabel}</Text>
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.navArrow, { backgroundColor: colors.primaryLight }]} onPress={() => navigate('next')}>
                        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {period === 'all' ? (
                    <>
                        <View style={[styles.chartCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                            <View style={styles.chartCardHeader}>
                                <Ionicons name="trending-up-outline" size={18} color={colors.primary} />
                                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>6-Month Trend</Text>
                            </View>
                            <MonthlyTrendChart data={monthlyTrend} colors={colors} currency={currency} />
                        </View>

                        <View style={[styles.chartCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                            <View style={styles.chartCardHeader}>
                                <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
                                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>Assets Trend</Text>
                            </View>
                            <AssetsTrendChart data={assetsTrend} colors={colors} currency={currency} width={screenWidth} />
                        </View>
                    </>
                ) : (
                    <>
                        <View style={[styles.heroCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>{periodLabel} Overview</Text>
                            <Text style={[styles.heroNet, { color: netBalance >= 0 ? colors.emerald : colors.rose }]}>
                                {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance, currency)}
                            </Text>
                            <Text style={[styles.heroNetLabel, { color: colors.textSecondary }]}>Net Balance</Text>
                            <View style={styles.heroRow}>
                                <View style={styles.heroStat}>
                                    <View style={[styles.heroStatDot, { backgroundColor: colors.emerald }]} />
                                    <View>
                                        <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{formatCurrency(totalIncome, currency)}</Text>
                                        <Text style={[styles.heroStatLabel, { color: colors.textSecondary }]}>Income</Text>
                                    </View>
                                </View>
                                <View style={[styles.heroStatDivider, { backgroundColor: colors.border }]} />
                                <View style={styles.heroStat}>
                                    <View style={[styles.heroStatDot, { backgroundColor: colors.rose }]} />
                                    <View>
                                        <Text style={[styles.heroStatValue, { color: colors.textPrimary }]}>{formatCurrency(totalSpending, currency)}</Text>
                                        <Text style={[styles.heroStatLabel, { color: colors.textSecondary }]}>Spending</Text>
                                    </View>
                                </View>
                            </View>
                        </View>


                        <View style={[styles.chartCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                            <View style={styles.chartCardHeader}>
                                <Ionicons name="bar-chart-outline" size={18} color={colors.primary} />
                                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>Income vs Spending</Text>
                            </View>
                            <View style={styles.pieSection}>
                                <DonutChart
                                    data={[{ label: 'Income', value: totalIncome, color: '#059669' }, { label: 'Spending', value: totalSpending, color: '#dc2626' }]}
                                    centerLabel="Net"
                                    centerValue={`${netBalance >= 0 ? '+' : ''}${formatCurrency(netBalance, currency)}`}
                                    colors={colors}
                                />
                            </View>

                            <View style={[styles.catBars, { borderColor: colors.border, marginBottom: Spacing.md }]}>
                                {[
                                    { id: 'income', name: 'Income', amount: totalIncome, count: incomeTx.length, color: colors.emerald, icon: 'trending-up-outline' },
                                    { id: 'spending', name: 'Spending', amount: totalSpending, count: spendingTx.length, color: colors.rose, icon: 'trending-down-outline' }
                                ].map((item) => {
                                    const totalFlow = totalIncome + totalSpending;
                                    const pct = totalFlow > 0 ? (item.amount / totalFlow * 100) : 0;
                                    return (
                                        <View key={item.id} style={styles.catBarRow}>
                                            <View style={[styles.catBarIconWrap, { backgroundColor: isDark ? `${item.color}33` : `${item.color}14` }]}>
                                                <Ionicons name={item.icon} size={16} color={item.color} />
                                            </View>
                                            <View style={styles.catBarInfo}>
                                                <View style={styles.catBarHeader}>
                                                    <Text style={[styles.catBarName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                                                    <Text style={[styles.catBarAmount, { color: item.color }]}>{formatCurrency(item.amount, currency)}</Text>
                                                </View>
                                                <View style={[styles.catBarTrack, { backgroundColor: colors.border }]}>
                                                    <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                                                </View>
                                                <View style={styles.catBarFooter}>
                                                    <Text style={[styles.catBarCount, { color: colors.textSecondary }]}>{item.count} transaction{item.count !== 1 ? 's' : ''}</Text>
                                                    <Text style={[styles.catBarPct, { color: item.color }]}>{pct.toFixed(1)}%</Text>
                                                </View>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        <View style={styles.statsGrid}>
                            {[
                                { icon: 'swap-horizontal-outline', value: String(periodTx.length), label: 'Transactions', color: colors.primary },
                                { icon: 'grid-outline', value: String(categoryData.length), label: 'Categories', color: '#6A6FF8' },
                                { icon: 'trending-down-outline', value: periodTx.length > 0 ? formatCurrency(totalSpending / Math.max(spendingTx.length, 1), currency) : formatCurrency(0, currency), label: 'Avg Expense', color: colors.rose },
                                { icon: 'analytics-outline', value: `${totalIncome > 0 ? ((totalSpending / totalIncome) * 100).toFixed(0) : 0}%`, label: 'Spend Rate', color: totalIncome > totalSpending ? colors.emerald : colors.rose },
                            ].map((stat, i) => (
                                <View key={i} style={[styles.statCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                                    <View style={[styles.statIconWrap, { backgroundColor: `${stat.color}18` }]}>
                                        <Ionicons name={stat.icon} size={18} color={stat.color} />
                                    </View>
                                    <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={[styles.chartCard, { backgroundColor: colors.card, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                            <View style={styles.chartCardHeader}>
                                <Ionicons name="pie-chart-outline" size={18} color={colors.primary} />
                                <Text style={[styles.chartTitle, { color: colors.textPrimary }]}>Spending by Category</Text>
                            </View>
                            {categoryData.length === 0 ? (
                                <View style={styles.noData}>
                                    <Ionicons name="pie-chart-outline" size={40} color={colors.textSecondary} />
                                    <Text style={[styles.noDataText, { color: colors.textSecondary }]}>No spending data for this period</Text>
                                </View>
                            ) : (
                                <View>
                                    <View style={styles.pieSection}>
                                        <DonutChart data={categoryPieData} centerLabel="Spending" centerValue={formatCurrency(totalSpending, currency)} colors={colors} />
                                    </View>
                                    <View style={[styles.catBars, { borderColor: colors.border }]}>
                                        {categoryData.map((cat) => (
                                            <TouchableOpacity
                                                key={cat.id}
                                                style={styles.catBarRow}
                                                activeOpacity={0.7}
                                                onPress={() => router.push({
                                                    pathname: '/category-transactions',
                                                    params: {
                                                        category: cat.id,
                                                        period: period,
                                                        refDate: refDate.toISOString(),
                                                    }
                                                })}
                                            >
                                                <View style={[styles.catBarIconWrap, { backgroundColor: isDark ? `${cat.color}33` : `${cat.color}14` }]}>
                                                    <Ionicons name={cat.icon} size={16} color={cat.color} />
                                                </View>
                                                <View style={styles.catBarInfo}>
                                                    <View style={styles.catBarHeader}>
                                                        <Text style={[styles.catBarName, { color: colors.textPrimary }]} numberOfLines={1}>{cat.name}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            <Text style={[styles.catBarAmount, { color: cat.color }]}>{formatCurrency(cat.total, currency)}</Text>
                                                            <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
                                                        </View>
                                                    </View>
                                                    <View style={[styles.catBarTrack, { backgroundColor: colors.border }]}>
                                                        <View style={[styles.catBarFill, { width: `${totalSpending > 0 ? (cat.total / totalSpending * 100) : 0}%`, backgroundColor: cat.color }]} />
                                                    </View>
                                                    <View style={styles.catBarFooter}>
                                                        <Text style={[styles.catBarCount, { color: colors.textSecondary }]}>{cat.count} transaction{cat.count > 1 ? 's' : ''}</Text>
                                                        <Text style={[styles.catBarPct, { color: cat.color }]}>{totalSpending > 0 ? ((cat.total / totalSpending) * 100).toFixed(1) : 0}%</Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            )}
                        </View>
                    </>
                )}
                <View style={{ height: 120 }} />
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
    container: { flex: 1, backgroundColor: '#F3F4F6' },

    header: {
        paddingHorizontal: Spacing.lg,
        paddingTop: 60,
        paddingBottom: Spacing.md,
    },
    title: {
        fontSize: FontSize.xxl,
        fontFamily: 'Poppins_800ExtraBold',
        color: '#1A1040',
    },

    periodTabsWrap: {
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    periodTabs: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: BorderRadius.full,
        padding: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.08)',
    },
    periodTab: {
        flex: 1,
        paddingVertical: Spacing.sm,
        alignItems: 'center',
        borderRadius: BorderRadius.full,
    },
    periodTabActive: {
        backgroundColor: '#ff6600',
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 4,
    },
    periodText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#8B7CC8',
    },
    periodTextActive: {
        color: '#fff',
        fontFamily: 'Poppins_700Bold',
    },

    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },

    allTimeBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xs,
        marginBottom: Spacing.sm,
    },
    allTimeText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#8B7CC8',
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
        backgroundColor: 'rgba(255,102,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateLabelWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.8)',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.1)',
    },
    dateLabel: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
        color: '#1A1040',
    },

    // Modal
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
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
        fontSize: FontSize.md,
    },

    // Hero Card
    heroCard: {
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: 22,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: Platform.OS === 'android' ? 0 : 4,
        alignItems: 'center',
    },
    heroLabel: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#8B7CC8',
        marginBottom: 4,
    },
    heroNet: {
        fontSize: 36,
        fontFamily: 'Poppins_800ExtraBold',
        lineHeight: 44,
    },
    heroNetLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
        marginBottom: Spacing.lg,
    },
    heroRow: {
        flexDirection: 'row',
        width: '100%',
    },
    heroStat: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    heroStatDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    heroStatValue: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
    },
    heroStatLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
    },
    heroStatDivider: {
        width: 1,
        backgroundColor: 'rgba(83,96,132,0.12)',
        marginVertical: 4,
    },

    chartCard: {
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: 22,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    chartCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    chartTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
    },
    trendWrap: {
        gap: Spacing.md,
    },
    trendLegend: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.md,
    },
    trendLegendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    trendDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
    },
    trendLegendText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
    },
    trendChart: {
        height: 132,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: Spacing.xs,
    },
    trendMonth: {
        flex: 1,
        alignItems: 'center',
        gap: Spacing.xs,
    },
    trendBars: {
        height: 110,
        width: '100%',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    trendBarPair: {
        height: '100%',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 4,
    },
    trendBar: {
        width: 9,
        borderTopLeftRadius: 5,
        borderTopRightRadius: 5,
    },
    trendLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
    },
    trendTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Spacing.md,
        borderTopWidth: 1,
    },
    trendTotalText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
    },
    trendTotalAmount: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
    },

    pieSection: {
        flexDirection: 'column',
        gap: Spacing.md,
        marginBottom: Spacing.md,
        alignItems: 'center',
    },
    pieLegend: {
        width: '100%',
        gap: Spacing.sm,
    },
    pieLegendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    pieLegendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    pieLegendLabel: {
        flex: 1,
        color: '#4B4570',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
    },
    pieLegendPct: {
        color: '#8B7CC8',
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
    },
    pieLegendAmount: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_700Bold',
    },

    barChartContainer: { gap: Spacing.md },
    barRow: { gap: 6 },
    barLabel: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#4B4570',
    },
    barTrack: {
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(83,96,132,0.1)',
        overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 5 },
    barAmount: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'right',
    },
    netRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderColor: 'rgba(83,96,132,0.09)',
        marginTop: 4,
    },
    netLabel: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
    },
    netAmount: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
    },

    // Stats Grid
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginBottom: Spacing.lg,
        justifyContent: 'center',
    },
    statCard: {
        width: '47.5%',
        backgroundColor: 'rgba(255,255,255,0.88)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: Platform.OS === 'android' ? 0 : 1,
    },
    statIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.sm,
    },
    statValue: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_800ExtraBold',
    },
    statLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
        marginTop: 2,
    },

    // Category charts
    noData: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
    noDataText: {
        color: '#8B7CC8',
        fontSize: FontSize.md,
        fontFamily: 'Poppins_400Regular',
    },
    donutContainer: { gap: Spacing.md, marginBottom: Spacing.lg },
    donutItem: { gap: 4 },
    donutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    donutDot: { width: 8, height: 8, borderRadius: 4 },
    donutName: {
        flex: 1,
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#1A1040',
    },
    donutPct: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
    },
    donutBar: {
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(83,96,132,0.1)',
        overflow: 'hidden',
    },
    donutFill: { height: '100%', borderRadius: 3 },
    donutAmount: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
        textAlign: 'right',
    },
    catBars: {
        gap: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderColor: 'rgba(83,96,132,0.09)',
    },
    catBarRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
    catBarIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    catBarInfo: { flex: 1 },
    catBarHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    catBarName: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_500Medium',
        color: '#1A1040',
        flex: 1,
    },
    catBarAmount: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
    },
    catBarTrack: {
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(83,96,132,0.1)',
        overflow: 'hidden',
    },
    catBarFill: { height: '100%', borderRadius: 3, minWidth: 4 },
    catBarFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
    catBarCount: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
    },
    catBarPct: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
    },
    assetsChartWrap: {
        gap: Spacing.xs,
    },
    assetsChartLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        marginTop: 4,
    },
    assetsChartLabelText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        width: 35,
        textAlign: 'center',
    },
});
