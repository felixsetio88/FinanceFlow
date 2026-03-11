import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { sendChatMessage, popularQuestions } from '../services/aiChatbot';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

export default function Chatbot() {
    const router = useRouter();
    const { transactions, budgets, assets, currency, aiApiKey, aiEndpoint } = useApp();
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hi! I\'m your FinanceFlow AI assistant. Ask me anything about your finances, and I\'ll provide insights based on your actual data. 💰' },
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef(null);

    const state = { transactions, budgets, assets, currency };

    const send = async (text) => {
        if (!text.trim()) return;
        if (!aiApiKey) {
            setMessages(prev => [...prev,
            { role: 'user', content: text },
            { role: 'assistant', content: '⚠️ AI API key is not configured. Please go to Settings → AI Configuration to set your API key.' },
            ]);
            setInput('');
            return;
        }

        const userMessage = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const chatHistory = messages.filter(m => m.role !== 'system').slice(-10);
            const response = await sendChatMessage(text, state, chatHistory, aiApiKey, aiEndpoint);
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', content: `❌ Error: ${err.message}` }]);
        } finally {
            setLoading(false);
        }

        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
                <View style={styles.headerTitle}>
                    <Text style={styles.title}>🤖 AI Assistant</Text>
                    <Text style={styles.subtitle}>Powered by Qwen</Text>
                </View>
                <TouchableOpacity onPress={() => setMessages([messages[0]])}>
                    <Ionicons name="refresh" size={22} color={Colors.dark.textSecondary} />
                </TouchableOpacity>
            </View>

            {/* Messages */}
            <ScrollView
                ref={scrollRef}
                style={styles.messagesArea}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
                {messages.map((msg, i) => (
                    <View key={i} style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
                        {msg.role === 'assistant' && (
                            <View style={styles.botAvatar}>
                                <Text style={{ fontSize: 14 }}>🤖</Text>
                            </View>
                        )}
                        <View style={[styles.bubbleContent, msg.role === 'user' ? styles.userContent : styles.assistantContent]}>
                            <Text style={[styles.bubbleText, msg.role === 'user' && styles.userText]}>{msg.content}</Text>
                        </View>
                    </View>
                ))}

                {loading && (
                    <View style={[styles.bubble, styles.assistantBubble]}>
                        <View style={styles.botAvatar}>
                            <Text style={{ fontSize: 14 }}>🤖</Text>
                        </View>
                        <View style={styles.assistantContent}>
                            <ActivityIndicator size="small" color={Colors.dark.emerald} />
                            <Text style={styles.typingText}>Thinking...</Text>
                        </View>
                    </View>
                )}

                {/* Popular Questions */}
                {messages.length <= 2 && (
                    <View style={styles.questionsSection}>
                        <Text style={styles.questionsTitle}>Popular Questions</Text>
                        {popularQuestions.map(q => (
                            <TouchableOpacity key={q.id} style={styles.questionBtn} onPress={() => send(q.text)}>
                                <Text style={styles.questionIcon}>{q.icon}</Text>
                                <Text style={styles.questionText}>{q.text}</Text>
                                <Ionicons name="chevron-forward" size={14} color={Colors.dark.textMuted} />
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputBar}>
                <TextInput
                    style={styles.inputField}
                    placeholder="Ask about your finances..."
                    placeholderTextColor={Colors.dark.textMuted}
                    value={input}
                    onChangeText={setInput}
                    multiline
                    maxLength={500}
                />
                <TouchableOpacity
                    style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
                    onPress={() => send(input)}
                    disabled={!input.trim() || loading}
                >
                    <Ionicons name="send" size={18} color={input.trim() && !loading ? '#fff' : Colors.dark.textMuted} />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.dark.background },
    handle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border,
        alignSelf: 'center', marginTop: Spacing.md,
    },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        borderBottomWidth: 1, borderColor: Colors.dark.border,
    },
    headerTitle: { flex: 1 },
    title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.dark.text },
    subtitle: { fontSize: FontSize.xs, color: Colors.dark.textMuted },
    messagesArea: { flex: 1 },
    messagesContent: { padding: Spacing.lg, gap: Spacing.md },
    bubble: { flexDirection: 'row', gap: Spacing.sm, maxWidth: '85%' },
    userBubble: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
    assistantBubble: { alignSelf: 'flex-start' },
    botAvatar: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: Colors.dark.card, alignItems: 'center', justifyContent: 'center',
    },
    bubbleContent: { borderRadius: BorderRadius.lg, padding: Spacing.md, maxWidth: '90%' },
    userContent: { backgroundColor: Colors.dark.emerald },
    assistantContent: {
        backgroundColor: Colors.dark.card, borderWidth: 1, borderColor: Colors.dark.border,
    },
    bubbleText: { fontSize: FontSize.md, color: Colors.dark.text, lineHeight: 22 },
    userText: { color: '#fff' },
    typingText: { fontSize: FontSize.sm, color: Colors.dark.textMuted, marginTop: 4 },
    questionsSection: { marginTop: Spacing.lg },
    questionsTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.dark.text, marginBottom: Spacing.md },
    questionBtn: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, borderRadius: BorderRadius.md,
        backgroundColor: Colors.dark.card, marginBottom: Spacing.sm,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    questionIcon: { fontSize: 18 },
    questionText: { flex: 1, fontSize: FontSize.md, color: Colors.dark.text },
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        borderTopWidth: 1, borderColor: Colors.dark.border, backgroundColor: Colors.dark.surface,
    },
    inputField: {
        flex: 1, backgroundColor: Colors.dark.card, borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
        color: Colors.dark.text, fontSize: FontSize.md, maxHeight: 100,
        borderWidth: 1, borderColor: Colors.dark.border,
    },
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: Colors.dark.emerald, alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { backgroundColor: Colors.dark.card },
});
