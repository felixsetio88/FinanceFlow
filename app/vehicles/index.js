import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Modal, TextInput, Platform, Alert, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { Spacing, FontSize, BorderRadius } from '../../constants/theme';
import { formatCurrency } from '../../utils/currencies';
import { obdService } from '../../services/obdService';
import { obdManager } from '../../services/obdManager';

export default function VehiclesScreen() {
    const router = useRouter();
    const { vehicles, transactions, currency, addVehicle, setDefaultVehicle, updateVehicle: ctxUpdateVehicle } = useApp();
    const { colors, isDark } = useTheme();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // Add vehicle modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [newVehicleName, setNewVehicleName] = useState('');
    const [newVehicleType, setNewVehicleType] = useState('gas');
    const [saving, setSaving] = useState(false);

    // OBD settings modal
    const [showOBDSettings, setShowOBDSettings] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [foundDevices, setFoundDevices] = useState([]);
    const [connecting, setConnecting] = useState(false);
    const [obdStatus, setObdStatus] = useState('disconnected');
    const [connectedDeviceName, setConnectedDeviceName] = useState(null);
    const [elmConnected, setElmConnected] = useState(false);
    const [ecuConnected, setEcuConnected] = useState(false);

    // Derive saved device from the default vehicle
    const savedDevice = React.useMemo(() => {
        const def = vehicles.find(v => v.isDefault === 1);
        if (def?.obdMacAddress) return { id: def.obdMacAddress, name: def.obdDeviceName || 'ELM327 Scanner' };
        return null;
    }, [vehicles]);

    // setSavedDevice is handled via ctxUpdateVehicle — no local state needed

    // Subscribe to OBD state changes
    useEffect(() => {
        const onState = ({ status, connectedDeviceName: name, elmConnected: elm, ecuConnected: ecu }) => {
            setObdStatus(status);
            setConnectedDeviceName(name || null);
            setElmConnected(!!elm);
            setEcuConnected(!!ecu);
        };
        obdManager.addListener(onState);
        // Reflect current state
        setObdStatus(obdManager.status);
        setConnectedDeviceName(obdManager.connectedDeviceName);
        setElmConnected(obdManager.elmConnected);
        setEcuConnected(obdManager.ecuConnected);
        return () => obdManager.removeListener(onState);
    }, []);

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
        setShowAddModal(false);
    };

    const handleScan = async () => {
        setScanning(true);
        setFoundDevices([]);
        try {
            await obdService.scanForDevices((device) => {
                setFoundDevices(prev => {
                    if (prev.find(d => d.id === device.id)) return prev;
                    return [...prev, device];
                });
            }, 12000);
        } catch (e) {
            Alert.alert('Scan Failed', e.message);
        }
        setScanning(false);
    };

    const handleConnect = async (device) => {
        const defaultVehicle = vehicles.find(v => v.isDefault === 1);
        if (!defaultVehicle) {
            Alert.alert('No Default Vehicle', 'Please set a vehicle as default before connecting an OBD scanner.');
            return;
        }
        setConnecting(true);
        // Enforce 32-second UI timeout (slightly more than the 30s in service)
        const uiTimeout = setTimeout(() => {
            setConnecting(false);
            Alert.alert('Connection Timed Out', 'Could not connect within 30 seconds. Make sure the OBD scanner is plugged in, Bluetooth is on, and the ignition is in the ON position.');
        }, 32000);
        try {
            // Save the scanner ID to this vehicle (only one device allowed)
            const updated = { ...defaultVehicle, obdMacAddress: device.id, obdDeviceName: device.name };
            await ctxUpdateVehicle(updated);
            obdManager.currentVehicle = updated;
            const success = await obdManager.connectToVehicle(updated, device);
            if (!success) {
                Alert.alert('Connection Failed', `Could not connect to ${device.name}. Check that the OBD scanner is plugged into the OBD port and Bluetooth is on.`);
            } else {
                setFoundDevices([]);
            }
        } catch (e) {
            Alert.alert('Error', e.message);
        }
        clearTimeout(uiTimeout);
        setConnecting(false);
    };

    const handleDisconnect = async () => {
        Alert.alert(
            'Disconnect Scanner',
            'This will save your trip data and disconnect the scanner.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Disconnect', style: 'destructive', onPress: () => obdManager.disconnect() },
            ]
        );
    };

    const purple = colors.primary;
    const textPrimary = colors.textPrimary;
    const textSec = colors.textSecondary;
    const border = colors.border;
    const cardBg = colors.card;

    const isConnected = obdStatus === 'connected';
    const isConnecting = obdStatus === 'connecting';

    return (
        <View style={[s.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            {/* Gradient background */}
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bgGradV" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGradV)" />
            </Svg>

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
                    <View style={[s.headerAvatar, { backgroundColor: purple }]}>
                        <Ionicons name="car-sport" size={16} color="#fff" />
                    </View>
                    <View>
                        <Text style={[s.headerTitle, { color: textPrimary }]}>My Vehicles</Text>
                        <Text style={[s.headerSub, { color: textSec }]}>{vehicles.length} registered</Text>
                    </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                        onPress={() => setShowOBDSettings(true)}
                        style={[s.headerIconBtn, { backgroundColor: isConnected ? 'rgba(16,185,129,0.15)' : cardBg, borderColor: isConnected ? colors.emerald : border, borderWidth: 1 }]}
                    >
                        <Ionicons name="settings-outline" size={19} color={isConnected ? colors.emerald : purple} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setShowAddModal(true)}
                        style={[s.headerIconBtn, { backgroundColor: cardBg, borderColor: border, borderWidth: 1 }]}
                    >
                        <Ionicons name="add" size={22} color={purple} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

                {/* ── OBD Connection Banner ── */}
                <View style={[s.obdBanner, {
                    backgroundColor: isConnected ? 'rgba(16,185,129,0.08)' : cardBg,
                    borderColor: isConnected ? colors.emerald : border,
                }]}>
                    <View style={[s.obdIconWrap, {
                        backgroundColor: isConnected ? 'rgba(16,185,129,0.15)' : `${purple}15`,
                    }]}>
                        {isConnecting ? (
                            <ActivityIndicator size="small" color={purple} />
                        ) : (
                            <Ionicons
                                name={isConnected ? 'bluetooth' : 'bluetooth-outline'}
                                size={20}
                                color={isConnected ? colors.emerald : purple}
                            />
                        )}
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[s.obdBannerTitle, { color: textPrimary }]}>
                            {isConnected ? 'OBD Connected' : isConnecting ? 'Connecting...' : 'OBD Scanner'}
                        </Text>
                        <Text style={[s.obdBannerSub, { color: textSec }]} numberOfLines={1}>
                            {isConnected
                                ? connectedDeviceName || 'Scanner active'
                                : vehicles.some(v => v.obdMacAddress)
                                    ? 'Tap Connect to reconnect scanner'
                                    : 'Connect a scanner to see live data'}
                        </Text>
                    </View>
                    {isConnected ? (
                        <TouchableOpacity
                            style={[s.obdBannerBtn, { backgroundColor: colors.emerald }]}
                            onPress={() => router.push('/obd-live-data')}
                        >
                            <Text style={s.obdBannerBtnTxt}>See live data</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[s.obdBannerBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: purple }]}
                            onPress={() => setShowOBDSettings(true)}
                            disabled={isConnecting}
                        >
                            <Text style={[s.obdBannerBtnTxt, { color: purple }]}>
                                {isConnecting ? '...' : 'Connect'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Vehicle Cards ── */}
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
                                                {v.obdMacAddress && (
                                                    <View style={[s.defaultBadge, { backgroundColor: `${purple}15` }]}>
                                                        <Ionicons name="bluetooth" size={9} color={purple} />
                                                        <Text style={[s.defaultBadgeTxt, { color: purple }]}>OBD</Text>
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
                            onPress={() => setShowAddModal(true)}
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={s.emptyBtnTxt}>Add First Vehicle</Text>
                        </TouchableOpacity>
                    </View>
                )}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* ── OBD Settings Modal ── */}
            <Modal visible={showOBDSettings} transparent animationType="slide">
                <View style={s.slideOverlay}>
                    <View style={[s.slideBox, { backgroundColor: cardBg }]}>
                        <View style={s.slideHandle}>
                            <View style={[s.slideBar, { backgroundColor: colors.border }]} />
                        </View>

                        <View style={s.slideHeader}>
                            <View style={[s.cardIconWrap, { backgroundColor: `${purple}15` }]}>
                                <Ionicons name="bluetooth" size={18} color={purple} />
                            </View>
                            <Text style={[s.modalTitle, { color: textPrimary, flex: 1 }]}>OBD Scanner Settings</Text>
                            <TouchableOpacity
                                onPress={() => setShowOBDSettings(false)}
                                style={[s.modalClose, { backgroundColor: colors.inputBg }]}
                            >
                                <Ionicons name="close" size={18} color={textSec} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={16}>

                            {/* ── Status Pills: ELM + ECU ── */}
                            <View style={s.statusRow}>
                                <View style={[s.statusPill, {
                                    backgroundColor: elmConnected ? 'rgba(16,185,129,0.10)' : 'rgba(107,114,128,0.10)',
                                    borderColor: elmConnected ? '#10B981' : 'rgba(107,114,128,0.3)',
                                }]}>
                                    <View style={[s.statusDotSm, { backgroundColor: elmConnected ? '#10B981' : '#6B7280' }]} />
                                    <View>
                                        <Text style={[s.statusPillTitle, { color: elmConnected ? '#10B981' : textSec }]}>ELM327</Text>
                                        <Text style={[s.statusPillSub, { color: textSec }]}>
                                            {elmConnected ? 'Connected' : isConnecting ? 'Connecting…' : 'Disconnected'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={[s.statusPill, {
                                    backgroundColor: ecuConnected ? 'rgba(16,185,129,0.10)' : 'rgba(107,114,128,0.10)',
                                    borderColor: ecuConnected ? '#10B981' : 'rgba(107,114,128,0.3)',
                                }]}>
                                    <View style={[s.statusDotSm, { backgroundColor: ecuConnected ? '#10B981' : '#6B7280' }]} />
                                    <View>
                                        <Text style={[s.statusPillTitle, { color: ecuConnected ? '#10B981' : textSec }]}>ECU</Text>
                                        <Text style={[s.statusPillSub, { color: textSec }]}>
                                            {ecuConnected ? 'Responding' : elmConnected ? 'Not responding' : 'Waiting'}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {/* ── Saved / Active Device ── */}
                            {savedDevice && (
                                <>
                                    <Text style={[s.sectionLabel, { color: textPrimary, marginBottom: 8 }]}>Saved Scanner</Text>
                                    <View style={[s.savedDeviceRow, {
                                        backgroundColor: isConnected ? 'rgba(16,185,129,0.06)' : colors.inputBg,
                                        borderColor: isConnected ? '#10B981' : border,
                                    }]}>
                                        <View style={[s.deviceIconWrap, { backgroundColor: isConnected ? 'rgba(16,185,129,0.15)' : `${purple}15` }]}>
                                            {isConnecting ? (
                                                <ActivityIndicator size="small" color={purple} />
                                            ) : (
                                                <Ionicons name="bluetooth" size={16} color={isConnected ? '#10B981' : purple} />
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.deviceName, { color: textPrimary }]}>{savedDevice.name}</Text>
                                            <Text style={[s.deviceId, { color: textSec }]} numberOfLines={1}>
                                                {Platform.OS === 'ios' ? `UUID: ${savedDevice.id}` : `MAC: ${savedDevice.id}`}
                                            </Text>
                                        </View>
                                        {isConnected ? (
                                            <TouchableOpacity
                                                style={[s.devActionBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }]}
                                                onPress={handleDisconnect}
                                            >
                                                <Text style={[s.devActionBtnTxt, { color: '#EF4444' }]}>Disconnect</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity
                                                style={[s.devActionBtn, { backgroundColor: `${purple}15`, borderColor: `${purple}40` }]}
                                                onPress={() => handleConnect(savedDevice)}
                                                disabled={connecting || isConnecting}
                                            >
                                                {(connecting || isConnecting) ? (
                                                    <ActivityIndicator size="small" color={purple} />
                                                ) : (
                                                    <Text style={[s.devActionBtnTxt, { color: purple }]}>Connect</Text>
                                                )}
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </>
                            )}

                            <View style={[s.divider, { backgroundColor: border, marginVertical: Spacing.lg }]} />

                            {/* ── Scan for devices ── */}
                            <Text style={[s.sectionLabel, { color: textPrimary }]}>Change Scanner</Text>
                            <Text style={[s.sectionDesc, { color: textSec }]}>
                                Tap Scan to find nearby Bluetooth OBD adapters. Make sure your ELM327 is plugged into the OBD-II port.
                            </Text>

                            <TouchableOpacity
                                style={[s.scanBtn, { borderColor: purple }]}
                                onPress={handleScan}
                                disabled={scanning || connecting}
                            >
                                {scanning ? (
                                    <ActivityIndicator size="small" color={purple} />
                                ) : (
                                    <Ionicons name="search" size={16} color={purple} />
                                )}
                                <Text style={[s.scanBtnTxt, { color: purple }]}>
                                    {scanning ? 'Scanning... (12s)' : 'Scan for Devices'}
                                </Text>
                            </TouchableOpacity>

                            {foundDevices.length > 0 && (
                                <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
                                    {foundDevices.map(d => (
                                        <TouchableOpacity
                                            key={d.id}
                                            style={[s.deviceItem, {
                                                backgroundColor: colors.inputBg,
                                                borderColor: savedDevice?.id === d.id ? purple : border,
                                                borderWidth: savedDevice?.id === d.id ? 1.5 : 1,
                                            }]}
                                            onPress={() => handleConnect(d)}
                                            disabled={connecting}
                                        >
                                            <View style={[s.deviceIconWrap, { backgroundColor: `${purple}15` }]}>
                                                <Ionicons name="bluetooth" size={16} color={purple} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[s.deviceName, { color: textPrimary }]}>{d.name}</Text>
                                                <Text style={[s.deviceId, { color: textSec }]} numberOfLines={1}>
                                                    {Platform.OS === 'ios' ? `UUID: ${d.id}` : `MAC: ${d.id}`}
                                                </Text>
                                            </View>
                                            {connecting ? (
                                                <ActivityIndicator size="small" color={purple} />
                                            ) : (
                                                <View style={[s.devActionBtn, { backgroundColor: `${purple}15`, borderColor: `${purple}40` }]}>
                                                    <Text style={[s.devActionBtnTxt, { color: purple }]}>Use</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {foundDevices.length === 0 && !scanning && (
                                <Text style={[s.noDevicesTxt, { color: textSec }]}>
                                    {savedDevice ? 'Tap "Scan for Devices" to find a different adapter.' : 'No devices found yet. Tap "Scan for Devices" to search.'}
                                </Text>
                            )}

                            <View style={[s.divider, { backgroundColor: border, marginVertical: Spacing.xl }]} />

                            {/* Default vehicle list */}
                            <Text style={[s.sectionLabel, { color: textPrimary }]}>Default Vehicle</Text>
                            <Text style={[s.sectionDesc, { color: textSec }]}>
                                OBD data will be linked to this vehicle. Tap the star to change it.
                            </Text>

                            {vehicles.map(v => (
                                <View key={v.id} style={[s.vehicleRow, { borderColor: border }]}>
                                    <View style={[s.vehicleRowIcon, {
                                        backgroundColor: v.type === 'ev' ? 'rgba(16,185,129,0.12)' : `${purple}15`
                                    }]}>
                                        {v.type === 'ev'
                                            ? <Ionicons name="flash" size={16} color={colors.emerald} />
                                            : <MaterialCommunityIcons name="gas-station" size={16} color={purple} />
                                        }
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.vehicleRowName, { color: textPrimary }]}>{v.name}</Text>
                                        <Text style={[s.vehicleRowType, { color: textSec }]}>
                                            {v.type === 'ev' ? 'Electric' : 'Gasoline'}{v.obdMacAddress ? ' · Scanner saved' : ''}
                                        </Text>
                                    </View>
                                    {v.isDefault === 1 ? (
                                        <View style={[s.defaultBadgeRow, { backgroundColor: colors.emeraldLight }]}>
                                            <Ionicons name="checkmark-circle" size={14} color={colors.emeraldDark} />
                                            <Text style={[s.defaultBadgeRowTxt, { color: colors.emeraldDark }]}>Default</Text>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={[s.setDefaultBtn, { borderColor: border }]}
                                            onPress={() => setDefaultVehicle(v.id)}
                                        >
                                            <Text style={[s.setDefaultTxt, { color: textSec }]}>Set default</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}

                            <View style={{ height: 48 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Add Vehicle Modal ── */}
            <Modal visible={showAddModal} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { backgroundColor: cardBg }]}>
                        <View style={s.modalHeader}>
                            <View style={[s.cardIconWrap, { backgroundColor: `${purple}15` }]}>
                                <Ionicons name="car-sport" size={20} color={purple} />
                            </View>
                            <Text style={[s.modalTitle, { color: textPrimary }]}>Add Vehicle</Text>
                            <TouchableOpacity
                                onPress={() => requestAnimationFrame(() => setShowAddModal(false))}
                                style={[s.modalClose, { backgroundColor: colors.inputBg }]}
                            >
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
                                style={[s.typeBtn, newVehicleType === 'gas' && { backgroundColor: purple }]}
                                onPress={() => setNewVehicleType('gas')}
                            >
                                <Ionicons name="water" size={14} color={newVehicleType === 'gas' ? '#fff' : purple} />
                                <Text style={[s.typeTxt, { color: textSec }, newVehicleType === 'gas' && { color: '#fff' }]}>Gas (Liters)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.typeBtn, newVehicleType === 'ev' && { backgroundColor: '#10B981' }]}
                                onPress={() => setNewVehicleType('ev')}
                            >
                                <Ionicons name="flash" size={14} color={newVehicleType === 'ev' ? '#fff' : colors.emerald} />
                                <Text style={[s.typeTxt, { color: textSec }, newVehicleType === 'ev' && { color: '#fff' }]}>Electric (kWh)</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={s.modalActions}>
                            <TouchableOpacity
                                style={[s.cancelBtn, { borderColor: border }]}
                                onPress={() => requestAnimationFrame(() => setShowAddModal(false))}
                            >
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
    dragHandle: { alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 12 : 8, paddingBottom: 4 },
    dragBar: { width: 36, height: 4, borderRadius: 2, opacity: 0.35 },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg, paddingTop: Platform.OS === 'ios' ? 20 : 16, paddingBottom: Spacing.md,
    },
    headerIconBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    headerAvatar: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    headerSub: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular' },

    scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Platform.OS === 'android' ? 90 : 60 },

    // OBD Banner
    obdBanner: {
        flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
        borderRadius: 16, borderWidth: 1, marginBottom: Spacing.lg, gap: 12,
    },
    obdIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    obdBannerTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    obdBannerSub: { fontFamily: 'Poppins_400Regular', fontSize: FontSize.xs, marginTop: 1 },
    obdBannerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.full },
    obdBannerBtnTxt: { color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.xs },

    // Vehicle cards
    vehicleCard: {
        borderRadius: 20, borderWidth: 1, marginBottom: Spacing.md, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 3,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
    cardIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    vehicleName: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    vehicleType: { fontSize: FontSize.xs, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    starBtn: { padding: 4 },
    defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    defaultBadgeTxt: { fontSize: 10, fontFamily: 'Poppins_600SemiBold' },
    cardDivider: { height: 1, marginHorizontal: Spacing.md, opacity: 0.5 },
    statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, alignItems: 'center' },
    statItem: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: FontSize.md, fontFamily: 'Poppins_700Bold' },
    statLbl: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 2, textAlign: 'center' },
    statDivider: { width: 1, height: 32, opacity: 0.4 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
    badgeTxt: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
    totalCost: { marginLeft: 'auto', fontSize: FontSize.xs, fontFamily: 'Poppins_700Bold' },

    // Empty state
    emptyState: { marginTop: Spacing.xxl, padding: Spacing.xl, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', gap: Spacing.md },
    emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    emptyTitle: { fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    emptyDesc: { fontSize: FontSize.sm, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 22 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, marginTop: Spacing.sm },
    emptyBtnTxt: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },

    // Add vehicle modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.lg },
    modalBox: { width: '100%', borderRadius: 24, padding: Spacing.xl, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
    modalTitle: { flex: 1, fontSize: FontSize.lg, fontFamily: 'Poppins_700Bold' },
    modalClose: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    inputLabel: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold', marginBottom: Spacing.sm, marginTop: Spacing.md },
    textInput: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: Spacing.md, fontFamily: 'Poppins_400Regular', fontSize: FontSize.md },
    typeToggle: { flexDirection: 'row', borderRadius: BorderRadius.full, padding: 4, borderWidth: 1, marginTop: 4 },
    typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md, borderRadius: BorderRadius.full },
    typeTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
    cancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center', borderWidth: 1 },
    cancelTxt: { fontSize: FontSize.sm, fontFamily: 'Poppins_600SemiBold' },
    saveBtn: { flex: 2, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, alignItems: 'center' },
    saveTxt: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Poppins_700Bold' },

    // OBD Settings slide-up modal
    slideOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    slideBox: { width: '100%', maxHeight: '88%', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 0 },
    slideHandle: { alignItems: 'center', marginBottom: Spacing.md },
    slideBar: { width: 40, height: 4, borderRadius: 2 },
    slideHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },

    connectedBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.md, borderRadius: 12, borderWidth: 1, marginBottom: Spacing.lg },
    connectedTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },

    sectionLabel: { fontFamily: 'Poppins_700Bold', fontSize: FontSize.sm, marginBottom: 4 },
    sectionDesc: { fontFamily: 'Poppins_400Regular', fontSize: FontSize.sm, marginBottom: Spacing.md, lineHeight: 20 },

    scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', gap: 8 },
    scanBtnTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    noDevicesTxt: { fontFamily: 'Poppins_400Regular', fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.md },

    deviceItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: 14, borderWidth: 1, gap: 12 },
    deviceIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    deviceName: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    deviceId: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },

    divider: { height: 1, opacity: 0.5 },

    vehicleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, gap: 12 },
    vehicleRowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    vehicleRowName: { fontFamily: 'Poppins_600SemiBold', fontSize: FontSize.sm },
    vehicleRowType: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },
    defaultBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: BorderRadius.full },
    defaultBadgeRowTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
    setDefaultBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1 },
    setDefaultTxt: { fontFamily: 'Poppins_500Medium', fontSize: 11 },

    // ELM/ECU status pills
    statusRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
    statusPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: Spacing.md, borderRadius: 14, borderWidth: 1,
    },
    statusDotSm: { width: 8, height: 8, borderRadius: 4 },
    statusPillTitle: { fontFamily: 'Poppins_700Bold', fontSize: FontSize.sm },
    statusPillSub: { fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },

    // Saved device row
    savedDeviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.md, borderRadius: 14, borderWidth: 1, marginBottom: 4 },

    // Action buttons on device rows
    devActionBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    devActionBtnTxt: { fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
});
