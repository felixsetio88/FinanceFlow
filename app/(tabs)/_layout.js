import { Tabs, useRouter } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Breakpoints } from '../../constants/theme';

export default function TabLayout() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isTablet = width >= Breakpoints.tablet;

    return (
        <View style={{ flex: 1 }}>
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarActiveTintColor: Colors.dark.tabActive,
                    tabBarInactiveTintColor: Colors.dark.tabInactive,
                    tabBarStyle: {
                        backgroundColor: Colors.dark.tabBar,
                        borderTopColor: Colors.dark.tabBarBorder,
                        borderTopWidth: 1,
                        height: 65,
                        paddingBottom: 8,
                        paddingBottom: 8,
                        paddingTop: 8,
                    },
                    tabBarLabelStyle: {
                        fontSize: 10,
                        fontWeight: '600',
                    },
                }}
            >
                <Tabs.Screen
                    name="index"
                    options={{
                        title: 'Home',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="home" size={size} color={color} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="transactions"
                    options={{
                        title: 'History',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="swap-horizontal" size={size} color={color} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="charts"
                    options={{
                        title: 'Charts',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="pie-chart" size={size} color={color} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="budget"
                    options={{
                        title: 'Budget',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="wallet" size={size} color={color} />
                        ),
                    }}
                />
                <Tabs.Screen
                    name="assets"
                    options={{
                        title: 'Assets',
                        tabBarIcon: ({ color, size }) => (
                            <Ionicons name="business" size={size} color={color} />
                        ),
                    }}
                />
            </Tabs>

            {/* Floating Action Button */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => router.push('/add-transaction')}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        bottom: 80,
        alignSelf: 'center',
        left: '50%',
        marginLeft: -28,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.dark.emerald,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: Colors.dark.emerald,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        zIndex: 100,
    },
});
