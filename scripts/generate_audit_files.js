const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DESKTOP_DIR = '/Users/felix/Desktop';

// ── File Manifests ──────────────────────────────────────────────────────────

const PART_1_FILES = [
    'package.json',
    'app.json',
    'babel.config.js',
    'eas.json',
    'tsconfig.json',
    'react-native.config.js',
    'withFmtFix.js',
    'scripts/patch-touch-handler.js',
    'app/_layout.js',
    'app/(tabs)/_layout.js',
    'app/(tabs)/index.js',
    'app/(tabs)/transactions.js',
    'app/(tabs)/budget.js',
    'app/(tabs)/savings.js',
    'app/(tabs)/charts.js',
    'app/(tabs)/center-placeholder.js',
    'android/app/build.gradle',
    'android/build.gradle',
    'android/settings.gradle',
    'android/gradle.properties',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/java/com/financeflow/app/MainActivity.kt',
    'android/app/src/main/java/com/financeflow/app/MainApplication.kt',
    'android/app/src/main/java/com/financeflow/app/WidgetDataModule.kt',
    'android/app/src/main/java/com/financeflow/app/WidgetDataPackage.kt',
];

const PART_2_FILES = [
    'app/about.js',
    'app/add-transaction.js',
    'app/assets.js',
    'app/budget.js',
    'app/calendar-view.js',
    'app/category-transactions.js',
    'app/chatbot.js',
    'app/custom-model-quantization.js',
    'app/custom-model-search.js',
    'app/financial-health.js',
    'app/log.js',
    'app/ocr-info.js',
    'app/onboarding.js',
    'app/pdf-statement-import.js',
    'app/pick-account.js',
    'app/pick-category.js',
    'app/receipt-scanner.js',
    'app/settings.js',
    'app/vehicle/[id].js',
    'app/vehicles/index.js',
    'components/DonutChart.js',
    'components/EdgeDetectionCropper.js',
    'components/EdgeDetectionModal.js',
    'components/FastInput.js',
    'components/BackgroundTaskMonitor.jsx',
];

const PART_3_FILES = [
    'services/aiChatbot.js',
    'services/aiReceiptScanner.js',
    'services/appLogger.js',
    'services/backgroundTaskIntegration.js',
    'services/backgroundTaskManager.js',
    'services/dataExport.js',
    'services/database.js',
    'services/documentScanner.js',
    'services/documentText.js',
    'services/errorLogger.js',
    'services/exchangeRates.js',
    'services/localAI.js',
    'services/localAIConfig.js',
    'services/localOCR.js',
    'services/notificationService.js',
    'services/ocrService.js',
    'services/pdfProcessor.js',
    'services/receiptScanSession.js',
    'services/recurringEngine.js',
    'modules/ReceiptOCR/package.json',
    'modules/ReceiptOCR/expo-module.config.json',
    'modules/ReceiptOCR/src/MyModule.ts',
    'modules/ReceiptOCR/src/MyModule.types.ts',
    'modules/ReceiptOCR/src/MyModule.web.ts',
    'modules/ReceiptOCR/ios/ReceiptOCRModule.swift',
    'modules/ReceiptOCR/android/build.gradle',
    'modules/ReceiptOCR/android/src/main/java/expo/modules/receiptocr/ReceiptOCRModule.kt',
    'ios/Podfile',
    'ios/FinanceFlow/AppDelegate.h',
    'ios/FinanceFlow/AppDelegate.mm',
    'ios/FinanceFlow/FinanceFlow.entitlements',
    'ios/FinanceFlow/Info.plist',
    'ios/FinanceFlow/PrivacyInfo.xcprivacy',
    'ios/FinanceFlow/WidgetDataModule.m',
    'ios/FinanceFlow/WidgetDataModule.swift',
    'ios/FinanceFlow/main.m',
    'ios/FinanceFlow/noop-file.swift',
    'ios/FinanceFlowWidget/FinanceFlowWidget.entitlements',
    'ios/FinanceFlowWidget/FinanceFlowWidget.swift',
    'ios/FinanceFlowWidget/Info.plist',
];

const PART_4_FILES = [
    'context/AppContext.js',
    'context/ThemeContext.js',
    'constants/theme.js',
    'utils/categories.js',
    'utils/currencies.js',
    'utils/helpers.js',
    'utils/pickerStore.js',
    'utils/recommendations.js',
    'utils/savings.js',
    'utils/widgetBridge.js',
    'android/app/src/main/java/com/financeflow/app/QuickActionsWidget.kt',
    'android/app/src/main/java/com/financeflow/app/DailyAllowanceWidget.kt',
    'ios/FinanceFlow/WidgetDataModule.swift',
    'ios/FinanceFlow/WidgetDataModule.m',
    'ios/FinanceFlowWidget/FinanceFlowWidget.swift',
];

// Helper to format a file section
function bundleFiles(files) {
    let out = '';
    for (const relPath of files) {
        const absPath = path.join(ROOT_DIR, relPath);
        if (!fs.existsSync(absPath)) {
            console.error(`ERROR: File not found: ${absPath}`);
            process.exit(1);
        }
        const content = fs.readFileSync(absPath, 'utf8');
        out += `================ FILE: ${relPath} ================\n\n${content}\n\n`;
    }
    return out;
}

// ── 1. Audit Part 1 ─────────────────────────────────────────────────────────
console.log('Generating Part 1: Pre-Release Audit Report & Configurations & Tabs...');
let part1Report = '';
const reportPath = path.join(__dirname, 'part1_report.txt');
if (fs.existsSync(reportPath)) {
    part1Report = fs.readFileSync(reportPath, 'utf8');
} else {
    part1Report = `# =====================================================================\n# FINANCEFLOW AUDIT PART 1: Pre-Release Audit Report & Configurations & Tabs\n# Release Readiness Review: Google Play Store & Apple App Store\n# Total Code Files: ${PART_1_FILES.length}\n# =====================================================================\n\n`;
}
const part1Content = part1Report + bundleFiles(PART_1_FILES);

// ── 2. Audit Part 2 ─────────────────────────────────────────────────────────
console.log('Generating Part 2: Main Application Screens & Components...');
const part2Header = `# =====================================================================\n# FINANCEFLOW AUDIT PART 2: Main Application Screens & Components\n# Total Files: ${PART_2_FILES.length}\n# Includes all standalone app screens, vehicle modules, and UI components\n# =====================================================================\n\n`;
const part2Content = part2Header + bundleFiles(PART_2_FILES);

// ── 3. Audit Part 3 ─────────────────────────────────────────────────────────
console.log('Generating Part 3: Services, Custom Native Modules, iOS Native...');
const part3Header = `# =====================================================================\n# FINANCEFLOW AUDIT PART 3: Services, Custom Native Modules, iOS Native\n# Total Files: ${PART_3_FILES.length}\n# Includes all data services, local AI inference, OCR engine, and iOS native source\n# =====================================================================\n\n`;
const part3Content = part3Header + bundleFiles(PART_3_FILES);

// ── 4. Audit Part 4 ─────────────────────────────────────────────────────────
console.log('Generating Part 4: State (Context), Constants, Utilities & Native Widgets...');
const part4Header = `# =====================================================================\n# FINANCEFLOW AUDIT PART 4: State (Context), Constants, Utilities & Native Widgets\n# Total Files: ${PART_4_FILES.length}\n# Includes React Context providers, formatting utilities, themes, and native widgets\n# =====================================================================\n\n`;
const part4Content = part4Header + bundleFiles(PART_4_FILES);

// ── 5. Complete Combined Codebase Audit ─────────────────────────────────────
console.log('Generating Complete Codebase Audit (financeflow_audit.txt)...');
const allUniqueFiles = Array.from(new Set([
    ...PART_1_FILES,
    ...PART_2_FILES,
    ...PART_3_FILES,
    ...PART_4_FILES,
]));
const combinedHeader = `# =====================================================================\n# FINANCEFLOW COMPLETE CODEBASE AUDIT\n# Total Files: ${allUniqueFiles.length}\n# =====================================================================\n\n`;
const combinedContent = combinedHeader + bundleFiles(allUniqueFiles);

// ── Save to Target Destinations ─────────────────────────────────────────────
const auditOutputs = [
    { name: 'audit_part1_report_and_configs.txt', content: part1Content, count: PART_1_FILES.length },
    { name: 'audit_part2_app_and_context.txt', content: part2Content, count: PART_2_FILES.length },
    { name: 'audit_part3_services_utils_ios.txt', content: part3Content, count: PART_3_FILES.length },
    { name: 'audit_part4_context_and_utils.txt', content: part4Content, count: PART_4_FILES.length },
    { name: 'financeflow_audit.txt', content: combinedContent, count: allUniqueFiles.length },
];

for (const { name, content, count } of auditOutputs) {
    const projectPath = path.join(ROOT_DIR, name);
    fs.writeFileSync(projectPath, content, 'utf8');

    let desktopMsg = '';
    if (fs.existsSync(DESKTOP_DIR)) {
        const desktopPath = path.join(DESKTOP_DIR, name);
        fs.writeFileSync(desktopPath, content, 'utf8');
        desktopMsg = ` & Desktop (${desktopPath})`;
    }

    const lines = content.split('\n').length;
    const sizeKB = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
    console.log(`✓ ${name}: ${count} files, ${lines.toLocaleString()} lines, ${sizeKB} KB -> Project Root${desktopMsg}`);
}

console.log('\nAll audit files successfully recreated from beginning!');
