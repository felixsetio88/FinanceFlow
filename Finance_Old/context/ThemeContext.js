import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

const THEME_STORAGE_KEY = 'app_theme_mode';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme() || 'light');
    const [themeMode, setThemeModeState] = useState('system'); // 'light' | 'dark' | 'system'

    useEffect(() => {
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            setSystemScheme(colorScheme || 'light');
        });
        return () => subscription.remove();
    }, []);

    // Load persisted preference on mount
    useEffect(() => {
        AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
            if (saved === 'light' || saved === 'dark' || saved === 'system') {
                setThemeModeState(saved);
            }
        });
    }, []);

    const setThemeMode = useCallback(async (mode) => {
        setThemeModeState(mode);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    }, []);

    // Resolve the effective color scheme
    const effectiveScheme =
        themeMode === 'system' ? (systemScheme || 'light') : themeMode;

    const colors = effectiveScheme === 'dark' ? Colors.dark : Colors.light;

    const value = {
        themeMode,        // user's preference: 'light' | 'dark' | 'system'
        setThemeMode,
        isDark: effectiveScheme === 'dark',
        colors,           // the resolved color palette
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
