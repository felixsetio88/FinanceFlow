import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { AppProvider, useApp } from '../context/AppContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { Breakpoints } from '../constants/theme';
import {
    useFonts,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';
import * as Notifications from 'expo-notifications';
import { logError } from '../services/errorLogger';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function AppContent() {
    const router = useRouter();
    const segments = useSegments();
    const { onboardingCompleted, loading } = useApp();
    const { colors, isDark } = useTheme();

    useEffect(() => {
        if (loading) return;
        const inOnboarding = segments[0] === 'onboarding';
        if (!onboardingCompleted && !inOnboarding) {
            router.replace('/onboarding');
        }
    }, [onboardingCompleted, loading]);

    useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response?.notification?.request?.content?.data;
            if (data?.type === 'savings_reminder' && data?.goalId) {
                router.push({
                    pathname: '/(tabs)/savings',
                    params: { addSavingGoalId: data.goalId }
                });
            } else if (data?.type === 'recurring_confirm' && data?.prefill) {
                router.push({
                    pathname: '/add-transaction',
                    params: { prefill: data.prefill }
                });
            }
        });
        return () => sub.remove();
    }, [router]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.content, { backgroundColor: colors.background }]}>
                    <StatusBar style={isDark ? 'light' : 'dark'} />
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: colors.background },
                            animation: 'slide_from_right',
                        }}
                    >
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
                        <Stack.Screen
                            name="add-transaction"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="chatbot"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="settings"
                            options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                            name="log"
                            options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                            name="about"
                            options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                            name="financial-health"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="assets"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="receipt-scanner"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="ocr-info"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                        />
                        <Stack.Screen
                            name="pdf-statement-import"
                            options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                            name="calendar-view"
                            options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                            name="custom-model-search"
                            options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                            name="custom-model-quantization"
                            options={{ presentation: 'card', animation: 'slide_from_right' }}
                        />
                        <Stack.Screen
                            name="vehicles/index"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="vehicle/[id]"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                        <Stack.Screen
                            name="pick-category"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                        />
                        <Stack.Screen
                            name="pick-account"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                        />
                        <Stack.Screen
                            name="category-transactions"
                            options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: false }}
                        />
                    </Stack>
                </View>
            </View>
        </GestureHandlerRootView>
    );
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        // Map heavier aliases to one-step lighter weights for a softer global typography.
        Poppins_600SemiBold: Poppins_500Medium,
        Poppins_700Bold: Poppins_600SemiBold,
        Poppins_800ExtraBold: Poppins_700Bold,
    });

    if (!fontsLoaded) {
        return null;
    }

    return (
        <ThemeProvider>
            <AppProvider>
                <AppContent />
            </AppProvider>
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
    },
    content: {
        flex: 1,
        width: '100%',
        maxWidth: Breakpoints.tablet, // 768px max width
        overflow: 'hidden',
    },
});

export function ErrorBoundary({ error, retry }) {
    useEffect(() => {
        if (error) {
            logError(error, 'Global Error Boundary caught a rendering exception.');
        }
    }, [error]);

    return (
        <View style={[styles.container, { justifyContent: 'center', padding: 32, backgroundColor: '#f9fafb' }]}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <Ionicons name="warning" size={32} color="#ef4444" />
            </View>
            <Text style={{ fontSize: 22, fontFamily: 'Poppins_700Bold', color: '#111827', marginBottom: 12, textAlign: 'center' }}>
                Oops! Something went wrong.
            </Text>
            <Text style={{ fontSize: 14, fontFamily: 'Poppins_400Regular', color: '#4b5563', textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
                {error?.message || 'An unexpected rendering error occurred. The app prevented a total crash, but this screen failed to load.'}
            </Text>
            <TouchableOpacity
                style={{ backgroundColor: '#6366f1', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16, width: '100%', alignItems: 'center', shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
                onPress={retry}
                activeOpacity={0.8}
            >
                <Text style={{ color: 'white', fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Reload Screen</Text>
            </TouchableOpacity>
        </View>
    );
}