// AI Receipt Scanner Service
// Supports LOCAL (llama.rn with OCR text) and CLOUD (Qwen VL with image) modes

import { Platform } from 'react-native';

// ─── Receipt data structure helper ────────────
export function receiptToTransaction(receiptData) {
    const items = (receiptData.items || []).map(item => ({
        name: item.name || 'Unknown Item',
        quantity: item.quantity || 1,
        price: item.price || 0,
        category: item.category || 'other_spending',
    }));

    const total = receiptData.total || items.reduce((s, i) => s + (i.price * i.quantity), 0);
    const mainCategory = items.length > 0 ? items[0].category : 'other_spending';

    return {
        type: 'spending',
        amount: total,
        category: mainCategory,
        description: receiptData.storeName || 'Receipt Scan',
        date: receiptData.date ? new Date(receiptData.date).toISOString() : new Date().toISOString(),
        items,
        paymentMethod: receiptData.paymentMethod || 'cash',
    };
}

// ─── JSON parsing helper ──────────────────────
function parseAIJSON(content) {
    const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    // Try to find a JSON object in the text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(cleaned);
}

const RECEIPT_PROMPT = `You are a receipt/invoice scanner AI. Analyze the receipt text and extract all information into a structured JSON format.
Return ONLY valid JSON, no markdown, no explanation.

Required JSON format:
{
  "storeName": "string",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "name": "string",
      "quantity": number,
      "price": number,
      "category": "string (one of: food, transport, daily_needs, health, shopping, entertainment, education, bills, rent, beauty, gift, pets, other_spending)"
    }
  ],
  "subtotal": number,
  "tax": number,
  "total": number,
  "paymentMethod": "string (cash, bank, ewallet, or other)"
}

Rules:
- All prices should be numbers (no currency symbols)
- If quantity is unclear, default to 1
- Categorize each item based on what it is
- If date is unclear, use today's date
- Extract the payment method if visible`;

// ─── LOCAL AI (on-device via llama.rn) ────────
export async function scanReceiptLocal(ocrText, onToken) {
    const { chatCompletion, isLocalAIAvailable } = require('./localAI');

    if (!isLocalAIAvailable()) {
        throw new Error('Local AI model is not ready.');
    }

    const messages = [
        { role: 'system', content: RECEIPT_PROMPT },
        {
            role: 'user',
            content: `Please scan and structure this receipt text:\n\n${ocrText}`,
        },
    ];

    const response = await chatCompletion(messages, onToken, {
        maxTokens: 1024,
        temperature: 0.1,
    });

    try {
        return parseAIJSON(response);
    } catch {
        console.error('Failed to parse local AI response:', response);
        throw new Error('Failed to parse receipt data. Please try again or edit manually.');
    }
}

// ─── CLOUD AI (API with image) ────────────────
export async function scanReceiptCloud(imageBase64, apiKey, endpoint = 'https://dashscope.aliyuncs.com/compatible-mode/v1') {
    if (!apiKey) {
        throw new Error('AI API key is required. Please set it in Settings.');
    }

    const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'qwen-vl-max',
            messages: [
                { role: 'system', content: RECEIPT_PROMPT },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`,
                            },
                        },
                        {
                            type: 'text',
                            text: 'Please scan this receipt and extract all item details, prices, and totals into JSON format.',
                        },
                    ],
                },
            ],
            max_tokens: 2000,
            temperature: 0.1,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    try {
        return parseAIJSON(content);
    } catch {
        console.error('Failed to parse cloud AI response:', content);
        throw new Error('Failed to parse receipt data. Please try again with a clearer image.');
    }
}

// ─── Unified scan (auto-selects local vs cloud) ─
export async function scanReceipt(imageBase64OrText, apiKey, endpoint, isOcrText = false, onToken) {
    // Try local AI first on native
    if (Platform.OS !== 'web' && isOcrText) {
        try {
            const { isLocalAIAvailable } = require('./localAI');
            if (isLocalAIAvailable()) {
                const result = await scanReceiptLocal(imageBase64OrText, onToken);
                return { data: result, source: 'local' };
            }
        } catch (e) {
            console.warn('Local receipt scan failed, trying cloud:', e.message);
        }
    }

    // Cloud fallback (with image)
    if (!isOcrText && apiKey) {
        const result = await scanReceiptCloud(imageBase64OrText, apiKey, endpoint);
        return { data: result, source: 'cloud' };
    }

    // Cloud with OCR text (no vision needed)
    if (isOcrText && apiKey) {
        // Send as text to cloud text API
        const response = await fetch(`${endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1'}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'qwen-plus',
                messages: [
                    { role: 'system', content: RECEIPT_PROMPT },
                    { role: 'user', content: `Please scan and structure this receipt text:\n\n${imageBase64OrText}` },
                ],
                max_tokens: 2000,
                temperature: 0.1,
            }),
        });

        if (!response.ok) throw new Error('Cloud API error');
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        return { data: parseAIJSON(content), source: 'cloud' };
    }

    throw new Error('No AI available. Please download the local model or configure API key in Settings.');
}
