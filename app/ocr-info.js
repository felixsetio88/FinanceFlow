import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Platform,
    useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function OCRInfoScreen() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const [expandedCards, setExpandedCards] = useState({});

    const toggleCard = (index) => {
        setExpandedCards(prev => ({
            ...prev,
            [index]: !prev[index],
        }));
    };

    const QA_LIST = [
        {
            id: 0,
            question: "What is On-Device OCR?",
            category: "Basics",
            categoryColor: "#F59E0B",
            icon: "eye-outline",
            shortAnswer: "Optical Character Recognition running directly on your phone's native hardware without internet.",
            fullAnswer: [
                "OCR stands for Optical Character Recognition. It is a computer vision technology that detects and extracts printed alphanumeric characters from photos.",
                "In FinanceFlow, Instant Scan uses native on-device frameworks (Apple Vision framework on iOS and Google ML Kit on Android). Your receipt is never uploaded to any remote server or external cloud.",
            ],
            points: [
                { title: "Lightning Fast", desc: "Extracts text in under 1 second without waiting for cloud queues.", icon: "flash" },
                { title: "100% Private", desc: "All receipt data and prices stay strictly on your phone.", icon: "lock-closed" },
                { title: "Works Offline", desc: "Scan receipts even in airplane mode or areas without cellular signal.", icon: "cloud-offline" },
            ],
        },
        {
            id: 1,
            question: "How does the feature work in FinanceFlow?",
            category: "Architecture",
            categoryColor: "#059669",
            icon: "cog-outline",
            shortAnswer: "3-step pipeline: Text Recognition → Geometric Line Reconstruction → Smart Regex Parsing.",
            fullAnswer: [
                "FinanceFlow's OCR pipeline transforms a raw photograph into structured transaction data through three deterministic phases:",
            ],
            steps: [
                {
                    num: "1",
                    title: "Hardware Vision Extraction",
                    desc: "The camera captures text bounding boxes with pixel coordinates and confidence scores directly from iOS/Android hardware.",
                },
                {
                    num: "2",
                    title: "Adaptive Line Reconstruction",
                    desc: "Our geometric engine computes horizontal alignment, detects tilt angles, and merges multi-column item names, quantities, and prices.",
                },
                {
                    num: "3",
                    title: "Deterministic Financial Parser",
                    desc: "Recognizes store brands, transaction dates, taxable amounts, taxes (SST, GST, VAT), service fees, and grand totals.",
                },
            ],
        },
        {
            id: 2,
            question: "Instant Scan (OCR) vs. AI Vision Scan: What is the difference?",
            category: "Comparison",
            categoryColor: "#6366F1",
            icon: "git-compare-outline",
            shortAnswer: "Instant Scan prioritizes raw speed and offline privacy; AI Vision excels at complex or degraded receipts.",
            comparison: [
                {
                    feature: "Scan Speed",
                    ocr: "⚡ < 1 Second (Instant)",
                    ai: "⏳ 3 – 8 Seconds",
                },
                {
                    feature: "Internet Required",
                    ocr: "❌ No (100% Offline)",
                    ai: "Depends on model mode",
                },
                {
                    feature: "Receipt Type",
                    ocr: "Standard printed receipts",
                    ai: "Handwritten & complex layouts",
                },
                {
                    feature: "Battery & CPU",
                    ocr: "Near-zero consumption",
                    ai: "Higher compute usage",
                },
                {
                    feature: "Handling Faded Ink",
                    ocr: "Requires legible contrast",
                    ai: "High contextual tolerance",
                },
            ],
        },
        {
            id: 3,
            question: "What are the limitations of on-device OCR?",
            category: "Limitations",
            categoryColor: "#EF4444",
            icon: "alert-circle-outline",
            shortAnswer: "OCR relies on visual clarity of printed characters and layout regularity.",
            fullAnswer: [
                "Because on-device OCR processes exact visual glyphs rather than inferring context like a large generative AI model, it has certain physical constraints:",
            ],
            limitations: [
                {
                    title: "Faded Thermal Paper",
                    desc: "Thermal receipts exposed to heat or sunlight can fade to light gray. The camera might miss low-contrast digits or confuse '0' with '8'.",
                    icon: "sunny-outline",
                },
                {
                    title: "Creases, Wrinkles & Folds",
                    desc: "Crumpled paper distorts line paths, causing numbers on the right side of the receipt to shift vertically relative to item names.",
                    icon: "document-text-outline",
                },
                {
                    title: "Camera Flash & Surface Glare",
                    desc: "Direct flash on glossy thermal paper produces white hot-spots that wash out printed text completely.",
                    icon: "flash-off-outline",
                },
                {
                    title: "Handwritten Additions",
                    desc: "Handwritten tips, waiter notes, or signatures cannot be parsed reliably by standard OCR.",
                    icon: "create-outline",
                },
            ],
        },
        {
            id: 4,
            question: "How do I get the most accurate scan results?",
            category: "Pro Tips",
            categoryColor: "#10B981",
            icon: "shield-checkmark-outline",
            shortAnswer: "Follow these 5 simple tips for 99%+ accuracy every single time.",
            proTips: [
                {
                    num: "1",
                    title: "Flatten the Paper",
                    tip: "Smooth out any sharp folds or creases before snapping the photo. Place it flat on a table.",
                    color: "#059669",
                },
                {
                    num: "2",
                    title: "Use Diffused Lighting",
                    tip: "Turn off camera flash. Natural room light or overhead light without harsh shadows works best.",
                    color: "#F59E0B",
                },
                {
                    num: "3",
                    title: "Hold Camera Directly Overhead (90°)",
                    tip: "Keep your phone parallel to the receipt to prevent perspective distortion and tilted text lines.",
                    color: "#6366F1",
                },
                {
                    num: "4",
                    title: "Fill the Frame",
                    tip: "Get close enough so the receipt occupies most of the screen. Avoid capturing excessive background clutter.",
                    color: "#EC4899",
                },
                {
                    num: "5",
                    title: "Review & Tap to Edit",
                    tip: "FinanceFlow presents all detected items in an editable table. You can always tap any quantity, price, or tax to make quick adjustments before saving!",
                    color: "#3B82F6",
                },
            ],
        },
        {
            id: 5,
            question: "Is my financial receipt data private?",
            category: "Security",
            categoryColor: "#8B5CF6",
            icon: "shield-outline",
            shortAnswer: "Yes, 100%. Instant Scan is entirely zero-knowledge and strictly local to your device.",
            fullAnswer: [
                "FinanceFlow is built from the ground up for privacy-first personal financial management.",
                "In Instant Scan mode, images are processed in-memory using Apple Vision / Google ML Kit frameworks. No image, store name, or transaction amount is transmitted over the network or saved to remote analytics databases.",
            ],
        },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Svg
                key={colors.background}
                style={StyleSheet.absoluteFillObject}
                width={screenWidth}
                height={screenHeight}
                pointerEvents="none"
            >
                <Defs>
                    <SvgGrad id="bgGradOcrInfo" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGradOcrInfo)" />
            </Svg>

            {/* ── Header ── */}
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
                    activeOpacity={0.75}
                    accessibilityLabel="Back"
                    accessibilityRole="button"
                >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <View style={styles.headerTextWrap}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                        OCR Questions & Answers
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                        Instant On-Device Text Recognition
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* ── Hero Banner ── */}
                <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.heroTopRow}>
                        <View style={[styles.heroIconWrap, { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.12)' }]}>
                            <Ionicons name="flash" size={26} color="#F59E0B" />
                        </View>
                        <View style={styles.heroBadge}>
                            <Ionicons name="shield-checkmark" size={13} color="#059669" />
                            <Text style={styles.heroBadgeText}>100% Offline & Private</Text>
                        </View>
                    </View>
                    <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                        Understanding Instant Scan
                    </Text>
                    <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
                        Instant Scan extracts itemized receipt lines in milliseconds using your device's native vision hardware. Here is everything you need to know about how it works, its advantages, limitations, and how to get optimal results.
                    </Text>

                    {/* Quick Stats Pills */}
                    <View style={styles.statsRow}>
                        <View style={[styles.statPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                            <Text style={styles.statPillVal}>&lt; 1 sec</Text>
                            <Text style={[styles.statPillLbl, { color: colors.textMuted }]}>Scan Speed</Text>
                        </View>
                        <View style={[styles.statPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                            <Text style={styles.statPillVal}>0 MB</Text>
                            <Text style={[styles.statPillLbl, { color: colors.textMuted }]}>Data Upload</Text>
                        </View>
                        <View style={[styles.statPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                            <Text style={styles.statPillVal}>On-Device</Text>
                            <Text style={[styles.statPillLbl, { color: colors.textMuted }]}>Vision ML</Text>
                        </View>
                    </View>
                </View>

                {/* ── Q&A Cards ── */}
                <View style={styles.qaSection}>
                    <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                        Frequently Asked Questions
                    </Text>

                    {QA_LIST.map((item, idx) => {
                        const isExpanded = !!expandedCards[item.id];
                        return (
                            <View
                                key={item.id}
                                style={[
                                    styles.qaCard,
                                    {
                                        backgroundColor: colors.card,
                                        borderColor: isExpanded ? colors.primaryLight || colors.border : colors.border,
                                    },
                                ]}
                            >
                                <TouchableOpacity
                                    onPress={() => toggleCard(item.id)}
                                    activeOpacity={0.7}
                                    style={styles.qaCardHeader}
                                >
                                    <View style={styles.qaHeaderLeft}>
                                        <View style={[styles.qaIconCircle, { backgroundColor: `${item.categoryColor}18` }]}>
                                            <Ionicons name={item.icon} size={20} color={item.categoryColor} />
                                        </View>
                                        <View style={styles.qaTitleContainer}>
                                            <View style={styles.qaCategoryRow}>
                                                <View style={[styles.categoryBadge, { backgroundColor: `${item.categoryColor}15` }]}>
                                                    <Text style={[styles.categoryBadgeText, { color: item.categoryColor }]}>
                                                        {item.category}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Text style={[styles.qaQuestionText, { color: colors.textPrimary }]}>
                                                {item.question}
                                            </Text>
                                        </View>
                                    </View>
                                    <Ionicons
                                        name={isExpanded ? "chevron-up" : "chevron-down"}
                                        size={20}
                                        color={colors.textMuted}
                                    />
                                </TouchableOpacity>

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <View style={styles.qaBody}>
                                        <View style={[styles.qaDivider, { backgroundColor: colors.border }]} />

                                        {/* Highlighted Takeaway / Short Answer */}
                                        {item.shortAnswer && (
                                            <View style={[styles.shortAnswerHighlight, { backgroundColor: `${item.categoryColor}10`, borderColor: `${item.categoryColor}25` }]}>
                                                <Ionicons name="information-circle-outline" size={16} color={item.categoryColor} style={{ marginTop: 1 }} />
                                                <Text style={[styles.shortAnswerHighlightText, { color: colors.textPrimary }]}>
                                                    {item.shortAnswer}
                                                </Text>
                                            </View>
                                        )}

                                        {/* Paragraphs */}
                                        {item.fullAnswer && item.fullAnswer.map((para, pIdx) => (
                                            <Text key={pIdx} style={[styles.qaParagraph, { color: colors.textSecondary }]}>
                                                {para}
                                            </Text>
                                        ))}

                                        {/* Point Pills (Basics) */}
                                        {item.points && (
                                            <View style={styles.pointsList}>
                                                {item.points.map((pt, ptIdx) => (
                                                    <View key={ptIdx} style={[styles.pointCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: colors.border }]}>
                                                        <View style={[styles.pointIconWrap, { backgroundColor: `${colors.primary}18` }]}>
                                                            <Ionicons name={pt.icon} size={16} color={colors.primary} />
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.pointTitle, { color: colors.textPrimary }]}>{pt.title}</Text>
                                                            <Text style={[styles.pointDesc, { color: colors.textSecondary }]}>{pt.desc}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* Pipeline Steps (Architecture) */}
                                        {item.steps && (
                                            <View style={styles.stepsList}>
                                                {item.steps.map((st, sIdx) => (
                                                    <View key={sIdx} style={styles.stepRow}>
                                                        <View style={[styles.stepNumberBadge, { backgroundColor: colors.primary }]}>
                                                            <Text style={styles.stepNumberText}>{st.num}</Text>
                                                        </View>
                                                        <View style={styles.stepTextCol}>
                                                            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{st.title}</Text>
                                                            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{st.desc}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* Comparison Table */}
                                        {item.comparison && (
                                            <View style={styles.comparisonTable}>
                                                <View style={[styles.tableHeaderRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                                                    <Text style={[styles.tableColHeader, { flex: 1.2, color: colors.textPrimary }]}>Aspect</Text>
                                                    <Text style={[styles.tableColHeader, { flex: 1.5, color: '#F59E0B' }]}>Instant Scan (OCR)</Text>
                                                    <Text style={[styles.tableColHeader, { flex: 1.4, color: '#6366F1' }]}>AI Vision Scan</Text>
                                                </View>
                                                {item.comparison.map((cRow, cIdx) => (
                                                    <View
                                                        key={cIdx}
                                                        style={[
                                                            styles.tableRow,
                                                            { borderColor: colors.border },
                                                            cIdx % 2 === 1 && { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)' },
                                                        ]}
                                                    >
                                                        <Text style={[styles.tableCellFeature, { flex: 1.2, color: colors.textPrimary }]}>{cRow.feature}</Text>
                                                        <Text style={[styles.tableCellVal, { flex: 1.5, color: colors.textSecondary }]}>{cRow.ocr}</Text>
                                                        <Text style={[styles.tableCellVal, { flex: 1.4, color: colors.textSecondary }]}>{cRow.ai}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* Limitations Cards */}
                                        {item.limitations && (
                                            <View style={styles.limitationsList}>
                                                {item.limitations.map((lim, lIdx) => (
                                                    <View key={lIdx} style={[styles.limitationCard, { backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.05)', borderColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.12)' }]}>
                                                        <Ionicons name={lim.icon} size={18} color="#EF4444" style={{ marginTop: 2 }} />
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.limitationTitle, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>{lim.title}</Text>
                                                            <Text style={[styles.limitationDesc, { color: colors.textSecondary }]}>{lim.desc}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {/* Pro Tips Cards */}
                                        {item.proTips && (
                                            <View style={styles.proTipsList}>
                                                {item.proTips.map((tip, tIdx) => (
                                                    <View key={tIdx} style={[styles.proTipItem, { borderColor: colors.border }]}>
                                                        <View style={[styles.proTipNumber, { backgroundColor: tip.color }]}>
                                                            <Text style={styles.proTipNumText}>{tip.num}</Text>
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={[styles.proTipTitle, { color: colors.textPrimary }]}>{tip.title}</Text>
                                                            <Text style={[styles.proTipBody, { color: colors.textSecondary }]}>{tip.tip}</Text>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Platform.OS === 'ios' ? 54 : 32,
        paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTextWrap: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
    },
    headerTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        marginTop: 1,
    },
    scrollContent: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xxl * 1.5,
    },

    // Hero
    heroCard: {
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        marginTop: Spacing.sm,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    heroTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    heroIconWrap: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(5,150,105,0.12)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: BorderRadius.full,
    },
    heroBadgeText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
        color: '#059669',
    },
    heroTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 6,
    },
    heroBody: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
        marginBottom: Spacing.md,
    },
    statsRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginTop: Spacing.xs,
    },
    statPill: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
    },
    statPillVal: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_700Bold',
        color: '#F59E0B',
    },
    statPillLbl: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        marginTop: 2,
    },

    // QA Section
    qaSection: {
        marginTop: Spacing.xl,
    },
    sectionHeading: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        marginBottom: Spacing.md,
    },
    qaCard: {
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        marginBottom: Spacing.md,
        overflow: 'hidden',
    },
    qaCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.md,
    },
    qaHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        flex: 1,
        gap: Spacing.sm,
        marginRight: Spacing.sm,
    },
    qaIconCircle: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    qaTitleContainer: {
        flex: 1,
    },
    qaCategoryRow: {
        marginBottom: 3,
    },
    categoryBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    categoryBadgeText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    qaQuestionText: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
        lineHeight: 20,
    },
    shortAnswerHighlight: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        marginBottom: Spacing.sm,
    },
    shortAnswerHighlightText: {
        flex: 1,
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 18,
    },
    qaBody: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
    },
    qaDivider: {
        height: 1,
        marginBottom: Spacing.sm,
    },
    qaParagraph: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 21,
        marginBottom: Spacing.xs,
    },

    // Points
    pointsList: {
        marginTop: Spacing.sm,
        gap: Spacing.sm,
    },
    pointCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
    },
    pointIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pointTitle: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
    },
    pointDesc: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 16,
    },

    // Steps
    stepsList: {
        marginTop: Spacing.sm,
        gap: Spacing.md,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
    },
    stepNumberBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    stepNumberText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        color: '#fff',
    },
    stepTextCol: {
        flex: 1,
    },
    stepTitle: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    stepDesc: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 16,
    },

    // Comparison Table
    comparisonTable: {
        marginTop: Spacing.sm,
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    tableHeaderRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        paddingHorizontal: 8,
    },
    tableColHeader: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 7,
        paddingHorizontal: 8,
        borderTopWidth: 1,
    },
    tableCellFeature: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    tableCellVal: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 15,
    },

    // Limitations
    limitationsList: {
        marginTop: Spacing.sm,
        gap: Spacing.sm,
    },
    limitationCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        padding: Spacing.sm,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
    },
    limitationTitle: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    limitationDesc: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 16,
    },

    // Pro Tips
    proTipsList: {
        marginTop: Spacing.sm,
        gap: Spacing.sm,
    },
    proTipItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        paddingVertical: 6,
    },
    proTipNumber: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    proTipNumText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        color: '#fff',
    },
    proTipTitle: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    proTipBody: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 16,
    },
});

