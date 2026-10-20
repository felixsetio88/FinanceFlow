import React, { useMemo, useState } from 'react';
import { Platform, Alert, View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currencies';
import { filterTransactionsByPeriod, groupByCategory, formatTime } from '../../utils/helpers';
import { getCategoryById, getAccountTypeById } from '../../utils/categories';
import { getSavingReminderRecommendations } from '../../utils/savings';
import { Spacing, FontSize, BorderRadius } from '../../constants/theme';

const DEFAULT_COLORS = ['#ff6600', '#1E3A8A', '#1E293B', '#065F46', '#7C3AED', '#9D174D'];

function getCardColor(asset, index) {
    return asset.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export default function Dashboard() {
    const router = useRouter();
    const { transactions, budgets, assets, savingsGoals, currency, loading, currentDateKey, deleteTransaction, updateAsset, exchangeRates, convertCurrency } = useApp();
    const { colors, isDark } = useTheme();
    const [showBalance, setShowBalance] = useState(true);
    const [showMore, setShowMore] = useState(false);
    const [spendingTab, setSpendingTab] = useState('recent');
    const [selectedAssetId, setSelectedAssetId] = useState(null);
    const [expandedTxId, setExpandedTxId] = useState(null);

    const assetCurrencies = useMemo(
        () => [...new Set(assets.map(a => a.currency || currency))],
        [assets, currency]
    );
    const hasMixedAssetCurrencies = assetCurrencies.length > 1;
    const totalAssetValue = useMemo(
        () => assets.reduce((sum, a) => sum + convertCurrency(a.balance || 0, a.currency || currency, currency, exchangeRates), 0),
        [assets, currency, exchangeRates]
    );
    const monthlyTx = useMemo(() => filterTransactionsByPeriod(transactions, 'monthly'), [transactions, currentDateKey]);
    const todayTx = useMemo(() => filterTransactionsByPeriod(transactions, 'daily'), [transactions, currentDateKey]);

    const totalIncome = monthlyTx.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(convertCurrency(t.amount || 0, t.currency || currency, currency, exchangeRates)), 0);
    const totalSpending = monthlyTx.filter(t => t.type === 'spending').reduce((s, t) => s + Math.abs(convertCurrency(t.amount || 0, t.currency || currency, currency, exchangeRates)), 0);
    const balance = totalIncome - totalSpending;
    const todayIncome = todayTx.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(convertCurrency(t.amount || 0, t.currency || currency, currency, exchangeRates)), 0);
    const todaySpending = todayTx.filter(t => t.type === 'spending').reduce((s, t) => s + Math.abs(convertCurrency(t.amount || 0, t.currency || currency, currency, exchangeRates)), 0);

    const activeBudget = budgets[0] || null;
    let dailyBudget = 0;
    if (activeBudget) {
        if (activeBudget.period === 'daily') dailyBudget = activeBudget.amount;
        else if (activeBudget.period === 'weekly') dailyBudget = activeBudget.amount / 7;
        else { const now = new Date(); dailyBudget = activeBudget.amount / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); }
    }
    const dailyBudgetRemaining = dailyBudget - todaySpending;

    const displayedAssets = assets.slice(0, 3);
    const showMoreAssetsBtn = assets.length > 5;
    const recentTransactions = transactions.slice(0, 6);
    const topCategories = Object.entries(groupByCategory(monthlyTx.filter(t => t.type === 'spending'), (t) => convertCurrency(t.amount, t.currency || currency, currency, exchangeRates)))
        .map(([id, data]) => {
            const catInfo = getCategoryById(id);
            return { ...catInfo, id: catInfo.id, total: data.total };
        })
        .sort((a, b) => b.total - a.total).slice(0, 6);
    const savingsRecommendations = useMemo(() => getSavingReminderRecommendations(savingsGoals).slice(0, 3), [savingsGoals]);

    const confirmDeleteTx = (transaction) => {
        if (transaction.type === 'move' && transaction.fromAssetId && transaction.toAssetId) {
            const fromAsset = assets.find(a => a.id === transaction.fromAssetId);
            const toAsset = assets.find(a => a.id === transaction.toAssetId);
            if (fromAsset && toAsset) {
                Alert.alert(
                    'Delete Transfer',
                    `Do you want to reverse this transfer and return ${formatCurrency(Math.abs(transaction.amount), currency)} from "${toAsset.name}" back to "${fromAsset.name}"?`,
                    [
                        { text: 'No, just delete', style: 'default', onPress: () => deleteTransaction(transaction.id) },
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Yes, reverse transfer',
                            style: 'default',
                            onPress: async () => {
                                await deleteTransaction(transaction.id);
                                await updateAsset({ ...fromAsset, balance: (fromAsset.balance || 0) + Math.abs(transaction.amount) });
                                await updateAsset({ ...toAsset, balance: (toAsset.balance || 0) - Math.abs(transaction.amount) });
                            },
                        },
                    ]
                );
                return;
            }
        }

        const linkedAsset = transaction.assetId ? assets.find(a => a.id === transaction.assetId) : null;
        if (linkedAsset) {
            const isSpending = transaction.type === 'spending';
            Alert.alert(
                'Delete Transaction',
                `Return ${formatCurrency(Math.abs(transaction.amount), currency)} ${isSpending ? 'back to' : 'from'} "${linkedAsset.name}"?`,
                [
                    { text: 'No, just delete', onPress: () => deleteTransaction(transaction.id) },
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Yes, restore',
                        onPress: async () => {
                            await deleteTransaction(transaction.id);
                            const delta = isSpending ? Math.abs(transaction.amount) : -Math.abs(transaction.amount);
                            await updateAsset({ ...linkedAsset, balance: (linkedAsset.balance || 0) + delta });
                        },
                    },
                ]
            );
        } else {
            Alert.alert('Delete Transaction', 'Delete this transaction?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(transaction.id) },
            ]);
        }
    };

    if (loading) {
        return (
            <View style={[{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.primary, fontSize: FontSize.md, fontFamily: 'Poppins_400Regular' }}>Loading…</Text>
            </View>
        );
    }

    const renderAssetCard = (asset, index) => {
        const isSelected = selectedAssetId === asset.id;
        const cardColor = getCardColor(asset, index);
        const typeInfo = getAccountTypeById(asset.type);
        return (
            <TouchableOpacity key={asset.id} activeOpacity={0.88}
                onPress={() => setSelectedAssetId(isSelected ? null : asset.id)}
                style={[styles.atmCard, { backgroundColor: cardColor }, isSelected ? styles.atmCardExpanded : styles.atmCardCollapsed]}>
                {isSelected ? (
                    <>
                        <View style={styles.atmTop}>
                            <View style={styles.atmChip}><View style={styles.atmChipLine1} /><View style={styles.atmChipLine2} /></View>
                            <Ionicons name={typeInfo.icon} size={22} color="rgba(255,255,255,0.55)" />
                        </View>
                        <Text style={styles.atmName} numberOfLines={1}>{asset.name}</Text>
                        <Text style={styles.atmBalance}>{showBalance ? formatCurrency(asset.balance || 0, asset.currency || currency) : '••••••'}</Text>
                        <View style={styles.atmFooter}>
                            <Text style={styles.atmTypeName}>{typeInfo.name}</Text>
                            <TouchableOpacity style={styles.atmEditChip} onPress={() => router.push('/assets')}>
                                <Ionicons name="create-outline" size={12} color="#fff" />
                                <Text style={styles.atmEditChipTxt}>Edit</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <View style={styles.atmCollapsedRow}>
                        <View style={styles.atmCollapsedLeft}>
                            <View style={styles.atmChipTiny} />
                            <View style={styles.atmCollapsedIcon}><Ionicons name={typeInfo.icon} size={14} color="rgba(255,255,255,0.7)" /></View>
                            <Text style={styles.atmCollapsedName} numberOfLines={1}>{asset.name}</Text>
                        </View>
                        <Text style={styles.atmCollapsedBal}>{showBalance ? formatCurrency(asset.balance || 0, asset.currency || currency) : '••••'}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // Dynamic styles that depend on theme
    const bg = colors.background;
    const cardBg = colors.card;
    const textPrimary = colors.text;
    const textSec = colors.textSecondary;
    const textMuted = colors.textMuted;
    const purple = colors.primary;
    const purpleLight = colors.primaryLight;
    const border = colors.border;

    return (
        <View style={[styles.container, { backgroundColor: bg }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* ── Hero section ── */}
                <View style={styles.heroSection}>
                    <View style={styles.heroTopRow}>
                        <Text style={[styles.heroLabel, { color: textSec }]}>Total Asset Value</Text>
                        <TouchableOpacity style={[styles.settingsBtn, { backgroundColor: purpleLight }]} onPress={() => router.push('/settings')}>
                            <Ionicons name="settings-outline" size={20} color={purple} />
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.heroValueRow} onPress={() => setShowBalance(v => !v)} activeOpacity={0.75}>
                        <Text style={[styles.heroValue, { color: textPrimary }]}>
                            {showBalance
                                ? formatCurrency(totalAssetValue, currency)
                                : '••••••'}
                        </Text>
                        <Ionicons name={showBalance ? 'eye-outline' : 'eye-off-outline'} size={22} color={textMuted} />
                    </TouchableOpacity>
                    {hasMixedAssetCurrencies && showBalance && (
                        <Text style={[styles.currencyWarning, { color: textMuted }]}>
                            Converted to {currency} · accounts in {assetCurrencies.join(', ')}
                        </Text>
                    )}
                    <Text style={[styles.budgetSignal, { color: dailyBudgetRemaining >= 0 ? '#0d9488' : '#dc2626' }]}>
                        Daily budget: {formatCurrency(dailyBudgetRemaining, currency)}
                    </Text>
                    <Text style={[styles.todayIncome, { color: textSec }]}>
                        Today's income: <Text style={{ color: '#059669', fontFamily: 'Poppins_600SemiBold' }}>{formatCurrency(todayIncome, currency)}</Text>
                    </Text>
                    <Text style={[styles.todaySpending, { color: textSec }]}>
                        Today's spending: <Text style={{ color: '#dc2626', fontFamily: 'Poppins_600SemiBold' }}>{formatCurrency(todaySpending, currency)}</Text>
                    </Text>
                    <TouchableOpacity style={[styles.moreToggle, { backgroundColor: purpleLight }]} onPress={() => setShowMore(v => !v)}>
                        <Text style={[styles.moreToggleTxt, { color: purple }]}>More</Text>
                        <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={14} color={purple} />
                    </TouchableOpacity>
                    {showMore && (
                        <View style={styles.statsGrid}>
                            {[
                                { label: 'Income', value: `+${formatCurrency(totalIncome, currency)}`, color: '#059669' },
                                { label: 'Spending', value: `-${formatCurrency(totalSpending, currency)}`, color: '#dc2626' },
                                { label: 'Balance', value: formatCurrency(balance, currency), color: balance >= 0 ? '#059669' : '#dc2626' },
                                { label: 'Daily Budget', value: formatCurrency(dailyBudget, currency), color: purple },
                            ].map(s => (
                                <View key={s.label} style={[styles.statCard, { backgroundColor: cardBg, borderColor: border }]}>
                                    <Text style={[styles.statLabel, { color: textMuted }]}>{s.label}</Text>
                                    <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {(assets.length === 0 || transactions.length === 0 || budgets.length === 0) && (
                    <View style={[styles.getStartedCard, { backgroundColor: cardBg, borderColor: `${purple}33` }]}>
                        <View style={styles.getStartedHeader}>
                            <Ionicons name="compass-outline" size={17} color={purple} />
                            <Text style={[styles.getStartedTitle, { color: textPrimary }]}>Getting started</Text>
                        </View>
                        {assets.length === 0 && (
                            <TouchableOpacity style={styles.getStartedRow} onPress={() => router.push('/assets')}>
                                <Ionicons name="card-outline" size={16} color={purple} />
                                <Text style={[styles.getStartedText, { color: textSec }]}>Add your first account</Text>
                            </TouchableOpacity>
                        )}
                        {transactions.length === 0 && (
                            <TouchableOpacity style={styles.getStartedRow} onPress={() => router.push('/add-transaction')}>
                                <Ionicons name="add-circle-outline" size={16} color={purple} />
                                <Text style={[styles.getStartedText, { color: textSec }]}>Add or scan your first transaction</Text>
                            </TouchableOpacity>
                        )}
                        {budgets.length === 0 && (
                            <TouchableOpacity style={styles.getStartedRow} onPress={() => router.push('/budget')}>
                                <Ionicons name="flag-outline" size={16} color={purple} />
                                <Text style={[styles.getStartedText, { color: textSec }]}>Set a spending budget</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Savings recommendations */}
                {savingsRecommendations.length > 0 && (
                    <View style={[styles.recommendCard, { backgroundColor: cardBg, borderColor: 'rgba(245,158,11,0.2)' }]}>
                        <View style={styles.recommendHeader}>
                            <Ionicons name="notifications-outline" size={16} color="#F59E0B" />
                            <Text style={[styles.recommendTitle, { color: '#B45309' }]}>Recommendations</Text>
                        </View>
                        {savingsRecommendations.map(item => (
                            <View key={item.goalId} style={styles.recommendRow}>
                                <View style={styles.recommendDot} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.recommendGoal, { color: textPrimary }]} numberOfLines={1}>{item.title}</Text>
                                    <Text style={[styles.recommendText, { color: textMuted }]}>{item.message}</Text>
                                </View>
                            </View>
                        ))}
                        <TouchableOpacity style={[styles.recommendBtn, { backgroundColor: purpleLight }]} onPress={() => router.push('/savings')}>
                            <Text style={[styles.recommendBtnTxt, { color: purple }]}>Add Savings Now</Text>
                            <Ionicons name="arrow-forward" size={14} color={purple} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Assets */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: textPrimary }]}>Assets</Text>
                    <TouchableOpacity onPress={() => router.push('/assets')}>
                        <Text style={[styles.linkText, { color: purple }]}>See all</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.atmList}>
                    {assets.length === 0 ? (
                        <TouchableOpacity style={[styles.emptyAssetsCard, { backgroundColor: cardBg, borderColor: `${purple}33` }]} onPress={() => router.push('/assets')}>
                            <Ionicons name="add-circle-outline" size={30} color={purple} />
                            <Text style={[styles.emptyAssetsTxt, { color: purple }]}>Add your first account</Text>
                        </TouchableOpacity>
                    ) : displayedAssets.map((a, i) => renderAssetCard(a, i))}
                    {showMoreAssetsBtn && (
                        <TouchableOpacity style={[styles.moreAssetsBtn, { backgroundColor: purpleLight }]} onPress={() => router.push('/assets')}>
                            <Text style={[styles.moreAssetsBtnTxt, { color: purple }]}>+{assets.length - 3} more accounts →</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Shortcuts */}
                <View style={styles.shortcutsRow}>
                    {[
                        { id: 'scan', title: 'Scan', icon: 'camera-outline', route: '/receipt-scanner' },
                        { id: 'health', title: 'AI Health', icon: 'heart-outline', route: '/financial-health' },
                        { id: 'ai', title: 'AI Chat', icon: 'chatbubble-ellipses-outline', route: '/chatbot' },
                        { id: 'vehicles', title: 'My Vehicles', icon: 'car-sport-outline', route: '/vehicles' },
                    ].map(item => (
                        <TouchableOpacity key={item.id} style={styles.shortcutItem} onPress={() => router.push(item.route)}>
                            <View style={[styles.shortcutIconWrap, { backgroundColor: cardBg, borderColor: border }]}>
                                <Ionicons name={item.icon} size={22} color={purple} />
                            </View>
                            <Text style={[styles.shortcutTxt, { color: textSec }]}>{item.title}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* My Spending */}
                <View style={[styles.sectionHeaderAlt]}>
                    <Text style={[styles.sectionTitle, { color: textPrimary }]}>My Spending</Text>
                    <TouchableOpacity onPress={() => router.push('/transactions')}>
                        <Text style={[styles.linkText, { color: purple }]}>View all</Text>
                    </TouchableOpacity>
                </View>
                <View style={[styles.segmentWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)' }]}>
                    {['recent', 'top'].map(tab => (
                        <TouchableOpacity key={tab}
                            style={[styles.segmentBtn, spendingTab === tab && [styles.segmentBtnActive, { backgroundColor: isDark ? colors.surface : '#FFFFFF' }]]}
                            onPress={() => setSpendingTab(tab)}>
                            <Text style={[styles.segmentTxt, { color: textMuted }, spendingTab === tab && { color: purple, fontFamily: 'Poppins_700Bold' }]}>
                                {tab === 'recent' ? 'Recent' : 'Top Categories'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.listWrap}>
                    {spendingTab === 'recent' ? (
                        recentTransactions.length === 0
                            ? <View style={styles.emptyList}><Text style={[styles.emptyListTxt, { color: textMuted }]}>No recent transactions</Text></View>
                            : recentTransactions.map(tx => {
                                let cat = tx.type === 'move' ? { name: 'Transfer', icon: 'swap-horizontal', color: '#6A6FF8' } : getCategoryById(tx.category);
                                if (tx.vehicleLogType === 'refuel') cat = { ...cat, name: 'Car Refuel' };
                                if (tx.vehicleLogType === 'maintenance') cat = { ...cat, name: 'Car Maintenance' };
                                const income = tx.type === 'income';
                                const expanded = expandedTxId === tx.id;
                                const amtColor = tx.type === 'move' ? '#6A6FF8' : income ? '#059669' : '#dc2626';
                                const txOriginalCur = tx.currency || currency;
                                const originalAmt = formatCurrency(Math.abs(tx.amount), txOriginalCur);
                                const hasDiffCurrency = txOriginalCur !== currency;
                                const baseAmt = hasDiffCurrency ? formatCurrency(Math.abs(convertCurrency(tx.amount, txOriginalCur, currency, exchangeRates)), currency) : null;
                                return (
                                    <TouchableOpacity
                                        key={tx.id}
                                        style={[styles.txCard, { backgroundColor: cardBg }]}
                                        onPress={() => setExpandedTxId(expanded ? null : tx.id)}
                                        activeOpacity={0.82}
                                    >
                                        <View style={styles.txMain}>
                                            <View style={[styles.txIcon, { backgroundColor: `${cat.color}18` }]}>
                                                <Ionicons name={cat.icon} size={20} color={cat.color} />
                                            </View>
                                            <View style={styles.txInfo}>
                                                <Text style={[styles.txName, { color: textPrimary }]} numberOfLines={1}>{tx.description || cat.name}</Text>
                                                <Text style={[styles.txMeta, { color: textMuted }]}>{cat.name} · {formatTime(tx.date)}</Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[styles.txAmount, { color: amtColor }]}>
                                                    {tx.type === 'move' ? '⇄ ' : income ? '+' : '-'}{originalAmt}
                                                </Text>
                                                {hasDiffCurrency && (
                                                    <Text style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>
                                                        {baseAmt}
                                                    </Text>
                                                )}
                                            </View>
                                        </View>
                                        {expanded && (
                                            <View style={styles.txExpanded}>
                                                <View style={[styles.txExpandedDivider, { backgroundColor: border }]} />
                                                <Text style={[styles.txDetail, { color: textSec }]}>📅 {tx.date ? new Date(tx.date).toLocaleDateString() : ''}</Text>
                                                <View style={styles.txActions}>
                                                    <TouchableOpacity
                                                        style={styles.editBtn}
                                                        onPress={() => router.push({ pathname: '/add-transaction', params: { editId: tx.id } })}
                                                    >
                                                        <Ionicons name="pencil" size={14} color="#6A6FF8" />
                                                        <Text style={styles.editTxt}>Edit</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={styles.deleteBtn} onPress={() => confirmDeleteTx(tx)}>
                                                        <Ionicons name="trash" size={14} color="#dc2626" />
                                                        <Text style={styles.deleteTxt}>Delete</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                    ) : (
                        topCategories.length === 0
                            ? <View style={styles.emptyList}><Text style={[styles.emptyListTxt, { color: textMuted }]}>No category spending yet</Text></View>
                            : topCategories.map(cat => (
                                <TouchableOpacity
                                    key={cat.id}
                                    style={[styles.txCard, { backgroundColor: cardBg }]}
                                    activeOpacity={0.75}
                                    onPress={() => router.push({
                                        pathname: '/category-transactions',
                                        params: {
                                            category: cat.id,
                                            period: 'monthly',
                                            refDate: new Date().toISOString(),
                                        }
                                    })}
                                >
                                    <View style={styles.txMain}>
                                        <View style={[styles.txIcon, { backgroundColor: `${cat.color}18` }]}><Ionicons name={cat.icon} size={20} color={cat.color} /></View>
                                        <View style={styles.txInfo}>
                                            <Text style={[styles.txName, { color: textPrimary }]}>{cat.name}</Text>
                                            <Text style={[styles.txMeta, { color: textMuted }]}>Top category · Tap to view</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={[styles.txAmount, { color: '#dc2626' }]}>-{formatCurrency(Math.abs(cat.total), currency)}</Text>
                                            <Ionicons name="chevron-forward" size={16} color={textMuted} />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: 64 },
    heroSection: { marginBottom: Spacing.xl },
    heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
    heroLabel: { fontSize: FontSize.md, fontFamily: 'Poppins_500Medium' },
    settingsBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    heroValueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    heroValue: { fontSize: 36, lineHeight: 44, fontFamily: 'Poppins_800ExtraBold' },
    budgetSignal: { fontSize: FontSize.md, fontFamily: 'Poppins_600SemiBold', marginBottom: 4 },
    currencyWarning: { fontSize: FontSize.xs, fontFamily: 'Poppins_500Medium', marginBottom: Spacing.sm },
    todayIncome: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginBottom: 2 },
    todaySpending: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', marginBottom: Spacing.sm },
    moreToggle: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingVertical: 6, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full },
    moreToggleTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md, justifyContent: 'center' },
    statCard: { width: '47%', borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1 },
    statLabel: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginBottom: 2 },
    statValue: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    recommendCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.xl },
    recommendHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
    recommendTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    recommendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: Spacing.sm },
    recommendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginTop: 6 },
    recommendGoal: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    recommendText: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    recommendBtn: { marginTop: Spacing.md, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
    recommendBtnTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    getStartedCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.xl },
    getStartedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.xs },
    getStartedTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    getStartedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
    getStartedText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    sectionHeaderAlt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xl, marginBottom: Spacing.md },
    sectionTitle: { fontSize: FontSize.xl, fontFamily: 'Poppins_700Bold' },
    linkText: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    atmList: { gap: Spacing.sm, marginBottom: Spacing.xl },
    atmCard: { borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: Platform.OS === 'android' ? 0 : 6 },
    atmCardExpanded: { padding: Spacing.lg, minHeight: 170, justifyContent: 'space-between' },
    atmCardCollapsed: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
    atmTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
    atmChip: { width: 32, height: 24, backgroundColor: 'rgba(255,220,100,0.85)', borderRadius: 5, justifyContent: 'space-around', paddingVertical: 5, paddingHorizontal: 3 },
    atmChipLine1: { height: 1.5, backgroundColor: 'rgba(180,130,0,0.6)', borderRadius: 2 },
    atmChipLine2: { height: 1.5, backgroundColor: 'rgba(180,130,0,0.6)', borderRadius: 2 },
    atmName: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
    atmBalance: { color: '#FFFFFF', fontSize: 26, fontFamily: 'Poppins_700Bold', marginBottom: Spacing.sm },
    atmFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    atmTypeName: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', letterSpacing: 0.5 },
    atmEditChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: BorderRadius.full },
    atmEditChipTxt: { color: '#fff', fontSize: FontSize.xs, fontFamily: 'Poppins_600SemiBold' },
    atmCollapsedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    atmCollapsedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    atmChipTiny: { width: 20, height: 15, backgroundColor: 'rgba(255,220,100,0.75)', borderRadius: 3 },
    atmCollapsedIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
    atmCollapsedName: { color: 'rgba(255,255,255,0.85)', fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium', flex: 1 },
    atmCollapsedBal: { color: '#FFFFFF', fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    emptyAssetsCard: { borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
    emptyAssetsTxt: { fontSize: FontSize.md, fontFamily: 'Poppins_500Medium' },
    moreAssetsBtn: { borderRadius: 14, paddingVertical: Spacing.md, alignItems: 'center' },
    moreAssetsBtnTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    shortcutsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xl },
    shortcutItem: { alignItems: 'center', gap: Spacing.sm, width: '23%' },
    shortcutIconWrap: { width: 56, height: 56, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#ff6600', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: Platform.OS === 'android' ? 0 : 3 },
    shortcutTxt: { fontSize: FontSize.xs, fontFamily: 'Poppins_500Medium', textAlign: 'center' },
    segmentWrap: { flexDirection: 'row', borderRadius: BorderRadius.full, padding: 4, marginBottom: Spacing.md },
    segmentBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: BorderRadius.full },
    segmentBtnActive: { shadowColor: '#ff6600', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: Platform.OS === 'android' ? 0 : 3 },
    segmentTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_500Medium' },
    listWrap: { gap: Spacing.sm },
    txCard: {
        borderRadius: BorderRadius.lg,
        backgroundColor: '#fff', overflow: 'hidden',
    },
    txMain: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
    txIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    txInfo: { flex: 1 },
    txName: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    txMeta: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    txAmount: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    txExpanded: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
    txExpandedDivider: { height: 1, marginBottom: Spacing.sm },
    txDetail: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginBottom: 4 },
    txActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(106,111,248,0.1)', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
    editTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#6A6FF8' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(220,38,38,0.08)', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
    deleteTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#dc2626' },
    emptyList: { padding: Spacing.xl, alignItems: 'center' },
    emptyListTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular' },
    // kept for backward compat but no longer used in rendering
    listCard: { borderRadius: 22, overflow: 'hidden', borderWidth: 1 },
    listRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md, borderBottomWidth: 1 },
    listIconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    listTitle: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    listMeta: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    listAmount: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    txExpandedInline: { marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(83,96,132,0.1)', paddingTop: Spacing.sm },
    txExpandedDetail: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginBottom: Spacing.sm },
    txExpandedActions: { flexDirection: 'row', gap: Spacing.md },
    inlineEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(106,111,248,0.1)', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
    inlineEditTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#6A6FF8' },
    inlineDeleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(220,38,38,0.08)', paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
    inlineDeleteTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', color: '#dc2626' },
});
