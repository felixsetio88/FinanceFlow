import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Modal, TextInput, Platform, Alert, useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { formatCurrency } from '../../utils/currencies';

export default function VehiclesScreen() {
    const router = useRouter();
    const { vehicles, transactions, currency, addVehicle, setDefaultVehicle } = useApp();
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
    const [newVehicleName, setNewVehicleName] = useState('');
    const [newVehicleType, setNewVehicleType] = useState('gas');
    const [saving, setSaving] = useState(false);

    const handleAddVehicle = async () => {
        if (!newVehicleName.trim()) {
            Alert.alert('Error', 'Please enter a vehicle name.');
            return;
        }
        setSaving(true);
        await addVehicle({ name: newVehicleName.trim(), type: newVehicleType, currency });
        setNewVehicleName('');
        setNewVehicleType('gas');
        setSaving(false);
        setShowAddVehicleModal(false);
    };

    const purple = colors.primary;
    const textPrimary = colors.textPrimary;
    const textSec = colors.textSecondary;
    const border = colors.border;
    const cardBg = colors.card;

    return (
        <View style={[s.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            {/* Gradient background – same as chatbot/add-transaction */}
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight}>
                <Defs>
                    <SvgGrad id="bgGrad2" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGrad2)" />
            </Svg>

            {/* Drag handle – indicates swipe-to-close */}
            <View style={s.dragHandle}>
                <View style={[s.dragBar, { backgroundColor: colors.textSecondary }]} />
            </View>

            <View style={s.header}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[s.headerIconBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                >
                    <Ionicons name="arrow-back" size={20} color={purple} />
                </TouchableOpacity>

                <View style={s.headerCenter}>
                    <View style={[s.headerAvatar, { backgroundColor: purple }]}>
                        <Ionicons name="car-sport" size={16} color="#fff" />
                    </View>
                    <View>
                        <Text style={[s.headerTitle, { color: textPrimary }]}>My Vehicles</Text>
                        <Text style={[s.headerSub, { color: textSec }]}>{vehicles.length} registered</Text>
                    </View>
                </View>

                {/* "+" button matching chatbot style */}
                <TouchableOpacity
                    onPress={() => setShowAddVehicleModal(true)}
                    style={[s.headerIconBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                >
                    <Ionicons name="add" size={22} color={purple} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
                {vehicles && vehicles.length > 0 ? (
                    <>

                        {vehicles.map(v => {
                            const vehicleTxs = transactions.filter(t => t.vehicleId === v.id);
                            const refuels = vehicleTxs.filter(t => t.vehicleLogType === 'refuel');
                            const maintenances = vehicleTxs.filter(t => t.vehicleLogType === 'maintenance');
                            const latestOdo = vehicleTxs.reduce((max, t) => Math.max(max, t.vehicleOdometer || 0), v.initialOdometer || 0);
                            const totalCost = vehicleTxs.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
                            const volUnit = v.type === 'ev' ? 'kWh' : 'L';
                            const totalVolume = refuels.reduce((sum, t) => sum + (t.vehicleVolume || 0), 0);
                            const sortedRefuels = [...refuels].sort((a, b) => new Date(a.date) - new Date(b.date));
                            const firstOdo = v.initialOdometer || sortedRefuels[0]?.vehicleOdometer || 0;
                            const lastOdo = sortedRefuels[sortedRefuels.length - 1]?.vehicleOdometer || 0;
                            const totalDist = Math.max(0, lastOdo - firstOdo);
                            const avgEff = totalVolume > 0 && totalDist > 0 ? (totalDist / totalVolume).toFixed(1) : null;

                            return (
                                <TouchableOpacity
                                    key={v.id}
                                    style={[s.vehicleCard, { backgroundColor: cardBg, borderColor: border }]}
                                    onPress={() => router.push(`/vehicle/${v.id}`)}
                                    activeOpacity={0.82}
                                >
                                    {/* Card header */}
                                    <View style={s.cardHeader}>
                                        <View style={[s.cardIconWrap, { backgroundColor: v.type === 'ev' ? 'rgba(16,185,129,0.12)' : `${purple}15` }]}>
                                            {v.type === 'ev' ? (
                                                <Ionicons name="flash" size={22} color={colors.emerald} />
                                            ) : (
                                                <MaterialCommunityIcons name="gas-station" size={22} color={purple} />
                                            )}
                                        </View>
                                        <View style={{ flex: 1, marginLeft: Spacing.md }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <Text style={[s.vehicleName, { color: textPrimary }]}>{v.name}</Text>
                                                {v.isDefault === 1 && (
                                                    <View style={[s.defaultBadge, { backgroundColor: colors.emeraldLight }]}>
                                                        <Text style={[s.defaultBadgeTxt, { color: colors.emeraldDark }]}>Default</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[s.vehicleType, { color: textSec }]}>
                                                {v.type === 'ev' ? 'Electric Vehicle' : 'Gasoline / Diesel'}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={s.starBtn}
                                            onPress={() => setDefaultVehicle(v.id)}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name={v.isDefault === 1 ? 'star' : 'star-outline'} size={20} color={v.isDefault === 1 ? colors.gold : textSec} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Stats row */}
                                    <View style={[s.cardDivider, { backgroundColor: border }]} />
                                    <View style={s.statsRow}>
                                        <View style={s.statItem}>
                                            <Text style={[s.statVal, { color: textPrimary }]}>
                                                {latestOdo > 0 ? latestOdo.toLocaleString() : '—'}
                                            </Text>
                                            <Text style={[s.statLbl, { color: textSec }]}>Odometer (km)</Text>
                                        </View>
                                        <View style={[s.statDivider, { backgroundColor: border }]} />
                                        <View style={s.statItem}>
                                            <Text style={[s.statVal, { color: textPrimary }]}>
                                                {totalVolume > 0 ? `${totalVolume.toFixed(1)} ${volUnit}` : '—'}
                                            </Text>
                                            <Text style={[s.statLbl, { color: textSec }]}>Total Consumed</Text>
                                        </View>
                                        <View style={[s.statDivider, { backgroundColor: border }]} />
                                        <View style={s.statItem}>
                                            <Text style={[s.statVal, { color: avgEff ? '#10B981' : textPrimary }]}>
                                                {avgEff ? `${avgEff}` : '—'}
                                            </Text>
                                            <Text style={[s.statLbl, { color: textSec }]}>
                                                {v.type === 'ev' ? 'km/kWh' : 'km/L'}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Footer badges */}
                                    <View style={s.cardFooter}>
                                        <View style={[s.badge, { backgroundColor: `${purple}12` }]}>
                                            <Ionicons name="water-outline" size={12} color={purple} />
                                            <Text style={[s.badgeTxt, { color: purple }]}>{refuels.length} refuels</Text>
                                        </View>
                                        <View style={[s.badge, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                                            <Ionicons name="build-outline" size={12} color={colors.gold} />
                                            <Text style={[s.badgeTxt, { color: '#f59e0b' }]}>{maintenances.length} services</Text>
                                        </View>
                                        <Text style={[s.totalCost, { color: '#ef4444' }]}>
                                            {formatCurrency(totalCost, currency)} total
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </>
                ) : (
                    <View style={[s.emptyState, { borderColor: border }]}>
                        <View style={[s.emptyIcon, { backgroundColor: `${purple}15` }]}>
                            <Ionicons name="car-sport-outline" size={40} color={purple} />
                        </View>
                        <Text style={[s.emptyTitle, { color: textPrimary }]}>No Vehicles Yet</Text>
                        <Text style={[s.emptyDesc, { color: textSec }]}>
                            Track fuel efficiency, maintenance costs and driving metrics for your vehicles.
                        </Text>
                        <TouchableOpacity
                            style={[s.emptyBtn, { backgroundColor: purple }]}
                            onPress={() => setShowAddVehicleModal(true)}
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={s.emptyBtnTxt}>Add First Vehicle</Text>
                        </TouchableOpacity>
                    </View>
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Add Vehicle Modal */}
            <Modal visible={showAddVehicleModal} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { backgroundColor: cardBg }]}>
                        {/* Modal header */}
                        <View style={s.modalHeader}>
                            <View style={[s.cardIconWrap, { backgroundColor: `${purple}15` }]}>
                                <Ionicons name="car-sport" size={20} color={purple} />
                            </View>
                            <Text style={[s.modalTitle, { color: textPrimary }]}>Add Vehicle</Text>
                            <TouchableOpacity onPress={() => setShowAddVehicleModal(false)} style={[s.modalClose, { backgroundColor: colors.inputBg }]}>
                                <Ionicons name="close" size={18} color={textSec} />
                            </TouchableOpacity>
                        </View>

                        <Text style={[s.inputLabel, { color: textSec }]}>Vehicle Name</Text>
                        <TextInput
                            style={[s.textInput, { borderColor: border, color: textPrimary, backgroundColor: colors.inputBg }]}
                            placeholder="e.g. Toyota Corolla"
                            placeholderTextColor={colors.textMuted}
                            value={newVehicleName}
                            onChangeText={setNewVehicleName}
                        />

                        <Text style={[s.inputLabel, { color: textSec, marginTop: Spacing.md }]}>Vehicle Type</Text>
                        <View style={[s.typeToggle, { backgroundColor: colors.inputBg, borderColor: border }]}>
                            <TouchableOpacity
                                style={[s.typeBtn, newVehicleType === 'gas' && { backgroundColor: purple, shadowColor: purple }]}
                                onPress={() => setNewVehicleType('gas')}
                            >
                                <Ionicons name="water" size={14} color={newVehicleType === 'gas' ? '#fff' : purple} />
                                <Text style={[s.typeTxt, { color: textSec }, newVehicleType === 'gas' && { color: '#fff' }]}>Gas (Liters)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.typeBtn, newVehicleType === 'ev' && { backgroundColor: '#10B981', shadowColor: '#10B981' }]}
                                onPress={() => setNewVehicleType('ev')}
                            >
                                <Ionicons name="flash" size={14} color={newVehicleType === 'ev' ? '#fff' : colors.emerald} />
                                <Text style={[s.typeTxt, { color: textSec }, newVehicleType === 'ev' && { color: '#fff' }]}>Electric (kWh)</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.modalActions}>
                            <TouchableOpacity style={[s.cancelBtn, { borderColor: border }]} onPress={() => setShowAddVehicleModal(false)}>
                                <Text style={[s.cancelTxt, { color: textSec }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.saveBtn, { backgroundColor: purple, opacity: saving ? 0.7 : 1 }]}
                                onPress={handleAddVehicle}
                                disabled={saving}
                            >
                                <Text style={s.saveTxt}>{saving ? 'Saving...' : 'Save Vehicle'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },

    dragHandle: {
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 12 : 8,
        paddingBottom: 4,
    },
    dragBar: {
        width: 36, height: 4, borderRadius: 2, opacity: 0.35,
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Platform.OS === 'ios' ? 20 : 16,
        paddingBottom: Spacing.md,
    },
    headerIconBtn: {
        width: 40, height: 40, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    headerAvatar: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    headerSub: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular' },

    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Platform.OS === 'android' ? 90 : 60 },

    sectionLabel: {
        fontSize: 10, fontFamily: 'Poppins_700Bold',
        letterSpacing: 1.2, textTransform: 'uppercase',
        marginBottom: Spacing.md,
    },

    vehicleCard: {
        borderRadius: 20, borderWidth: 1,
        marginBottom: Spacing.md, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: Platform.OS === 'android' ? 0 : 3,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
    cardIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    vehicleName: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    vehicleType: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    starBtn: { padding: 4 },
    defaultBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    defaultBadgeTxt: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
    cardDivider: { height: 1, marginHorizontal: Spacing.md, opacity: 0.5 },

    statsRow: {
        flexDirection: 'row', paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md, alignItems: 'center',
    },
    statItem: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    statLbl: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 2, textAlign: 'center' },
    statDivider: { width: 1, height: 32, opacity: 0.4 },

    cardFooter: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    },
    badge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: Spacing.sm, paddingVertical: 4,
        borderRadius: BorderRadius.full,
    },
    badgeTxt: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
    totalCost: { marginLeft: 'auto', fontSize: FontSize.xs, fontFamily: 'Poppins_700Bold' },

    // Empty state
    emptyState: {
        marginTop: Spacing.xxl, padding: Spacing.xl,
        borderRadius: 20, borderWidth: 1, borderStyle: 'dashed',
        alignItems: 'center', gap: Spacing.md,
    },
    emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    emptyDesc: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 22 },
    emptyBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full, marginTop: Spacing.sm,
    },
    emptyBtnTxt: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center', alignItems: 'center',
        paddingHorizontal: Spacing.lg,
    },
    modalBox: {
        width: '100%', borderRadius: 24,
        padding: Spacing.xl,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18, shadowRadius: 20, elevation: Platform.OS === 'android' ? 0 : 10,
    },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
    modalTitle: { flex: 1, fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    modalClose: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    inputLabel: {
        fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold',
        marginBottom: Spacing.sm, marginTop: Spacing.md,
    },
    textInput: {
        height: 50, borderWidth: 1, borderRadius: 12,
        paddingHorizontal: Spacing.md,
        fontFamily: 'Poppins_400Regular', fontSize: FontSize.md,
    },

    typeToggle: {
        flexDirection: 'row', borderRadius: BorderRadius.full,
        padding: 4, borderWidth: 1, marginTop: 4,
    },
    typeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: Spacing.md, borderRadius: BorderRadius.full,
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 0,
    },
    typeTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },

    modalActions: {
        flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl,
    },
    cancelBtn: {
        flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.full,
        alignItems: 'center', borderWidth: 1,
    },
    cancelTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    saveBtn: {
        flex: 2, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center',
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 3,
    },
    saveTxt: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },
});
