import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Platform, useWindowDimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect, Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../constants/theme';
import { obdManager } from '../services/obdManager';
import { formatCurrency } from '../utils/currencies';
import { useApp } from '../context/AppContext';

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function MetricCard({ icon, iconComponent, value, unit, label, accent, cardBg, textPrimary, textSec, border }) {
    return (
        <View style={[mc.card, { backgroundColor: cardBg, borderColor: border }]}>
            <View style={[mc.iconWrap, { backgroundColor: `${accent}18` }]}>
                {iconComponent || <Ionicons name={icon} size={20} color={accent} />}
            </View>
            <Text style={[mc.value, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                {value}
            </Text>
            <Text style={[mc.unit, { color: accent }]}>{unit}</Text>
            <Text style={[mc.label, { color: textSec }]}>{label}</Text>
        </View>
    );
}

const mc = StyleSheet.create({
    card: {
        flex: 1, minWidth: '46%', borderRadius: 20, borderWidth: 1,
        padding: Spacing.md, alignItems: 'center', gap: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
    },
    iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    value: { fontSize: 26, fontFamily: 'Poppins_700Bold', textAlign: 'center' },
    unit: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: -4 },
    label: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center' },
});

export default function OBDLiveDataScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { currency } = useApp();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [metrics, setMetrics] = useState(obdManager.metrics);
    const [status, setStatus] = useState(obdManager.status);
    const [connectedDeviceName, setConnectedDeviceName] = useState(obdManager.connectedDeviceName);
    const [connectedDeviceId, setConnectedDeviceId] = useState(obdManager.connectedDeviceId);

    useEffect(() => {
        const onUpdate = (data) => {
            setMetrics({ ...data });
            setStatus(data.status);
            setConnectedDeviceName(data.connectedDeviceName);
            setConnectedDeviceId(data.connectedDeviceId);
        };
        obdManager.addListener(onUpdate);
        // Sync immediately
        setMetrics({ ...obdManager.metrics });
        setStatus(obdManager.status);
        setConnectedDeviceName(obdManager.connectedDeviceName);
        setConnectedDeviceId(obdManager.connectedDeviceId);
        return () => obdManager.removeListener(onUpdate);
    }, []);

    const handleDisconnect = () => {
        Alert.alert(
            'End Trip',
            'This will save your trip data and disconnect the OBD scanner.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'End Trip & Disconnect',
                    style: 'destructive',
                    onPress: async () => {
                        await obdManager.disconnect();
                        router.back();
                    }
                },
            ]
        );
    };

    const purple = colors.primary;
    const textPrimary = colors.textPrimary;
    const textSec = colors.textSecondary;
    const border = colors.border;
    const cardBg = colors.card;

    const isConnected = status === 'connected';
    const GREEN = '#10B981';
    const ORANGE = '#F59E0B';
    const BLUE = '#3B82F6';
    const RED = '#EF4444';

    const speedPct = Math.min((metrics.currentSpeed || 0) / 180, 1);

    return (
        <View style={[s.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bgOBD" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgOBD)" />
            </Svg>

            {/* Header */}
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 56 : 20 }]}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[s.headerBtn, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}
                >
                    <Ionicons name="arrow-back" size={20} color={purple} />
                </TouchableOpacity>
                <View style={s.headerCenter}>
                    <Text style={[s.headerTitle, { color: textPrimary }]}>Live Data</Text>
                    <View style={[s.statusDot, { backgroundColor: isConnected ? GREEN : '#6B7280' }]} />
                    <Text style={[s.statusTxt, { color: isConnected ? GREEN : textSec }]}>
                        {isConnected ? connectedDeviceName || 'Connected' : 'Not connected'}
                    </Text>
                </View>
                <TouchableOpacity
                    onPress={handleDisconnect}
                    style={[s.headerBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', borderWidth: 1 }]}
                    disabled={!isConnected}
                >
                    <Ionicons name="stop-circle-outline" size={20} color={RED} />
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

                {/* ── Speedometer ── */}
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push('/obd-dashboard')}
                    style={[s.speedCard, { backgroundColor: cardBg, borderColor: border }]}
                >
                    <Text style={[s.speedLabel, { color: textSec }]}>CURRENT SPEED</Text>
                    <View style={s.speedDisplay}>
                        <Text style={[s.speedValue, { color: textPrimary }]}>
                            {Math.round(metrics.currentSpeed || 0)}
                        </Text>
                        <Text style={[s.speedUnit, { color: purple }]}>km/h</Text>
                    </View>
                    {/* Speed bar */}
                    <View style={[s.speedBar, { backgroundColor: border }]}>
                        <View style={[s.speedBarFill, { width: `${speedPct * 100}%`, backgroundColor: purple }]} />
                    </View>
                    <View style={s.speedBarLabels}>
                        <Text style={[s.speedBarLbl, { color: textSec }]}>0</Text>
                        <Text style={[s.speedBarLbl, { color: textSec }]}>90</Text>
                        <Text style={[s.speedBarLbl, { color: textSec }]}>180</Text>
                    </View>

                    {/* RPM and cost sub-row */}
                    <View style={[s.speedSubRow, { borderColor: border }]}>
                        <View style={s.speedSubItem}>
                            <Text style={[s.speedSubVal, { color: ORANGE }]}>{Math.round(metrics.rpm || 0)}</Text>
                            <Text style={[s.speedSubLbl, { color: textSec }]}>RPM</Text>
                        </View>
                        <View style={[s.speedSubDivider, { backgroundColor: border }]} />
                        <View style={s.speedSubItem}>
                            <Text style={[s.speedSubVal, { color: RED }]} numberOfLines={1}>
                                {formatCurrency(metrics.cost || 0, currency)}
                            </Text>
                            <Text style={[s.speedSubLbl, { color: textSec }]}>Trip Cost</Text>
                        </View>
                        {metrics.fuelLevel !== null && (
                            <>
                                <View style={[s.speedSubDivider, { backgroundColor: border }]} />
                                <View style={s.speedSubItem}>
                                    <Text style={[s.speedSubVal, { color: GREEN }]}>{Math.round(metrics.fuelLevel || 0)}%</Text>
                                    <Text style={[s.speedSubLbl, { color: textSec }]}>Fuel Level</Text>
                                </View>
                            </>
                        )}
                    </View>

                    {/* Tap hint */}
                    <View style={s.tapHint}>
                        <Ionicons name="speedometer" size={12} color={purple} />
                        <Text style={[s.tapHintText, { color: textSec }]}>Tap for dashboard view</Text>
                        <Ionicons name="chevron-forward" size={12} color={textSec} />
                    </View>
                </TouchableOpacity>

                {/* ── Metrics Grid ── */}
                <View style={s.grid}>
                    <MetricCard
                        icon="speedometer-outline"
                        value={metrics.averageSpeed ? metrics.averageSpeed.toFixed(1) : '—'}
                        unit="km/h"
                        label="Average Speed"
                        accent={BLUE}
                        cardBg={cardBg} textPrimary={textPrimary} textSec={textSec} border={border}
                    />
                    <MetricCard
                        icon="water-outline"
                        value={metrics.realtimeFuelRate ? metrics.realtimeFuelRate.toFixed(2) : '—'}
                        unit="L/h"
                        label="Realtime Fuel Rate"
                        accent={ORANGE}
                        cardBg={cardBg} textPrimary={textPrimary} textSec={textSec} border={border}
                    />
                    <MetricCard
                        icon="analytics-outline"
                        value={metrics.avgFuelConsumption ? metrics.avgFuelConsumption.toFixed(1) : '—'}
                        unit="L/100km"
                        label="Avg Consumption"
                        accent={RED}
                        cardBg={cardBg} textPrimary={textPrimary} textSec={textSec} border={border}
                    />
                    <MetricCard
                        icon="map-outline"
                        value={metrics.distanceTraveled ? metrics.distanceTraveled.toFixed(2) : '0.00'}
                        unit="km"
                        label="Distance"
                        accent={GREEN}
                        cardBg={cardBg} textPrimary={textPrimary} textSec={textSec} border={border}
                    />
                    <MetricCard
                        icon="time-outline"
                        value={formatTime(Math.round(metrics.drivingTime || 0))}
                        unit=""
                        label="Driving Time"
                        accent={purple}
                        cardBg={cardBg} textPrimary={textPrimary} textSec={textSec} border={border}
                    />
                    <MetricCard
                        icon="flask-outline"
                        value={metrics.totalFuelConsumed ? metrics.totalFuelConsumed.toFixed(2) : '0.00'}
                        unit="L"
                        label="Fuel Consumed"
                        accent={ORANGE}
                        cardBg={cardBg} textPrimary={textPrimary} textSec={textSec} border={border}
                    />
                </View>

                {/* ── Device Info ── */}
                {(connectedDeviceId || connectedDeviceName) && (
                    <View style={[s.deviceCard, { backgroundColor: cardBg, borderColor: border }]}>
                        <Ionicons name="bluetooth" size={16} color={isConnected ? GREEN : textSec} />
                        <View style={{ flex: 1 }}>
                            <Text style={[s.deviceCardName, { color: textPrimary }]}>
                                {connectedDeviceName || 'OBD Scanner'}
                            </Text>
                            {connectedDeviceId && (
                                <Text style={[s.deviceCardId, { color: textSec }]} numberOfLines={1}>
                                    {Platform.OS === 'ios' ? `UUID: ${connectedDeviceId}` : `MAC: ${connectedDeviceId}`}
                                </Text>
                            )}
                        </View>
                        <View style={[s.connectedPill, { backgroundColor: isConnected ? 'rgba(16,185,129,0.12)' : `${textSec}15` }]}>
                            <Text style={[s.connectedPillTxt, { color: isConnected ? GREEN : textSec }]}>
                                {isConnected ? 'Live' : 'Offline'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Note */}
                <Text style={[s.note, { color: textSec }]}>
                    💾 Trip data auto-saves when engine turns off or scanner disconnects. Accumulated data persists across screen navigation.
                </Text>

                {/* Disconnect button */}
                {isConnected && (
                    <TouchableOpacity style={[s.disconnectBtn, { borderColor: 'rgba(239,68,68,0.4)' }]} onPress={handleDisconnect}>
                        <Ionicons name="stop-circle-outline" size={18} color={RED} />
                        <Text style={[s.disconnectTxt, { color: RED }]}>End Trip & Disconnect</Text>
                    </TouchableOpacity>
                )}

                <View style={{ height: 80 }} />
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1 },

    header: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md, justifyContent: 'space-between',
    },
    headerBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerTitle: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusTxt: { fontSize: FontSize.xs, fontFamily: 'Poppins_500Medium' },

    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

    // Speed card
    speedCard: {
        borderRadius: 24, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.lg,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12,
    },
    speedLabel: { fontFamily: 'Poppins_700Bold', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.sm },
    speedDisplay: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: Spacing.md },
    speedValue: { fontSize: 72, fontFamily: 'Poppins_700Bold', lineHeight: 80 },
    speedUnit: { fontSize: 22, fontFamily: 'Poppins_600SemiBold', paddingBottom: 12 },
    speedBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
    speedBarFill: { height: '100%', borderRadius: 3 },
    speedBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
    speedBarLbl: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    speedSubRow: { flexDirection: 'row', borderTopWidth: 1, paddingTop: Spacing.md, gap: 0 },
    speedSubItem: { flex: 1, alignItems: 'center' },
    speedSubDivider: { width: 1, height: 36, alignSelf: 'center' },
    speedSubVal: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    speedSubLbl: { fontSize: 11, fontFamily: 'Poppins_400Regular' },

    // Metrics grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },

    // Device card
    deviceCard: {
        flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: 14, borderWidth: 1,
        gap: 10, marginBottom: Spacing.md,
    },
    deviceCardName: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    deviceCardId: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },
    connectedPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full },
    connectedPillTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },

    note: { fontFamily: 'Poppins_400Regular', fontSize: FontSize.xs, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.xl },

    tapHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.md, paddingTop: Spacing.sm },
    tapHintText: { fontFamily: 'Poppins_500Medium', fontSize: 11 },

    disconnectBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: 1, borderRadius: BorderRadius.full, paddingVertical: Spacing.md, marginBottom: Spacing.md,
    },
    disconnectTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
});
