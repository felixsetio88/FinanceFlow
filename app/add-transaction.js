import React, { useState, useEffect, useMemo } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, StyleSheet, Alert, Modal, useWindowDimensions
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { spendingCategories, incomeCategories, getAccountTypeById } from '../utils/categories';
import { generateId, formatDateTime } from '../utils/helpers';
import { getTransactionRecommendations } from '../utils/recommendations';
import { formatCurrency } from '../utils/currencies';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

/* ─── Date/Time Picker ─── */
function DateTimePickerModal({ visible, value, onChange, onClose, colors, isDark }) {
    const [month, setMonth] = useState(0);
    const [day, setDay] = useState(1);
    const [year, setYear] = useState(2025);
    const [hour, setHour] = useState(12);
    const [minute, setMinute] = useState(0);
    const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    useEffect(() => {
        if (visible) {
            const d = value ? new Date(value) : new Date();
            setMonth(d.getMonth()); setDay(d.getDate()); setYear(d.getFullYear());
            setHour(d.getHours()); setMinute(d.getMinutes());
        }
    }, [visible]);

    const dim = new Date(year, month + 1, 0).getDate();
    const confirm = () => {
        onChange(new Date(year, month, Math.min(day, dim), hour, minute).toISOString());
        onClose();
    };

    const fields = [
        { label:'Mo', val: MN[month], up:()=>setMonth((month+11)%12), dn:()=>setMonth((month+1)%12) },
        { label:'Day', val: String(day).padStart(2,'0'), up:()=>setDay(day<=1?dim:day-1), dn:()=>setDay(day>=dim?1:day+1) },
        { label:'Yr', val: year, up:()=>setYear(year-1), dn:()=>setYear(year+1) },
        { label:'Hr', val: String(hour).padStart(2,'0'), up:()=>setHour((hour+23)%24), dn:()=>setHour((hour+1)%24) },
        { label:'Min', val: String(minute).padStart(2,'0'), up:()=>setMinute((minute+59)%60), dn:()=>setMinute((minute+1)%60) },
    ];

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={[dt.overlay, { backgroundColor: colors.overlay }]}>
                <View style={[dt.box, { backgroundColor: colors.modalBg, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                    <Text style={[dt.title, { color: colors.textPrimary }]}>Date & Time</Text>
                    <View style={dt.row}>
                        {fields.map((f,i)=>(
                            <View key={i} style={dt.field}>
                                <Text style={[dt.fl, { color: colors.textSecondary }]}>{f.label}</Text>
                                <TouchableOpacity onPress={f.up}><Ionicons name="chevron-up" size={20} color={colors.primary}/></TouchableOpacity>
                                <Text style={[dt.fv, { color: colors.textPrimary }]}>{String(f.val)}</Text>
                                <TouchableOpacity onPress={f.dn}><Ionicons name="chevron-down" size={20} color={colors.primary}/></TouchableOpacity>
                            </View>
                        ))}
                    </View>
                    <View style={dt.btns}>
                        <TouchableOpacity style={[dt.cancel, { backgroundColor: colors.inputBg }]} onPress={onClose}><Text style={[dt.cancelTxt, { color: colors.textSecondary }]}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity style={[dt.confirm, { backgroundColor: colors.primary }]} onPress={confirm}><Text style={dt.confirmTxt}>Confirm</Text></TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/* ─── Extra Charge Row ─── */
function ExtraCharge({ label, enabled, setEnabled, isPercent, setIsPercent, value, setValue, colors }) {
    return (
        <View style={[s.extraRow, { borderColor: colors.border }]}>
            <TouchableOpacity style={s.checkRow} onPress={()=>setEnabled(!enabled)}>
                <View style={[s.checkbox, { borderColor: colors.border }, enabled && [s.checkboxOn, { backgroundColor: colors.primary, borderColor: colors.primary }]]}>
                    {enabled && <Ionicons name="checkmark" size={12} color="#fff"/>}
                </View>
                <Text style={[s.extraLabel, { color: enabled ? colors.textPrimary : colors.textMuted }, enabled && {fontFamily:'Poppins_600SemiBold'}]}>{label}</Text>
            </TouchableOpacity>
            {enabled && (
                <View style={s.extraInputs}>
                    <View style={[s.pctToggle, { backgroundColor: colors.inputBg }]}>
                        <TouchableOpacity style={[s.pctBtn, !isPercent && [s.pctBtnOn, { backgroundColor: colors.primary }]]} onPress={()=>setIsPercent(false)}>
                            <Text style={[s.pctTxt, { color: colors.textMuted }, !isPercent && s.pctTxtOn]}>$</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.pctBtn, isPercent && [s.pctBtnOn, { backgroundColor: colors.primary }]]} onPress={()=>setIsPercent(true)}>
                            <Text style={[s.pctTxt, { color: colors.textMuted }, isPercent && s.pctTxtOn]}>%</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={[s.extraInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                        value={value}
                        onChangeText={setValue}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                    />
                </View>
            )}
        </View>
    );
}

/* ─── Main Screen ─── */
export default function AddTransaction() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { editId, prefill } = useLocalSearchParams();
    const { addTransaction, updateTransaction, updateAsset, assets, transactions, vehicles, currency, updateVehicle } = useApp();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const gridPadding = Spacing.lg * 2;
    const totalGaps = 3 * Spacing.sm;
    const calculatedItemWidth = (screenWidth - gridPadding - totalGaps) / 4;

    const [type, setType] = useState('spending');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [assetId, setAssetId] = useState('');
    const [fromAssetId, setFromAssetId] = useState('');
    const [toAssetId, setToAssetId] = useState('');

    const [items, setItems] = useState([]);
    const [itemName, setItemName] = useState('');
    const [itemPrice, setItemPrice] = useState('');
    const [itemQty, setItemQty] = useState('1');

    const [taxEnabled, setTaxEnabled] = useState(false);
    const [taxIsPercent, setTaxIsPercent] = useState(true);
    const [taxValue, setTaxValue] = useState('');
    const [serviceFeeEnabled, setServiceFeeEnabled] = useState(false);
    const [serviceFeeIsPercent, setServiceFeeIsPercent] = useState(false);
    const [serviceFeeValue, setServiceFeeValue] = useState('');
    const [tipEnabled, setTipEnabled] = useState(false);
    const [tipIsPercent, setTipIsPercent] = useState(true);
    const [tipValue, setTipValue] = useState('');

    const [vehicleId, setVehicleId] = useState('');
    const [vehicleLogType, setVehicleLogType] = useState('refuel');
    const [vehicleOdometer, setVehicleOdometer] = useState('');
    const [vehicleVolume, setVehicleVolume] = useState('');
    const [vehicleMaintenanceItems, setVehicleMaintenanceItems] = useState('');
    const [initialOdometer, setInitialOdometer] = useState('');

    const isEditing = !!editId;

    useEffect(() => {
        if (prefill && !editId) {
            try {
                const data = JSON.parse(prefill);
                if (data.type) setType(data.type);
                if (data.amount) setAmount(String(data.amount));
                if (data.category) setCategory(data.category);
                if (data.description) setDescription(data.description);
                if (data.items && Array.isArray(data.items) && data.items.length > 0) setItems(data.items);
                if (data.assetId) setAssetId(data.assetId);
                if (data.date) {
                    const d = new Date(data.date);
                    if (!isNaN(d.getTime())) {
                        setSelectedDate(d.toISOString());
                    }
                }
                if (data.vehicleLogType) setVehicleLogType(data.vehicleLogType);
                if (data.vehicleId) setVehicleId(data.vehicleId);
                if (data.vehicleOdometer) setVehicleOdometer(String(data.vehicleOdometer));
                if (data.vehicleVolume) setVehicleVolume(String(data.vehicleVolume));
            } catch(e) {
                console.error("Failed to parse prefill data", e);
            }
        }
    }, [prefill, editId]);

    useEffect(() => {
        if (!editId || !transactions) return;
        const tx = transactions.find(t => t.id === editId);
        if (!tx) return;
        setType(tx.type); setAmount(Math.abs(tx.amount).toString());
        setCategory(tx.category || ''); setDescription(tx.description || '');
        setSelectedDate(tx.date); setAssetId(tx.assetId || '');
        setFromAssetId(tx.fromAssetId || ''); setToAssetId(tx.toAssetId || '');
        setItems(tx.items || []);
        setTaxEnabled(tx.taxEnabled); setTaxIsPercent(tx.taxIsPercent); setTaxValue(tx.tax ? String(tx.tax) : '');
        setServiceFeeEnabled(tx.serviceFeeEnabled); setServiceFeeIsPercent(tx.serviceFeeIsPercent); setServiceFeeValue(tx.serviceFee ? String(tx.serviceFee) : '');
        setTipEnabled(tx.tipEnabled); setTipIsPercent(tx.tipIsPercent); setTipValue(tx.tip ? String(tx.tip) : '');
        setVehicleId(tx.vehicleId || '');
        setVehicleLogType(tx.vehicleLogType || 'refuel');
        setVehicleOdometer(tx.vehicleOdometer ? String(tx.vehicleOdometer) : '');
        setVehicleVolume(tx.vehicleVolume ? String(tx.vehicleVolume) : '');
        setVehicleMaintenanceItems(tx.vehicleMaintenanceItems || '');
    }, [editId, transactions]);

    const categories = type === 'spending' ? spendingCategories : incomeCategories;
    const recommendations = useMemo(() => {
        if (isEditing || type === 'move') return [];
        return getTransactionRecommendations({ transactions, type, selectedDate, limit: 4 });
    }, [isEditing, transactions, type, selectedDate]);

    // Auto-select default vehicle
    useEffect(() => {
        if (category === 'transport' && !vehicleId && vehicles && vehicles.length > 0) {
            const defaultVehicle = vehicles.find(v => v.isDefault === 1);
            if (defaultVehicle) {
                setVehicleId(defaultVehicle.id);
            }
        }
    }, [category, vehicleId, vehicles]);

    const applyRecommendation = rec => {
        setCategory(rec.categoryId);
        if (!description.trim()) setDescription(rec.description || rec.categoryName);
    };

    const calcExtra = (en, isPct, val, base) => {
        if (!en || !val) return 0;
        const n = parseFloat(val) || 0;
        return isPct ? (base * n) / 100 : n;
    };
    const base = items.length > 0 ? items.reduce((s,i)=>s+i.price*i.quantity,0) : parseFloat(amount)||0;
    const taxAmt = calcExtra(taxEnabled, taxIsPercent, taxValue, base);
    const feeAmt = calcExtra(serviceFeeEnabled, serviceFeeIsPercent, serviceFeeValue, base);
    const tipAmt = calcExtra(tipEnabled, tipIsPercent, tipValue, base);
    const total = base + (type==='spending' ? taxAmt+feeAmt+tipAmt : 0);

    const addItem = () => {
        if (!itemName.trim() || !itemPrice) return;
        setItems([...items, { name:itemName.trim(), quantity:parseInt(itemQty)||1, price:parseFloat(itemPrice)||0 }]);
        setItemName(''); setItemPrice(''); setItemQty('1');
    };
    const removeItem = idx => setItems(items.filter((_,i)=>i!==idx));
    const updateItemQty = (idx, qty) => {
        const u = [...items]; u[idx] = {...u[idx], quantity: Math.max(1, qty)}; setItems(u);
    };

    const handleSave = async () => {
        if (!total || total <= 0) { Alert.alert('Error','Please enter an amount or add items.'); return; }
        if (!category) { Alert.alert('Error','Please select a category.'); return; }
        const tx = {
            id: isEditing ? editId : generateId(),
            type, amount: total, category,
            description: description || (categories.find(c=>c.id===category)?.name || ''),
            date: selectedDate, items: type==='spending' ? items : [], photos:[],
            paymentMethod: assetId ? 'asset' : 'cash',
            assetId: assetId||null, fromAssetId:null, toAssetId:null,
            tax: taxEnabled ? parseFloat(taxValue||0) : 0, taxIsPercent, taxEnabled,
            serviceFee: serviceFeeEnabled ? parseFloat(serviceFeeValue||0) : 0, serviceFeeIsPercent, serviceFeeEnabled,
            tip: tipEnabled ? parseFloat(tipValue||0) : 0, tipIsPercent, tipEnabled,
            vehicleId: category === 'transport' ? (vehicleId || null) : null,
            vehicleLogType: category === 'transport' ? vehicleLogType : null,
            vehicleOdometer: category === 'transport' ? parseFloat(vehicleOdometer||0) : null,
            vehicleVolume: category === 'transport' && vehicleLogType === 'refuel' ? parseFloat(vehicleVolume||0) : null,
            vehicleMaintenanceItems: category === 'transport' && vehicleLogType === 'maintenance' ? vehicleMaintenanceItems : null,
            currency,
        };

        if (isEditing) {
            const oldTx = transactions.find(t => t.id === editId);
            if (oldTx) {
                const oldAssetId = oldTx.assetId;
                const newAssetId = tx.assetId;

                let oldAssetBalanceChange = oldTx.type === 'income' ? -oldTx.amount : oldTx.amount;
                let newAssetBalanceChange = tx.type === 'income' ? tx.amount : -tx.amount;

                if (oldAssetId === newAssetId && oldAssetId) {
                    const asset = assets.find(a => a.id === oldAssetId);
                    if (asset) {
                        const netChange = oldAssetBalanceChange + newAssetBalanceChange;
                        if (netChange !== 0) {
                            await updateAsset({ ...asset, balance: asset.balance + netChange });
                        }
                    }
                } else {
                    if (oldAssetId) {
                        const oldAsset = assets.find(a => a.id === oldAssetId);
                        if (oldAsset) {
                            await updateAsset({ ...oldAsset, balance: oldAsset.balance + oldAssetBalanceChange });
                        }
                    }
                    if (newAssetId) {
                        const newAsset = assets.find(a => a.id === newAssetId);
                        if (newAsset) {
                            await updateAsset({ ...newAsset, balance: newAsset.balance + newAssetBalanceChange });
                        }
                    }
                }
            }
            await updateTransaction(tx);
        } else {
            if (tx.assetId) {
                const asset = assets.find(a => a.id === tx.assetId);
                if (asset) {
                    const balanceChange = tx.type === 'income' ? tx.amount : -tx.amount;
                    await updateAsset({ ...asset, balance: asset.balance + balanceChange });
                }
            }
            if (category === 'transport' && vehicleLogType === 'refuel' && vehicleId) {
                const selectedV = vehicles.find(v => v.id === vehicleId);
                if (selectedV && !selectedV.initialOdometer && initialOdometer) {
                    await updateVehicle({ ...selectedV, initialOdometer: parseFloat(initialOdometer) });
                }
            }
            await addTransaction(tx);
        }
        router.back();
    };

    const handleMove = async () => {
        const amt = parseFloat(amount);
        if (!amt || amt<=0) { Alert.alert('Error','Enter a valid amount'); return; }
        if (!fromAssetId || !toAssetId) { Alert.alert('Error','Select both source and destination accounts'); return; }
        if (fromAssetId===toAssetId) { Alert.alert('Error','Source and destination must be different'); return; }
        const fa = assets.find(a=>a.id===fromAssetId);
        const ta = assets.find(a=>a.id===toAssetId);
        if (!fa || !ta) return;

        const balanceDeltas = {};
        const addDelta = (assetId, delta) => {
            if (!assetId) return;
            balanceDeltas[assetId] = (balanceDeltas[assetId] || 0) + delta;
        };

        if (isEditing) {
            const oldTx = transactions.find(t => t.id === editId);
            if (oldTx?.type === 'move') {
                addDelta(oldTx.fromAssetId, oldTx.amount || 0);
                addDelta(oldTx.toAssetId, -(oldTx.amount || 0));
            }
        }

        addDelta(fromAssetId, -amt);
        addDelta(toAssetId, amt);

        for (const [assetId, delta] of Object.entries(balanceDeltas)) {
            if (!delta) continue;
            const asset = assets.find(a => a.id === assetId);
            if (asset) {
                await updateAsset({ ...asset, balance: (asset.balance || 0) + delta });
            }
        }

        const moveTx = {
            id: isEditing ? editId : generateId(),
            type:'move', amount:amt, category:'transfer',
            description: description || (fa.name+' → '+ta.name),
            date:selectedDate, items:[], photos:[], paymentMethod:'transfer',
            assetId:null, fromAssetId, toAssetId,
            tax:0, taxIsPercent:false, taxEnabled:false,
            serviceFee:0, serviceFeeIsPercent:false, serviceFeeEnabled:false,
            tip:0, tipIsPercent:false, tipEnabled:false, currency,
        };
        if (isEditing) { await updateTransaction(moveTx); } else { await addTransaction(moveTx); }
        router.back();
    };

    const TYPE_CONFIG = {
        income:  { label:'Income',  icon:'arrow-down',      color:'#059669' },
        spending:{ label:'Spending', icon:'arrow-up',        color:'#dc2626' },
        move:    { label:'Move',     icon:'swap-horizontal', color:'#6A6FF8' },
    };

    const AssetPicker = ({ label, value, onChange }) => (
        <View>
            <Text style={[s.label, { color: colors.textSecondary }]}>{label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:Spacing.xs}}>
                {assets.map(a => {
                    const at = getAccountTypeById(a.type);
                    const sel = value===a.id;
                    return (
                        <TouchableOpacity key={a.id} style={[s.assetChip, { backgroundColor: colors.inputBg, borderColor: colors.border }, sel && [s.assetChipSel, { backgroundColor: colors.primary, borderColor: colors.primary }]]} onPress={()=>onChange(sel?'':a.id)} activeOpacity={0.8}>
                            <Ionicons name={at.icon} size={16} color={sel ? '#fff' : colors.primary} />
                            <View>
                                <Text style={[s.acName, { color: colors.textPrimary }, sel&&{color:'#fff'}]}>{a.name}</Text>
                                <Text style={[s.acBal, { color: colors.textSecondary }, sel&&{color:'rgba(255,255,255,0.7)'}]}>{formatCurrency(a.balance,currency)}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );

    return (
        <KeyboardAvoidingView style={[s.container, { backgroundColor: colors.background }]} behavior={Platform.OS==='ios'?'padding':undefined}>
            {/* Gradient background */}
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight} pointerEvents="none">
                <Defs>
                    <SvgGrad id="bgGrad" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.5" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGrad)" />
            </Svg>

            <View style={[s.handle, { backgroundColor: colors.border }]}/>
            <View style={s.header}>
                <TouchableOpacity onPress={()=>router.back()} style={[s.closeBtn, { backgroundColor: colors.card }]}>
                    <Ionicons name="close" size={20} color={colors.textSecondary}/>
                </TouchableOpacity>
                <Text style={[s.title, { color: colors.textPrimary }]}>{isEditing?'Edit Transaction':'Add Transaction'}</Text>
                <View style={{width:40}}/>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                {/* Type Toggle */}
                <View style={[s.typeToggle, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    {Object.entries(TYPE_CONFIG).map(([id, cfg])=>(
                        <TouchableOpacity
                            key={id}
                            style={[s.typeBtn, type===id && {backgroundColor:cfg.color, shadowColor:cfg.color}]}
                            onPress={()=>{setType(id);setCategory('');}}
                            activeOpacity={0.8}
                        >
                            <Ionicons name={cfg.icon} size={14} color={type===id?'#fff':cfg.color}/>
                            <Text style={[s.typeTxt, { color: colors.textSecondary }, type===id&&{color:'#fff'}]}>{cfg.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Date & Time */}
                <Text style={[s.label, { color: colors.textSecondary }]}>Date & Time</Text>
                <TouchableOpacity style={[s.dateRow, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={()=>setShowDatePicker(true)} activeOpacity={0.8}>
                    <Ionicons name="calendar" size={18} color={colors.primary}/>
                    <Text style={[s.dateTxt, { color: colors.textPrimary }]}>{formatDateTime(selectedDate)}</Text>
                    <Ionicons name="pencil" size={14} color={colors.textSecondary}/>
                </TouchableOpacity>

                {/* MOVE */}
                {type==='move' && (
                    <>
                        <Text style={[s.label, { color: colors.textSecondary }]}>Amount ({currency})</Text>
                        <TextInput style={[s.amtInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]} placeholder="0" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="numeric"/>
                        {assets.length>=2 ? (
                            <>
                                <AssetPicker label="From Account" value={fromAssetId} onChange={setFromAssetId}/>
                                <AssetPicker label="To Account" value={toAssetId} onChange={setToAssetId}/>
                            </>
                        ) : (
                            <View style={[s.infoBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                                <Ionicons name="information-circle" size={18} color="#F59E0B"/>
                                <Text style={[s.infoTxt, { color: colors.textSecondary }]}>You need at least 2 accounts to move funds. Add accounts in Assets.</Text>
                            </View>
                        )}
                        <Text style={[s.label, { color: colors.textSecondary }]}>Description (Optional)</Text>
                        <TextInput style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]} placeholder="e.g. Bank deposit" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription}/>
                    </>
                )}

                {/* INCOME / SPENDING */}
                {type!=='move' && (
                    <>
                        <Text style={[s.label, { color: colors.textSecondary }]}>Amount ({currency})</Text>
                        <TextInput style={[s.amtInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]} placeholder="0.00" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="numeric"/>

                        {recommendations.length > 0 && (
                            <View style={s.recommendationsSect}>
                                <View style={s.recommendationsHeader}>
                                    <Ionicons name="sparkles" size={13} color={colors.primary}/>
                                    <Text style={[s.recommendationsTitle, { color: colors.primary }]}>Smart Suggestions</Text>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recommendationsRow}>
                                    {recommendations.map(rec => {
                                        const selected = category === rec.categoryId;
                                        return (
                                            <TouchableOpacity
                                                key={rec.id}
                                                style={[s.recommendationChip, { backgroundColor: colors.inputBg, borderColor: colors.border }, selected && [s.recommendationChipActive, { backgroundColor: colors.primary, borderColor: colors.primary }]]}
                                                onPress={() => applyRecommendation(rec)}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[s.recommendationLabel, { color: colors.textPrimary }, selected && s.recommendationLabelActive]}>{rec.label}</Text>
                                                <Text style={[s.recommendationReason, { color: colors.textSecondary }, selected && s.recommendationReasonActive]}>{rec.reason}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        )}

                        <Text style={[s.label, { color: colors.textSecondary }]}>Category</Text>
                        <View style={s.catGrid}>
                            {categories.map(c=>(
                                <TouchableOpacity
                                    key={c.id}
                                    style={[s.catItem, { width: calculatedItemWidth, height: calculatedItemWidth, backgroundColor: colors.inputBg, borderColor: colors.border }, category===c.id&&{borderColor:c.color, backgroundColor: isDark ? `${c.color}33` : `${c.color}12`}]}
                                    onPress={()=>setCategory(c.id)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name={c.icon} size={24} color={category===c.id?c.color:colors.textMuted}/>
                                    <Text style={[s.catName, { color: colors.textMuted }, category===c.id&&{color:c.color, fontFamily:'Poppins_600SemiBold'}]}>{c.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {category === 'transport' && vehicles && vehicles.length > 0 && (
                            <View>
                                <Text style={[s.label, { color: colors.textSecondary }]}>Vehicle Expenses</Text>
                                <View style={{ marginTop: 0 }}>
                                    {/* Log type toggle */}
                                    <View style={[s.typeToggle, { backgroundColor: colors.inputBg, borderColor: colors.border, marginBottom: 0 }]}>
                                        <TouchableOpacity style={[s.typeBtn, vehicleLogType==='refuel' && {backgroundColor:colors.primary, shadowColor:colors.primary}]} onPress={()=>setVehicleLogType('refuel')}>
                                            <MaterialCommunityIcons name="gas-station-outline" size={16} color={vehicleLogType==='refuel'?'#fff':colors.primary}/>
                                            <Text style={[s.typeTxt, { color: colors.textSecondary }, vehicleLogType==='refuel'&&{color:'#fff'}]}>Car Refuel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[s.typeBtn, vehicleLogType==='maintenance' && {backgroundColor:colors.primary, shadowColor:colors.primary}]} onPress={()=>setVehicleLogType('maintenance')}>
                                            <Ionicons name="build-outline" size={14} color={vehicleLogType==='maintenance'?'#fff':colors.primary}/>
                                            <Text style={[s.typeTxt, { color: colors.textSecondary }, vehicleLogType==='maintenance'&&{color:'#fff'}]}>Maintenance</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Vehicle picker */}
                                    <View>
                                        <Text style={[s.label, { color: colors.textSecondary }]}>Select Vehicle</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                                            {vehicles.map(v => {
                                                const sel = vehicleId === v.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={v.id}
                                                        onPress={() => setVehicleId(v.id)}
                                                        style={[s.assetChip, { backgroundColor: colors.inputBg, borderColor: colors.border }, sel && [s.assetChipSel, { backgroundColor: colors.primary, borderColor: colors.primary }]]}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Ionicons name={v.type === 'ev' ? 'flash' : 'water'} size={16} color={sel ? '#fff' : colors.primary} />
                                                        <View>
                                                            <Text style={[s.acName, { color: colors.textPrimary }, sel&&{color:'#fff'}]}>{v.name}</Text>
                                                            <Text style={[s.acBal, { color: colors.textSecondary }, sel&&{color:'rgba(255,255,255,0.7)'}]}>{v.type === 'ev' ? 'Electric' : 'Gas'}</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>
                                    </View>

                                    {/* Initial odometer (first refuel only) */}
                                    {vehicleId && vehicleLogType === 'refuel' && !vehicles.find(v => v.id === vehicleId)?.initialOdometer && !isEditing && (
                                        <View>
                                            <Text style={[s.label, { color: colors.textSecondary }]}>Initial Odometer — optional, enables first efficiency calc</Text>
                                            <TextInput
                                                style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary, height: 44 }]}
                                                placeholder="e.g. 100000"
                                                placeholderTextColor={colors.textMuted}
                                                keyboardType="decimal-pad"
                                                value={initialOdometer}
                                                onChangeText={setInitialOdometer}
                                            />
                                        </View>
                                    )}

                                    {/* Odometer + Volume row */}
                                    <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[s.label, { color: colors.textSecondary }]}>Odometer (km)</Text>
                                            <TextInput
                                                style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary, height: 44 }]}
                                                placeholder="e.g. 125000"
                                                placeholderTextColor={colors.textMuted}
                                                keyboardType="decimal-pad"
                                                value={vehicleOdometer}
                                                onChangeText={setVehicleOdometer}
                                            />
                                        </View>
                                        {vehicleLogType === 'refuel' && (
                                            <View style={{ flex: 1 }}>
                                                <Text style={[s.label, { color: colors.textSecondary }]}>
                                                    {vehicles.find(v => v.id === vehicleId)?.type === 'ev' ? 'Energy (kWh)' : 'Fuel (Liters)'}
                                                </Text>
                                                <TextInput
                                                    style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary, height: 44 }]}
                                                    placeholder="e.g. 35.5"
                                                    placeholderTextColor={colors.textMuted}
                                                    keyboardType="decimal-pad"
                                                    value={vehicleVolume}
                                                    onChangeText={setVehicleVolume}
                                                />
                                            </View>
                                        )}
                                    </View>

                                    {/* Maintenance items */}
                                    {vehicleLogType === 'maintenance' && (
                                        <View>
                                            <Text style={[s.label, { color: colors.textSecondary }]}>Repaired / Replaced Items</Text>
                                            <TextInput
                                                style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary, minHeight: 60 }]}
                                                placeholder="e.g. Oil change, new brake pads"
                                                placeholderTextColor={colors.textMuted}
                                                value={vehicleMaintenanceItems}
                                                onChangeText={setVehicleMaintenanceItems}
                                                multiline
                                            />
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}

                        <Text style={[s.label, { color: colors.textSecondary }]}>Description</Text>
                        <TextInput style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]} placeholder="What was this for?" placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription}/>

                        {assets.length>0 && (
                            <AssetPicker
                                label={type==='income'?'Receive into Account (Optional)':'Pay from Account (Optional)'}
                                value={assetId}
                                onChange={setAssetId}
                            />
                        )}

                        {type==='spending' && (
                            <View style={s.itemsSect}>
                                <Text style={[s.label, { color: colors.textSecondary }]}>Items (Optional)</Text>
                                {items.map((item,i)=>(
                                    <View key={i} style={[s.itemRow, { borderColor: colors.border }]}>
                                        <View style={{flex:1}}>
                                            <Text style={[s.itemTxt, { color: colors.textPrimary }]}>{item.name}</Text>
                                            <View style={s.qtyRow}>
                                                <TouchableOpacity onPress={()=>updateItemQty(i,item.quantity-1)} style={[s.qtyBtn, { backgroundColor: colors.inputBg }]}>
                                                    <Ionicons name="remove" size={14} color={colors.primary}/>
                                                </TouchableOpacity>
                                                <Text style={[s.qtyTxt, { color: colors.textPrimary }]}>{item.quantity}</Text>
                                                <TouchableOpacity onPress={()=>updateItemQty(i,item.quantity+1)} style={[s.qtyBtn, { backgroundColor: colors.inputBg }]}>
                                                    <Ionicons name="add" size={14} color={colors.primary}/>
                                                </TouchableOpacity>
                                                <Text style={[s.itemPrice, { color: colors.textSecondary }]}>× {formatCurrency(item.price,currency)} = {formatCurrency(item.price*item.quantity,currency)}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity onPress={()=>removeItem(i)} style={[s.removeItemBtn, { backgroundColor: isDark ? 'rgba(220,38,38,0.33)' : 'rgba(220,38,38,0.08)' }]}>
                                            <Ionicons name="close" size={14} color={colors.rose}/>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                <View style={s.addItemRow}>
                                    <TextInput style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }, {flex:3}]} placeholder="Item name" placeholderTextColor={colors.textMuted} value={itemName} onChangeText={setItemName}/>
                                    <TextInput style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }, {width:50,textAlign:'center'}]} placeholder="Qty" placeholderTextColor={colors.textMuted} value={itemQty} onChangeText={setItemQty} keyboardType="numeric"/>
                                    <TextInput style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }, {flex:2}]} placeholder="Price" placeholderTextColor={colors.textMuted} value={itemPrice} onChangeText={setItemPrice} keyboardType="numeric"/>
                                    <TouchableOpacity style={[s.addItemBtn, { backgroundColor: colors.primary }]} onPress={addItem}>
                                        <Ionicons name="add" size={18} color="#fff"/>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {type==='spending' && (
                            <View style={s.extrasSect}>
                                <Text style={[s.label, { color: colors.textSecondary }]}>Extra Charges</Text>
                                <View style={[s.extrasCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                    <ExtraCharge label="Tax" enabled={taxEnabled} setEnabled={setTaxEnabled} isPercent={taxIsPercent} setIsPercent={setTaxIsPercent} value={taxValue} setValue={setTaxValue} colors={colors}/>
                                    <ExtraCharge label="Service Fee" enabled={serviceFeeEnabled} setEnabled={setServiceFeeEnabled} isPercent={serviceFeeIsPercent} setIsPercent={setServiceFeeIsPercent} value={serviceFeeValue} setValue={setServiceFeeValue} colors={colors}/>
                                    <ExtraCharge label="Tip" enabled={tipEnabled} setEnabled={setTipEnabled} isPercent={tipIsPercent} setIsPercent={setTipIsPercent} value={tipValue} setValue={setTipValue} colors={colors}/>
                                </View>
                                {(taxEnabled||serviceFeeEnabled||tipEnabled) && (
                                    <View style={[s.breakdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                        <View style={s.brow}><Text style={[s.blbl, { color: colors.textSecondary }]}>Subtotal</Text><Text style={[s.bval, { color: colors.textPrimary }]}>{formatCurrency(base,currency)}</Text></View>
                                        {taxEnabled && <View style={s.brow}><Text style={[s.blbl, { color: colors.textSecondary }]}>Tax ({taxIsPercent?taxValue+'%':formatCurrency(parseFloat(taxValue)||0,currency)})</Text><Text style={[s.bval, { color: colors.textPrimary }]}>{formatCurrency(taxAmt,currency)}</Text></View>}
                                        {serviceFeeEnabled && <View style={s.brow}><Text style={[s.blbl, { color: colors.textSecondary }]}>Service Fee</Text><Text style={[s.bval, { color: colors.textPrimary }]}>{formatCurrency(feeAmt,currency)}</Text></View>}
                                        {tipEnabled && <View style={s.brow}><Text style={[s.blbl, { color: colors.textSecondary }]}>Tip ({tipIsPercent?tipValue+'%':formatCurrency(parseFloat(tipValue)||0,currency)})</Text><Text style={[s.bval, { color: colors.textPrimary }]}>{formatCurrency(tipAmt,currency)}</Text></View>}
                                        <View style={[s.brow,s.btotalRow, { borderColor: colors.border }]}>
                                            <Text style={[s.btotalLbl, { color: colors.textPrimary }]}>Total</Text>
                                            <Text style={[s.btotalVal, { color: colors.primary }]}>{formatCurrency(total,currency)}</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}

                        <TouchableOpacity style={[s.scanBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={()=>router.push('/receipt-scanner')} activeOpacity={0.82}>
                            <Ionicons name="camera" size={18} color={colors.primary}/>
                            <Text style={[s.scanTxt, { color: colors.primary }]}>Scan Receipt Instead</Text>
                        </TouchableOpacity>
                    </>
                )}

                <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]} onPress={type==='move'?handleMove:handleSave} activeOpacity={0.85}>
                    <Text style={s.saveTxt}>{isEditing?'Update Transaction':type==='move'?'Move Funds':'Save Transaction'}</Text>
                </TouchableOpacity>
            </ScrollView>

            <DateTimePickerModal colors={colors} isDark={isDark} visible={showDatePicker} value={selectedDate} onChange={setSelectedDate} onClose={()=>setShowDatePicker(false)}/>
        </KeyboardAvoidingView>
    );
}

const dt = StyleSheet.create({
    overlay: { flex:1, backgroundColor:'rgba(21,26,45,0.4)', justifyContent:'center', alignItems:'center' },
    box: {
        backgroundColor:'#FDFDFF', borderRadius:24, padding:Spacing.xl, width:'92%',
        shadowColor:'#1A1040', shadowOffset:{width:0,height:12}, shadowOpacity:0.18, shadowRadius:24, elevation: Platform.OS === 'android' ? 0 : 12,
    },
    title: { fontSize:FontSize.lg, fontFamily:'Poppins_700Bold', color:'#1A1040', textAlign:'center', marginBottom:Spacing.lg },
    row: { flexDirection:'row', justifyContent:'space-around', marginBottom:Spacing.lg },
    field: { alignItems:'center', gap:4 },
    fl: { fontSize:10, fontFamily:'Poppins_700Bold', color:'#8B7CC8', marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 },
    fv: { fontSize:FontSize.lg, fontFamily:'Poppins_700Bold', color:'#1A1040', minWidth:44, textAlign:'center' },
    btns: { flexDirection:'row', gap:Spacing.md },
    cancel: { flex:1, paddingVertical:Spacing.md, borderRadius:BorderRadius.full, backgroundColor:'rgba(255,102,0,0.08)', alignItems:'center' },
    cancelTxt: { fontFamily:'Poppins_600SemiBold', color:'#ff6600', fontSize:FontSize.md },
    confirm: { flex:2, paddingVertical:Spacing.md, borderRadius:BorderRadius.full, backgroundColor:'#ff6600', alignItems:'center' },
    confirmTxt: { color:'#fff', fontFamily:'Poppins_700Bold', fontSize:FontSize.md },
});

const s = StyleSheet.create({
    container: { flex:1, backgroundColor:'#F3F4F6' },
    handle: { width:36, height:4, borderRadius:2, backgroundColor:'rgba(83,96,132,0.2)', alignSelf:'center', marginTop:Spacing.md },
    header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:Spacing.lg, paddingVertical:Spacing.md },
    closeBtn: {
        width:40, height:40, borderRadius:14, backgroundColor:'rgba(255,102,0,0.1)',
        alignItems:'center', justifyContent:'center',
    },
    title: { fontSize:FontSize.xl, fontFamily:'Poppins_800ExtraBold', color:'#1A1040' },
    scroll: { paddingHorizontal:Spacing.lg, paddingBottom: Platform.OS === 'android' ? 90 : 60 },

    typeToggle: {
        flexDirection:'row', borderRadius:BorderRadius.full,
        backgroundColor:'rgba(255,255,255,0.75)', padding:4, marginBottom:Spacing.lg,
        borderWidth:1, borderColor:'rgba(255,102,0,0.08)',
    },
    typeBtn: {
        flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center',
        gap:5, paddingVertical:Spacing.md, borderRadius:BorderRadius.full,
        shadowOffset:{width:0,height:3}, shadowOpacity:0.28, shadowRadius:8, elevation: Platform.OS === 'android' ? 0 : 3,
    },
    typeTxt: { fontSize:FontSize.sm, fontFamily:'Poppins_700Bold', color:'#8B7CC8' },

    label: { fontSize:FontSize.sm, fontFamily:'Poppins_600SemiBold', color:'#4B4570', marginBottom:Spacing.sm, marginTop:Spacing.md },
    dateRow: {
        flexDirection:'row', alignItems:'center', gap:Spacing.sm,
        backgroundColor:'rgba(255,255,255,0.88)', borderRadius:BorderRadius.md,
        paddingHorizontal:Spacing.md, paddingVertical:Spacing.md,
        borderWidth:1, borderColor:'rgba(255,102,0,0.1)',
    },
    dateTxt: { flex:1, fontSize:FontSize.sm, fontFamily:'Poppins_600SemiBold', color:'#1A1040' },
    amtInput: {
        backgroundColor:'rgba(255,255,255,0.88)', borderRadius:BorderRadius.lg,
        paddingHorizontal:Spacing.lg, paddingVertical:Spacing.lg,
        color:'#1A1040', fontSize:FontSize.xxxl, fontFamily:'Poppins_800ExtraBold',
        textAlign:'center', borderWidth:1, borderColor:'rgba(255,102,0,0.1)',
        shadowColor:'#1A1040', shadowOffset:{width:0,height:2}, shadowOpacity:0.05, shadowRadius:8, elevation: Platform.OS === 'android' ? 0 : 1,
    },
    catGrid: { flexDirection:'row', flexWrap:'wrap', gap:Spacing.sm, justifyContent:'flex-start' },
    catItem: {
        justifyContent:'center', alignItems:'center',
        borderRadius:BorderRadius.md, backgroundColor:'rgba(255,255,255,0.88)',
        borderWidth:1.5, borderColor:'rgba(83,96,132,0.1)', gap:4,
    },
    catName: { fontSize:FontSize.xs, fontFamily:'Poppins_400Regular', color:'#8B7CC8', textAlign:'center' },
    input: {
        backgroundColor:'rgba(255,255,255,0.88)', borderRadius:BorderRadius.md,
        paddingHorizontal:Spacing.md, paddingVertical:Spacing.md,
        fontFamily:'Poppins_400Regular', color:'#1A1040', fontSize:FontSize.md,
        borderWidth:1, borderColor:'rgba(255,102,0,0.1)',
    },
    assetChip: {
        flexDirection:'row', alignItems:'center', gap:8,
        paddingHorizontal:Spacing.md, paddingVertical:Spacing.sm,
        borderRadius:BorderRadius.lg, backgroundColor:'rgba(255,255,255,0.88)',
        borderWidth:1.5, borderColor:'rgba(83,96,132,0.1)', marginRight:Spacing.sm,
    },
    assetChipSel: { borderColor:'#ff6600', backgroundColor:'#ff6600' },
    acName: { fontSize:FontSize.sm, fontFamily:'Poppins_700Bold', color:'#1A1040' },
    acBal: { fontSize:11, fontFamily:'Poppins_400Regular', color:'#8B7CC8' },
    infoBox: {
        flexDirection:'row', alignItems:'center', gap:Spacing.sm,
        backgroundColor:'rgba(245,158,11,0.1)', borderRadius:BorderRadius.md,
        padding:Spacing.md, marginTop:Spacing.sm,
        borderWidth:1, borderColor:'rgba(245,158,11,0.2)',
    },
    infoTxt: { flex:1, fontSize:FontSize.sm, fontFamily:'Poppins_400Regular', color:'#F59E0B' },
    itemsSect: { marginTop:Spacing.sm },
    itemRow: {
        flexDirection:'row', alignItems:'center', gap:Spacing.sm,
        paddingVertical:Spacing.sm, borderBottomWidth:1,
        borderColor:'rgba(83,96,132,0.08)',
    },
    itemTxt: { fontSize:FontSize.sm, fontFamily:'Poppins_600SemiBold', color:'#1A1040' },
    qtyRow: { flexDirection:'row', alignItems:'center', gap:6, marginTop:2 },
    qtyBtn: {
        width:22, height:22, borderRadius:8, backgroundColor:'rgba(255,102,0,0.1)',
        alignItems:'center', justifyContent:'center',
    },
    qtyTxt: { fontSize:FontSize.sm, fontFamily:'Poppins_700Bold', color:'#1A1040', minWidth:20, textAlign:'center' },
    itemPrice: { fontSize:FontSize.xs, fontFamily:'Poppins_400Regular', color:'#8B7CC8', marginLeft: 2 },
    removeItemBtn: {
        width:28, height:28, borderRadius:9, backgroundColor:'rgba(220,38,38,0.08)',
        alignItems:'center', justifyContent:'center',
    },
    addItemRow: { flexDirection:'row', gap:Spacing.xs, marginTop:Spacing.sm, alignItems:'center' },
    addItemBtn: {
        backgroundColor:'#ff6600', width:44, height:44, borderRadius:BorderRadius.md,
        alignItems:'center', justifyContent:'center',
    },

    recommendationsSect: { marginTop:Spacing.md },
    recommendationsHeader: { flexDirection:'row', alignItems:'center', gap:5, marginBottom:Spacing.sm },
    recommendationsTitle: { fontSize:FontSize.sm, fontFamily:'Poppins_700Bold', color:'#6A6FF8' },
    recommendationsRow: { gap:Spacing.sm, paddingRight:Spacing.sm },
    recommendationChip: {
        width:180, backgroundColor:'rgba(106,111,248,0.08)', borderRadius:BorderRadius.md,
        padding:Spacing.sm, borderWidth:1, borderColor:'rgba(106,111,248,0.2)',
    },
    recommendationChipActive: { backgroundColor:'#6A6FF8', borderColor:'#6A6FF8' },
    recommendationLabel: { fontSize:FontSize.sm, fontFamily:'Poppins_700Bold', color:'#1A1040' },
    recommendationLabelActive: { color:'#fff' },
    recommendationReason: { fontSize:11, fontFamily:'Poppins_400Regular', color:'#8B7CC8', marginTop:2 },
    recommendationReasonActive: { color:'rgba(255,255,255,0.82)' },

    extrasSect: { marginTop:Spacing.sm },
    extrasCard: {
        backgroundColor:'rgba(255,255,255,0.88)', borderRadius:BorderRadius.md,
        borderWidth:1, borderColor:'rgba(255,102,0,0.08)',
        overflow:'hidden',
    },
    extraRow: {
        flexDirection:'row', alignItems:'center', justifyContent:'space-between',
        paddingVertical:Spacing.sm, paddingHorizontal:Spacing.md,
        borderBottomWidth:1, borderColor:'rgba(83,96,132,0.08)',
        flexWrap:'wrap', gap:Spacing.sm,
    },
    checkRow: { flexDirection:'row', alignItems:'center', gap:8 },
    checkbox: {
        width:22, height:22, borderRadius:7, borderWidth:2,
        borderColor:'rgba(83,96,132,0.25)', alignItems:'center', justifyContent:'center',
    },
    checkboxOn: { backgroundColor:'#ff6600', borderColor:'#ff6600' },
    extraLabel: { fontSize:FontSize.sm, fontFamily:'Poppins_400Regular', color:'#8B7CC8' },
    extraInputs: { flexDirection:'row', alignItems:'center', gap:6 },
    pctToggle: {
        flexDirection:'row', backgroundColor:'rgba(83,96,132,0.08)',
        borderRadius:BorderRadius.sm, overflow:'hidden',
    },
    pctBtn: { paddingHorizontal:10, paddingVertical:6 },
    pctBtnOn: { backgroundColor:'#ff6600' },
    pctTxt: { fontSize:FontSize.sm, fontFamily:'Poppins_700Bold', color:'#8B7CC8' },
    pctTxtOn: { color:'#fff' },
    extraInput: {
        backgroundColor:'rgba(83,96,132,0.06)', borderRadius:BorderRadius.sm,
        paddingHorizontal:Spacing.sm, paddingVertical:6, fontFamily:'Poppins_500Medium',
        color:'#1A1040', fontSize:FontSize.sm, borderWidth:1, borderColor:'rgba(255,102,0,0.1)',
        width:70, textAlign:'center',
    },
    breakdown: {
        backgroundColor:'rgba(255,255,255,0.88)', borderRadius:BorderRadius.md,
        padding:Spacing.md, marginTop:Spacing.md,
        borderWidth:1, borderColor:'rgba(255,102,0,0.08)',
    },
    brow: { flexDirection:'row', justifyContent:'space-between', marginBottom:4 },
    blbl: { fontSize:FontSize.sm, fontFamily:'Poppins_400Regular', color:'#4B4570' },
    bval: { fontSize:FontSize.sm, fontFamily:'Poppins_600SemiBold', color:'#1A1040' },
    btotalRow: {
        borderTopWidth:1, borderColor:'rgba(83,96,132,0.1)',
        paddingTop:Spacing.sm, marginTop:Spacing.xs,
    },
    btotalLbl: { fontSize:FontSize.md, fontFamily:'Poppins_800ExtraBold', color:'#1A1040' },
    btotalVal: { fontSize:FontSize.md, fontFamily:'Poppins_800ExtraBold', color:'#ff6600' },

    scanBtn: {
        flexDirection:'row', alignItems:'center', justifyContent:'center',
        gap:Spacing.sm, marginTop:Spacing.lg,
        padding:Spacing.md, borderRadius:BorderRadius.full,
        backgroundColor:'rgba(255,102,0,0.08)',
        borderWidth:1, borderColor:'rgba(255,102,0,0.15)',
    },
    scanTxt: { fontSize:FontSize.md, fontFamily:'Poppins_600SemiBold', color:'#ff6600' },
    saveBtn: {
        backgroundColor:'#ff6600', paddingVertical:Spacing.lg,
        borderRadius:BorderRadius.full, alignItems:'center', marginTop:Spacing.xl,
        shadowColor:'#ff6600', shadowOffset:{width:0,height:6},
        shadowOpacity:0.35, shadowRadius:12, elevation: Platform.OS === 'android' ? 0 : 6,
    },
    saveTxt: { color:'#fff', fontFamily:'Poppins_700Bold', fontSize:FontSize.lg },
});
