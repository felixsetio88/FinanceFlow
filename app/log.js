import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    TextInput,
    Alert,
    ActivityIndicator,
    Platform,
    ScrollView,
    useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { getLogs, clearLogs, exportLogs, subscribeToLogs } from '../services/appLogger';

const CATEGORY_FILTERS = [
    { id: 'all', label: 'All', icon: 'layers-outline' },
    { id: 'transaction', label: 'Transactions', icon: 'receipt-outline' },
    { id: 'asset', label: 'Accounts', icon: 'wallet-outline' },
    { id: 'currency', label: 'Currency', icon: 'cash-outline' },
    { id: 'error', label: 'Errors', icon: 'alert-circle-outline' },
    { id: 'system', label: 'System', icon: 'cog-outline' },
];

export default function LogScreen() {
    const router = useRouter();
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [expandedLogId, setExpandedLogId] = useState(null);
    const [isExporting, setIsExporting] = useState(false);

    const loadLogsData = useCallback(async () => {
        try {
            const data = await getLogs();
            setLogs(data);
        } catch (e) {
            console.error('Failed to load logs:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadLogsData();
        const unsubscribe = subscribeToLogs((newLogs) => {
            setLogs(newLogs);
        });
        return unsubscribe;
    }, [loadLogsData]);

    const handleClearLogs = () => {
        if (logs.length === 0) return;
        Alert.alert(
            'Clear Activity Logs',
            'Are you sure you want to delete all local activity and system logs? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear All',
                    style: 'destructive',
                    onPress: async () => {
                        await clearLogs();
                        setLogs([]);
                    },
                },
            ]
        );
    };

    const handleExportLogs = async () => {
        if (logs.length === 0) {
            Alert.alert('No Logs', 'There are no logs to export yet.');
            return;
        }
        setIsExporting(true);
        try {
            const result = await exportLogs();
            if (!result.success && result.reason !== 'sharing_unavailable') {
                Alert.alert('Export Failed', result.reason || 'Could not export logs.');
            }
        } catch (e) {
            Alert.alert('Export Error', e.message);
        } finally {
            setIsExporting(false);
        }
    };

    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            // Category filter
            if (selectedCategory !== 'all') {
                if (selectedCategory === 'error' && log.level !== 'error' && log.category !== 'error') {
                    return false;
                } else if (selectedCategory !== 'error' && log.category !== selectedCategory) {
                    return false;
                }
            }

            // Search query filter
            if (search.trim()) {
                const query = search.toLowerCase();
                const titleMatch = (log.title || '').toLowerCase().includes(query);
                const detailsMatch = (log.details || '').toLowerCase().includes(query);
                const categoryMatch = (log.category || '').toLowerCase().includes(query);
                return titleMatch || detailsMatch || categoryMatch;
            }

            return true;
        });
    }, [logs, selectedCategory, search]);

    const getLevelColors = (level, category) => {
        if (level === 'error' || category === 'error') {
            return {
                bg: isDark ? `${colors.spending}22` : `${colors.spending}14`,
                border: `${colors.spending}40`,
                color: colors.spending,
                icon: 'alert-circle',
            };
        }
        if (level === 'warn') {
            return {
                bg: isDark ? `${colors.gold}22` : `${colors.gold}18`,
                border: `${colors.gold}44`,
                color: colors.gold,
                icon: 'warning',
            };
        }
        if (level === 'success') {
            return {
                bg: isDark ? `${colors.income}22` : `${colors.income}16`,
                border: `${colors.income}40`,
                color: colors.income,
                icon: 'checkmark-circle',
            };
        }
        return {
            bg: isDark ? `${colors.blue}22` : `${colors.blue}14`,
            border: `${colors.blue}40`,
            color: colors.blue,
            icon: 'information-circle',
        };
    };

    const getCategoryIcon = (category) => {
        switch (category) {
            case 'transaction':
                return 'receipt-outline';
            case 'asset':
                return 'wallet-outline';
            case 'currency':
                return 'cash-outline';
            case 'settings':
                return 'cog-outline';
            case 'backup':
                return 'cloud-outline';
            case 'ai':
                return 'sparkles-outline';
            case 'error':
                return 'bug-outline';
            default:
                return 'document-text-outline';
        }
    };

    const formatTimestamp = (iso) => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        } catch (e) {
            return iso;
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

    const renderLogItem = ({ item }) => {
        const badge = getLevelColors(item.level, item.category);
        const catIcon = getCategoryIcon(item.category);
        const isExpanded = expandedLogId === item.id;

        return (
            <View style={[styles.logCard, { backgroundColor: colors.card }]}>
                <View style={styles.logMain}>
                    <View style={[styles.logIcon, { backgroundColor: badge.bg }]}>
                        <Ionicons name={catIcon} size={20} color={badge.color} />
                    </View>
                    <View style={styles.logInfo}>
                        <View style={styles.logTitleRow}>
                            <Text style={[styles.logName, { color: colors.textPrimary }]} numberOfLines={1}>
                                {item.title}
                            </Text>
                            <View style={[styles.levelBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                                <Text style={[styles.levelBadgeText, { color: badge.color }]}>
                                    {(item.level || 'info').toUpperCase()}
                                </Text>
                            </View>
                        </View>
                        <Text style={[styles.logMeta, { color: colors.textSecondary }]}>
                            {item.category?.toUpperCase()} · {formatTimestamp(item.timestamp)}
                        </Text>
                    </View>
                </View>

                {/* Details text */}
                {!!item.details && (
                    <Text style={[styles.logDetails, { color: colors.textPrimary }]}>
                        {item.details}
                    </Text>
                )}

                {/* Stack trace toggle for errors */}
                {!!item.stack && (
                    <View style={styles.stackWrap}>
                        <TouchableOpacity
                            style={[styles.stackToggleBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                            onPress={() => setExpandedLogId(isExpanded ? null : item.id)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={14}
                                color={colors.primary}
                            />
                            <Text style={[styles.stackToggleText, { color: colors.primary }]}>
                                {isExpanded ? 'Hide Stack Trace' : 'View Stack Trace'}
                            </Text>
                        </TouchableOpacity>

                        {isExpanded && (
                            <View style={[styles.stackBox, { backgroundColor: isDark ? '#16171F' : '#F1F3F7', borderColor: colors.border }]}>
                                <Text style={[styles.stackText, { color: colors.textPrimary }]} selectable>
                                    {item.stack}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Background SVG Gradient */}
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bgGradLog" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGradLog)" />
            </Svg>

            {/* Top Navigation Bar */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    activeOpacity={0.75}
                    accessibilityLabel="Back to settings"
                >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>

                <Text style={[styles.title, { color: colors.textPrimary }]}>Activity Log</Text>

                <View style={styles.headerActions}>
                    <TouchableOpacity
                        onPress={handleExportLogs}
                        style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                        activeOpacity={0.75}
                        disabled={isExporting}
                        accessibilityLabel="Export logs"
                    >
                        {isExporting ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Ionicons name="share-outline" size={18} color={colors.primary} />
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleClearLogs}
                        style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                        activeOpacity={0.75}
                        accessibilityLabel="Clear logs"
                    >
                        <Ionicons
                            name="trash-outline"
                            size={18}
                            color={logs.length > 0 ? (isDark ? '#FF8594' : '#dc2626') : colors.textMuted}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Privacy Callout Section */}
            <View style={{ paddingHorizontal: Spacing.lg }}>
                <View style={[styles.section, { backgroundColor: colors.card, marginBottom: Spacing.sm }]}>
                    <SectionHeader icon="shield-checkmark" color={colors.emerald} title="100% On-Device & Private" />
                    <Text style={[styles.helperText, { color: colors.textSecondary, marginBottom: 0 }]}>
                        Activity history and diagnostic traces are saved strictly in local sandboxed storage and never transmitted to external servers.
                    </Text>
                </View>
            </View>

            {/* Search Input Box */}
            <View style={styles.searchRow}>
                <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Ionicons name="search" size={16} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.textPrimary }]}
                        placeholder="Search logs, actions, details…"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                        autoCorrect={false}
                    />
                    {search ? (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* Filter Chips Row */}
            <View style={styles.filterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipRow}>
                    {CATEGORY_FILTERS.map((opt) => {
                        const isSelected = selectedCategory === opt.id;
                        return (
                            <TouchableOpacity
                                key={opt.id}
                                style={[
                                    styles.filterChip,
                                    { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                                    isSelected && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                                ]}
                                onPress={() => setSelectedCategory(opt.id)}
                                activeOpacity={0.8}
                            >
                                <Ionicons
                                    name={opt.icon}
                                    size={14}
                                    color={isSelected ? colors.primary : colors.textSecondary}
                                />
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        { color: isSelected ? colors.primary : colors.textSecondary },
                                        isSelected && { fontFamily: 'Poppins_700Bold' },
                                    ]}
                                >
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Logs List / Empty State */}
            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : filteredLogs.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="receipt-outline" size={38} color={colors.primary} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Logs Found</Text>
                    <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                        {search.trim() || selectedCategory !== 'all'
                            ? 'No activity logs match your current search or category filter.'
                            : 'App operations, transactions, accounts, and system diagnostics will automatically appear here.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredLogs}
                    keyExtractor={(item) => item.id}
                    renderItem={renderLogItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={12}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                />
            )}
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
        paddingTop: 60,
        paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: FontSize.xl,
        fontFamily: 'Poppins_800ExtraBold',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    section: {
        borderRadius: 22,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.xs,
    },
    sectionIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
    },
    helperText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    searchRow: {
        paddingHorizontal: Spacing.lg,
        marginBottom: Spacing.sm,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        height: 44,
        borderRadius: BorderRadius.md,
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
    },
    filterRow: {
        marginBottom: Spacing.sm,
    },
    filterChipRow: {
        paddingHorizontal: Spacing.lg,
        gap: 8,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: BorderRadius.full,
    },
    filterChipText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
    },
    listContent: {
        paddingHorizontal: Spacing.lg,
        paddingTop: 4,
        paddingBottom: 40,
        gap: Spacing.sm,
    },
    logCard: {
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.xs,
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    logMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    logIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logInfo: {
        flex: 1,
    },
    logTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.xs,
    },
    logName: {
        fontSize: FontSize.md - 1,
        fontFamily: 'Poppins_700Bold',
        flex: 1,
    },
    levelBadge: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
        borderWidth: StyleSheet.hairlineWidth,
    },
    levelBadgeText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    logMeta: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        marginTop: 1,
    },
    logDetails: {
        fontSize: FontSize.xs + 1,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
        marginTop: Spacing.sm,
        paddingLeft: 42 + Spacing.md,
    },
    stackWrap: {
        marginTop: Spacing.sm,
        paddingLeft: 42 + Spacing.md,
    },
    stackToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        gap: 5,
    },
    stackToggleText: {
        fontSize: FontSize.xs - 1,
        fontFamily: 'Poppins_600SemiBold',
    },
    stackBox: {
        marginTop: 6,
        padding: 10,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
    },
    stackText: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        lineHeight: 16,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: Spacing.xl,
    },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    emptyTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    emptyDesc: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
    },
});
