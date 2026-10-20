import React, { useEffect, useRef, useState } from 'react';
import {
    Platform, View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, StyleSheet, ActivityIndicator, useWindowDimensions, Alert, Image, Modal, FlatList
} from 'react-native';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { sendChatMessage } from '../services/aiChatbot';
import { extractTextFromDocumentUri } from '../services/localOCR';
import * as DocumentPicker from 'expo-document-picker';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const SUGGESTIONS = [
    'Show my spending summary',
    'What did I spend most on?',
    'How much did I save this month?',
    'Am I on track with budget?',
    'Suggest ways to save more',
];

export default function Chatbot() {
    const { colors, isDark } = useTheme();
    const router = useRouter();
    const { transactions, currency, savingsGoals, budgets, assets, vehicles, chatSessions, addChatSession, updateChatSession, deleteChatSession } = useApp();
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const welcomeMessage = {
        id: 'welcome',
        role: 'assistant',
        text: "Hi! I'm your AI financial assistant 👋\n\nI can help you analyze your spending, track savings goals, and give personalized financial insights. What would you like to know?",
    };
    const [messages, setMessages] = useState([welcomeMessage]);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const scrollRef = useRef(null);

    useEffect(() => {
        const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        return () => clearTimeout(timer);
    }, [messages]);

    const state = { transactions, budgets, assets: assets || [], vehicles: vehicles || [], currency };

    const addImageAttachment = async ({ uri, name, mimeType }) => {
        if (!uri) return;
        const newAttachment = {
            id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
            uri,
            name: name || `Attachment-${attachments.length + 1}`,
            mimeType: mimeType || 'image/jpeg',
            text: null, // Text extraction is deferred until send
        };
        setAttachments(prev => [...prev, newAttachment]);
    };

    const pickPhotoAttachment = async () => {
        const permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permResult.granted) {
            Alert.alert('Permission needed', 'Please grant gallery permission to attach photos.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
            base64: false,
            allowsEditing: false,
        });

        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        await addImageAttachment({
            uri: asset.uri,
            name: asset.fileName || 'Photo Attachment',
            mimeType: asset.mimeType || 'image/jpeg',
        });
    };

    const pickDocumentAttachment = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'text/plain'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            await addImageAttachment({
                uri: asset.uri,
                name: asset.name || 'Document Attachment',
                mimeType: asset.mimeType || 'application/pdf',
            });
        } catch (err) {
            Alert.alert('Attachment Error', 'Could not pick document.');
        }
    };

    const renderMarkdownText = (text, baseStyle) => {
        if (!text) return null;
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return (
            <Text style={baseStyle}>
                {parts.map((part, i) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <Text key={i} style={{ fontFamily: 'Poppins_600SemiBold', fontWeight: 'bold' }}>{part.slice(2, -2)}</Text>;
                    }
                    return part;
                })}
            </Text>
        );
    };

    const handleAttachPress = () => {
        Alert.alert('Attach', 'Choose what to add to the chat', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Photo', onPress: pickPhotoAttachment },
            { text: 'Document', onPress: pickDocumentAttachment },
        ]);
    };

    const removeAttachment = (attachmentId) => {
        setAttachments(prev => prev.filter(item => item.id !== attachmentId));
    };

    const send = async (text, forceSkipTxCheck = false, injectedAttachments = null) => {
        const typedText = (text || input).trim();
        const attachmentsToSend = injectedAttachments || [...attachments];
        let userText = typedText || (attachmentsToSend.length > 0
            ? 'Please analyze the attached files/photos and explain the key financial insights.'
            : '');
        if (!userText || loading || uploadingAttachment) return;
        
        const isTransactionMode = attachmentsToSend.some(att => att.mimeType === 'application/vnd.financeflow.transaction');

        if (!isTransactionMode && !forceSkipTxCheck) {
            const txKeywords = /\b(bought|spend|spent|paid|cost|deposited|earned|salary|purchase|purchased|received|pay|income|expense|sold)\b/i;
            if (txKeywords.test(userText)) {
                Alert.alert(
                    "Add as Transaction?",
                    "It looks like you might be describing a transaction. Do you want to record this?",
                    [
                        { 
                            text: "No, just chat", 
                            onPress: () => send(userText, true, attachmentsToSend),
                            style: 'cancel'
                        },
                        { 
                            text: "Yes, add transaction", 
                            onPress: () => {
                                const txAtt = {
                                    id: 'tx-' + Date.now(),
                                    name: 'Transaction Context',
                                    mimeType: 'application/vnd.financeflow.transaction',
                                    text: 'User is providing transaction details.'
                                };
                                send(userText, true, [...attachmentsToSend, txAtt]);
                            } 
                        }
                    ]
                );
                return; // Stop the send, wait for user's alert choice
            }
        }

        let finalUserText = userText;
        if (isTransactionMode) {
            const today = new Date();
            const tzOffset = today.getTimezoneOffset() * 60000;
            const localToday = new Date(today - tzOffset).toISOString().slice(0, 10);
            const yesterday = new Date(today.getTime() - 86400000);
            const localYesterday = new Date(yesterday - tzOffset).toISOString().slice(0, 10);
            
            const assetsStr = (assets || []).map(a => `${a.name} (ID: ${a.id})`).join(', ');
            
            //PROMPT FOR ADD TRANSACTION ON AI ASSISTANT
            finalUserText = `I want to add a transaction. Please extract the transaction details from my message and return a strict JSON object (enclosed in \`\`\`json and \`\`\`) with these keys:
- type: "spending" or "income" (or "move" if transferring between accounts)
- amount: the total amount as a positive number
- category: ONLY the exact ID string (e.g. "food", "transport", "salary") from the Available Categories list (or leave empty string if unsure)
- description: a short description of the transaction
- items: array of objects with { name, quantity, price } if specific items are mentioned, otherwise empty array
- assetId: ONLY the exact ID string from the following list if I mention receiving/paying from an account/asset: [${assetsStr}]. You must match the account name exactly to the ID!
- date: ISO 8601 date string for when the transaction happened. (Today is ${localToday}, yesterday was ${localYesterday}. If I say yesterday, use ${localYesterday} exactly!)

My message: ${userText}`;
        }
        setInput('');
        setAttachments([]);
        const userMsg = { id: String(Date.now()), role: 'user', text: userText, attachments: attachmentsToSend };
        const assistantId = String(Date.now() + 1);
        let newMessages = [...messages, userMsg, { id: assistantId, role: 'assistant', text: '' }];
        setMessages(newMessages);
        const chatHistory = [...messages]
            .filter(m => m.id !== 'welcome')
            .map(m => ({ role: m.role, content: m.text }));

        // setMessages already done above
        setLoading(true);
        let activeSessionId = currentSessionId;
        if (!activeSessionId) {
            activeSessionId = await addChatSession({
                title: (isTransactionMode ? 'Add Transaction' : userText).substring(0, 30) + ((isTransactionMode ? 'Add Transaction' : userText).length > 30 ? '...' : ''),
                messages: newMessages
            });
            setCurrentSessionId(activeSessionId);
        } else {
            await updateChatSession(activeSessionId, newMessages);
        }

        try {
            for (const att of attachmentsToSend) {
                if (!att.text) {
                    setMessages(prev => prev.map(m =>
                        m.id === assistantId ? { ...m, text: `Reading ${att.name}... Might take a minute or two` } : m
                    ));
                    try {
                        att.text = await extractTextFromDocumentUri(att.uri);
                    } catch (e) {
                        att.text = `[Failed to read: ${e.message}]`;
                    }
                }
            }
            setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, text: '' } : m
            ));

            const aiResponse = await sendChatMessage(
                finalUserText,
                state,
                chatHistory,
                (token) => {
                    setMessages(prev => {
                        const updated = prev.map(m => m.id === assistantId ? { ...m, text: m.text + token } : m);
                        updateChatSession(activeSessionId, updated).catch(console.error);
                        return updated;
                    });
                },
                attachmentsToSend,
                isTransactionMode
            );
        } catch (err) {
            setMessages(prev => {
                const updated = prev.map(m => m.id === assistantId ? { ...m, text: '⚠️ ' + (err.message || 'Could not get response.') } : m);
                updateChatSession(activeSessionId, updated).catch(console.error);
                return updated;
            });
        } finally {
            setLoading(false);
        }
    };


    return (
        <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Gradient background */}
            <Svg key={colors.background} style={StyleSheet.absoluteFillObject} width={screenWidth} height={screenHeight}>
                <Defs>
                    <SvgGrad id="bgGrad" x1="0.2" y1="0" x2="0.8" y2="1">
                        <Stop offset="0" stopColor={colors.gradientStart} stopOpacity="1" />
                        <Stop offset="0.4" stopColor={colors.gradientMid} stopOpacity="1" />
                        <Stop offset="1" stopColor={colors.gradientEnd} stopOpacity="1" />
                    </SvgGrad>
                </Defs>
                <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="url(#bgGrad)" />
            </Svg>

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                    <Ionicons name="arrow-back" size={20} color={colors.primary} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <View style={[styles.aiAvatarSmall, { backgroundColor: colors.primary }]}>
                        <Ionicons name="sparkles" size={16} color="#fff" />
                    </View>
                    <View>
                        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>AI Assistant</Text>
                        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{loading ? 'Thinking...' : 'Ready to help'}</Text>
                    </View>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => { setMessages([welcomeMessage]); setCurrentSessionId(null); }} style={[styles.headerIconBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                        <Ionicons name="add" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowHistory(true)} style={[styles.headerIconBtn, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                        <Ionicons name="time-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Messages */}
            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.msgList}
                keyboardShouldPersistTaps="handled"
            >
                {messages.map((msg) => (
                    <View key={msg.id} style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowAI]}>
                        {msg.role === 'assistant' && (
                            <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
                                <Ionicons name="sparkles" size={14} color="#fff" />
                            </View>
                        )}
                        <View style={[styles.bubble, msg.role === 'user' ? [styles.bubbleUser, { backgroundColor: colors.primary, shadowColor: colors.primary }] : [styles.bubbleAI, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: isDark ? '#000' : '#1A1040' }]]}>
                            {msg.attachments && msg.attachments.length > 0 && (
                                <View style={styles.msgAttachments}>
                                    {msg.attachments.map((att, idx) => (
                                        att.mimeType?.startsWith('image/') ? (
                                            <Image key={idx} source={{ uri: att.uri }} style={styles.msgImage} />
                                        ) : (
                                            <View key={idx} style={styles.msgDoc}>
                                                <Ionicons name="document-text" size={16} color="#fff" />
                                                <Text style={styles.msgDocText} numberOfLines={1}>{att.name}</Text>
                                            </View>
                                        )
                                    ))}
                                </View>
                            )}
                            {msg.role === 'assistant' && !msg.text && loading ? (
                                <View style={styles.typingDots}>
                                    <View style={[styles.dot, styles.dot1, { backgroundColor: colors.textMuted }]} />
                                    <View style={[styles.dot, styles.dot2, { backgroundColor: colors.textMuted }]} />
                                    <View style={[styles.dot, styles.dot3, { backgroundColor: colors.textMuted }]} />
                                </View>
                            ) : (
                                msg.role === 'assistant' && msg.text.includes('```json') ? (
                                    <View>
                                        <Text style={[styles.bubbleAIText, { color: colors.textPrimary }]}>
                                            {msg.text.replace(/```json\n[\s\S]*?\n```/, 'I have extracted the transaction details for you.')}
                                        </Text>
                                        <TouchableOpacity
                                            style={[styles.txAddBtn, { backgroundColor: colors.primary }]}
                                            onPress={() => {
                                                const match = msg.text.match(/```json\n([\s\S]*?)\n```/);
                                                if (match) {
                                                    try {
                                                        const txData = JSON.parse(match[1]);
                                                        // Use setTimeout to avoid iOS touch registry crash
                                                        setTimeout(() => {
                                                            router.push({ pathname: '/add-transaction', params: { prefill: JSON.stringify(txData) } });
                                                        }, 10);
                                                    } catch (e) {
                                                        Alert.alert('Error', 'Could not parse transaction data.');
                                                    }
                                                }
                                            }}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name="add-circle-outline" size={18} color="#fff" />
                                            <Text style={styles.txAddBtnTxt}>Add to transaction</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    msg.role === 'user' ? (
                                        <Text style={styles.bubbleUserText}>{msg.text}</Text>
                                    ) : (
                                        renderMarkdownText(msg.text, [styles.bubbleAIText, { color: colors.textPrimary }])
                                    )
                                )
                            )}
                        </View>
                    </View>
                ))}
            </ScrollView>

            {/* Suggestions */}
            {messages.length === 1 && !loading && (
                <View style={styles.suggestionsWrap}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow}>
                        {/* First Item: Add transaction */}
                        <TouchableOpacity
                            style={[styles.suggestionChip, { backgroundColor: colors.primary, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }]}
                            onPress={() => {
                                setAttachments(prev => {
                                    if (prev.some(a => a.mimeType === 'application/vnd.financeflow.transaction')) {
                                        return prev; // Prevent adding multiple times
                                    }
                                    return [...prev, {
                                        id: 'tx-' + Date.now(),
                                        name: 'Transaction Context',
                                        mimeType: 'application/vnd.financeflow.transaction',
                                        text: 'User is providing transaction details.'
                                    }];
                                });
                            }}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="add" size={16} color="#ffffff" />
                            <Text style={[styles.suggestionTxt, { color: '#ffffff' }]}>Add transaction</Text>
                        </TouchableOpacity>

                        {/* Second Item: Show my spending summary */}
                        <TouchableOpacity
                            style={[styles.suggestionChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                            onPress={() => send('Show my spending summary')}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.suggestionTxt, { color: colors.primary }]}>Show my spending summary</Text>
                        </TouchableOpacity>

                        {/* Remaining suggestions */}
                        {SUGGESTIONS.filter(s => s !== 'Show my spending summary').map(s => (
                            <TouchableOpacity key={s} style={[styles.suggestionChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => send(s)} activeOpacity={0.8}>
                                <Text style={[styles.suggestionTxt, { color: colors.primary }]}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Input */}
            <View style={styles.inputArea}>
                {attachments.length > 0 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.attachmentRow}
                    >
                        {attachments.map((attachment) => (
                            <View key={attachment.id} style={[styles.attachmentChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                                <Ionicons name={attachment.mimeType === 'application/vnd.financeflow.transaction' ? "card-outline" : attachment.mimeType?.startsWith('image/') ? "image-outline" : "document-text-outline"} size={14} color={colors.primary} />
                                <Text style={[styles.attachmentText, { color: colors.textSecondary }]} numberOfLines={1}>{attachment.name}</Text>
                                <TouchableOpacity onPress={() => removeAttachment(attachment.id)}>
                                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                )}

                <View style={[styles.inputBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, shadowColor: isDark ? '#000' : '#1A1040' }]}>
                    <TouchableOpacity
                        style={[styles.attachBtn, { backgroundColor: colors.card, borderColor: colors.border }, (loading || uploadingAttachment) && styles.attachBtnDisabled]}
                        onPress={handleAttachPress}
                        disabled={loading || uploadingAttachment}
                    >
                        {uploadingAttachment ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Ionicons name="add" size={24} color={colors.primary} />
                        )}
                    </TouchableOpacity>

                    <TextInput
                        style={[styles.textInput, { color: colors.textPrimary }]}
                        placeholder="Ask about your finances..."
                        placeholderTextColor={colors.textMuted}
                        value={input}
                        onChangeText={setInput}
                        multiline
                        maxLength={1000}
                        returnKeyType="send"
                        onSubmitEditing={() => !loading && send()}
                    />
                    <TouchableOpacity
                        style={[styles.sendBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }, ((!input.trim() && attachments.length === 0) || loading || uploadingAttachment) && [styles.sendBtnDisabled, { backgroundColor: colors.card, shadowColor: 'transparent' }]]}
                        onPress={() => send()}
                        disabled={(!input.trim() && attachments.length === 0) || loading || uploadingAttachment}
                        activeOpacity={0.85}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Ionicons name="arrow-up" size={18} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>
                <Text style={[styles.aiDisclaimer, { color: colors.textMuted }]}>AI responses are informational only. Not financial advice.</Text>
            </View>
            {/* History Modal */}
            <Modal visible={showHistory} animationType="slide" transparent={true} onRequestClose={() => setShowHistory(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Chat History</Text>
                            <TouchableOpacity onPress={() => setShowHistory(false)}>
                                <Ionicons name="close" size={24} color={colors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                        {chatSessions.length === 0 ? (
                            <View style={styles.emptyHistory}>
                                <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
                                <Text style={[styles.emptyHistoryText, { color: colors.textSecondary }]}>No previous chats found.</Text>
                            </View>
                        ) : (
                            <FlatList
                                data={chatSessions}
                                keyExtractor={item => item.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[styles.historyItem, { backgroundColor: colors.card, borderColor: currentSessionId === item.id ? colors.primary : colors.border }]}
                                        onPress={() => {
                                            setMessages(item.messages);
                                            setCurrentSessionId(item.id);
                                            setShowHistory(false);
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.historyTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                                            <Text style={[styles.historyDate, { color: colors.textSecondary }]}>{new Date(item.updatedAt).toLocaleString()}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => {
                                            Alert.alert('Delete Chat', 'Are you sure you want to delete this chat?', [
                                                { text: 'Cancel', style: 'cancel' },
                                                { text: 'Delete', style: 'destructive', onPress: () => {
                                                    deleteChatSession(item.id);
                                                    if (currentSessionId === item.id) {
                                                        setMessages([welcomeMessage]);
                                                        setCurrentSessionId(null);
                                                    }
                                                }}
                                            ]);
                                        }}>
                                            <Ionicons name="trash-outline" size={20} color={colors.rose} />
                                        </TouchableOpacity>
                                    </TouchableOpacity>
                                )}
                                contentContainerStyle={{ paddingBottom: Spacing.xl }}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0EEFF' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: 60,
        paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: 'rgba(255,102,0,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    aiAvatarSmall: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#ff6600',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_700Bold',
        color: '#1A1040',
    },
    headerSub: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
        color: '#8B7CC8',
    },

    msgList: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.md,
        gap: Spacing.md,
    },
    msgRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: Spacing.sm,
    },
    msgRowUser: { justifyContent: 'flex-end' },
    msgRowAI: { justifyContent: 'flex-start' },

    aiAvatar: {
        width: 28,
        height: 28,
        borderRadius: 9,
        backgroundColor: '#ff6600',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },

    bubble: {
        maxWidth: '78%',
        borderRadius: 18,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
    },
    bubbleUser: {
        backgroundColor: '#ff6600',
        borderBottomRightRadius: 4,
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 3,
    },
    bubbleAI: {
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.07)',
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    bubbleUserText: {
        color: '#fff',
        fontSize: FontSize.md,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
    },
    bubbleAIText: {
        color: '#1A1040',
        fontSize: FontSize.md,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 22,
    },
    msgAttachments: {
        marginBottom: 8,
        gap: 8,
    },
    msgImage: {
        width: 140,
        height: 140,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    msgDoc: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        padding: 8,
        borderRadius: 8,
    },
    msgDocText: {
        color: '#fff',
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        flex: 1,
    },

    typingDots: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 4,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#8B7CC8',
    },
    dot1: { opacity: 1 },
    dot2: { opacity: 0.6 },
    dot3: { opacity: 0.3 },

    suggestionsWrap: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
    suggestionsRow: { gap: Spacing.sm },
    suggestionChip: {
        backgroundColor: 'rgba(255,102,0,0.08)',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.15)',
    },
    suggestionTxt: {
        fontSize: FontSize.sm,
        fontFamily: 'Poppins_500Medium',
        color: '#ff6600',
    },

    inputArea: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Platform.OS === 'ios' ? 34 : 16,
        paddingTop: Spacing.sm,
    },
    inputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 22,
        paddingHorizontal: Spacing.md,
        paddingTop: 8,
        paddingBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.1)',
        shadowColor: '#1A1040',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: Platform.OS === 'android' ? 0 : 2,
    },
    attachBtn: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,102,0,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.16)',
    },
    attachBtnDisabled: {
        opacity: 0.55,
    },
    textInput: {
        flex: 1,
        fontSize: FontSize.md,
        fontFamily: 'Poppins_400Regular',
        color: '#1A1040',
        maxHeight: 100,
        minHeight: 22,
        paddingTop: Platform.OS === 'ios' ? 1 : 0,
        paddingBottom: 0,
        textAlignVertical: 'center',
    },
    sendBtn: {
        width: 38,
        height: 38,
        borderRadius: 14,
        backgroundColor: '#ff6600',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#ff6600',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: Platform.OS === 'android' ? 0 : 3,
    },
    sendBtnDisabled: { backgroundColor: 'rgba(255,102,0,0.25)', shadowOpacity: 0 },
    attachmentRow: {
        gap: Spacing.sm,
        paddingBottom: Spacing.xs,
    },
    attachmentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        maxWidth: 210,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(255,102,0,0.09)',
        borderWidth: 1,
        borderColor: 'rgba(255,102,0,0.16)',
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    attachmentText: {
        flex: 1,
        fontSize: FontSize.xs,
        color: '#4B4570',
        fontFamily: 'Poppins_500Medium',
    },
    aiDisclaimer: {
        fontSize: 10,
        fontFamily: 'Poppins_400Regular',
        color: '#B0A8C8',
        textAlign: 'center',
        marginTop: 6,
    },
});

const additionalStyles = StyleSheet.create({
    headerRight: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    headerIconBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '80%',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    modalTitle: {
        fontSize: FontSize.lg,
        fontFamily: 'Poppins_700Bold',
    },
    emptyHistory: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    emptyHistoryText: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_500Medium',
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        marginBottom: Spacing.sm,
        justifyContent: 'space-between',
    },
    historyTitle: {
        fontSize: FontSize.md,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 2,
    },
    historyDate: {
        fontSize: FontSize.xs,
        fontFamily: 'Poppins_400Regular',
    },
    txAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: Spacing.md,
        borderRadius: 12,
        marginTop: Spacing.sm,
    },
    txAddBtnTxt: {
        color: '#fff',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: FontSize.sm,
    },
});

Object.assign(styles, additionalStyles);
