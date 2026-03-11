// AI Chatbot Service — supports LOCAL (llama.rn) and CLOUD (API) modes
// Provides financial advice based on user's actual data

import { Platform } from 'react-native';
import { formatCurrency } from '../utils/currencies';
import { filterTransactionsByPeriod, groupByCategory, calculateBudgetUsage } from '../utils/helpers';
import { getCategoryById } from '../utils/categories';

export const popularQuestions = [
    { id: 1, text: 'How much did I spend this month?', icon: '\u{1F4B8}' },
    { id: 2, text: "What's my biggest spending category?", icon: '\u{1F4CA}' },
    { id: 3, text: 'Am I within my budget?', icon: '\u{1F3AF}' },
    { id: 4, text: 'How much income did I earn this month?', icon: '\u{1F4B0}' },
    { id: 5, text: "What's my net savings this month?", icon: '\u{1F3E6}' },
    { id: 6, text: 'Compare my spending this week vs last week', icon: '\u{1F4C8}' },
    { id: 7, text: 'Which days do I spend the most?', icon: '\u{1F4C5}' },
    { id: 8, text: 'How can I reduce my spending?', icon: '\u2702\uFE0F' },
    { id: 9, text: "What's my financial health summary?", icon: '\u2764\uFE0F' },
    { id: 10, text: 'Forecast my spending for the rest of the month', icon: '\u{1F52E}' },
];

function buildFinancialContext(state) {
    const { transactions, budgets, assets, currency } = state;

    const monthlySpending = filterTransactionsByPeriod(transactions, 'monthly').filter(t => t.type === 'spending');
    const monthlyIncome = filterTransactionsByPeriod(transactions, 'monthly').filter(t => t.type === 'income');
    const totalSpending = monthlySpending.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalIncome = monthlyIncome.reduce((s, t) => s + Math.abs(t.amount), 0);

    const weeklySpending = filterTransactionsByPeriod(transactions, 'weekly').filter(t => t.type === 'spending');
    const weeklyTotal = weeklySpending.reduce((s, t) => s + Math.abs(t.amount), 0);

    const dailySpending = filterTransactionsByPeriod(transactions, 'daily').filter(t => t.type === 'spending');
    const dailyTotal = dailySpending.reduce((s, t) => s + Math.abs(t.amount), 0);

    const catGroups = groupByCategory(monthlySpending);
    const categoryBreakdown = Object.entries(catGroups)
        .map(([id, data]) => ({
            name: getCategoryById(id).name,
            total: data.total,
            count: data.count,
        }))
        .sort((a, b) => b.total - a.total);

    const budgetStatus = budgets.map(b => {
        const usage = calculateBudgetUsage(transactions, b);
        return {
            period: b.period,
            limit: b.amount,
            spent: usage.spent,
            remaining: usage.remaining,
            percentage: usage.percentage.toFixed(1),
            isOver: usage.isOver,
        };
    });

    const assetInfo = assets.map(a => ({
        name: a.name,
        type: a.type,
        balance: a.balance,
    }));
    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);

    return `## User's Financial Data (Currency: ${currency})
### This Month
- Total Income: ${formatCurrency(totalIncome, currency)}
- Total Spending: ${formatCurrency(totalSpending, currency)}
- Net Savings: ${formatCurrency(totalIncome - totalSpending, currency)}
- Transaction Count: ${monthlySpending.length} expenses, ${monthlyIncome.length} income entries

### This Week
- Weekly Spending: ${formatCurrency(weeklyTotal, currency)}

### Today
- Today's Spending: ${formatCurrency(dailyTotal, currency)}

### Top Spending Categories (This Month)
${categoryBreakdown.slice(0, 8).map((c, i) => `${i + 1}. ${c.name}: ${formatCurrency(c.total, currency)} (${c.count} transactions)`).join('\n')}

### Budget Status
${budgetStatus.length > 0 ? budgetStatus.map(b => `- ${b.period}: ${formatCurrency(b.spent, currency)} / ${formatCurrency(b.limit, currency)} (${b.percentage}%) ${b.isOver ? 'OVER BUDGET' : 'OK'}`).join('\n') : 'No budgets set'}

### Assets
${assetInfo.length > 0 ? assetInfo.map(a => `- ${a.name} (${a.type}): ${formatCurrency(a.balance, currency)}`).join('\n') : 'No assets tracked'}
Total Assets: ${formatCurrency(totalAssets, currency)}

### Recent Transactions (Last 10)
${transactions.slice(0, 10).map(t => {
        const sign = t.type === 'income' ? '+' : '-';
        return `- ${sign}${formatCurrency(Math.abs(t.amount), currency)} | ${getCategoryById(t.category).name} | ${t.description || 'No description'} | ${new Date(t.date).toLocaleDateString()}`;
    }).join('\n')}`;
}

const SYSTEM_PROMPT_TEMPLATE = `You are FinanceFlow AI, a helpful personal finance assistant. You have access to the user's real financial data shown below. Use this data to give specific, actionable advice.

{CONTEXT}

Rules:
- Always reference the user's actual numbers when answering
- Be encouraging but honest about overspending
- Give specific, actionable advice
- Use the currency shown in the data
- Keep responses concise (2-4 paragraphs max)
- Use bullet points for lists
- If asked about something not in the data, say so`;

// ─── LOCAL AI (on-device via llama.rn) ────────
export async function sendLocalChatMessage(userMessage, state, chatHistory = [], onToken) {
    const { chatCompletion, isLocalAIAvailable } = require('./localAI');

    if (!isLocalAIAvailable()) {
        throw new Error('Local AI model is not ready. Please download and load it from Settings.');
    }

    const financialContext = buildFinancialContext(state);
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{CONTEXT}', financialContext);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
    ];

    const response = await chatCompletion(messages, onToken, {
        maxTokens: 512,
        temperature: 0.7,
    });

    return response;
}

// ─── CLOUD AI (API fallback) ──────────────────
export async function sendCloudChatMessage(userMessage, state, chatHistory = [], apiKey, endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1') {
    if (!apiKey) {
        throw new Error('AI API key is required. Please set it in Settings.');
    }

    const financialContext = buildFinancialContext(state);
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{CONTEXT}', financialContext);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
    ];

    const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'qwen-plus',
            messages,
            max_tokens: 1000,
            temperature: 0.7,
            stream: false,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
}

// ─── Unified send (auto-selects local vs cloud) ─
export async function sendChatMessage(userMessage, state, chatHistory = [], onToken, apiKey, endpoint) {
    // Try local first on native platforms
    if (Platform.OS !== 'web') {
        try {
            const { isLocalAIAvailable } = require('./localAI');
            if (isLocalAIAvailable()) {
                return {
                    text: await sendLocalChatMessage(userMessage, state, chatHistory, onToken),
                    source: 'local',
                };
            }
        } catch (e) {
            console.warn('Local AI failed, falling back to cloud:', e.message);
        }
    }

    // Fallback to cloud
    const text = await sendCloudChatMessage(userMessage, state, chatHistory, apiKey, endpoint);
    return { text, source: 'cloud' };
}
