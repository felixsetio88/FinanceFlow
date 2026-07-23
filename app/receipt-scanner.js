import React, { useEffect, useRef, useState } from "react";
import {
    Platform,
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    TextInput,
    Alert,
    ActivityIndicator,
    StyleSheet,
    useWindowDimensions,
    BackHandler,
    Switch,
    Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
    Defs,
    LinearGradient as SvgGrad,
    Stop,
    Rect,
} from "react-native-svg";
import { useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApp } from "../context/AppContext";
import { scanReceipt, scanReceiptFromText } from "../services/aiReceiptScanner";
import { runOCRAndParse, isOCRAvailable } from "../services/ocrService";
import {
    checkModelStatus,
    isModelDownloaded,
    getActiveModelId,
} from "../services/localAI";
import {
    enqueueReceiptScan,
    taskManager,
    TaskStatus,
} from "../services/backgroundTaskManager";
import {
    clearReceiptScanSession,
    loadReceiptScanSession,
    updateReceiptScanSession,
} from "../services/receiptScanSession";
import EdgeDetectionModal from "../components/EdgeDetectionModal";
import { spendingCategories } from "../utils/categories";
import { generateId } from "../utils/helpers";
import { Colors, Spacing, FontSize, BorderRadius } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";

const FAST_SCAN_STORAGE_KEY = "receipt_fast_scan_enabled";

const SCAN_QUALITY_OPTIONS = [
    { id: "medium", label: "Medium", maxSize: 768, compress: 0.68 },
    { id: "high", label: "High", maxSize: 1024, compress: 0.8 },
    { id: "original", label: "Original", maxSize: null, compress: null },
];

function getNumericString(value, fallback = "0") {
    if (typeof value === "number" && Number.isFinite(value))
        return String(Number(value.toFixed(2)).toString());
    const parsed = Number.parseFloat(
        String(value ?? "").replace(/[^0-9.-]/g, ""),
    );
    return Number.isFinite(parsed)
        ? String(Number(parsed.toFixed(2)).toString())
        : fallback;
}
function getScanErrorMessage(error) {
    const message = String(error?.message || "").trim();
    return message || "Receipt scan failed. Please try again.";
}
function resolveTargetSize(width, height, maxSize) {
    if (!width || !height || !maxSize) return { width: maxSize, height: maxSize };
    const longestSide = Math.max(width, height);
    if (longestSide <= maxSize) return { width, height };
    const scale = maxSize / longestSide;
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}
function getImageDimensions(uri) {
    return new Promise((resolve, reject) =>
        Image.getSize(uri, (width, height) => resolve({ width, height }), reject),
    );
}

function parseEditableNumber(value, fallback = 0) {
    const parsed = Number.parseFloat(
        String(value ?? "").replace(/[^0-9.-]/g, ""),
    );
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEditableAmount(value, fallback = "0") {
    const parsed = Number.parseFloat(
        String(value ?? "").replace(/[^0-9.-]/g, ""),
    );
    return Number.isFinite(parsed) ? String(parsed) : fallback;
}

function normalizeEditableQty(value, fallback = "1") {
    const parsed = Number.parseInt(
        String(value ?? "").replace(/[^0-9-]/g, ""),
        10,
    );
    return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : fallback;
}

function toEditableReceiptItem(item) {
    return {
        name: String(item?.name ?? ""),
        quantity: normalizeEditableQty(item?.quantity, "1"),
        price: normalizeEditableAmount(item?.price, "0"),
        category: item?.category || "other_spending",
    };
}

function getReceiptItemLineTotal(item) {
    return parseEditableNumber(item?.price, 0);
}

function getReceiptItemsSubtotal(list) {
    return (list || []).reduce(
        (sum, item) => sum + getReceiptItemLineTotal(item),
        0,
    );
}

function getReceiptGrandTotal(list, taxValue, serviceChargeValue) {
    return (
        getReceiptItemsSubtotal(list) +
        parseEditableNumber(taxValue, 0) +
        parseEditableNumber(serviceChargeValue, 0)
    );
}

function getReceiptGrandTotalFromSubtotal(
    subtotalValue,
    taxValue,
    serviceChargeValue,
) {
    return (
        parseEditableNumber(subtotalValue, 0) +
        parseEditableNumber(taxValue, 0) +
        parseEditableNumber(serviceChargeValue, 0)
    );
}

export default function ReceiptScanner() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const navigation = useNavigation();
    const { addTransaction, assets, updateAsset, currency } = useApp();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [imageAsset, setImageAsset] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [receiptData, setReceiptData] = useState(null);
    const [scanQuality, setScanQuality] = useState("high");
    const [storeName, setStoreName] = useState("");
    const [date, setDate] = useState("");
    const [items, setItems] = useState([]);
    const [subtotal, setSubtotal] = useState("0");
    const [tax, setTax] = useState("0");
    const [serviceCharge, setServiceCharge] = useState("0");
    const [total, setTotal] = useState("");
    const [category, setCategory] = useState("food");
    const [selectedAssetId, setSelectedAssetId] = useState(null);
    const [scanTaskId, setScanTaskId] = useState(null);
    const [fastScanEnabled, setFastScanEnabled] = useState(true);
    const [ocrProgress, setOcrProgress] = useState("");
    const [pendingCropAsset, setPendingCropAsset] = useState(null);

    const isMountedRef = useRef(true);
    const activeScanTaskRef = useRef(null);
    const allowLeaveRef = useRef(false);
    const allowBackgroundRef = useRef(false);
    const promptVisibleRef = useRef(false);
    const imageUri = imageAsset?.uri || null;



    const resolveActiveTaskId = () => {
        const currentTaskId = scanTaskId || activeScanTaskRef.current;
        if (!currentTaskId) return null;
        const task = taskManager.getTask(currentTaskId);
        if (!task) return currentTaskId;
        if (
            task.status === TaskStatus.RUNNING ||
            task.status === TaskStatus.PENDING
        ) {
            return currentTaskId;
        }
        return null;
    };

    const showLeavePrompt = (onConfirmLeave) => {
        if (promptVisibleRef.current) return;
        promptVisibleRef.current = true;
        Alert.alert(
            "Continue in Background?",
            "Do you want to continue the process in background?",
            [
                {
                    text: "No",
                    style: "cancel",
                    onPress: () => {
                        promptVisibleRef.current = false;
                        allowBackgroundRef.current = false;
                    },
                },
                {
                    text: "Yes",
                    onPress: () => {
                        promptVisibleRef.current = false;
                        allowBackgroundRef.current = true;
                        onConfirmLeave();
                    },
                },
            ],
        );
    };

    useEffect(() => {
        const handleHardwareBackPress = () => {
            const currentTaskId = resolveActiveTaskId();
            if (!currentTaskId) {
                return false; // let default behavior happen
            }

            showLeavePrompt(() => {
                allowLeaveRef.current = true;
                router.back();
            });
            return true; // prevent default behavior
        };

        BackHandler.addEventListener("hardwareBackPress", handleHardwareBackPress);
        return () =>
            BackHandler.removeEventListener(
                "hardwareBackPress",
                handleHardwareBackPress,
            );
    }, [router, scanTaskId]);

    useEffect(() => {
        const unsubscribe = navigation.addListener("beforeRemove", (e) => {
            if (allowLeaveRef.current) {
                allowLeaveRef.current = false;
                return;
            }
            const currentTaskId = resolveActiveTaskId();
            if (!currentTaskId) return;
            e.preventDefault();
            showLeavePrompt(() => {
                allowLeaveRef.current = true;
                navigation.dispatch(e.data.action);
            });
        });
        return unsubscribe;
    }, [navigation, scanTaskId]);

    // Load Fast Scan preference
    useEffect(() => {
        AsyncStorage.getItem(FAST_SCAN_STORAGE_KEY)
            .then((val) => {
                if (val !== null) setFastScanEnabled(val === "true");
            })
            .catch(() => { });
    }, []);

    const toggleFastScan = async (value) => {
        setFastScanEnabled(value);
        try {
            await AsyncStorage.setItem(FAST_SCAN_STORAGE_KEY, String(value));
        } catch { }
    };

    useEffect(() => {
        isMountedRef.current = true;
        loadReceiptScanSession().then((session) => {
            if (!isMountedRef.current || !session) return;
            if (session.imageAsset?.uri) setImageAsset(session.imageAsset);
            if (session.status === "running" && session.taskId) {
                // Double-check the task is actually alive in the task manager.
                // loadReceiptScanSession already reconciles this, but guard here
                // too in case of a hot-reload race where the singleton resets.
                const task = taskManager.getTask(session.taskId);
                const isAlive =
                    task &&
                    (task.status === TaskStatus.RUNNING ||
                        task.status === TaskStatus.PENDING);
                if (isAlive) {
                    setScanning(true);
                    activeScanTaskRef.current = session.taskId;
                    setScanTaskId(session.taskId);
                } else {
                    // Stale session — clear it so the user can retry immediately
                    updateReceiptScanSession({
                        taskId: null,
                        status: "idle",
                        result: null,
                        error: null,
                        imageAsset: session.imageAsset,
                    });
                }
            }
            if (session.status === "completed" && session.result) {
                applyScannedData(session.result);
                setScanning(false);
                setScanTaskId(null);
            }
        });

        const unsubscribe = taskManager.onTaskUpdate(
            (taskId, status, _progress, result, error) => {
                if (!activeScanTaskRef.current || taskId !== activeScanTaskRef.current)
                    return;
                if (status === TaskStatus.RUNNING || status === TaskStatus.PENDING) {
                    updateReceiptScanSession({ taskId, status: "running" });
                    if (isMountedRef.current) setScanning(true);
                    return;
                }
                allowBackgroundRef.current = false;
                if (isMountedRef.current) {
                    setScanning(false);
                    setScanTaskId(null);
                }
                activeScanTaskRef.current = null;
                if (status === TaskStatus.COMPLETED) {
                    const data = result?.data || result;
                    if (!data) return;
                    updateReceiptScanSession({
                        taskId: null,
                        status: "completed",
                        result: data,
                        error: null,
                    });
                    if (isMountedRef.current) applyScannedData(data);
                    return;
                }
                if (status === TaskStatus.FAILED) {
                    updateReceiptScanSession({
                        taskId: null,
                        status: "failed",
                        error: error?.message || "Scan failed",
                    });
                    if (isMountedRef.current) {
                        Alert.alert("Scan Error", getScanErrorMessage(error));
                        setReceiptData(null);
                    }
                } else if (status === TaskStatus.CANCELLED) {
                    updateReceiptScanSession({
                        taskId: null,
                        status: "cancelled",
                        result: null,
                    });
                }
            },
        );
        return () => {
            isMountedRef.current = false;
            unsubscribe();
        };
    }, []);

    const applyScannedData = (data) => {
        setReceiptData(data);
        setStoreName(data.storeName || "");
        setDate(data.date || new Date().toISOString().slice(0, 10));
        const editableItems = (data.items || []).map(toEditableReceiptItem);
        setItems(editableItems);
        setSubtotal(
            normalizeEditableAmount(
                data.subtotal || getReceiptItemsSubtotal(editableItems),
                "0",
            ),
        );
        setTax(normalizeEditableAmount(data.tax, "0"));
        setServiceCharge(normalizeEditableAmount(data.serviceCharge, "0"));
        setTotal(normalizeEditableAmount(data.total, "0"));
        setCategory(data.items?.[0]?.category || "food");
    };

    const pickImage = async (useCamera) => {
        const permResult = useCamera
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permResult.granted) {
            Alert.alert(
                "Permission needed",
                "Please grant camera/gallery permission.",
            );
            return;
        }

        // On Android, the permission dialog can block the JS thread.
        // A short delay ensures the dialog is fully dismissed before
        // the camera/gallery intent launches, preventing a 1-minute freeze.
        const launchPicker = async () => {
            const result = useCamera
                ? await ImagePicker.launchCameraAsync({
                    quality: 1,
                    base64: false,
                    allowsEditing: false,
                })
                : await ImagePicker.launchImageLibraryAsync({
                    quality: 1,
                    base64: false,
                    allowsEditing: false,
                });
            if (!result.canceled) {
                setPendingCropAsset(result.assets[0]);
            }
        };

        if (Platform.OS === 'android') {
            setTimeout(launchPicker, 100);
        } else {
            await launchPicker();
        }
    };

    // ─── Fast Scan (OCR-first) handler ─────────
    const handleFastScan = async () => {
        if (!imageUri) return;
        setScanning(true);
        setOcrProgress("Running OCR...");

        try {
            // Step 1: Run on-device OCR + regex parsing (instant, no AI)
            const { ocrText, parsedData } = await runOCRAndParse(imageUri);
            if (!isMountedRef.current) {
                setScanning(false);
                return;
            }

            // Step 2: Use regex result if it found ANY useful data.
            // We accept items-only (total=0) because the user can see and verify.
            // We ONLY fall to AI if parsedData is completely null (OCR text was unreadable).
            const hasItems = parsedData?.items?.length > 0;
            const hasTotal = (parsedData?.total ?? 0) > 0;

            if (parsedData && (hasItems || hasTotal)) {
                // Regex parsing produced usable data — use it directly (instant, no AI!)
                // If total is missing but items exist, derive it from item prices.
                if (!hasTotal && hasItems) {
                    const derived = parsedData.items.reduce(
                        (s, it) => s + (it.price || 0) * (it.quantity || 1),
                        0,
                    );
                    parsedData.total = parsedData.total || derived;
                    parsedData.subtotal = parsedData.subtotal || derived;
                }
                setOcrProgress("");
                applyScannedData(parsedData);
                setScanning(false);
                await updateReceiptScanSession({
                    taskId: null,
                    status: "completed",
                    result: parsedData,
                    imageAsset,
                });
                return;
            }

            // Step 3: OCR text extracted but regex found nothing.
            // Since Instant Scan is strictly OCR-only, we throw an error instead of falling back to AI.
            throw new Error(
                "OCR could not automatically extract the exact receipt amounts from this image. Please manually enter the details or disable Fast Scan to use the AI model instead.",
            );
        } catch (err) {
            setOcrProgress("");
            Alert.alert("Fast Scan Error", getScanErrorMessage(err));
            setReceiptData(null);
            setScanning(false);
        }
    };

    // ─── Standard (vision-based) scan handler ─────
    const handleScan = async () => {
        if (!imageUri) return;

        // If fast scan is enabled, use the OCR-first flow instead.
        if (fastScanEnabled) {
            return handleFastScan();
        }

        // Always refresh status from disk before checking — in-memory state may be stale on first launch
        allowBackgroundRef.current = false;
        setScanning(true);
        try {
            await checkModelStatus();
            const modelId = await getActiveModelId();
            const downloaded = await isModelDownloaded(modelId);
            if (!downloaded) {
                setScanning(false);
                Alert.alert(
                    "No AI Model Installed",
                    "Please download a local AI model in Settings to scan receipts.",
                    [
                        { text: "Cancel", style: "cancel" },
                        { text: "Go to Settings", onPress: () => router.push("/settings") },
                    ],
                );
                return;
            }
        } catch {
            setScanning(false);
            Alert.alert(
                "AI Check Failed",
                "Could not verify AI model status. Please try again.",
            );
            return;
        }
        // scanning is already true from the check above
        try {
            const selectedQuality =
                SCAN_QUALITY_OPTIONS.find((option) => option.id === scanQuality) ||
                SCAN_QUALITY_OPTIONS[1];
            let scanImageUri = imageUri;
            let ImageManipulator;
            try {
                ImageManipulator = require("expo-image-manipulator");
            } catch {
                ImageManipulator = null;
            }

            if (
                selectedQuality.id !== "original" &&
                ImageManipulator?.manipulateAsync
            ) {
                const sourceDimensions =
                    imageAsset?.width && imageAsset?.height
                        ? { width: imageAsset.width, height: imageAsset.height }
                        : await getImageDimensions(imageUri);
                const { width, height } = resolveTargetSize(
                    sourceDimensions.width,
                    sourceDimensions.height,
                    selectedQuality.maxSize,
                );
                const resized = await ImageManipulator.manipulateAsync(
                    imageUri,
                    [{ resize: { width, height } }],
                    {
                        compress: selectedQuality.compress,
                        format: ImageManipulator.SaveFormat.JPEG,
                    },
                );
                scanImageUri = resized.uri;
            }

            if (!isMountedRef.current && !allowBackgroundRef.current) {
                // If the user left the screen while checking model or resizing, abort.
                setScanning(false);
                return;
            }

            const taskId = enqueueReceiptScan(
                scanImageUri,
                async (input, onToken, taskControl) => {
                    taskControl?.throwIfCancelled?.();
                    const result = await scanReceipt(
                        input,
                        null,
                        null,
                        (token) => {
                            if (taskControl?.isCancelled?.()) return;
                            if (onToken) onToken(token);
                        },
                        input,
                        taskControl,
                    );
                    taskControl?.throwIfCancelled?.();
                    return result;
                },
                {
                    name: "Scan Receipt",
                    description: "Processing receipt image in background...",
                },
            );
            activeScanTaskRef.current = taskId;
            setScanTaskId(taskId);
            await updateReceiptScanSession({
                taskId,
                status: "running",
                imageAsset,
                result: null,
                error: null,
            });
        } catch (err) {
            Alert.alert("Scan Error", getScanErrorMessage(err));
            setReceiptData(null);
            setScanTaskId(null);
            activeScanTaskRef.current = null;
            setScanning(false);
            await updateReceiptScanSession({
                taskId: null,
                status: "failed",
                error: getScanErrorMessage(err),
            });
        }
    };

    const handleCancelScan = () => {
        const targetTaskId = scanTaskId || activeScanTaskRef.current;

        // No task ID tracked at all — just reset UI state
        if (!targetTaskId) {
            setScanning(false);
            updateReceiptScanSession({
                taskId: null,
                status: "idle",
                result: null,
                error: null,
                imageAsset,
            });
            return;
        }

        const task = taskManager.getTask(targetTaskId);
        const isStillActive =
            task &&
            (task.status === TaskStatus.RUNNING ||
                task.status === TaskStatus.PENDING);

        if (!isStillActive) {
            // Task is gone (app crashed previously) or already finished — just clean up UI
            setScanning(false);
            setScanTaskId(null);
            activeScanTaskRef.current = null;
            allowBackgroundRef.current = false;
            updateReceiptScanSession({
                taskId: null,
                status: "idle",
                result: null,
                error: null,
                imageAsset,
            });
            return;
        }

        const cancelled = taskManager.cancelTask(targetTaskId);
        if (!cancelled) {
            // Race condition: task finished between our check and cancelTask call
            setScanning(false);
            setScanTaskId(null);
            activeScanTaskRef.current = null;
            updateReceiptScanSession({
                taskId: null,
                status: "idle",
                result: null,
                error: null,
                imageAsset,
            });
            return;
        }

        allowBackgroundRef.current = false;
        setScanning(false);
        setScanTaskId(null);
        activeScanTaskRef.current = null;
        updateReceiptScanSession({
            taskId: null,
            status: "cancelled",
            result: null,
            error: null,
            imageAsset,
        });
        Alert.alert("Scan Cancelled", "Receipt scan has been cancelled.");
    };

    const handleBackPress = () => {
        const currentTaskId = resolveActiveTaskId();
        if (!currentTaskId) {
            router.back();
            return;
        }

        showLeavePrompt(() => {
            allowLeaveRef.current = true;
            router.back();
        });
    };

    const updateItem = (idx, field, value) => {
        const updated = [...items];
        updated[idx] = { ...updated[idx], [field]: value };
        const nextSubtotal = getNumericString(
            getReceiptItemsSubtotal(updated),
            "0",
        );
        setItems(updated);
        setSubtotal(nextSubtotal);
        setTotal(
            getNumericString(
                getReceiptGrandTotalFromSubtotal(nextSubtotal, tax, serviceCharge),
                "0",
            ),
        );
    };

    const normalizeItemField = (idx, field) => {
        setItems((prev) => {
            const updated = [...prev];
            const current = updated[idx];
            if (!current) return prev;

            updated[idx] = {
                ...current,
                [field]:
                    field === "price"
                        ? normalizeEditableAmount(current[field], "0")
                        : field === "quantity"
                            ? normalizeEditableQty(current[field], "1")
                            : current[field],
            };
            const nextSubtotal = getNumericString(
                getReceiptItemsSubtotal(updated),
                "0",
            );
            setSubtotal(nextSubtotal);
            setTotal(
                getNumericString(
                    getReceiptGrandTotalFromSubtotal(nextSubtotal, tax, serviceCharge),
                    "0",
                ),
            );
            return updated;
        });
    };

    const removeItem = (idx) => {
        const updated = items.filter((_, i) => i !== idx);
        const nextSubtotal = getNumericString(
            getReceiptItemsSubtotal(updated),
            "0",
        );
        setItems(updated);
        setSubtotal(nextSubtotal);
        setTotal(
            getNumericString(
                getReceiptGrandTotalFromSubtotal(nextSubtotal, tax, serviceCharge),
                "0",
            ),
        );
    };

    const handleSave = async () => {
        const amt = parseFloat(total);
        if (!amt || amt <= 0) {
            Alert.alert("Error", "No valid amount to save.");
            return;
        }
        try {
            const tx = {
                id: generateId(),
                type: "spending",
                amount: amt,
                category,
                description: storeName || "Receipt Scan",
                date: date ? new Date(date).toISOString() : new Date().toISOString(),
                items: items.map((item) => {
                    const quantity = Math.max(1, parseEditableNumber(item.quantity, 1));
                    const lineTotal = parseEditableNumber(item.price, 0);
                    return {
                        name: item.name,
                        quantity,
                        price: quantity > 0 ? lineTotal / quantity : lineTotal,
                    };
                }),
                photos: imageUri ? [imageUri] : [],
                assetId: selectedAssetId || null,
                currency,
            };
            await addTransaction(tx);
            // Deduct from the selected asset if one was chosen
            if (selectedAssetId) {
                const asset = assets.find((a) => a.id === selectedAssetId);
                if (asset) {
                    await updateAsset({ ...asset, balance: (asset.balance || 0) - amt });
                }
            }
            await clearReceiptScanSession();
            Alert.alert("Saved!", "Transaction saved successfully.", [
                { text: "OK", onPress: () => router.back() },
            ]);
        } catch (err) {
            Alert.alert(
                "Save Failed",
                err?.message || "Could not save transaction. Please try again.",
            );
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
            {/* Gradient background */}
            <Svg
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
                width={screenWidth}
                height={screenHeight}
            >
                <Defs>
                    <SvgGrad id="bgGrad" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect
                    x="0"
                    y="0"
                    width={screenWidth}
                    height={screenHeight}
                    fill="url(#bgGrad)"
                />
            </Svg>

            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={handleBackPress}
                    style={[
                        styles.backBtn,
                        {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            borderWidth: 1,
                        },
                    ]}
                >
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Scan Receipt
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                scrollEnabled={!scanning}
                keyboardShouldPersistTaps="handled"
            >
                {/* Image Selection */}
                {!imageUri ? (
                    <View style={styles.pickArea}>
                        <TouchableOpacity
                            style={[
                                styles.pickBtn,
                                {
                                    backgroundColor: colors.card,
                                    borderColor: colors.border,
                                    shadowColor: isDark ? "#000" : "#1A1040",
                                },
                            ]}
                            onPress={() => pickImage(true)}
                            activeOpacity={0.82}
                        >
                            <View
                                style={[
                                    styles.pickIconWrap,
                                    {
                                        backgroundColor: isDark
                                            ? "rgba(5,150,105,0.2)"
                                            : "rgba(5,150,105,0.1)",
                                    },
                                ]}
                            >
                                <Ionicons name="camera" size={32} color={colors.emerald} />
                            </View>
                            <Text
                                style={[styles.pickBtnTitle, { color: colors.textPrimary }]}
                            >
                                Take Photo
                            </Text>
                            <Text
                                style={[styles.pickBtnSub, { color: colors.textSecondary }]}
                            >
                                Use camera
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.pickBtn,
                                {
                                    backgroundColor: colors.card,
                                    borderColor: colors.border,
                                    shadowColor: isDark ? "#000" : "#1A1040",
                                },
                            ]}
                            onPress={() => pickImage(false)}
                            activeOpacity={0.82}
                        >
                            <View
                                style={[
                                    styles.pickIconWrap,
                                    {
                                        backgroundColor: isDark
                                            ? "rgba(255,102,0,0.2)"
                                            : "rgba(255,102,0,0.1)",
                                    },
                                ]}
                            >
                                <Ionicons name="images" size={32} color={colors.primary} />
                            </View>
                            <Text
                                style={[styles.pickBtnTitle, { color: colors.textPrimary }]}
                            >
                                Pick from Gallery
                            </Text>
                            <Text
                                style={[styles.pickBtnSub, { color: colors.textSecondary }]}
                            >
                                Choose existing
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View>
                        <View style={styles.imageContainer}>
                            <Image
                                source={{ uri: imageUri }}
                                style={[styles.receiptImage, { backgroundColor: colors.card }]}
                            />
                        </View>
                        <View style={styles.imageActions}>
                            <TouchableOpacity
                                style={[
                                    styles.retakeBtn,
                                    { backgroundColor: colors.card, borderColor: colors.border },
                                ]}
                                onPress={() => {
                                    setImageAsset(null);
                                    setReceiptData(null);
                                    clearReceiptScanSession();
                                }}
                                activeOpacity={0.82}
                            >
                                <Ionicons name="refresh" size={16} color={colors.primary} />
                                <Text style={[styles.retakeBtnText, { color: colors.primary }]}>
                                    Retake
                                </Text>
                            </TouchableOpacity>
                            {!receiptData && (
                                <TouchableOpacity
                                    style={[
                                        styles.scanActionBtn,
                                        {
                                            backgroundColor: fastScanEnabled
                                                ? "#F59E0B"
                                                : colors.emerald,
                                            shadowColor: fastScanEnabled ? "#F59E0B" : colors.emerald,
                                        },
                                        scanning && styles.scanActionBtnDisabled,
                                    ]}
                                    onPress={handleScan}
                                    disabled={scanning}
                                    activeOpacity={0.85}
                                >
                                    {scanning ? (
                                        <>
                                            <Text style={styles.scanActionBtnText}>
                                                {fastScanEnabled ? "Fast Scanning..." : "Scanning..."}
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            <Ionicons
                                                name={fastScanEnabled ? "flash" : "sparkles"}
                                                size={16}
                                                color="#fff"
                                            />
                                            <Text style={styles.scanActionBtnText}>
                                                {fastScanEnabled ? "Fast Scan" : "Scan Receipt"}
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* Options Card */}
                <View
                    style={[
                        styles.optionsCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                >
                    <Text style={[styles.optionHintTop, { color: colors.textSecondary }]}>
                        Only support receipts issued by supermarket or restaurants
                    </Text>

                    {/* Fast Scan Toggle */}
                    <View style={[styles.fastScanRow, { borderColor: colors.border }, fastScanEnabled && { borderBottomWidth: 0, paddingBottom: 0, marginBottom: 0 }]}>
                        <View style={styles.fastScanLeft}>
                            <View
                                style={[
                                    styles.fastScanIconWrap,
                                    {
                                        backgroundColor: isDark
                                            ? "rgba(251,191,36,0.2)"
                                            : "rgba(251,191,36,0.12)",
                                    },
                                ]}
                            >
                                <Ionicons name="flash" size={18} color="#F59E0B" />
                            </View>
                            <View style={styles.fastScanTextCol}>
                                <Text
                                    style={[styles.fastScanTitle, { color: colors.textPrimary }]}
                                >
                                    Instant Scan
                                </Text>
                                <Text
                                    style={[styles.fastScanSubtitle, { color: colors.textMuted }]}
                                >
                                    {fastScanEnabled
                                        ? "OCR extracts text directly without AI model, but less accurate."
                                        : "Image sent to AI vision model directly, slower but more accurate"}
                                </Text>
                            </View>
                        </View>
                        <Switch
                            style={{ marginTop: 2, marginRight: 6 }}
                            value={fastScanEnabled}
                            onValueChange={toggleFastScan}
                        />
                    </View>

                    {!fastScanEnabled && (
                        <>
                            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                                Image Quality
                            </Text>
                            <Text
                                style={[styles.optionHint, { color: colors.textSecondary }]}
                            >
                                Medium: up to 768px · High: up to 1024px · Original: unchanged
                            </Text>
                            <View style={[styles.qualityRow, { marginTop: Spacing.sm }]}>
                                {SCAN_QUALITY_OPTIONS.map((opt) => (
                                    <TouchableOpacity
                                        key={opt.id}
                                        style={[
                                            styles.qualityChip,
                                            {
                                                backgroundColor: colors.inputBg,
                                                borderColor: colors.border,
                                            },
                                            scanQuality === opt.id && [
                                                styles.qualityChipActive,
                                                {
                                                    backgroundColor: isDark
                                                        ? "rgba(5,150,105,0.3)"
                                                        : "rgba(5,150,105,0.1)",
                                                    borderColor: colors.emerald,
                                                },
                                            ],
                                        ]}
                                        onPress={() => setScanQuality(opt.id)}
                                        activeOpacity={0.8}
                                    >
                                        <Text
                                            style={[
                                                styles.qualityChipText,
                                                { color: colors.textSecondary },
                                                scanQuality === opt.id && [
                                                    styles.qualityChipTextActive,
                                                    { color: colors.emerald },
                                                ],
                                            ]}
                                        >
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </>
                    )}
                </View>

                {scanning && (
                    <View
                        style={[
                            styles.scanningBanner,
                            {
                                backgroundColor: fastScanEnabled
                                    ? isDark
                                        ? "rgba(251,191,36,0.15)"
                                        : "rgba(251,191,36,0.08)"
                                    : isDark
                                        ? "rgba(255,102,0,0.2)"
                                        : "rgba(255,102,0,0.07)",
                                borderColor: fastScanEnabled ? "#F59E0B" : colors.primary,
                            },
                        ]}
                        pointerEvents="box-none"
                    >
                        <ActivityIndicator
                            color={fastScanEnabled ? "#F59E0B" : colors.primary}
                        />
                        <Text
                            style={[
                                styles.scanningText,
                                { color: fastScanEnabled ? "#F59E0B" : colors.primary },
                            ]}
                        >
                            {fastScanEnabled
                                ? ocrProgress || "Fast scanning receipt..."
                                : "AI is analyzing your receipt, do not leave this page"}
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.cancelScanBtn,
                                {
                                    backgroundColor: isDark
                                        ? "rgba(220,38,38,0.2)"
                                        : "rgba(220,38,38,0.08)",
                                    borderColor: colors.rose,
                                },
                            ]}
                            onPress={handleCancelScan}
                            activeOpacity={0.82}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <Ionicons name="close-circle" size={16} color={colors.rose} />
                            <Text style={[styles.cancelScanText, { color: colors.rose }]}>
                                Cancel
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Editable Form (after scan) */}
                {receiptData && (
                    <View style={styles.formSection}>
                        <View style={styles.formTitleRow}>
                            <View style={styles.formTitleIconWrap}>
                                <Ionicons name="checkmark" size={16} color="#fff" />
                            </View>
                            <Text style={[styles.formTitle, { color: colors.emerald }]}>
                                Receipt Scanned — Review & Edit
                            </Text>
                        </View>

                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            Store Name
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: colors.inputBg,
                                    borderColor: colors.border,
                                    color: colors.textPrimary,
                                },
                            ]}
                            value={storeName}
                            onChangeText={setStoreName}
                            scrollEnabled={false}
                            placeholderTextColor={colors.textMuted}
                        />

                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            Date
                        </Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    backgroundColor: colors.inputBg,
                                    borderColor: colors.border,
                                    color: colors.textPrimary,
                                },
                            ]}
                            value={date}
                            onChangeText={setDate}
                            scrollEnabled={false}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={colors.textMuted}
                        />

                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            Category
                        </Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ marginBottom: Spacing.md }}
                        >
                            <View style={styles.catRow}>
                                {spendingCategories.map((c) => (
                                    <TouchableOpacity
                                        key={c.id}
                                        style={[
                                            styles.catChip,
                                            {
                                                backgroundColor: colors.inputBg,
                                                borderColor: colors.border,
                                            },
                                            category === c.id && {
                                                backgroundColor: isDark
                                                    ? `${c.color}33`
                                                    : `${c.color}20`,
                                                borderColor: c.color,
                                            },
                                        ]}
                                        onPress={() => setCategory(c.id)}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons
                                            name={c.icon}
                                            size={14}
                                            color={category === c.id ? c.color : colors.textMuted}
                                        />
                                        <Text
                                            style={[
                                                styles.catChipText,
                                                { color: colors.textSecondary },
                                                category === c.id && { color: c.color },
                                            ]}
                                        >
                                            {c.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            Items
                        </Text>
                        {items.map((item, i) => (
                            <View key={i} style={styles.itemRow}>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: colors.inputBg,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        },
                                        { flex: 2 },
                                    ]}
                                    value={item.name}
                                    onChangeText={(v) => updateItem(i, "name", v)}
                                    scrollEnabled={false}
                                    multiline={true}
                                    blurOnSubmit={true}
                                    placeholder="Item"
                                    placeholderTextColor={colors.textMuted}
                                />
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: colors.inputBg,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        },
                                        styles.qtyInput,
                                    ]}
                                    value={String(item.quantity ?? "1")}
                                    onChangeText={(v) => updateItem(i, "quantity", v)}
                                    scrollEnabled={false}
                                    multiline={true}
                                    blurOnSubmit={true}
                                    onBlur={() => normalizeItemField(i, "quantity")}
                                    keyboardType="number-pad"
                                    placeholder="Qty"
                                    placeholderTextColor={colors.textMuted}
                                />
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: colors.inputBg,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        },
                                        { flex: 1 },
                                    ]}
                                    value={String(item.price ?? "0")}
                                    onChangeText={(v) => updateItem(i, "price", v)}
                                    scrollEnabled={false}
                                    multiline={true}
                                    blurOnSubmit={true}
                                    onBlur={() => normalizeItemField(i, "price")}
                                    keyboardType="decimal-pad"
                                    placeholder="Total"
                                    placeholderTextColor={colors.textMuted}
                                />
                                <TouchableOpacity
                                    onPress={() => removeItem(i)}
                                    style={[
                                        styles.removeBtn,
                                        {
                                            backgroundColor: isDark
                                                ? "rgba(220,38,38,0.2)"
                                                : "rgba(220,38,38,0.08)",
                                        },
                                    ]}
                                >
                                    <Ionicons name="close" size={16} color={colors.rose} />
                                </TouchableOpacity>
                            </View>
                        ))}
                        <TouchableOpacity
                            style={styles.addItemBtn}
                            onPress={() => {
                                setItems((prev) => {
                                    const updated = [
                                        ...prev,
                                        {
                                            name: "",
                                            quantity: "1",
                                            price: "0",
                                            category: "other_spending",
                                        },
                                    ];
                                    const nextSubtotal = getNumericString(
                                        getReceiptItemsSubtotal(updated),
                                        "0",
                                    );
                                    setSubtotal(nextSubtotal);
                                    setTotal(
                                        getNumericString(
                                            getReceiptGrandTotalFromSubtotal(
                                                nextSubtotal,
                                                tax,
                                                serviceCharge,
                                            ),
                                            "0",
                                        ),
                                    );
                                    return updated;
                                });
                            }}
                            activeOpacity={0.82}
                        >
                            <Ionicons
                                name="add-circle-outline"
                                size={16}
                                color={colors.primary}
                            />
                            <Text style={[styles.addItemBtnText, { color: colors.primary }]}>
                                Add Item
                            </Text>
                        </TouchableOpacity>

                        <View
                            style={[styles.summarySection, { borderColor: colors.border }]}
                        >
                            <View style={styles.summaryRow}>
                                <Text
                                    style={[styles.summaryLabel, { color: colors.textSecondary }]}
                                >
                                    Subtotal
                                </Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: colors.inputBg,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        },
                                        styles.summaryInput,
                                    ]}
                                    value={subtotal}
                                    onChangeText={(v) => {
                                        setSubtotal(v);
                                        setTotal(
                                            getNumericString(
                                                getReceiptGrandTotalFromSubtotal(v, tax, serviceCharge),
                                                "0",
                                            ),
                                        );
                                    }}
                                    scrollEnabled={false}
                                    multiline={true}
                                    blurOnSubmit={true}
                                    onBlur={() =>
                                        setSubtotal(normalizeEditableAmount(subtotal, "0"))
                                    }
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                />
                            </View>
                            <View style={styles.summaryRow}>
                                <Text
                                    style={[styles.summaryLabel, { color: colors.textSecondary }]}
                                >
                                    Tax
                                </Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: colors.inputBg,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        },
                                        styles.summaryInput,
                                    ]}
                                    value={tax}
                                    onChangeText={(v) => {
                                        setTax(v);
                                        setTotal(
                                            getNumericString(
                                                getReceiptGrandTotalFromSubtotal(
                                                    subtotal,
                                                    v,
                                                    serviceCharge,
                                                ),
                                                "0",
                                            ),
                                        );
                                    }}
                                    scrollEnabled={false}
                                    multiline={true}
                                    blurOnSubmit={true}
                                    onBlur={() => setTax(normalizeEditableAmount(tax, "0"))}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                />
                            </View>
                            <View style={styles.summaryRow}>
                                <Text
                                    style={[styles.summaryLabel, { color: colors.textSecondary }]}
                                >
                                    Service Charge
                                </Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: colors.inputBg,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        },
                                        styles.summaryInput,
                                    ]}
                                    value={serviceCharge}
                                    onChangeText={(v) => {
                                        setServiceCharge(v);
                                        setTotal(
                                            getNumericString(
                                                getReceiptGrandTotalFromSubtotal(subtotal, tax, v),
                                                "0",
                                            ),
                                        );
                                    }}
                                    scrollEnabled={false}
                                    multiline={true}
                                    blurOnSubmit={true}
                                    onBlur={() =>
                                        setServiceCharge(
                                            normalizeEditableAmount(serviceCharge, "0"),
                                        )
                                    }
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={colors.textMuted}
                                />
                            </View>
                        </View>

                        <View style={[styles.totalRow, { borderColor: colors.border }]}>
                            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>
                                Total
                            </Text>
                            <TextInput
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: colors.inputBg,
                                        borderColor: colors.border,
                                    },
                                    styles.totalInput,
                                    { color: colors.primary },
                                ]}
                                value={total}
                                onChangeText={setTotal}
                                scrollEnabled={false}
                                multiline={true}
                                blurOnSubmit={true}
                                onBlur={() => setTotal(normalizeEditableAmount(total, "0"))}
                                keyboardType="decimal-pad"
                            />
                        </View>

                        <Text style={[styles.label, { color: colors.textSecondary }]}>
                            Pay from Account{" "}
                            <Text
                                style={{
                                    color: colors.textMuted,
                                    fontFamily: "Poppins_400Regular",
                                }}
                            >
                                (optional)
                            </Text>
                        </Text>
                        {assets.length === 0 ? (
                            <Text style={[styles.noAssetsHint, { color: colors.textMuted }]}>
                                No accounts found. Add one in Settings → Assets.
                            </Text>
                        ) : (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{ marginBottom: Spacing.sm }}
                            >
                                <View style={styles.paymentRow}>
                                    <TouchableOpacity
                                        style={[
                                            styles.paymentChip,
                                            {
                                                backgroundColor: colors.inputBg,
                                                borderColor: colors.border,
                                            },
                                            selectedAssetId === null && [
                                                styles.paymentChipActive,
                                                {
                                                    backgroundColor: isDark
                                                        ? "rgba(255,102,0,0.2)"
                                                        : "rgba(255,102,0,0.1)",
                                                    borderColor: colors.primary,
                                                },
                                            ],
                                        ]}
                                        onPress={() => requestAnimationFrame(() => setSelectedAssetId(null))}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons
                                            name="close-circle-outline"
                                            size={14}
                                            color={
                                                selectedAssetId === null
                                                    ? colors.primary
                                                    : colors.textMuted
                                            }
                                        />
                                        <Text
                                            style={[
                                                styles.paymentChipText,
                                                { color: colors.textSecondary },
                                                selectedAssetId === null && [
                                                    styles.paymentChipTextActive,
                                                    { color: colors.primary },
                                                ],
                                            ]}
                                        >
                                            None
                                        </Text>
                                    </TouchableOpacity>
                                    {assets.map((a) => (
                                        <TouchableOpacity
                                            key={a.id}
                                            style={[
                                                styles.paymentChip,
                                                {
                                                    backgroundColor: colors.inputBg,
                                                    borderColor: colors.border,
                                                },
                                                selectedAssetId === a.id && [
                                                    styles.paymentChipActive,
                                                    {
                                                        backgroundColor: isDark
                                                            ? "rgba(255,102,0,0.2)"
                                                            : "rgba(255,102,0,0.1)",
                                                        borderColor: colors.primary,
                                                    },
                                                ],
                                            ]}
                                            onPress={() => setSelectedAssetId(a.id)}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons
                                                name="card-outline"
                                                size={14}
                                                color={
                                                    selectedAssetId === a.id
                                                        ? colors.primary
                                                        : colors.textMuted
                                                }
                                            />
                                            <Text
                                                style={[
                                                    styles.paymentChipText,
                                                    { color: colors.textSecondary },
                                                    selectedAssetId === a.id && [
                                                        styles.paymentChipTextActive,
                                                        { color: colors.primary },
                                                    ],
                                                ]}
                                            >
                                                {a.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>
                        )}

                        <TouchableOpacity
                            style={[
                                styles.saveBtn,
                                {
                                    backgroundColor: colors.primary,
                                    shadowColor: colors.primary,
                                },
                            ]}
                            onPress={handleSave}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.saveBtnText}>Save Transaction</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
            {/* Edge Detection Modal */}
            <EdgeDetectionModal
                visible={!!pendingCropAsset}
                imageAsset={pendingCropAsset}
                onCancel={() => {
                    // Back button or hardware back → use original (no crop)
                    if (pendingCropAsset) {
                        const orig = pendingCropAsset;
                        setPendingCropAsset(null);
                        setImageAsset(orig);
                        setReceiptData(null);
                        updateReceiptScanSession({
                            imageAsset: orig,
                            status: 'idle',
                            taskId: null,
                            result: null,
                            error: null,
                        });
                    }
                }}
                onConfirm={(croppedAsset) => {
                    setPendingCropAsset(null);
                    setImageAsset(croppedAsset);
                    setReceiptData(null);
                    updateReceiptScanSession({
                        imageAsset: croppedAsset,
                        status: 'idle',
                        taskId: null,
                        result: null,
                        error: null,
                    });
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F3F4F6" },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: "rgba(83,96,132,0.2)",
        alignSelf: "center",
        marginTop: Spacing.md,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: "rgba(255,102,0,0.1)",
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontSize: FontSize.xl,
        fontFamily: "Poppins_800ExtraBold",
        color: "#1A1040",
    },
    scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Platform.OS === 'android' ? 90 : 60 },

    pickArea: {
        flexDirection: "row",
        gap: Spacing.md,
        marginVertical: Spacing.lg,
    },
    pickBtn: {
        flex: 1,
        alignItems: "center",
        padding: Spacing.xl,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: 2,
        borderColor: "rgba(255,102,0,0.1)",
        borderStyle: "dashed",
        gap: Spacing.sm,
        shadowColor: "#1A1040",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: Platform.OS === "android" ? 0 : 2,
    },
    pickIconWrap: {
        width: 60,
        height: 60,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },
    pickBtnTitle: {
        fontSize: FontSize.md,
        fontFamily: "Poppins_700Bold",
        color: "#1A1040",
    },
    pickBtnSub: {
        fontSize: FontSize.xs,
        fontFamily: "Poppins_400Regular",
        color: "#8B7CC8",
    },

    imageContainer: {
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
    },
    receiptImage: {
        width: "100%",
        height: 320,
        resizeMode: "contain",
        backgroundColor: "rgba(255,255,255,0.88)",
    },
    imageScanOverlay: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(255,102,0,0.8)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
    },
    imageScanText: {
        color: "#fff",
        fontFamily: "Poppins_700Bold",
        fontSize: FontSize.sm,
    },

    imageActions: {
        flexDirection: "row",
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    retakeBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: "rgba(255,102,0,0.1)",
    },
    retakeBtnText: {
        fontFamily: "Poppins_600SemiBold",
        color: "#6A6FF8",
        fontSize: FontSize.sm,
    },
    scanActionBtn: {
        flex: 2,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        padding: Spacing.md,
        borderRadius: BorderRadius.full,
        backgroundColor: "#059669",
        shadowColor: "#059669",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
        elevation: Platform.OS === "android" ? 0 : 4,
    },
    scanActionBtnDisabled: {
        backgroundColor: "rgba(5,150,105,0.5)",
        shadowOpacity: 0,
    },
    scanActionBtnText: {
        color: "#fff",
        fontFamily: "Poppins_700Bold",
        fontSize: FontSize.sm,
    },

    optionsCard: {
        marginTop: Spacing.md,
        marginBottom: Spacing.md,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: "rgba(255,102,0,0.08)",
    },
    optionHintTop: {
        fontSize: FontSize.xs,
        fontFamily: "Poppins_400Regular",
        color: "#8B7CC8",
        lineHeight: 16,
        marginBottom: Spacing.sm,
    },
    fastScanRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        paddingVertical: Spacing.md,
        marginBottom: Spacing.md,
        borderBottomWidth: 1,
        borderColor: "rgba(83,96,132,0.08)",
    },
    fastScanLeft: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: Spacing.sm,
        flex: 1,
    },
    fastScanIconWrap: {
        marginTop: 2,
        width: 36,
        height: 36,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
    },
    fastScanTextCol: { flex: 1 },
    fastScanTitle: {
        fontSize: FontSize.sm,
        fontFamily: "Poppins_700Bold",
        color: "#1A1040",
    },
    fastScanSubtitle: {
        fontSize: 11,
        fontFamily: "Poppins_400Regular",
        color: "#8B7CC8",
        marginTop: 1,
    },
    optionTitle: {
        fontSize: FontSize.sm,
        fontFamily: "Poppins_700Bold",
        color: "#1A1040",
    },
    optionHint: {
        fontSize: FontSize.xs,
        fontFamily: "Poppins_400Regular",
        color: "#8B7CC8",
        marginTop: 2,
    },
    qualityRow: { flexDirection: "row", gap: Spacing.sm },
    qualityChip: {
        paddingHorizontal: Spacing.md,
        paddingVertical: 7,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: "rgba(255,102,0,0.1)",
        backgroundColor: "rgba(83,96,132,0.04)",
    },
    qualityChipActive: {
        borderColor: "#059669",
        backgroundColor: "rgba(5,150,105,0.1)",
    },
    qualityChipText: {
        color: "#8B7CC8",
        fontFamily: "Poppins_600SemiBold",
        fontSize: FontSize.sm,
    },
    qualityChipTextActive: { color: "#059669", fontFamily: "Poppins_700Bold" },

    scanningBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.md,
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        backgroundColor: "rgba(255,102,0,0.07)",
        marginVertical: Spacing.md,
        borderWidth: 1,
        borderColor: "rgba(255,102,0,0.15)",
    },
    scanningText: {
        flex: 1,
        fontFamily: "Poppins_600SemiBold",
        color: "#ff6600",
        fontSize: FontSize.sm,
    },
    cancelScanBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(220,38,38,0.08)",
        paddingHorizontal: Spacing.sm,
        paddingVertical: 5,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: "rgba(220,38,38,0.2)",
    },
    cancelScanText: {
        color: "#dc2626",
        fontSize: FontSize.xs,
        fontFamily: "Poppins_700Bold",
    },

    formSection: { marginTop: Spacing.lg },
    formTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    formTitleIconWrap: {
        width: 28,
        height: 28,
        borderRadius: 9,
        backgroundColor: "#059669",
        alignItems: "center",
        justifyContent: "center",
    },
    formTitle: {
        fontSize: FontSize.lg,
        fontFamily: "Poppins_700Bold",
        color: "#059669",
    },
    label: {
        fontSize: FontSize.sm,
        fontFamily: "Poppins_600SemiBold",
        color: "#4B4570",
        marginBottom: Spacing.xs,
        marginTop: Spacing.md,
    },
    input: {
        backgroundColor: "rgba(255,255,255,0.88)",
        borderRadius: BorderRadius.md,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        color: "#1A1040",
        fontSize: FontSize.md,
        fontFamily: "Poppins_400Regular",
        borderWidth: 1,
        borderColor: "rgba(255,102,0,0.1)",
    },
    catRow: { flexDirection: "row", gap: Spacing.sm },
    catChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: "rgba(83,96,132,0.1)",
    },
    catChipText: {
        fontSize: FontSize.sm,
        fontFamily: "Poppins_500Medium",
        color: "#8B7CC8",
    },
    itemRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    qtyInput: { width: 72, textAlign: "center", paddingHorizontal: 8 },
    removeBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: "rgba(220,38,38,0.08)",
        alignItems: "center",
        justifyContent: "center",
    },
    addItemBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.xs,
        paddingVertical: Spacing.sm,
        marginTop: Spacing.xs,
        marginBottom: Spacing.md,
    },
    addItemBtnText: {
        fontSize: FontSize.sm,
        fontFamily: "Poppins_600SemiBold",
        color: "#ff6600",
    },
    summarySection: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderColor: "rgba(83,96,132,0.09)",
        gap: Spacing.sm,
    },
    summaryRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    summaryLabel: {
        fontSize: FontSize.md,
        fontFamily: "Poppins_500Medium",
        color: "#8B7CC8",
    },
    summaryValue: {
        fontSize: FontSize.md,
        fontFamily: "Poppins_600SemiBold",
        color: "#1A1040",
    },
    summaryInput: { width: 130, textAlign: "right", paddingHorizontal: 12 },
    totalRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1.5,
        borderColor: "rgba(83,96,132,0.12)",
    },
    totalLabel: {
        fontSize: FontSize.xl,
        fontFamily: "Poppins_800ExtraBold",
        color: "#1A1040",
    },
    totalInput: {
        width: 150,
        textAlign: "right",
        fontSize: FontSize.xl,
        fontFamily: "Poppins_800ExtraBold",
        color: "#ff6600",
        paddingHorizontal: 12,
    },
    paymentRow: { flexDirection: "row", gap: Spacing.sm },
    paymentChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        backgroundColor: "rgba(255,255,255,0.88)",
        borderWidth: 1,
        borderColor: "rgba(83,96,132,0.1)",
    },
    paymentChipActive: {
        borderColor: "#ff6600",
        backgroundColor: "rgba(255,102,0,0.1)",
    },
    paymentChipText: {
        fontSize: FontSize.sm,
        fontFamily: "Poppins_500Medium",
        color: "#8B7CC8",
    },
    paymentChipTextActive: { color: "#ff6600", fontFamily: "Poppins_700Bold" },
    noAssetsHint: {
        fontSize: FontSize.sm,
        fontFamily: "Poppins_400Regular",
        marginBottom: Spacing.md,
    },
    saveBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.sm,
        backgroundColor: "#ff6600",
        paddingVertical: Spacing.lg,
        borderRadius: BorderRadius.full,
        marginTop: Spacing.xl,
        shadowColor: "#ff6600",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: Platform.OS === "android" ? 0 : 6,
    },
    saveBtnText: {
        color: "#fff",
        fontFamily: "Poppins_700Bold",
        fontSize: FontSize.lg,
    },
});
