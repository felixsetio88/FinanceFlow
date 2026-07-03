import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
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
            const data = response.notification.request.content.data;
            if (data?.type === 'savings_reminder' && data?.goalId) {
                // Route to savings and pass the goalId in params
                router.push({
                    pathname: '/(tabs)/savings',
                    params: { addSavingGoalId: data.goalId }
                });
            }
        });
        return () => sub.remove();
    }, [router]);

    return (
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
                        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                        name="chatbot"
                        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                        name="settings"
                        options={{ presentation: 'modal', animation: 'slide_from_right' }}
                    />
                    <Stack.Screen
                        name="financial-freedom"
                        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                        name="assets"
                        options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }}
                    />
                    <Stack.Screen
                        name="receipt-scanner"
                        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                    />
                    <Stack.Screen
                        name="pdf-statement-import"
                        options={{ presentation: 'modal', animation: 'slide_from_right' }}
                    />
                    <Stack.Screen
                        name="custom-model-search"
                        options={{ presentation: 'modal', animation: 'slide_from_right' }}
                    />
                    <Stack.Screen
                        name="custom-model-quantization"
                        options={{ presentation: 'modal', animation: 'slide_from_right' }}
                    />
                    <Stack.Screen
                        name="vehicles/index"
                        options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }}
                    />
                    <Stack.Screen
                        name="vehicle/[id]"
                        options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }}
                    />
                </Stack>
            </View>
        </View>
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