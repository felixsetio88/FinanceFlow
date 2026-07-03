import React, { useEffect, useMemo, useState } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    StyleSheet, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect, Polyline } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/currencies';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const PLANNER_INPUTS_KEY = '@financeflow_financial_freedom_inputs_v1';

// ─── helpers ────────────────────────────────────────────────────────────────

function parseNumber(value) {
    const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value) {
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(1).replace(/\.0$/, '');
}

function addMonths(date, months) {
    const copy = new Date(date.getTime());
    copy.setMonth(copy.getMonth() + months);
    return copy;
}

function monthsToLabel(months) {
    if (!Number.isFinite(months) || months < 0) return '∞';
    const y = Math.floor(months / 12);
    const m = Math.round(months % 12);
    if (y === 0) return `${m}mo`;
    if (m === 0) return `${y}yr`;
    return `${y}yr ${m}mo`;
}

// ─── core calculation ────────────────────────────────────────────────────────

function calcFI({ current, monthlySave, monthlySpend, annualReturnPct, inflationPct, swrPct }) {
    if (monthlySpend <= 0 || swrPct <= 0) return { status: 'incomplete' };

    const target = (monthlySpend * 12) / (swrPct / 100);
    const realAnnualRate = (1 + annualReturnPct / 100) / (1 + inflationPct / 100) - 1;
    const monthlyRate = Math.pow(1 + realAnnualRate, 1 / 12) - 1;
    const progress = Math.max(0, Math.min(100, (current / target) * 100));

    if (current >= target) return { status: 'reached', target, months: 0, realAnnualRate, progress: 100 };
    if (monthlySave <= 0) return { status: 'unreachable', target, realAnnualRate, progress };

    let months;
    if (Math.abs(monthlyRate) < 1e-9) {
        months = (target - current) / monthlySave;
    } else {
        const num = target * monthlyRate + monthlySave;
        const den = current * monthlyRate + monthlySave;
        months = (num > 0 && den > 0) ? Math.log(num / den) / Math.log(1 + monthlyRate) : NaN;
    }

    if (!Number.isFinite(months) || months < 0) return { status: 'unreachable', target, realAnnualRate, progress };
    return { status: 'ok', target, months, realAnnualRate, progress };
}

// Coast FI: amount needed today so compounding alone reaches target by retirement age.
function calcCoastFI({ current, target, realAnnualRate, yearsToRetirement = 30 }) {
    if (!target || !Number.isFinite(realAnnualRate) || yearsToRetirement <= 0) return null;
    const coastTarget = target / Math.pow(1 + realAnnualRate, yearsToRetirement);
    return { coastTarget, reached: current >= coastTarget, yearsToRetirement };
}

// Build portfolio growth series (real inflation-adjusted values, capped at 480 months)
function buildGrowthSeries({ current, monthlySave, monthlyRate, months }) {
    const n = Math.min(Math.ceil(months) + 1, 480);
    let v = current;
    const pts = [];
    for (let i = 0; i <= n; i++) {
        pts.push(v);
        v = v * (1 + monthlyRate) + monthlySave;
    }
    return pts;
}

// ─── mini sparkline chart (no external lib) ──────────────────────────────────

function GrowthChart({ series, target, color, width }) {
    if (!series || series.length < 2) return null;

    const height = 110;
    const padL = 6;
    const padR = 6;
    const padT = 10;
    const padB = 10;
    const w = width - padL - padR;
    const h = height - padT - padB;

    const maxY = Math.max(...series, target * 1.05);
    const minY = 0;
    const scaleX = (i) => padL + (i / (series.length - 1)) * w;
    const scaleY = (v) => padT + h - ((v - minY) / (maxY - minY)) * h;

    const points = series.map((v, i) => `${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(' ');

    // target dashed line — draw as short segments to simulate dashes
    const targetY = scaleY(target).toFixed(1);
    const dashSegments = [];
    for (let x = padL; x < padL + w; x += 14) {
        const x2 = Math.min(x + 7, padL + w);
        dashSegments.push(`${x.toFixed(1)},${targetY} ${x2.toFixed(1)},${targetY}`);
    }

    return (
        <Svg width={width} height={height}>
            {/* target dashed line */}
            {dashSegments.map((seg, i) => (
                <Polyline key={i} points={seg} stroke="#059669" strokeWidth="1.5" fill="none" />
            ))}
            {/* portfolio line */}
            <Polyline points={points} stroke={color} strokeWidth="2" fill="none" />
        </Svg>
    );
}

// ─── sensitivity row ─────────────────────────────────────────────────────────

function SensitivityRow({ label, baseMonths, newMonths, colors }) {
    const diff = Number.isFinite(baseMonths) && Number.isFinite(newMonths)
        ? Math.round(baseMonths - newMonths) : null;

    const diffLabel = diff === null ? '—'
        : diff > 0 ? `${monthsToLabel(diff)} sooner`
        : diff < 0 ? `${monthsToLabel(-diff)} later`
        : 'No change';

    const diffColor = diff === null ? colors.textMuted
        : diff > 0 ? colors.emerald
        : diff < 0 ? '#E85D3B'
        : colors.textMuted;

    return (
        <View style={styles.sensRow}>
            <Text style={[styles.sensLabel, { color: colors.textSecondary }]}>{label}</Text>
            <View style={styles.sensRight}>
                <Text style={[styles.sensTime, { color: colors.textPrimary }]}>{monthsToLabel(newMonths)}</Text>
                <Text style={[styles.sensDiff, { color: diffColor }]}>{diffLabel}</Text>
            </View>
        </View>
    );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function FinancialFreedom() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { currency } = useApp();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // inputs
    const [currentSavings, setCurrentSavings] = useState('');
    const [monthlySavings, setMonthlySavings] = useState('');
    const [monthlySpending, setMonthlySpending] = useState('');
    const [retirementSpending, setRetirementSpending] = useState('');
    const [annualReturn, setAnnualReturn] = useState('7');
    const [inflation, setInflation] = useState('3');
    const [withdrawalRate, setWithdrawalRate] = useState('4');
    const [currentAge, setCurrentAge] = useState('35');
    const [retirementAge, setRetirementAge] = useState('65');

    useEffect(() => {
        AsyncStorage.getItem(PLANNER_INPUTS_KEY).then((raw) => {
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved.currentSavings != null) setCurrentSavings(String(saved.currentSavings));
            if (saved.monthlySavings != null) setMonthlySavings(String(saved.monthlySavings));
            if (saved.monthlySpending != null) setMonthlySpending(String(saved.monthlySpending));
            if (saved.retirementSpending != null) setRetirementSpending(String(saved.retirementSpending));
            if (saved.annualReturn != null) setAnnualReturn(String(saved.annualReturn));
            if (saved.inflation != null) setInflation(String(saved.inflation));
            if (saved.withdrawalRate != null) setWithdrawalRate(String(saved.withdrawalRate));
            if (saved.currentAge != null) setCurrentAge(String(saved.currentAge));
            if (saved.retirementAge != null) setRetirementAge(String(saved.retirementAge));
        }).catch(() => {});
    }, []);

    useEffect(() => {
        AsyncStorage.setItem(PLANNER_INPUTS_KEY, JSON.stringify({
            currentSavings,
            monthlySavings,
            monthlySpending,
            retirementSpending,
            annualReturn,
            inflation,
            withdrawalRate,
            currentAge,
            retirementAge,
        })).catch(() => {});
    }, [currentSavings, monthlySavings, monthlySpending, retirementSpending, annualReturn, inflation, withdrawalRate, currentAge, retirementAge]);

    // ── derived values ──────────────────────────────────────────────────────

    const inputs = useMemo(() => ({
        current: parseNumber(currentSavings),
        monthlySave: parseNumber(monthlySavings),
        // retirement spending falls back to current spending if blank
        monthlySpend: parseNumber(retirementSpending) || parseNumber(monthlySpending),
        annualReturnPct: parseNumber(annualReturn),
        inflationPct: parseNumber(inflation),
        swrPct: parseNumber(withdrawalRate),
        currentAge: parseNumber(currentAge),
        retirementAge: parseNumber(retirementAge),
    }), [currentSavings, monthlySavings, monthlySpending, retirementSpending, annualReturn, inflation, withdrawalRate, currentAge, retirementAge]);

    const results = useMemo(() => calcFI(inputs), [inputs]);

    const coastFI = useMemo(() => {
        if (results.status === 'incomplete') return null;
        return calcCoastFI({
            current: inputs.current,
            target: results.target,
            realAnnualRate: results.realAnnualRate,
            yearsToRetirement: Math.max(0, inputs.retirementAge - inputs.currentAge),
        });
    }, [results, inputs.current, inputs.currentAge, inputs.retirementAge]);

    const growthSeries = useMemo(() => {
        if (results.status === 'incomplete' || results.status === 'unreachable') return null;
        const monthlyRate = Math.pow(1 + results.realAnnualRate, 1 / 12) - 1;
        return buildGrowthSeries({
            current: inputs.current,
            monthlySave: inputs.monthlySave,
            monthlyRate,
            months: results.months,
        });
    }, [results, inputs]);

    // Sensitivity: compute months for small tweaks
    const sensitivityCases = useMemo(() => {
        if (results.status === 'incomplete') return [];
        const base = results.months ?? Infinity;

        const run = (overrides) => {
            const r = calcFI({ ...inputs, ...overrides });
            return r.months ?? Infinity;
        };

        return [
            { label: `Save ${formatCurrency(500, currency)} more/mo`, months: run({ monthlySave: inputs.monthlySave + 500 }) },
            { label: `Spend ${formatCurrency(300, currency)} less/mo`, months: run({ monthlySpend: Math.max(0, inputs.monthlySpend - 300) }) },
            { label: 'Return +1%', months: run({ annualReturnPct: inputs.annualReturnPct + 1 }) },
            { label: '3.5% withdrawal rate', months: run({ swrPct: 3.5 }) },
        ].map(c => ({ ...c, baseMonths: base }));
    }, [results, inputs, currency]);

    // ── milestone helpers ───────────────────────────────────────────────────

    const milestones = useMemo(() => {
        if (!results.target) return [];
        return [
            { pct: 25, label: formatCurrency(results.target * 0.25, currency) },
            { pct: 50, label: formatCurrency(results.target * 0.5, currency) },
            { pct: 75, label: formatCurrency(results.target * 0.75, currency) },
            { pct: 100, label: 'FI 🎯' },
        ];
    }, [results.target, currency]);

    // ── render helpers ──────────────────────────────────────────────────────

    const chartWidth = screenWidth - Spacing.lg * 2 - Spacing.md * 2;

    const renderProgress = () => {
        if (results.status === 'incomplete') return null;
        const pct = results.progress ?? 0;

        return (
            <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                    <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Progress to FI</Text>
                    <Text style={[styles.progressValue, { color: colors.primary }]}>{formatPercent(pct)}%</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: colors.inputBg }]}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                </View>
                <View style={styles.milestoneRow}>
                    {milestones.map((ms) => {
                        const reached = pct >= ms.pct;
                        return (
                            <View
                                key={ms.pct}
                                style={[
                                    styles.milestoneChip,
                                    {
                                        backgroundColor: reached ? 'rgba(5,150,105,0.12)' : colors.inputBg,
                                        borderColor: reached ? '#059669' : colors.border,
                                    },
                                ]}
                            >
                                <Text style={[styles.milestonePct, { color: reached ? '#059669' : colors.textMuted }]}>
                                    {ms.pct}%
                                </Text>
                                <Text style={[styles.milestoneLabel, { color: reached ? '#059669' : colors.textMuted }]} numberOfLines={1}>
                                    {ms.label}
                                </Text>
                            </View>
                        );
                    })}
                </View>
            </View>
        );
    };

    const renderCoastFI = () => {
        if (!coastFI) return null;
        return (
            <View style={[styles.coastBox, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '10' }]}>
                <View style={styles.coastHeader}>
                    <Ionicons name="boat-outline" size={14} color={colors.primary} />
                    <Text style={[styles.coastTitle, { color: colors.primary }]}>  Coast FI</Text>
                </View>
                {coastFI.reached ? (
                    <Text style={[styles.coastBody, { color: colors.textSecondary }]}>
                        ✓ You've reached Coast FI! Compounding alone can carry your portfolio to FI in about {Math.round(coastFI.yearsToRetirement)} years — even if you stop contributing now.
                    </Text>
                ) : (
                    <Text style={[styles.coastBody, { color: colors.textSecondary }]}>
                        Need{' '}
                        <Text style={{ color: colors.primary, fontFamily: 'Poppins_700Bold' }}>
                            {formatCurrency(coastFI.coastTarget, currency)}
                        </Text>
                        {' '}({formatCurrency(Math.max(0, coastFI.coastTarget - inputs.current), currency)} away). Once reached, growth alone can get you to FI by age {inputs.retirementAge || 65} — no more contributions needed.
                    </Text>
                )}
            </View>
        );
    };

    const renderResults = () => {
        if (results.status === 'incomplete') {
            return (
                <Text style={[styles.helperText, { color: colors.textMuted }]}>
                    Fill in retirement spending and withdrawal rate to see your estimate.
                </Text>
            );
        }

        const months = Math.max(0, Math.round(results.months || 0));
        const years = Math.floor(months / 12);
        const monthsLeft = months % 12;
        const etaDate = addMonths(new Date(), months);
        const annualIncome = inputs.monthlySpend * 12;

        return (
            <View>
                {/* primary metric */}
                <Text style={[styles.resultTitle, { color: colors.textSecondary }]}>FI target portfolio</Text>
                <Text style={[styles.resultValue, { color: colors.primary }]}>
                    {formatCurrency(results.target || 0, currency)}
                </Text>
                <Text style={[styles.resultSubtitle, { color: colors.textMuted }]}>
                    at {formatPercent(parseNumber(withdrawalRate))}% withdrawal = {formatCurrency(annualIncome, currency)}/yr income
                </Text>

                {/* time grid */}
                {results.status === 'ok' && (
                    <View style={styles.resultGrid}>
                        <View style={[styles.resultChip, { backgroundColor: colors.inputBg }]}>
                            <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>Time to FI</Text>
                            <Text style={[styles.chipValue, { color: colors.textPrimary }]}>
                                {years > 0 ? `${years}yr ` : ''}{monthsLeft}mo
                            </Text>
                        </View>
                        <View style={[styles.resultChip, { backgroundColor: colors.inputBg }]}>
                            <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>Est. date</Text>
                            <Text style={[styles.chipValue, { color: colors.textPrimary }]}>
                                {etaDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                            </Text>
                        </View>
                        <View style={[styles.resultChip, { backgroundColor: colors.inputBg }]}>
                            <Text style={[styles.chipLabel, { color: colors.textSecondary }]}>Real return</Text>
                            <Text style={[styles.chipValue, { color: colors.emerald }]}>
                                {formatPercent((results.realAnnualRate || 0) * 100)}%
                            </Text>
                        </View>
                    </View>
                )}

                {results.status === 'unreachable' && (
                    <View style={[styles.warnBox, { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' }]}>
                        <Text style={[styles.warnText, { color: colors.textSecondary }]}>
                            At current savings rate, you will not reach FI. Increase monthly savings, reduce retirement spending, or raise your expected return.
                        </Text>
                    </View>
                )}

                {renderProgress()}
                {renderCoastFI()}
            </View>
        );
    };

    // ── main render ─────────────────────────────────────────────────────────

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight}>
                <Defs>
                    <SvgGrad id="bgGrad" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGrad)" />
            </Svg>

            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Financial Freedom</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
                        contentInsetAdjustmentBehavior="automatic">

                {/* ── INPUTS ── */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Numbers</Text>
                    <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>All values in {currency}.</Text>

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Current savings / investments</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                        value={currentSavings}
                        onChangeText={setCurrentSavings}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                    />

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Monthly savings (contributions)</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                        value={monthlySavings}
                        onChangeText={setMonthlySavings}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                    />

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Current monthly spending</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                        value={monthlySpending}
                        onChangeText={setMonthlySpending}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                    />

                    <Text style={[styles.label, { color: colors.textSecondary }]}>
                        Retirement monthly spending{' '}
                        <Text style={{ color: colors.textMuted, fontFamily: 'Poppins_400Regular' }}>(leave blank to use above)</Text>
                    </Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                        value={retirementSpending}
                        onChangeText={setRetirementSpending}
                        placeholder={monthlySpending || '0'}
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                    />
                </View>

                {/* ── ASSUMPTIONS ── */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assumptions</Text>
                    <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>Adjust to match your expectations.</Text>

                    <View style={styles.inputRow}>
                        <View style={styles.inputHalf}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Annual return (%)</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                                value={annualReturn}
                                onChangeText={setAnnualReturn}
                                placeholder="7"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={styles.inputHalf}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Inflation (%)</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                                value={inflation}
                                onChangeText={setInflation}
                                placeholder="3"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>

                    <Text style={[styles.label, { color: colors.textSecondary }]}>Safe withdrawal rate (%)</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                        value={withdrawalRate}
                        onChangeText={setWithdrawalRate}
                        placeholder="4"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                    />

                    <View style={styles.inputRow}>
                        <View style={styles.inputHalf}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Current age</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                                value={currentAge}
                                onChangeText={setCurrentAge}
                                placeholder="35"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                            />
                        </View>
                        <View style={styles.inputHalf}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Retirement age</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                                value={retirementAge}
                                onChangeText={setRetirementAge}
                                placeholder="65"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>

                    {results.status !== 'incomplete' && (
                        <View style={styles.assumptionRow}>
                            <Text style={[styles.assumptionLabel, { color: colors.textSecondary }]}>Real annual return</Text>
                            <Text style={[styles.assumptionValue, { color: colors.emerald }]}>
                                {formatPercent((results.realAnnualRate || 0) * 100)}%
                            </Text>
                        </View>
                    )}
                </View>

                {/* ── RESULTS ── */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Results</Text>
                    {renderResults()}
                </View>

                {/* ── GROWTH CHART ── */}
                {growthSeries && (
                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Growth Projection</Text>
                        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
                            Real (inflation-adjusted) portfolio value over time. Green dashed = FI target.
                        </Text>
                        <View style={{ marginTop: Spacing.sm }}>
                            <GrowthChart
                                series={growthSeries}
                                target={results.target}
                                color={colors.primary}
                                width={chartWidth}
                            />
                        </View>
                        <View style={styles.chartLegend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendLine, { backgroundColor: colors.primary }]} />
                                <Text style={[styles.legendText, { color: colors.textMuted }]}>Portfolio</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDash, { backgroundColor: colors.emerald }]} />
                                <Text style={[styles.legendText, { color: colors.textMuted }]}>FI target</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* ── SENSITIVITY ── */}
                {sensitivityCases.length > 0 && (
                    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>What-If Scenarios</Text>
                        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
                            Small changes, big impact on your timeline.
                        </Text>
                        <View style={[styles.sensHeader, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.sensHeaderText, { color: colors.textMuted }]}>Scenario</Text>
                            <Text style={[styles.sensHeaderText, { color: colors.textMuted, textAlign: 'right' }]}>Change</Text>
                        </View>
                        {sensitivityCases.map((c) => (
                            <SensitivityRow
                                key={c.label}
                                label={c.label}
                                baseMonths={c.baseMonths}
                                newMonths={c.months}
                                colors={colors}
                            />
                        ))}
                    </View>
                )}

                {/* ── HOW IT WORKS ── */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>How It Works</Text>
                    <Text style={[styles.helperText, { color: colors.textMuted }]}>
                        <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>FI Target</Text>
                        {' '}— Based on the Trinity Study (1998): a portfolio of 25× your annual spending has historically sustained 30+ years of withdrawals at a 4% rate.{'\n\n'}
                        <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>Coast FI</Text>
                        {' '}— The point where compounding alone carries your portfolio to the FI target by retirement (~age 65), even without further contributions.{'\n\n'}
                        <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>Real return</Text>
                        {' '}— Nominal return minus inflation, using the Fisher equation. All projections are in today's purchasing power.
                    </Text>
                </View>

            </ScrollView>
        </View>
    );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1 },
    handle: {
        width: 36, height: 4, borderRadius: 2,
        alignSelf: 'center', marginTop: Spacing.md,
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: FontSize.xl, fontFamily: 'Poppins_800ExtraBold' },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Platform.OS === 'android' ? 90 : 60 },
    card: {
        marginTop: Spacing.md,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
    },
    sectionTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    sectionHint: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    label: {
        fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold',
        marginTop: Spacing.md, marginBottom: Spacing.xs,
    },
    input: {
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
        fontSize: FontSize.md, fontFamily: 'Poppins_400Regular',
        borderWidth: 1,
    },
    inputRow: { flexDirection: 'row', gap: Spacing.sm },
    inputHalf: { flex: 1 },

    // assumptions
    assumptionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
    assumptionLabel: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    assumptionValue: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },

    // results
    resultTitle: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', marginTop: Spacing.sm },
    resultValue: { fontSize: FontSize.xl, fontFamily: 'Poppins_800ExtraBold', marginTop: 4 },
    resultSubtitle: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    resultGrid: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
    resultChip: { flex: 1, borderRadius: BorderRadius.md, padding: Spacing.sm },
    chipLabel: { fontSize: 10, fontFamily: 'Poppins_500Medium' },
    chipValue: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold', marginTop: 2 },

    // warn
    warnBox: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.md },
    warnText: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', lineHeight: 18 },

    // progress
    progressSection: { marginTop: Spacing.md },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressLabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_500Medium' },
    progressValue: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 4 },
    milestoneRow: { flexDirection: 'row', gap: 6, marginTop: Spacing.sm },
    milestoneChip: {
        flex: 1, borderRadius: BorderRadius.md, borderWidth: 1,
        paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center',
    },
    milestonePct: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
    milestoneLabel: { fontSize: 9, fontFamily: 'Poppins_400Regular', marginTop: 1, textAlign: 'center' },

    // coast FI
    coastBox: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.md },
    coastHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    coastTitle: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    coastBody: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', lineHeight: 18 },

    // chart
    chartLegend: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendLine: { width: 16, height: 2, borderRadius: 1 },
    legendDash: { width: 16, height: 2, borderRadius: 1, opacity: 0.6 },
    legendText: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular' },

    // sensitivity
    sensHeader: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingBottom: 6, borderBottomWidth: 1, marginTop: Spacing.sm,
    },
    sensHeaderText: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
    sensRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,102,0,0.08)',
    },
    sensLabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', flex: 1 },
    sensRight: { alignItems: 'flex-end' },
    sensTime: { fontSize: FontSize.xs, fontFamily: 'Poppins_700Bold' },
    sensDiff: { fontSize: 10, fontFamily: 'Poppins_500Medium', marginTop: 1 },

    // misc
    helperText: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginTop: Spacing.sm, lineHeight: 20 },
    emerald: { color: '#059669' },
});
