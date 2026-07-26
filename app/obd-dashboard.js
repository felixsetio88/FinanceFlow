/**
 * OBD Dashboard — Premium dual-gauge speedometer page.
 * Layout inspired by luxury car instrument clusters.
 *
 * Left gauge:  Engine RPM (0–6500, red zone at 6000+), coolant temp below
 * Right gauge: Vehicle Speed (0–200 km/h), battery voltage below
 * Center:      Trip info panel (time, distance, fuel, avg speed, inst fuel rate)
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Platform,
    useWindowDimensions, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
    Path, Circle, G, Text as SvgText, Line, Defs,
    LinearGradient as SvgGrad, Stop,
} from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { obdManager } from '../services/obdManager';

// ── Gauge geometry helpers ──
const DEG_TO_RAD = Math.PI / 180;

/**
 * Build an SVG arc path from startAngle to endAngle (degrees, 0 = top, clockwise).
 * cx, cy = center; r = radius.
 */
function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * DEG_TO_RAD;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// ── Gauge component ──
function ArcGauge({
    size,
    value,
    maxValue,
    label,
    unit,
    tickCount = 14,
    redZoneStart,       // value at which red zone starts (e.g. 6000 for RPM)
    accentColor = '#FF6B00',
    redColor = '#FF3B30',
    subValue,           // small value below the gauge (coolant temp or voltage)
    subLabel,
    subUnit,
    subIcon,
}) {
    const cx = size / 2;
    const cy = size / 2;
    const strokeWidth = size * 0.045;
    const radius = size * 0.40;
    const innerTickR = radius - size * 0.06;
    const outerTickR = radius + size * 0.02;
    const labelR = radius - size * 0.14;

    // Arc spans from 135° to 405° (i.e. 270° sweep, opening at bottom)
    const ARC_START = 135;
    const ARC_END = 405;
    const ARC_SWEEP = ARC_END - ARC_START;

    const clampedValue = Math.min(Math.max(value, 0), maxValue);
    const valueFraction = clampedValue / maxValue;
    const valueAngle = ARC_START + valueFraction * ARC_SWEEP;

    // Red zone
    const redFraction = redZoneStart != null ? redZoneStart / maxValue : 1;
    const redStartAngle = ARC_START + redFraction * ARC_SWEEP;

    // Tick marks
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
        const frac = i / tickCount;
        const angle = ARC_START + frac * ARC_SWEEP;
        const isMajor = i % 2 === 0;
        const inner = isMajor ? innerTickR - size * 0.02 : innerTickR;
        const p1 = polarToCartesian(cx, cy, inner, angle);
        const p2 = polarToCartesian(cx, cy, outerTickR, angle);
        const tickVal = Math.round((frac * maxValue));
        const isInRed = redZoneStart != null && tickVal >= redZoneStart;

        ticks.push(
            <Line
                key={`tick-${i}`}
                x1={p1.x} y1={p1.y}
                x2={p2.x} y2={p2.y}
                stroke={isInRed ? redColor : 'rgba(255,255,255,0.35)'}
                strokeWidth={isMajor ? 2.5 : 1.2}
                strokeLinecap="round"
            />
        );

        // Tick labels on major ticks
        if (isMajor) {
            const lp = polarToCartesian(cx, cy, labelR, angle);
            let displayVal;
            if (maxValue >= 1000) {
                displayVal = (tickVal / 1000).toString();
            } else {
                displayVal = tickVal.toString();
            }
            ticks.push(
                <SvgText
                    key={`lbl-${i}`}
                    x={lp.x} y={lp.y}
                    fill={isInRed ? redColor : 'rgba(255,255,255,0.55)'}
                    fontSize={size * 0.055}
                    fontWeight="600"
                    textAnchor="middle"
                    alignmentBaseline="central"
                >
                    {displayVal}
                </SvgText>
            );
        }
    }

    // Minor ticks (between major ticks)
    const minorTickCount = tickCount * 5;
    const minorTicks = [];
    for (let i = 0; i <= minorTickCount; i++) {
        if (i % 5 === 0) continue; // skip major positions
        const frac = i / minorTickCount;
        const angle = ARC_START + frac * ARC_SWEEP;
        const p1 = polarToCartesian(cx, cy, innerTickR + size * 0.01, angle);
        const p2 = polarToCartesian(cx, cy, outerTickR - size * 0.01, angle);
        const tickVal = frac * maxValue;
        const isInRed = redZoneStart != null && tickVal >= redZoneStart;
        minorTicks.push(
            <Line
                key={`mt-${i}`}
                x1={p1.x} y1={p1.y}
                x2={p2.x} y2={p2.y}
                stroke={isInRed ? `${redColor}55` : 'rgba(255,255,255,0.12)'}
                strokeWidth={0.8}
                strokeLinecap="round"
            />
        );
    }

    return (
        <View style={{ alignItems: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Defs>
                    <SvgGrad id={`gaugeGrad-${label}`} x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={accentColor} stopOpacity="1" />
                        <Stop offset="1" stopColor={accentColor} stopOpacity="0.6" />
                    </SvgGrad>
                </Defs>

                {/* Background arc */}
                <Path
                    d={describeArc(cx, cy, radius, ARC_START, ARC_END)}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Red zone arc */}
                {redZoneStart != null && (
                    <Path
                        d={describeArc(cx, cy, radius, redStartAngle, ARC_END)}
                        stroke={`${redColor}30`}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                    />
                )}

                {/* Value arc */}
                {valueFraction > 0.005 && (
                    <Path
                        d={describeArc(cx, cy, radius, ARC_START, Math.min(valueAngle, ARC_END))}
                        stroke={valueAngle >= redStartAngle ? redColor : accentColor}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                    />
                )}

                {/* Glow dot at current position */}
                {valueFraction > 0.005 && (() => {
                    const dot = polarToCartesian(cx, cy, radius, Math.min(valueAngle, ARC_END));
                    return (
                        <Circle
                            cx={dot.x} cy={dot.y}
                            r={strokeWidth * 0.7}
                            fill={valueAngle >= redStartAngle ? redColor : accentColor}
                            opacity={0.9}
                        />
                    );
                })()}

                {/* Minor ticks */}
                {minorTicks}
                {/* Major ticks + labels */}
                {ticks}

                {/* Center digital readout */}
                <SvgText
                    x={cx} y={cy - size * 0.03}
                    fill="#FFFFFF"
                    fontSize={size * 0.22}
                    fontWeight="800"
                    textAnchor="middle"
                    alignmentBaseline="central"
                >
                    {Math.round(clampedValue)}
                </SvgText>
                <SvgText
                    x={cx} y={cy + size * 0.10}
                    fill="rgba(255,255,255,0.5)"
                    fontSize={size * 0.065}
                    fontWeight="600"
                    textAnchor="middle"
                    alignmentBaseline="central"
                >
                    {unit}
                </SvgText>
            </Svg>

            {/* Sub-value below gauge */}
            {subValue !== null && subValue !== undefined && (
                <View style={gaugeStyles.subValueRow}>
                    {subIcon && (
                        <MaterialCommunityIcons name={subIcon} size={14} color="rgba(255,255,255,0.5)" />
                    )}
                    <Text style={gaugeStyles.subValue}>
                        {subValue}{subUnit}
                    </Text>
                    <Text style={gaugeStyles.subLabel}>{subLabel}</Text>
                </View>
            )}
        </View>
    );
}

const gaugeStyles = StyleSheet.create({
    subValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: -8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    subValue: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
    subLabel: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
});

// ── Helper: format time ──
function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Main Screen ──
export default function OBDDashboardScreen() {
    const router = useRouter();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [metrics, setMetrics] = useState(obdManager.metrics);

    useEffect(() => {
        const onUpdate = (data) => setMetrics({ ...data });
        obdManager.addListener(onUpdate);
        setMetrics({ ...obdManager.metrics });
        return () => obdManager.removeListener(onUpdate);
    }, []);

    // Gauge sizing — fit two gauges + center panel
    const horizontalPadding = 12;
    const centerPanelWidth = Math.min(screenWidth * 0.22, 120);
    const availableWidth = screenWidth - horizontalPadding * 2 - centerPanelWidth;
    const gaugeSize = Math.min(availableWidth / 2, screenHeight * 0.50, 220);

    const rpm = metrics.rpm || 0;
    const speed = metrics.currentSpeed || 0;
    const coolantTemp = metrics.coolantTemp;
    const voltage = metrics.voltage;
    const tripTime = metrics.drivingTime || 0;
    const tripKm = metrics.distanceTraveled || 0;
    const avgSpeed = metrics.averageSpeed || 0;
    const instFuelRate = metrics.realtimeFuelRate || 0;
    const avgFuelCons = metrics.avgFuelConsumption || 0;

    return (
        <View style={s.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

            {/* Dark background */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0A0F' }]} />

            {/* Subtle radial gradient effect via overlapping layers */}
            <View style={[StyleSheet.absoluteFill, s.bgGlow]} />

            {/* Header */}
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? insets.top + 8 : insets.top + 12 }]}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={s.headerBtn}
                >
                    <Ionicons name="arrow-back" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Dashboard</Text>
                <View style={s.statusIndicator}>
                    <View style={[s.statusDot, { backgroundColor: obdManager.status === 'connected' ? '#10B981' : '#6B7280' }]} />
                    <Text style={s.statusText}>
                        {obdManager.status === 'connected' ? 'LIVE' : 'OFFLINE'}
                    </Text>
                </View>
            </View>

            {/* Main gauge area */}
            <View style={s.gaugeArea}>
                {/* Left: RPM */}
                <ArcGauge
                    size={gaugeSize}
                    value={rpm}
                    maxValue={6500}
                    label="RPM"
                    unit="RPM"
                    tickCount={13}
                    redZoneStart={6000}
                    accentColor="#FF6B00"
                    redColor="#FF3B30"
                    subValue={coolantTemp != null ? coolantTemp : '--'}
                    subLabel="Coolant"
                    subUnit="°C"
                    subIcon="thermometer"
                />

                {/* Center: Trip info */}
                <View style={s.centerPanel}>
                    <TripInfoItem
                        icon="timer-outline"
                        label="Trip Time"
                        value={formatTime(tripTime)}
                    />
                    <TripInfoItem
                        icon="speedometer-outline"
                        label="Trip"
                        value={`${tripKm.toFixed(1)}`}
                        unit="km"
                    />
                    <TripInfoItem
                        icon="water-outline"
                        label="Fuel Cons."
                        value={avgFuelCons > 0 ? avgFuelCons.toFixed(1) : '--'}
                        unit="L/100km"
                    />
                    <TripInfoItem
                        icon="analytics-outline"
                        label="Avg Speed"
                        value={avgSpeed > 0 ? avgSpeed.toFixed(0) : '--'}
                        unit="km/h"
                    />
                    <TripInfoItem
                        icon="flame-outline"
                        label="Inst. Fuel"
                        value={instFuelRate > 0 ? instFuelRate.toFixed(1) : '--'}
                        unit="L/h"
                    />
                </View>

                {/* Right: Speed */}
                <ArcGauge
                    size={gaugeSize}
                    value={speed}
                    maxValue={200}
                    label="SPEED"
                    unit="km/h"
                    tickCount={10}
                    redZoneStart={180}
                    accentColor="#FF6B00"
                    redColor="#FF3B30"
                    subValue={voltage != null ? voltage : '--'}
                    subLabel="Battery"
                    subUnit="V"
                    subIcon="car-battery"
                />
            </View>
        </View>
    );
}

function TripInfoItem({ icon, label, value, unit }) {
    return (
        <View style={s.tripItem}>
            <Ionicons name={icon} size={13} color="rgba(255,255,255,0.35)" />
            <View style={{ flex: 1 }}>
                <Text style={s.tripLabel}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                    <Text style={s.tripValue}>{value}</Text>
                    {unit && <Text style={s.tripUnit}>{unit}</Text>}
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0F',
    },
    bgGlow: {
        backgroundColor: 'transparent',
        // Subtle gradient-like darkening at edges
        borderWidth: 0,
        shadowColor: '#FF6B00',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.03,
        shadowRadius: 120,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
        justifyContent: 'space-between',
    },
    headerBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 0.5,
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    statusText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: 1.5,
    },

    // Gauge area
    gaugeArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        gap: 0,
    },

    // Center panel
    centerPanel: {
        width: 120,
        paddingVertical: 8,
        paddingHorizontal: 6,
        gap: 6,
        alignItems: 'stretch',
    },
    tripItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    tripLabel: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 8,
        fontFamily: 'Poppins_500Medium',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    tripValue: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    tripUnit: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 9,
        fontFamily: 'Poppins_500Medium',
    },
});
