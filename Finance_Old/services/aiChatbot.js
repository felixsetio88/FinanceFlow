// AI Chatbot Service — LOCAL ONLY (on-device llama.rn)
// Provides financial advice based on user's actual data

import { Platform } from 'react-native';
import { formatCurrency } from '../utils/currencies';
import { filterTransactionsByPeriod, groupByCategory, calculateBudgetUsage } from '../utils/helpers';
import { getCategoryById, spendingCategories, incomeCategories } from '../utils/categories';

export const popularQuestions = [
    { id: 1, text: 'How much did I spend this month?', icon: 'wallet-outline' },
    { id: 2, text: "What's my biggest spending category?", icon: 'pie-chart-outline' },
    { id: 3, text: 'Am I within my budget?', icon: 'flag-outline' },
    { id: 4, text: 'How much income did I earn this month?', icon: 'cash-outline' },
    { id: 5, text: "What's my net savings this month?", icon: 'business-outline' },
    { id: 6, text: 'Compare my spending this week vs last week', icon: 'stats-chart-outline' },
    { id: 7, text: 'Which days do I spend the most?', icon: 'calendar-outline' },
    { id: 8, text: 'How can I reduce my spending?', icon: 'cut-outline' },
    { id: 9, text: "What's my financial health summary?", icon: 'heart-outline' },
    { id: 10, text: 'Forecast my spending for the rest of the month', icon: 'sparkles-outline' },
];

function buildFinancialContext(state) {
    const { transactions, budgets, assets, vehicles = [], currency, currentDateKey } = state;
    const referenceDate = currentDateKey ? new Date(currentDateKey) : new Date();

    const monthlySpending = filterTransactionsByPeriod(transactions, 'monthly', referenceDate).filter(t => t.type === 'spending');
    const monthlyIncome = filterTransactionsByPeriod(transactions, 'monthly', referenceDate).filter(t => t.type === 'income');
    const totalSpending = monthlySpending.reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalIncome = monthlyIncome.reduce((s, t) => s + Math.abs(t.amount), 0);

    const weeklySpending = filterTransactionsByPeriod(transactions, 'weekly', referenceDate).filter(t => t.type === 'spending');
    const weeklyTotal = weeklySpending.reduce((s, t) => s + Math.abs(t.amount), 0);

    const dailySpending = filterTransactionsByPeriod(transactions, 'daily', referenceDate).filter(t => t.type === 'spending');
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
        const usage = calculateBudgetUsage(transactions, b, referenceDate);
        return {
            category: b.category || 'all',
            period: b.period,
            limit: b.amount,
            spent: usage.spent,
            remaining: usage.remaining,
            percentage: usage.percentage.toFixed(1),
            isOver: usage.isOver,
        };
    });

    const assetInfo = assets.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
    }));
    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const recentTransactions = [...transactions]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);
    const topSpends = [...monthlySpending]
        .sort((a, b) => Math.abs(b.amount || 0) - Math.abs(a.amount || 0))
        .slice(0, 5);
    const recentByCategory = categoryBreakdown.slice(0, 6);

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
${budgetStatus.length > 0 ? budgetStatus.map(b => `- ${b.category === 'all' ? 'All spending' : getCategoryById(b.category).name} ${b.period}: ${formatCurrency(b.spent, currency)} / ${formatCurrency(b.limit, currency)} (${b.percentage}%) ${b.isOver ? 'OVER BUDGET' : 'OK'}`).join('\n') : 'No budgets set'}

### Assets
${assetInfo.length > 0 ? assetInfo.map(a => `- ${a.name} (ID: ${a.id}, Type: ${a.type}): ${formatCurrency(a.balance, currency)}`).join('\n') : 'No assets tracked'}
Total Assets: ${formatCurrency(totalAssets, currency)}

### User Vehicles
${vehicles.length > 0 ? vehicles.map(v => `- ${v.name} (ID: ${v.id}, Type: ${v.type})`).join('\n') : 'No vehicles added'}

### Available Categories
- Spending: ${spendingCategories.map(c => `${c.name} (ID: ${c.id})`).join(', ')}
- Income: ${incomeCategories.map(c => `${c.name} (ID: ${c.id})`).join(', ')}

### Recent Transactions (Last 10)
${recentTransactions.map(t => {
        const sign = t.type === 'income' ? '+' : '-';
        return `- ${sign}${formatCurrency(Math.abs(t.amount), currency)} | ${getCategoryById(t.category).name} | ${t.description || 'No description'} | ${new Date(t.date).toLocaleDateString()}`;
    }).join('\n')}

### Top Spends This Month
${topSpends.length > 0 ? topSpends.map((t, i) => `${i + 1}. ${formatCurrency(Math.abs(t.amount), currency)} | ${getCategoryById(t.category).name} | ${t.description || 'No description'} | ${new Date(t.date).toLocaleDateString()}`).join('\n') : 'No spending this month'}

### Recent Category Pattern Summary
${recentByCategory.length > 0 ? recentByCategory.map(c => `- ${c.name}: ${formatCurrency(c.total, currency)} across ${c.count} transaction${c.count === 1 ? '' : 's'}`).join('\n') : 'No spending pattern yet'}`;
}

function estimateTokens(text) {
    return Math.ceil(String(text || '').length / 4);
}

function trimChatHistory(chatHistory = [], maxTokens = 1200) {
    const normalized = Array.isArray(chatHistory) ? chatHistory : [];
    const trimmed = [];
    let used = 0;
    for (let i = normalized.length - 1; i >= 0; i--) {
        const message = normalized[i];
        const cost = estimateTokens(message?.content) + 8;
        if (trimmed.length >= 24 || used + cost > maxTokens) break;
        trimmed.unshift(message);
        used += cost;
    }
    return trimmed;
}

function buildAttachmentContext(attachments = []) {
    const items = Array.isArray(attachments) ? attachments : [];
    if (items.length === 0) return '';

    return items.map((attachment, index) => {
        const name = attachment?.name || `Attachment ${index + 1}`;
        const mimeType = attachment?.mimeType || attachment?.type || 'unknown';
        const pageCount = Number.isFinite(attachment?.pageCount) ? `, ${attachment.pageCount} pages` : '';
        const text = String(attachment?.text || '').trim();
        const preview = text.length > 12000 ? `${text.slice(0, 12000)}\n\n[Attachment text truncated]` : text;

        return `- ${name} (${mimeType}${pageCount})\n${preview || '[No readable text extracted from attachment]'}`;
    }).join('\n\n');
}

const SYSTEM_PROMPT_GENERAL = `You are an AI Chatbot for FinanceFlow app, it is a financial tracking app, you must be a helpful personal finance assistant. You have access to the user's real financial data shown below. Use this data to give specific, actionable advice.

{CONTEXT}

Rules:
- Always reference the user's actual numbers when answering
- Be encouraging but honest about overspending
- Give specific, actionable advice
- Use the currency shown in the data
- Use bullet points for lists
- If asked about something not in the data, say so

CRITICAL INSTRUCTION: You MUST keep your responses extremely concise. You are STRICTLY LIMITED to a maximum of 3 short paragraphs. Do not over-explain.`;

const SYSTEM_PROMPT_TRANSACTION = `You are an AI Chatbot for FinanceFlow app. Your current task is to help the user record a transaction. 
You have access to the user's financial data below to know their available categories, assets, and vehicles.

{CONTEXT}

## Transaction JSON Schema
When the user describes a transaction they want to record, respond with a brief confirmation sentence followed by a JSON block in this exact format:

\`\`\`json
{
  "type": "spending" | "income",
  "amount": <number>,
  "category": "<categoryId>",
  "description": "<short description>",
  "date": "<ISO date string>",
  "assetId": "<assetId if mentioned>",
  "items": [{"name": "string", "quantity": 1, "price": <number>}],
  "vehicleId": "<vehicleId if transport, else null>",
  "vehicleLogType": "refuel" | "maintenance" | null,
  "vehicleOdometer": <number if mentioned, else null>,
  "vehicleVolume": <number (liters/kWh) if refuel mentioned, else null>
}
\`\`\`

### Category Selection Rules (IMPORTANT – follow exactly):
- Use category ID "transport" for ANY car/vehicle-related expense: fuel, petrol, diesel, refueling, EV charging, car repair, tire replacement, oil change, brake service, car wash, car service, vehicle maintenance, mechanic, workshop, etc.
- When category is "transport", you MUST also set:
  - "vehicleId" to the ID of the User Vehicle mentioned (if matched from "User Vehicles" section).
  - "vehicleVolume" to the liters/gallons/kWh if refuel is mentioned (e.g. "20 liters" -> 20).
  - "vehicleOdometer" to the odometer reading if mentioned (e.g. "105000km" -> 105000).
  - "vehicleLogType": "refuel" when the user mentions fuel, petrol, diesel, charging, fill up, litre, liter, gallon, kWh
  - "vehicleLogType": "maintenance" when the user mentions repair, service, tire, tyre, oil, brake, battery, mechanic, workshop, replaced, maintenance, tune-up, inspection, car wash
- Use "food" for meals, restaurants, groceries, delivery food
- Use "shopping" for general retail, clothing, electronics
- Use "health" for medical, pharmacy, doctor, hospital
- Use "entertainment" for movies, games, subscriptions, streaming
- Use "utilities" for electricity, water, internet, phone bills
- Use "education" for courses, books, tuition
- Use "travel" for flights, hotels, accommodation (non-car)
- Use "other" only when nothing else fits

### General Rules:
- "date": If the user says "yesterday", map it precisely to the date of yesterday.
- "assetId": If the user mentions paying with or receiving to an account (e.g., "BCA", "Wallet"), you MUST find the exact matching ID from the Assets list and set it here.
- "items": If the user bought specific items (e.g. "latte coffee"), include them in the "items" array.`;


// ─── LOCAL AI (on-device via llama.rn) ────────
export async function sendLocalChatMessage(userMessage, state, chatHistory = [], onToken, attachments = [], isTransactionMode = false) {
    const { chatCompletion, validateActiveModelForTask, getModelContextLength } = require('./localAI');
    validateActiveModelForTask('chatbot');

    const financialContext = buildFinancialContext(state);
    const attachmentContext = buildAttachmentContext(attachments);
    const contextWithAttachments = attachmentContext
        ? `${financialContext}\n\n### Attached Files\n${attachmentContext}`
        : financialContext;
        
    const template = isTransactionMode ? SYSTEM_PROMPT_TRANSACTION : SYSTEM_PROMPT_GENERAL;
    const systemPrompt = template.replace('{CONTEXT}', contextWithAttachments);

    const contextLength = await getModelContextLength();
    const reservedForPrompt = estimateTokens(systemPrompt) + estimateTokens(userMessage) + estimateTokens(attachmentContext) + 700;
    const historyBudget = Math.max(400, Math.min(1800, contextLength - reservedForPrompt));
    const safeHistory = trimChatHistory(chatHistory, historyBudget);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...safeHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
    ];

    const response = await chatCompletion(messages, onToken, {
        maxTokens: 512,
        temperature: 0.7,
    });

    return response;
}

// ─── CLOUD AI (API fallback) ──────────────────
export async function sendCloudChatMessage(userMessage, state, chatHistory = [], apiKey, endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1', attachments = [], isTransactionMode = false) {
    if (!apiKey) {
        throw new Error('AI API key is required. Please set it in Settings.');
    }

    const financialContext = buildFinancialContext(state);
    const attachmentContext = buildAttachmentContext(attachments);
    const contextWithAttachments = attachmentContext
        ? `${financialContext}\n\n### Attached Files\n${attachmentContext}`
        : financialContext;
        
    const template = isTransactionMode ? SYSTEM_PROMPT_TRANSACTION : SYSTEM_PROMPT_GENERAL;
    const systemPrompt = template.replace('{CONTEXT}', contextWithAttachments);
    const safeHistory = trimChatHistory(chatHistory, 1600);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...safeHistory.map(m => ({ role: m.role, content: m.content })),
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

// ─── Unified send (local-only) ─
export async function sendChatMessage(userMessage, state, chatHistory = [], onToken, attachments = [], isTransactionMode = false) {
    if (Platform.OS === 'web') {
        throw new Error('Local AI chatbot is only supported on iOS/Android.');
    }

    try {
        const response = await sendLocalChatMessage(userMessage, state, chatHistory, onToken, attachments, isTransactionMode);
        return { text: response, source: 'local' };
    } catch (error) {
        throw new Error(`Local AI unavailable: ${error.message}`);
    }
}
