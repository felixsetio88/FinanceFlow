import { Tabs, useRouter } from 'expo-router';
import { Platform, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
    const router = useRouter();
    const { colors } = useTheme();

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: colors.tabActive,
                    tabBarInactiveTintColor: colors.tabInactive,
                    tabBarStyle: {
                        backgroundColor: colors.tabBar,
                        borderTopWidth: 0,
                        height: 70,
                        paddingBottom: 8,
                        paddingTop: 8,
                        marginHorizontal: 14,
                        marginBottom: 12,
                        borderRadius: 24,
                        position: 'absolute',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 6 },
                        shadowOpacity: 0.10,
                        shadowRadius: 18,
                        elevation: Platform.OS === 'android' ? 0 : 10,
                    },
                    tabBarLabelStyle: {
                        fontSize: 10,
                        fontWeight: '600',
                        fontFamily: 'Poppins_600SemiBold',
                    },
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Home',
                        tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="transactions"
                    options={{
                        title: 'History',
                        tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" size={size} color={color} />,
                    }}
                />
                {/* Center FAB rendered as the middle tab button */}
                <Tabs.Screen
                    name="center-placeholder"
                    options={{
                        title: '',
                        tabBarButton: () => (
                            <TouchableOpacity
                                style={styles.centerFab}
                                onPress={() => router.push('/add-transaction')}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.centerFabInner, { backgroundColor: colors.primary }]}>
                                    <Ionicons name="add" size={28} color="#fff" />
                                </View>
                            </TouchableOpacity>
                        ),
                    }}
                />
                <Tabs.Screen
                    name="charts"
                    options={{
                        title: 'Charts',
                        tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
                    }}
                />
                <Tabs.Screen
                    name="savings"
                    options={{
                        title: 'Savings',
                        tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline" size={size} color={color} />,
                    }}
                />
                {/* Accessible via Settings only */}
                <Tabs.Screen name="budget" options={{ href: null }} />
            </Tabs>
        </View>
    );
}

const styles = StyleSheet.create({
    centerFab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerFabInner: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: Platform.OS === 'android' ? 0 : 10,
    },
});
