import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { AppProvider } from '../context/AppContext';
import { Colors, Breakpoints } from '../constants/theme';

export default function RootLayout() {
    return (
        <AppProvider>
            <View style={styles.container}>
                <View style={styles.content}>
                    <StatusBar style="light" />
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: Colors.dark.background },
                            animation: 'slide_from_right',
                        }}
                    >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                    name="add-transaction"
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="chatbot"
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="settings"
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_right',
                    }}
                />
                <Stack.Screen
                    name="pdf-import"
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
                <Stack.Screen
                    name="receipt-scanner"
                    options={{
                        presentation: 'modal',
                        animation: 'slide_from_bottom',
                    }}
                />
            </Stack>
                </View>
            </View>
        </AppProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#05070d', // Darker background for the letterbox area
        alignItems: 'center',
    },
    content: {
        flex: 1,
        width: '100%',
        maxWidth: Breakpoints.tablet, // 768px max width
        backgroundColor: Colors.dark.background,
        overflow: 'hidden',
    },
});
