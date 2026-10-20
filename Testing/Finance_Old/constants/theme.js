// Theme constants for FinanceFlow
// Two complete palettes: light and dark

const lightColors = {
    // Core backgrounds
    background: '#F2F3F5',
    surface: '#FCFCFF',
    card: 'rgba(255,255,255,0.88)',
    cardSolid: '#FFFFFF',

    // Text
    text: '#151A2D',
    textPrimary: '#151A2D',
    textSecondary: '#4E566E',
    textMuted: '#8E95AB',

    // Data accents
    emerald: '#1EC98E',
    emeraldDark: '#0FA272',
    emeraldLight: 'rgba(30,201,142,0.12)',
    gold: '#E4D84D',
    goldLight: 'rgba(228,216,77,0.18)',
    red: '#FF7A87',
    redLight: 'rgba(255,122,135,0.16)',
    rose: '#FF7A87',
    roseLight: 'rgba(255,122,135,0.16)',
    blue: '#6A6FF8',
    blueLight: 'rgba(106,111,248,0.14)',
    primary: '#ff6600',
    primaryLight: 'rgba(255,102,0,0.15)',
    secondary: '#0d47a1',
    secondaryLight: 'rgba(13,71,161,0.15)',

    // Semantic colors
    income: '#059669',
    spending: '#dc2626',

    // Borders
    border: 'rgba(83,96,132,0.14)',
    borderLight: 'rgba(83,96,132,0.08)',

    // Navigation
    tabBar: 'rgba(255,255,255,0.95)',
    tabBarBorder: 'rgba(83,96,132,0.14)',
    tabInactive: '#8F96AC',
    tabActive: '#ff6600',

    // Input
    inputBg: '#FFFFFF',
    inputBorder: 'rgba(83,96,132,0.16)',
    inputFocusBorder: '#ff6600',

    // Modal
    overlay: 'rgba(21,26,45,0.22)',
    modalBg: '#FDFDFF',

    // Gradient stops for backgrounds
    gradientStart: '#F7F7F8',
    gradientMid: '#F2F3F5',
    gradientEnd: '#ECEEF1',

    // Status bar style
    statusBar: 'dark',
};

const darkColors = {
    // Core backgrounds
    background: '#111114',
    surface: '#1A1B22',
    card: 'rgba(30,31,42,0.92)',
    cardSolid: '#1E1F2A',

    // Text
    text: '#EDEEF5',
    textPrimary: '#EDEEF5',
    textSecondary: '#9CA3B8',
    textMuted: '#5C6278',

    // Data accents
    emerald: '#23D499',
    emeraldDark: '#0FA272',
    emeraldLight: 'rgba(35,212,153,0.15)',
    gold: '#F0E060',
    goldLight: 'rgba(240,224,96,0.15)',
    red: '#FF8594',
    redLight: 'rgba(255,133,148,0.15)',
    rose: '#FF8594',
    roseLight: 'rgba(255,133,148,0.15)',
    blue: '#7A7FFA',
    blueLight: 'rgba(122,127,250,0.15)',
    primary: '#ff6600',
    primaryLight: 'rgba(255,102,0,0.15)',
    secondary: '#0d47a1',
    secondaryLight: 'rgba(13,71,161,0.15)',

    // Semantic colors
    income: '#23D499',
    spending: '#FF8594',

    // Borders
    border: 'rgba(255,255,255,0.09)',
    borderLight: 'rgba(255,255,255,0.05)',

    // Navigation
    tabBar: 'rgba(18,19,26,0.97)',
    tabBarBorder: 'rgba(255,255,255,0.08)',
    tabInactive: '#4A5068',
    tabActive: '#ff6600',

    // Input
    inputBg: '#1C1D28',
    inputBorder: 'rgba(255,255,255,0.10)',
    inputFocusBorder: '#ff6600',

    // Modal
    overlay: 'rgba(0,0,0,0.65)',
    modalBg: '#18191F',

    // Gradient stops for backgrounds
    gradientStart: '#141418',
    gradientMid: '#111114',
    gradientEnd: '#0E0E12',

    // Status bar style
    statusBar: 'light',
};

export const Colors = {
    light: lightColors,
    dark: darkColors,
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

export const FontSize = {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 19,
    xxl: 23,
    xxxl: 29,
    display: 38,
};

export const BorderRadius = {
    sm: 8,
    md: 14,
    lg: 18,
    xl: 20,
    full: 999,
};

// Breakpoints for responsive layout
export const Breakpoints = {
    phone: 0,
    tablet: 768,
    desktop: 1024,
};
