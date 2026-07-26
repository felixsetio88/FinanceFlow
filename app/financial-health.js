import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/currencies';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { chatCompletion, isModelDownloaded } from '../services/localAI';
import { convertCurrency } from '../services/exchangeRates';

// Circular Progress Component
const ScoreGauge = ({ score, colors }) => {
    const size = 180;
    const strokeWidth = 14;
    const center = size / 2;
    const radius = center - strokeWidth;
    const circumference = 2 * Math.PI * radius;
    const progressOffset = circumference - (score / 100) * circumference;

    let scoreColor = '#ef4444'; // Red
    if (score >= 80) scoreColor = '#10b981'; // Green
    else if (score >= 50) scoreColor = '#f59e0b'; // Yellow

    return (
        <View style={styles.gaugeContainer}>
            <Svg width={size} height={size}>
                <G rotation="-90" origin={`${center}, ${center}`}>
                    <Circle
                        cx={center} cy={center} r={radius}
                        stroke={colors.border}
                        strokeWidth={strokeWidth}
                        fill="transparent"
                    />
                    <Circle
                        cx={center} cy={center} r={radius}
                        stroke={scoreColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={progressOffset}
                        strokeLinecap="round"
                        fill="transparent"
                    />
                </G>
                <SvgText
                    x={center} y={center - 10}
                    textAnchor="middle" alignmentBaseline="central"
                    fill={colors.textPrimary}
                    fontSize="42" fontWeight="800" fontFamily="Poppins_800ExtraBold"
                >
                    {score}
                </SvgText>
                <SvgText
                    x={center} y={center + 24}
                    textAnchor="middle" alignmentBaseline="central"
                    fill={colors.textSecondary}
                    fontSize="14" fontWeight="600" fontFamily="Poppins_600SemiBold"
                >
                    / 100
                </SvgText>
            </Svg>
        </View>
    );
};

export default function FinancialHealth() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const { transactions, assets, savingsGoals, budgets, currency, exchangeRates } = useApp();

    const [modelReady, setModelReady] = useState(false);
    const [insight, setInsight] = useState('');
    const [generating, setGenerating] = useState(false);

    const [aiScore, setAiScore] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date());

    useEffect(() => {
        isModelDownloaded().then(ready => setModelReady(ready));
    }, []);

    // Load cached insight for the selected month
    useEffect(() => {
        const loadCache = async () => {
            try {
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const key = `@financeflow_health_${year}_${month}`;
                const cached = await AsyncStorage.getItem(key);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setAiScore(parsed.score);
                    setInsight(parsed.insight);
                } else {
                    setAiScore(null);
                    setInsight('');
                }
            } catch (err) {
                console.warn('Failed to load health cache', err);
            }
        };
        loadCache();
    }, [selectedDate]);

    const handlePrevMonth = () => {
        setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        if (isCurrentMonth) return;
        const now = new Date();
        const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
        if (next > now) return; // don't go to future
        setSelectedDate(next);
    };

    const isCurrentMonth = selectedDate.getFullYear() === new Date().getFullYear() && selectedDate.getMonth() === new Date().getMonth();

    // Calculate metrics
    const metrics = useMemo(() => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();

        // 1. Get live total asset value
        let liquidAssets = assets
            .filter(a => ['bank', 'cash', 'investment'].includes(a.type))
            .reduce((sum, a) => sum + convertCurrency(a.balance, a.currency || currency, currency, exchangeRates), 0);

        const endOfSelectedMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

        // 2. Adjust live assets backwards by reverting future transactions
        transactions.forEach(t => {
            const txTime = new Date(t.date).getTime();
            if (txTime > endOfSelectedMonth) {
                const amt = convertCurrency(t.amount, t.currency || currency, currency, exchangeRates);
                if (t.type === 'income') liquidAssets -= amt;
                if (t.type === 'spending') liquidAssets += amt;
                // 'transfer' does not change total net worth across liquid assets
            }
        });

        const savingsProgress = savingsGoals.reduce((sum, g) => sum + convertCurrency(g.currentAmount || 0, g.currency || currency, currency, exchangeRates), 0);
        const currentSavings = liquidAssets + savingsProgress;

        // Cash flow for selected month
        let monthlyEarning = 0;
        let monthlySpending = 0;
        transactions.forEach(t => {
            const d = new Date(t.date);
            if (d.getFullYear() === year && d.getMonth() === month) {
                const amt = convertCurrency(t.amount, t.currency || currency, currency, exchangeRates);
                if (t.type === 'income') monthlyEarning += amt;
                if (t.type === 'spending') monthlySpending += amt;
            }
        });

        const netSavings = monthlyEarning - monthlySpending;
        const savingRatio = monthlyEarning > 0 ? Math.max(0, (netSavings / monthlyEarning) * 100) : 0;

        // Monthly Budget Total
        const totalBudget = budgets ? budgets.reduce((sum, b) => sum + (b.amount || 0), 0) : 0;

        return {
            currentSavings,
            monthlyEarning,
            monthlySpending,
            savingRatio,
            totalBudget
        };
    }, [transactions, assets, savingsGoals, budgets, selectedDate]);

    const handleGenerateInsight = async () => {
        if (generating) return;
        if (!modelReady) {
            router.push('/settings');
            return;
        }

        // Prevent Fabric touch handler crashes on iOS by delaying state updates slightly
        setTimeout(async () => {
            setGenerating(true);
            setInsight('');
            setAiScore(null);

            const monthName = selectedDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

            const prompt = `You are a financial scoring system. You MUST output EXACTLY two lines.
Line 1: SCORE: [a single number between 0 and 100]
Line 2: ADVICE: [a single short sentence of advice]
Do NOT output any thinking, greetings, markdown, or bullet points.

Data for ${monthName}:
- Assets: ${formatCurrency(metrics.currentSavings, currency)}
- Earned: ${formatCurrency(metrics.monthlyEarning, currency)}
- Spent: ${formatCurrency(metrics.monthlySpending, currency)}
- Budget: ${formatCurrency(metrics.totalBudget, currency)}
- Savings Ratio: ${metrics.savingRatio.toFixed(1)}%`;

            let fullText = '';
            try {
                await chatCompletion([{ role: 'user', content: prompt }], (token) => {
                    fullText += token;
                });

                let finalScore = null;
                let finalAdvice = '';

                // Attempt 1: Strict JSON (just in case it still outputs JSON)
                const jsonMatch = fullText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (typeof parsed.score === 'number') finalScore = parsed.score;
                        if (parsed.advice) finalAdvice = parsed.advice;
                    } catch (e) { }
                }

                // Attempt 2: Strict Labels "SCORE: XX"
                if (finalScore === null) {
                    const scoreMatch = fullText.match(/SCORE\s*[:=|-]?\s*(\d{1,3})/i);
                    if (scoreMatch) finalScore = parseInt(scoreMatch[1], 10);
                }

                // Attempt 3: Look for the word score followed by a number
                if (finalScore === null) {
                    const nearScore = fullText.match(/score.*?(\d{1,3})/i);
                    if (nearScore) finalScore = parseInt(nearScore[1], 10);
                }

                // Attempt 4: Fallback to the largest number found in the text that isn't a list number (1, 2, 3)
                if (finalScore === null) {
                    const numbers = fullText.match(/\b(\d{1,3})\b/g);
                    if (numbers) {
                        const valid = numbers.map(Number).filter(n => n >= 0 && n <= 100 && n > 10);
                        if (valid.length > 0) {
                            finalScore = Math.max(...valid); // Assume the highest valid number is the score
                        }
                    }
                }

                // Extract Advice
                if (!finalAdvice) {
                    const adviceMatch = fullText.match(/ADVICE\s*[:=|-]?\s*([\s\S]*)/i);
                    if (adviceMatch && adviceMatch[1].trim().length > 5) {
                        finalAdvice = adviceMatch[1].trim();
                    } else {
                        // Clean up raw text
                        let cleaned = fullText
                            .replace(/\*+/g, '') // remove markdown bold/italics
                            .replace(/SCORE\s*[:=|-]?\s*\d{1,3}/i, '') // remove score line
                            .replace(/#+/g, '') // remove headings
                            .replace(/- /g, '') // remove bullet points
                            .replace(/^\d+\.\s.*$/gm, '') // remove numbered lists like "1. Evaluate metrics"
                            .replace(/evaluate.*metrics/i, '')
                            .trim();
                        finalAdvice = cleaned || "Keep building your financial foundation.";
                    }
                }

                setAiScore(finalScore !== null ? Math.max(0, Math.min(100, finalScore)) : 50); // fallback to 50 if totally failed
                setInsight(finalAdvice);

                // Cache the result
                try {
                    const cacheYear = selectedDate.getFullYear();
                    const cacheMonth = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    await AsyncStorage.setItem(`@financeflow_health_${cacheYear}_${cacheMonth}`, JSON.stringify({
                        score: finalScore !== null ? Math.max(0, Math.min(100, finalScore)) : 50,
                        insight: finalAdvice
                    }));
                } catch (e) { }

            } catch (error) {
                setInsight("Unable to generate insight right now. Please ensure the AI model is ready in Settings.");
            } finally {
                setGenerating(false);
            }
        }, 50);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[
                        styles.backBtn,
                        {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            borderWidth: 1,
                        },
                    ]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Financial Health</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Month Selector */}
                <View style={[styles.monthSelector, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <TouchableOpacity onPress={handlePrevMonth} style={styles.monthBtn}>
                        <Ionicons name="chevron-back" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={[styles.monthText, { color: colors.textPrimary }]}>
                        {selectedDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                        onPress={handleNextMonth}
                        style={styles.monthBtn}
                    >
                        <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? colors.border : colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Gauge Section */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <ScoreGauge score={aiScore ?? 0} colors={colors} />
                    <Text style={[styles.gaugeDesc, { color: colors.textSecondary }]}>
                        {aiScore === null
                            ? "Tap Analyze to let AI determine your score!"
                            : aiScore >= 80 ? "Excellent! Your finances are in great shape."
                                : aiScore >= 50 ? "Good work! You have a solid foundation."
                                    : "Needs Attention. Let's work on improving your habits."}
                    </Text>
                </View>

                {/* Metrics */}
                <View style={[styles.metricsGrid]}>
                    <View style={[styles.metricBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.iconWrap, { backgroundColor: 'rgba(5, 150, 105, 0.1)' }]}>
                            <Ionicons name="wallet" size={20} color="#059669" />
                        </View>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Total Assets</Text>
                        <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{formatCurrency(metrics.currentSavings, currency)}</Text>
                    </View>

                    <View style={[styles.metricBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[styles.iconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                            <Ionicons name="pie-chart" size={20} color="#3b82f6" />
                        </View>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Savings Ratio</Text>
                        <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{metrics.savingRatio.toFixed(1)}%</Text>
                    </View>
                </View>

                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.rowBetween}>
                        <View style={styles.flowRow}>
                            <View style={[styles.flowDot, { backgroundColor: '#10b981' }]} />
                            <Text style={[styles.flowLabel, { color: colors.textSecondary }]}>Earned</Text>
                            <Text style={[styles.flowValue, { color: colors.textPrimary }]}>{formatCurrency(metrics.monthlyEarning, currency)}</Text>
                        </View>
                        <View style={styles.flowRow}>
                            <View style={[styles.flowDot, { backgroundColor: '#ef4444' }]} />
                            <Text style={[styles.flowLabel, { color: colors.textSecondary }]}>Spent</Text>
                            <Text style={[styles.flowValue, { color: colors.textPrimary }]}>{formatCurrency(metrics.monthlySpending, currency)}</Text>
                        </View>
                        <View style={styles.flowRow}>
                            <View style={[styles.flowDot, { backgroundColor: '#f59e0b' }]} />
                            <Text style={[styles.flowLabel, { color: colors.textSecondary }]}>Budget</Text>
                            <Text style={[styles.flowValue, { color: colors.textPrimary }]}>{formatCurrency(metrics.totalBudget, currency)}</Text>
                        </View>
                    </View>
                </View>

                {/* AI Insights Section */}
                <View style={[styles.aiSection, { backgroundColor: isDark ? 'rgba(83,96,132,0.1)' : 'rgba(255,102,0,0.05)', borderColor: colors.border }]}>
                    <View style={styles.aiHeader}>
                        <Ionicons name="sparkles" size={20} color={colors.primary} />
                        <Text style={[styles.aiTitle, { color: colors.textPrimary }]}>AI Financial Advisor</Text>
                    </View>

                    {insight ? (
                        <View style={styles.insightBox}>
                            <Text style={[styles.insightText, { color: colors.textPrimary }]}>{insight}</Text>
                            <TouchableOpacity
                                style={{ marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }}
                                onPress={handleGenerateInsight}
                                disabled={generating}
                            >
                                {generating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={16} color={colors.primary} />}
                                <Text style={{ color: colors.primary, fontFamily: 'Poppins_500Medium', fontSize: 13 }}>
                                    {generating ? 'Regenerating...' : 'Regenerate Insight'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.emptyAiBox}>
                            <Text style={[styles.emptyAiText, { color: colors.textSecondary }]}>
                                Get personalized, AI-driven advice on how to improve your financial health score.
                            </Text>
                            <TouchableOpacity
                                style={[styles.aiBtn, { backgroundColor: colors.primary, opacity: generating ? 0.7 : 1 }]}
                                onPress={handleGenerateInsight}
                            >
                                {generating ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Ionicons name={modelReady ? "flash" : "download"} size={18} color="#fff" />
                                )}
                                <Text style={styles.aiBtnText}>
                                    {generating ? 'Analyzing...' : modelReady ? 'Analyze My Health' : 'Download AI Model'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: "rgba(83,96,132,0.2)",
        alignSelf: "center",
        marginTop: Spacing.md,
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
    scrollContent: { padding: Spacing.lg },

    monthSelector: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: Spacing.sm, borderRadius: BorderRadius.full, borderWidth: 1,
        marginBottom: Spacing.lg,
    },
    monthBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    monthText: { fontSize: FontSize.md, fontFamily: 'Poppins_600SemiBold' },

    card: {
        borderRadius: 24, borderWidth: 1,
        padding: Spacing.xl,
        marginBottom: Spacing.md,
        alignItems: 'center',
    },
    gaugeContainer: { alignItems: 'center', marginVertical: Spacing.sm },
    gaugeDesc: {
        fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium',
        textAlign: 'center', marginTop: Spacing.md, lineHeight: 20
    },

    metricsGrid: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
    metricBox: {
        flex: 1, borderRadius: 24, borderWidth: 1,
        padding: Spacing.lg, alignItems: 'center', justifyContent: 'center',
    },
    iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
    metricLabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_500Medium', marginBottom: 2 },
    metricValue: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },

    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: Spacing.sm },
    flowRow: { alignItems: 'center' },
    flowDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
    flowLabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_500Medium', marginBottom: 2 },
    flowValue: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },

    aiSection: {
        borderRadius: 24, borderWidth: 1, padding: Spacing.xl, marginTop: Spacing.sm,
    },
    aiHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    aiTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    emptyAiBox: { alignItems: 'flex-start' },
    emptyAiText: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', lineHeight: 22, marginBottom: Spacing.md },
    aiBtn: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingHorizontal: Spacing.lg, paddingVertical: 12, borderRadius: BorderRadius.full,
    },
    aiBtnText: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    insightBox: { backgroundColor: 'rgba(0,0,0,0.03)', padding: Spacing.md, borderRadius: BorderRadius.md },
    insightText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', lineHeight: 24 }
});
