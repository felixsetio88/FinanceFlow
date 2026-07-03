import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, Platform, useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currencies';
import { Spacing, FontSize, BorderRadius } from '../../constants/theme';

export default function VehicleDashboard() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { vehicles, transactions, currency, deleteVehicle, deleteTransaction } = useApp();
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [filter, setFilter] = useState('all'); // 'all' | 'refuel' | 'maintenance'
    const [expandedId, setExpandedId] = useState(null);

    const vehicle = useMemo(() => vehicles.find(v => v.id === id), [vehicles, id]);

    const vehicleTransactions = useMemo(() => {
        return transactions
            .filter(t => t.vehicleId === id)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [transactions, id]);

    const filteredTransactions = useMemo(() => {
        if (filter === 'all') return vehicleTransactions;
        return vehicleTransactions.filter(t => t.vehicleLogType === filter);
    }, [vehicleTransactions, filter]);

    // Summary stats
    const stats = useMemo(() => {
        const refuels = [...vehicleTransactions]
            .filter(t => t.vehicleLogType === 'refuel')
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let totalVolume = 0;
        let totalRefuelCost = 0;
        let totalMaintenanceCost = 0;
        let latestOdo = vehicle?.initialOdometer || 0;

        refuels.forEach(r => {
            totalVolume += (r.vehicleVolume || 0);
            totalRefuelCost += Math.abs(r.amount || 0);
            if ((r.vehicleOdometer || 0) > latestOdo) latestOdo = r.vehicleOdometer;
        });

        vehicleTransactions.filter(t => t.vehicleLogType === 'maintenance').forEach(m => {
            totalMaintenanceCost += Math.abs(m.amount || 0);
            if ((m.vehicleOdometer || 0) > latestOdo) latestOdo = m.vehicleOdometer;
        });

        const firstOdo = vehicle?.initialOdometer || refuels[0]?.vehicleOdometer || 0;
        const lastOdo = refuels[refuels.length - 1]?.vehicleOdometer || 0;
        const totalDistance = Math.max(0, lastOdo - firstOdo);
        const avgEfficiency = totalVolume > 0 && totalDistance > 0 ? totalDistance / totalVolume : 0;
        const totalCost = totalRefuelCost + totalMaintenanceCost;
        const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;

        return { totalCost, totalVolume, totalDistance, latestOdo, avgEfficiency, costPerKm, refuelCount: refuels.length };
    }, [vehicleTransactions, vehicle]);

    if (!vehicle) {
        return (
            <View style={[s.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
                <Text style={{ color: colors.textPrimary, fontFamily: 'Poppins_500Medium', fontSize: FontSize.md }}>Vehicle not found.</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleDeleteVehicle = () => {
        Alert.alert('Delete Vehicle', 'Are you sure? Its transaction history will be kept but will lose the vehicle link.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteVehicle(id); router.back(); } }
        ]);
    };

    const confirmDeleteTx = (tx) => {
        Alert.alert('Delete Record', 'Delete this record?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(tx.id) }
        ]);
    };

    const isEV = vehicle.type === 'ev';
    const volUnit = isEV ? 'kWh' : 'L';
    const effUnit = isEV ? 'km/kWh' : 'km/L';
    const purple = colors.primary;
    const textPrimary = colors.textPrimary;
    const textSec = colors.textSecondary;
    const border = colors.border;
    const cardBg = colors.card;

    // Build enriched transaction list with computed per-tx metrics
    const enrichedTransactions = useMemo(() => {
        const refuels = [...vehicleTransactions]
            .filter(t => t.vehicleLogType === 'refuel')
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const refuelWithPrev = refuels.map((r, idx) => {
            const prevOdo = idx === 0
                ? (vehicle?.initialOdometer || null)
                : (refuels[idx - 1]?.vehicleOdometer || null);
            return { ...r, _prevOdo: prevOdo };
        });
        const refuelMap = Object.fromEntries(refuelWithPrev.map(r => [r.id, r]));

        return filteredTransactions.map(tx => ({
            ...tx,
            _prevOdo: refuelMap[tx.id]?._prevOdo ?? null
        }));
    }, [filteredTransactions, vehicleTransactions, vehicle]);

    return (
        <View style={[s.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            {/* Gradient background */}
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight}>
                <Defs>
                    <SvgGrad id="vBg" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#vBg)" />
            </Svg>

            {/* Drag handle – indicates swipe-to-close */}
            <View style={s.dragHandle}>
                <View style={[s.dragBar, { backgroundColor: colors.textSecondary }]} />
            </View>

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[s.headerIconBtn, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}
                >
                    <Ionicons name="arrow-back" size={20} color={purple} />
                </TouchableOpacity>
                <View style={s.headerCenter}>
                    <View style={[s.headerAvatar, { backgroundColor: isEV ? '#10B981' : purple }]}>
                        <Ionicons name={isEV ? 'flash' : 'car-sport'} size={16} color="#fff" />
                    </View>
                    <View>
                        <Text style={[s.headerTitle, { color: textPrimary }]}>{vehicle.name}</Text>
                        <Text style={[s.headerSub, { color: textSec }]}>{isEV ? 'Electric Vehicle' : 'Gasoline / Diesel'}</Text>
                    </View>
                </View>
                <TouchableOpacity
                    onPress={handleDeleteVehicle}
                    style={[s.headerIconBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', borderWidth: 1 }]}
                >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Stats grid – transparent, no border */}
                <View style={s.kpiGrid}>
                    <View style={[s.kpiCard, { backgroundColor: 'transparent', borderWidth: 0 }]}>
                        <Ionicons name="speedometer-outline" size={18} color={purple} />
                        <Text style={[s.kpiVal, { color: textPrimary }]}>
                            {stats.latestOdo > 0 ? stats.latestOdo.toLocaleString() : '—'}
                        </Text>
                        <Text style={[s.kpiLbl, { color: textSec }]}>Odometer (km)</Text>
                    </View>
                    <View style={[s.kpiCard, { backgroundColor: 'transparent', borderWidth: 0 }]}>
                        <Ionicons name={isEV ? 'flash-outline' : 'water-outline'} size={18} color={isEV ? '#10B981' : '#ef4444'} />
                        <Text style={[s.kpiVal, { color: stats.avgEfficiency > 0 ? '#10B981' : textPrimary }]}>
                            {stats.avgEfficiency > 0 ? stats.avgEfficiency.toFixed(2) : '—'}
                        </Text>
                        <Text style={[s.kpiLbl, { color: textSec }]}>Avg {effUnit}</Text>
                    </View>
                    <View style={[s.kpiCard, { backgroundColor: 'transparent', borderWidth: 0 }]}>
                        <Ionicons name="trending-up-outline" size={18} color="#f59e0b" />
                        <Text style={[s.kpiVal, { color: textPrimary }]}>
                            {stats.costPerKm > 0 ? formatCurrency(stats.costPerKm, currency) : '—'}
                        </Text>
                        <Text style={[s.kpiLbl, { color: textSec }]}>Cost / km</Text>
                    </View>
                    <View style={[s.kpiCard, { backgroundColor: 'transparent', borderWidth: 0 }]}>
                        <Ionicons name="wallet-outline" size={18} color="#3b82f6" />
                        <Text style={[s.kpiVal, { color: '#ef4444' }]}>
                            {formatCurrency(stats.totalCost, currency)}
                        </Text>
                        <Text style={[s.kpiLbl, { color: textSec }]}>Total Spent</Text>
                    </View>
                </View>

                {/* Filter chips */}
                <View style={s.sortRow}>
                    <Text style={[s.sortLabel, { color: colors.textSecondary }]}>Filter:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sortChipRow}>
                        {[{ key: 'all', label: 'All Records' }, { key: 'refuel', label: 'Refueling' }, { key: 'maintenance', label: 'Maintenance' }].map(f => (
                            <TouchableOpacity
                                key={f.key}
                                style={[
                                    s.sortChip,
                                    { backgroundColor: colors.card, borderColor: colors.border },
                                    filter === f.key && { backgroundColor: 'rgba(255,102,0,0.12)', borderColor: colors.primary }
                                ]}
                                onPress={() => setFilter(f.key)}
                            >
                                <Text style={[
                                    s.sortChipText,
                                    { color: colors.textSecondary },
                                    filter === f.key && { color: colors.primary }
                                ]}>{f.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Transaction list */}
                <View style={{ paddingHorizontal: Spacing.lg }}>
                    {enrichedTransactions.length === 0 ? (
                        <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                            <Ionicons name="document-text-outline" size={52} color={border} />
                            <Text style={{ color: textSec, marginTop: Spacing.md, fontFamily: 'Poppins_500Medium', fontSize: FontSize.md }}>
                                No records found
                            </Text>
                            <Text style={{ color: textSec, fontFamily: 'Poppins_400Regular', fontSize: FontSize.sm, marginTop: 4 }}>
                                Add a transaction in the Car category.
                            </Text>
                        </View>
                    ) : (
                        enrichedTransactions.map((tx) => {
                            const isRefuel = tx.vehicleLogType === 'refuel';
                            const amount = Math.abs(tx.amount || 0);
                            const expanded = expandedId === tx.id;

                            // Per-refuel metrics
                            const distanceDriven = (isRefuel && tx._prevOdo != null && tx.vehicleOdometer)
                                ? Math.max(0, tx.vehicleOdometer - tx._prevOdo)
                                : null;
                            const efficiency = (isRefuel && distanceDriven != null && tx.vehicleVolume > 0)
                                ? distanceDriven / tx.vehicleVolume
                                : null;
                            const pricePerUnit = (isRefuel && tx.vehicleVolume > 0)
                                ? amount / tx.vehicleVolume
                                : null;
                            const costPerKm = (isRefuel && distanceDriven != null && distanceDriven > 0)
                                ? amount / distanceDriven
                                : null;

                            const formattedDate = new Date(tx.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

                            return (
                                <TouchableOpacity
                                    key={tx.id}
                                    activeOpacity={0.85}
                                    style={[s.txCard, { backgroundColor: cardBg, borderColor: border }]}
                                    onPress={() => setExpandedId(expanded ? null : tx.id)}
                                >
                                    {/* Card top row */}
                                    <View style={s.txTop}>
                                        <View style={[s.txIconWrap, { backgroundColor: isRefuel ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }]}>
                                            <Ionicons
                                                name={isRefuel ? (isEV ? 'flash-outline' : 'water-outline') : 'build-outline'}
                                                size={20}
                                                color={isRefuel ? (isEV ? '#10B981' : '#ef4444') : '#f59e0b'}
                                            />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                                            <Text style={[s.txType, { color: textPrimary }]}>
                                                {isRefuel ? (isEV ? 'Charging' : 'Refuel') : 'Maintenance'}
                                            </Text>
                                            <Text style={[s.txDate, { color: textSec }]}>{formattedDate}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                            <Text style={s.txAmount}>−{formatCurrency(amount, currency)}</Text>
                                            <Ionicons
                                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                                size={14}
                                                color={textSec}
                                            />
                                        </View>
                                    </View>

                                    {/* Collapsed: compact summary */}
                                    {!expanded && (
                                        <View style={s.compactInfoBlock}>
                                            {isRefuel ? (
                                                <>
                                                    <View style={s.compactRow}>
                                                        <View style={s.compactPill}>
                                                            <Ionicons name={isEV ? 'flash-outline' : 'water-outline'} size={12} color={isEV ? '#10B981' : '#ef4444'} />
                                                            <Text style={[s.compactTxt, { color: textSec }]}>
                                                                {tx.vehicleVolume ? `${tx.vehicleVolume} ${volUnit}` : '—'}
                                                            </Text>
                                                            <Text style={[s.compactSep, { color: textSec }]}>→</Text>
                                                            <Text style={[s.compactTxt, { color: textSec }]}>
                                                                {pricePerUnit != null ? `${formatCurrency(pricePerUnit, currency)}/${volUnit}` : '—'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <View style={s.compactRow}>
                                                        {efficiency != null && (
                                                            <View style={s.compactPill}>
                                                                <Ionicons name="trending-up-outline" size={12} color="#10B981" />
                                                                <Text style={[s.compactTxt, { color: '#10B981', fontFamily: 'Poppins_600SemiBold' }]}>
                                                                    {effUnit}: {efficiency.toFixed(2)}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {tx.vehicleOdometer ? (
                                                            <View style={s.compactPill}>
                                                                <Ionicons name="speedometer-outline" size={12} color={purple} />
                                                                <Text style={[s.compactTxt, { color: textSec }]}>
                                                                    {tx.vehicleOdometer.toLocaleString()} km
                                                                </Text>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                </>
                                            ) : (
                                                <View style={s.compactRow}>
                                                    {tx.vehicleOdometer ? (
                                                        <View style={s.compactPill}>
                                                            <Ionicons name="speedometer-outline" size={12} color={purple} />
                                                            <Text style={[s.compactTxt, { color: textSec }]}>
                                                                {tx.vehicleOdometer.toLocaleString()} km
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                    {tx.vehicleMaintenanceItems ? (
                                                        <View style={[s.compactPill, { flex: 1 }]}>
                                                            <Ionicons name="build-outline" size={12} color="#f59e0b" />
                                                            <Text style={[s.compactTxt, { color: textSec, flexShrink: 1 }]} numberOfLines={1}>
                                                                {tx.vehicleMaintenanceItems}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {/* Expanded: full details */}
                                    {expanded && (
                                        <View>
                                            <View style={[s.expandDivider, { backgroundColor: `${purple}30` }]} />
                                            <View style={s.expandBlock}>
                                                {isRefuel ? (
                                                    <>
                                                        <DetailRow icon="water-outline" iconColor={isEV ? '#10B981' : '#ef4444'} label={isEV ? 'Energy Used' : 'Fuel Volume'} value={tx.vehicleVolume ? `${tx.vehicleVolume} ${volUnit}` : '—'} colors={colors} />
                                                        <DetailRow icon="pricetag-outline" iconColor="#f59e0b" label={`Price / ${volUnit}`} value={pricePerUnit != null ? formatCurrency(pricePerUnit, currency) : '—'} colors={colors} />
                                                        <DetailRow icon="cash-outline" iconColor="#ef4444" label="Total Cost" value={formatCurrency(amount, currency)} highlight colors={colors} />
                                                        <DetailRow icon="trending-up-outline" iconColor="#10B981" label={effUnit} value={efficiency != null ? `${efficiency.toFixed(2)} ${effUnit}` : '—'} highlight={efficiency != null} colors={colors} />
                                                        <DetailRow icon="navigate-outline" iconColor="#3b82f6" label="Distance Driven" value={distanceDriven != null ? `${distanceDriven.toLocaleString()} km` : '—'} colors={colors} />
                                                        <DetailRow icon="speedometer-outline" iconColor={purple} label="Odometer Before" value={tx._prevOdo != null ? `${Number(tx._prevOdo).toLocaleString()} km` : '—'} colors={colors} />
                                                        <DetailRow icon="speedometer" iconColor={purple} label="Odometer After" value={tx.vehicleOdometer ? `${tx.vehicleOdometer.toLocaleString()} km` : '—'} colors={colors} />
                                                        {costPerKm != null && (
                                                            <DetailRow icon="trending-up-outline" iconColor="#3b82f6" label="Cost / km" value={formatCurrency(costPerKm, currency)} colors={colors} />
                                                        )}
                                                        {tx.notes ? (
                                                            <DetailRow icon="document-text-outline" iconColor={textSec} label="Notes" value={tx.notes} colors={colors} />
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <>
                                                        <DetailRow icon="cash-outline" iconColor="#ef4444" label="Maintenance Cost" value={formatCurrency(amount, currency)} highlight colors={colors} />
                                                        <DetailRow icon="speedometer-outline" iconColor={purple} label="Odometer" value={tx.vehicleOdometer ? `${tx.vehicleOdometer.toLocaleString()} km` : '—'} colors={colors} />
                                                        {tx.vehicleMaintenanceItems ? (
                                                            <DetailRow icon="build-outline" iconColor="#f59e0b" label="Repaired / Replaced" value={tx.vehicleMaintenanceItems} colors={colors} />
                                                        ) : null}
                                                        {tx.notes ? (
                                                            <DetailRow icon="document-text-outline" iconColor={textSec} label="Notes" value={tx.notes} colors={colors} />
                                                        ) : null}
                                                    </>
                                                )}
                                            </View>

                                            {/* Actions: Edit + Delete – match transaction history style */}
                                            <View style={s.actionRow}>
                                                <TouchableOpacity
                                                    style={s.editBtn}
                                                    onPress={() => router.push({ pathname: '/add-transaction', params: { editId: tx.id } })}
                                                >
                                                    <Ionicons name="pencil" size={13} color="#6A6FF8" />
                                                    <Text style={s.editTxt}>Edit</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={s.deleteBtn}
                                                    onPress={() => confirmDeleteTx(tx)}
                                                >
                                                    <Ionicons name="trash" size={13} color="#dc2626" />
                                                    <Text style={s.deleteTxt}>Delete</Text>
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
        </View>
    );
}

function DetailRow({ icon, iconColor, label, value, highlight, colors }) {
    return (
        <View style={s.detailRow}>
            <View style={[s.detailIconWrap, { backgroundColor: `${iconColor}15` }]}>
                <Ionicons name={icon} size={13} color={iconColor} />
            </View>
            <Text style={[s.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[s.detailValue, { color: highlight ? '#10B981' : colors.textPrimary }]}>{value}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Platform.OS === 'ios' ? 8 : 8,
        paddingBottom: Spacing.md,
    },
    headerIconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    headerAvatar: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    headerSub: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular' },

    dragHandle: {
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 12 : 8,
        paddingBottom: 4,
    },
    dragBar: {
        width: 36, height: 4, borderRadius: 2, opacity: 0.35,
    },

    kpiGrid: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: Spacing.lg, gap: Spacing.md,
        marginBottom: Spacing.lg,
    },
    kpiCard: {
        width: '47%', padding: Spacing.md,
        borderRadius: 16, borderWidth: 1,
        gap: 4,
    },
    kpiVal: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold', marginTop: 2 },
    kpiLbl: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular' },

    sortRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        gap: Spacing.sm,
    },
    sortLabel: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_600SemiBold',
    },
    sortChipRow: { flexDirection: 'row', gap: 8 },
    sortChip: {
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        paddingHorizontal: Spacing.md,
        paddingVertical: 5,
    },
    sortChipText: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Transaction card
    txCard: {
        borderRadius: 18, borderWidth: 1, marginBottom: Spacing.md,
        overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: Platform.OS === 'android' ? 0 : 2,
    },
    txTop: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
    txIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    txType: { fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
    txDate: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    txAmount: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold', color: '#ef4444' },

    // Compact collapsed view
    compactInfoBlock: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.sm,
        gap: 6,
    },
    compactRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    compactPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    compactTxt: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_500Medium',
    },
    compactSep: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        marginHorizontal: 2,
    },

    // Expanded view
    expandDivider: { height: 1, marginHorizontal: Spacing.md },
    expandBlock: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        gap: 2,
    },
    detailRow: {
        flexDirection: 'row', alignItems: 'center',
        gap: Spacing.sm, paddingVertical: 6,
    },
    detailIconWrap: {
        width: 24, height: 24, borderRadius: 7,
        alignItems: 'center', justifyContent: 'center',
    },
    detailLabel: {
        flex: 1, fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular',
    },
    detailValue: {
        fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold',
        textAlign: 'right', flexShrink: 1, maxWidth: '55%',
    },

    // Edit / Delete actions – match transaction history
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: Spacing.md,
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
        paddingTop: Spacing.xs,
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
});
