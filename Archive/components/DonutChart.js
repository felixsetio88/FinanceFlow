import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { FontSize } from '../constants/theme';

export default function DonutChart({ data, size = 170, strokeWidth = 24, centerLabel, centerValue, colors }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const slices = (data || []).filter(d => d.value > 0);
    const total = slices.reduce((sum, item) => sum + item.value, 0);

    if (total <= 0) {
        return (
            <View style={[styles.donutChartWrap, { width: size, height: size }]}>
                <Ionicons name="pie-chart-outline" size={40} color={colors.textSecondary} />
            </View>
        );
    }

    let startFraction = 0;

    return (
        <View style={[styles.donutChartWrap, { width: size, height: size }]}>
            <Svg width={size} height={size}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={colors.border}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
                    {slices.map((slice, idx) => {
                        const fraction = slice.value / total;
                        const dash = circumference * fraction;
                        const offset = -circumference * startFraction;
                        startFraction += fraction;

                        return (
                            <Circle
                                key={`${slice.label}-${idx}`}
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                stroke={slice.color}
                                strokeWidth={strokeWidth}
                                fill="none"
                                strokeDasharray={`${dash} ${Math.max(circumference - dash, 0.0001)}`}
                                strokeDashoffset={offset}
                                strokeLinecap="butt"
                            />
                        );
                    })}
                </G>
            </Svg>
            <View style={styles.donutCenter}>
                <Text style={[styles.donutCenterLabel, { color: colors.textSecondary }]}>{centerLabel}</Text>
                <Text style={[styles.donutCenterValue, { color: colors.textPrimary }]}>{centerValue}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    donutChartWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },
    donutCenter: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
    },
    donutCenterLabel: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
    },
    donutCenterValue: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
        marginTop: -2,
    },
});
