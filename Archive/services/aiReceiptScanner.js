// AI Receipt Scanner Service
// LOCAL ONLY (on-device llama.rn)

import { Platform } from 'react-native';
import { LOCAL_MODELS } from './localAIConfig';
import { getActiveModelConfig, getActiveModelId, isModelDownloaded, setActiveModelId } from './localAI';

const RECEIPT_CATEGORIES = new Set([
    'food', 'transport', 'daily_needs', 'health', 'shopping', 'entertainment',
    'education', 'bills', 'rent', 'beauty', 'gift', 'pets', 'other_spending',
]);

const NON_ITEM_KEYWORDS = new Set([
    'subtotal', 'service', 'tax', 'pajak', 'total', 'bayar', 'cash', 'voucher', 'kembalian',
    'change', 'discount', 'diskon', 'tip', 'rounding', 'pembulatan', 'meja', 'table', 'order',
    'bill', 'waiter', 'kasir', 'nama', 'no.bill', 'no. bill', 'tgl/jam', 'guest', 'tamu',
]);

const INVALID_RECEIPT_MESSAGE = 'This image is unclear or not a valid receipt. Please upload a clear receipt photo.';

function buildInvalidReceiptError() {
    return new Error(INVALID_RECEIPT_MESSAGE);
}



function isLikelyReceiptText(text) {
    const raw = extractTextValue(text);
    if (!raw) return false;

    const normalized = raw.replace(/\r/g, '\n');
    const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) return false;

    const lower = normalized.toLowerCase();
    const hasReceiptKeywords = /(total|subtotal|tax|pajak|service|bayar|cash|debit|credit|kembalian|change|qty|quantity|tanggal|tgl|invoice|receipt|struk|no\.?\s*(bill|trx|transaksi)|rp|idr)/i.test(lower);
    const amountTokens = normalized.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b|\b\d{2,}\b/g) || [];
    const hasDate = !!parseDateFromText(normalized);

    return amountTokens.length >= 1 && (hasReceiptKeywords || hasDate);
}

function ensureValidReceiptResult(data) {
    if (!data || typeof data !== 'object') {
        throw buildInvalidReceiptError();
    }

    const items = Array.isArray(data.items) ? data.items : [];
    const pricedItems = items.filter((item) => {
        const name = extractTextValue(item?.name);
        const price = parseNumericValue(item?.price) || 0;
        return name.length >= 2 && price > 0;
    });

    const total = parseNumericValue(data.total) || 0;
    const subtotal = parseNumericValue(data.subtotal) || 0;
    const hasStructuredAmount = pricedItems.length > 0 || total > 0 || subtotal > 0;

    // Treat as invalid when there are no priced line-items and no meaningful totals.
    if (!hasStructuredAmount) {
        throw buildInvalidReceiptError();
    }
}

// ─── Receipt data structure helper ────────────
export function receiptToTransaction(receiptData) {
    const normalized = normalizeReceiptData(receiptData);
    const items = normalized.items;
    const total = normalized.total || items.reduce((s, i) => s + (i.price * i.quantity), 0);
    const mainCategory = items.length > 0 ? items[0].category : 'other_spending';

    return {
        type: 'spending',
        amount: total,
        category: mainCategory,
        description: normalized.storeName || 'Receipt Scan',
        date: normalized.date ? new Date(normalized.date).toISOString() : new Date().toISOString(),
        items,
        paymentMethod: normalized.paymentMethod || 'cash',
    };
}

function extractTextValue(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value).trim();
    }
    if (Array.isArray(value)) {
        return value.map(extractTextValue).filter(Boolean).join(' ').trim();
    }
    if (typeof value === 'object') {
        const preferred = [
            value.name, value.title, value.label, value.description, value.item,
            value.product, value.text, value.content, value.value, value.raw,
        ].map(extractTextValue).filter(Boolean).join(' ').trim();

        if (preferred) return preferred;

        return Object.values(value).map(extractTextValue).filter(Boolean).join(' ').trim();
    }
    return '';
}

function parseNumericString(raw) {
    if (!raw) return null;
    let cleaned = String(raw).replace(/[^0-9,.-]/g, '').trim();
    if (!cleaned) return null;

    if (cleaned.includes(',') && cleaned.includes('.')) {
        cleaned = cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
        const parts = cleaned.split(',');
        const lastPart = parts[parts.length - 1];
        cleaned = lastPart.length === 2
            ? cleaned.replace(/\./g, '').replace(',', '.')
            : cleaned.replace(/,/g, '');
    }

    const matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
    if (!matches || matches.length === 0) return null;

    const parsed = Number.parseFloat(matches[matches.length - 1]);
    return Number.isFinite(parsed) ? parsed : null;
}

const MONTH_NAME_MAP = {
    jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
    jun: '06', jul: '07', agt: '08', aug: '08', sep: '09',
    okt: '10', oct: '10', nov: '11', des: '12', dec: '12',
    januari: '01', februari: '02', maret: '03', april: '04',
    juni: '06', juli: '07', agustus: '08', september: '09',
    oktober: '10', november: '11', desember: '12',
    january: '01', february: '02', march: '03', june: '06',
    july: '07', august: '08', october: '10', december: '12',
};

function parseDateFromText(text) {
    const raw = extractTextValue(text);
    if (!raw) return null;

    // Strip date label prefixes (Tanggal:, Tgl:, Date:, Tgl/Jam:, Waktu:)
    let stripped = raw.replace(/^(tanggal|tgl\/jam|tgl|date|waktu|time)\s*[:.\-]?\s*/i, '').trim();
    // Strip day-of-week prefixes (Indonesian and English)
    stripped = stripped.replace(/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[,.]?\s*/i, '').trim();

    // Named month: "17 Mar 2026", "17 Maret 2026", "17 March 2026" (with optional time)
    const named = stripped.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
    if (named) {
        const mm = MONTH_NAME_MAP[named[2].toLowerCase()];
        if (mm) {
            const dd = named[1].padStart(2, '0');
            const yyyy = named[3];
            const hh = (named[4] || '00').padStart(2, '0');
            const mi = (named[5] || '00').padStart(2, '0');
            const ss = (named[6] || '00').padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
        }
    }

    // Named month: "March 17, 2026" or "Mar 17 2026"
    const named2 = stripped.match(/([a-z]+)\s+(\d{1,2})[,\s]+(\d{4})/i);
    if (named2) {
        const mm = MONTH_NAME_MAP[named2[1].toLowerCase()];
        if (mm) {
            const dd = named2[2].padStart(2, '0');
            const yyyy = named2[3];
            return `${yyyy}-${mm}-${dd}T00:00:00`;
        }
    }

    // Numeric DMY: 17/03/2026, 17-03-26
    const dmy = stripped.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmy) {
        const dd = dmy[1].padStart(2, '0');
        const mm = dmy[2].padStart(2, '0');
        const yyyy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
        const hh = (dmy[4] || '00').padStart(2, '0');
        const mi = (dmy[5] || '00').padStart(2, '0');
        const ss = (dmy[6] || '00').padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }

    const ymd = stripped.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (ymd) {
        const yyyy = ymd[1];
        const mm = ymd[2].padStart(2, '0');
        const dd = ymd[3].padStart(2, '0');
        const hh = (ymd[4] || '00').padStart(2, '0');
        const mi = (ymd[5] || '00').padStart(2, '0');
        const ss = (ymd[6] || '00').padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }

    return null;
}

function parseNumericValue(value) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return parseNumericString(value);
    if (Array.isArray(value)) {
        for (const entry of value) {
            const parsed = parseNumericValue(entry);
            if (parsed != null) return parsed;
        }
        return null;
    }
    if (typeof value === 'object') {
        const preferredKeys = ['amount', 'total', 'price', 'value', 'subtotal', 'unitPrice', 'lineTotal', 'text', 'content', 'raw'];
        for (const key of preferredKeys) {
            if (value[key] != null) {
                const parsed = parseNumericValue(value[key]);
                if (parsed != null) return parsed;
            }
        }

        for (const entry of Object.values(value)) {
            const parsed = parseNumericValue(entry);
            if (parsed != null) return parsed;
        }
    }
    return null;
}

function normalizeCategory(value) {
    const category = extractTextValue(value).toLowerCase().trim();
    return RECEIPT_CATEGORIES.has(category) ? category : 'other_spending';
}

function normalizePaymentMethod(value) {
    const normalized = extractTextValue(value).toLowerCase();
    if (normalized.includes('cash')) return 'cash';
    if (normalized.includes('bank') || normalized.includes('card') || normalized.includes('debit') || normalized.includes('credit')) return 'bank';
    if (normalized.includes('wallet') || normalized.includes('ewallet') || normalized.includes('e-wallet') || normalized.includes('ovo') || normalized.includes('gopay') || normalized.includes('dana')) return 'ewallet';
    return normalized || 'cash';
}

function normalizeItem(item, index) {
    if (typeof item === 'string') {
        return {
            name: item.trim() || `Item ${index + 1}`,
            quantity: 1,
            price: 0,
            category: 'other_spending',
        };
    }

    const quantity = Math.max(1, parseNumericValue(item?.quantity ?? item?.qty ?? item?.count ?? item?.units ?? item?.cnt) || 1);
    const explicitPrice = parseNumericValue(item?.price ?? item?.unitPrice ?? item?.unit_price ?? item?.amount ?? item?.unitprice);
    const lineTotal = parseNumericValue(item?.lineTotal ?? item?.line_total ?? item?.total);
    const price = explicitPrice != null
        ? explicitPrice
        : lineTotal != null
            ? lineTotal / quantity
            : 0;

    return {
        name: extractTextValue(item?.name ?? item?.nm ?? item?.item ?? item?.description ?? item?.title ?? item?.product) || `Item ${index + 1}`,
        quantity,
        price: Number.isFinite(price) ? price : 0,
        category: normalizeCategory(item?.category),
    };
}

function toItemArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return Object.values(value);
    return [];
}

function summarizeResponse(content) {
    const summary = extractTextValue(content).replace(/\s+/g, ' ').trim();
    if (!summary) return 'empty response';
    return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
}

function normalizeReceiptData(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI returned JSON in an unexpected receipt format.');
    }

    const rawItems = toItemArray(parsed.items)
        .concat(toItemArray(parsed.lineItems))
        .concat(toItemArray(parsed.products))
        .concat(toItemArray(parsed.menu))
        .concat(toItemArray(parsed.lines));

    const items = rawItems
        .map(normalizeItem)
        .filter((item) => extractTextValue(item?.name).length >= 2 && (item.price || 0) > 0);
    const itemsSubtotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
    const subtotal = parseNumericValue(parsed.subtotal) ?? itemsSubtotal;
    const tax = parseNumericValue(parsed.tax) ?? 0;
    const serviceCharge = parseNumericValue(parsed.serviceCharge ?? parsed.service_charge ?? parsed.service ?? parsed.servicecharge) ?? 0;
    const total = parseNumericValue(parsed.total)
        ?? parseNumericValue(parsed.grandTotal)
        ?? parseNumericValue(parsed.amount)
        ?? (subtotal + tax + serviceCharge);

    return {
        storeName: extractTextValue(parsed.storeName ?? parsed.merchantName ?? parsed.vendor ?? parsed.store ?? parsed.name) || 'Receipt Scan',
        date: extractTextValue(parsed.date ?? parsed.transactionDate ?? parsed.purchaseDate) || new Date().toISOString().slice(0, 10),
        items,
        subtotal,
        tax,
        serviceCharge,
        total: Number.isFinite(total) ? total : itemsSubtotal,
        paymentMethod: normalizePaymentMethod(parsed.paymentMethod ?? parsed.payment_method ?? parsed.method),
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

function parseLooseReceiptFromText(content) {
    const text = String(content || '');
    const items = [];

    const itemMatches = text.matchAll(/"(?:nm|name)"\s*:\s*"([^"]+)"[\s\S]{0,120}?"(?:unitprice|price|amount)"\s*:\s*"?([0-9.,]+)"?[\s\S]{0,80}?(?:"(?:cnt|qty|quantity)"\s*:\s*"?([0-9.,%]+)"?)?/gi);
    for (const match of itemMatches) {
        const rawName = (match[1] || '').trim();
        const rawPrice = match[2];
        const rawQty = match[3];
        if (!rawName) continue;

        const qty = Math.max(1, parseNumericValue(rawQty) || 1);
        const price = parseNumericValue(rawPrice) || 0;
        if (price <= 0) continue;

        items.push({
            name: rawName,
            quantity: qty,
            price,
            category: 'other_spending',
        });
    }

    const totalMatch = text.match(/"(?:total|grandTotal|amount)"\s*:\s*"?([0-9.,]+)"?/i);
    const total = parseNumericValue(totalMatch?.[1]) || items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    if (items.length === 0 && total <= 0) {
        throw new Error('AI response could not be converted into receipt items.');
    }

    return normalizeReceiptData({
        storeName: 'Receipt Scan',
        date: new Date().toISOString().slice(0, 10),
        items,
        subtotal: items.reduce((sum, i) => sum + (i.price * i.quantity), 0),
        tax: 0,
        total,
        paymentMethod: 'cash',
    });
}

const RECEIPT_PROMPT = `Extract receipt image provided to JSON only. No markdown, no explanation.

JSON schema:
{
  "storeName": "string",
  "date": "YYYY-MM-DD",
  "items": [{"name": "string", "quantity": number, "price": number, "category": "food|transport|daily_needs|health|shopping|entertainment|education|bills|rent|beauty|gift|pets|other_spending"}],
  "subtotal": number,
  "serviceCharge": number,
  "tax": number,
  "total": number,
}

Rules:
- For quantity, check left of item name first, then right, if not available, default to 1

- Store name: usually on very top, skip addresses/phone/NPWP/websites. Sentence with "rd" or "st", or city name is not store name, DO NOT USE IT.
- Category: decide based on item name. If uncertain, use "other_spending"
- Date: ALL DATE MUST BE RETURNED AS YYYY-MM-DD on JSON format
- If the item name are in multiple languages, use English if available.
- Unclear or not a receipt image, return: {"invalidReceipt": true, "reason": "Not a valid receipt"}`;

// ─── LOCAL AI (on-device via llama.rn) ────────
export async function scanReceiptLocal(input, onToken) {
    const { textCompletion, validateActiveModelForTask } = require('./localAI');
    validateActiveModelForTask('receipt-scan');

    const prompt = `${RECEIPT_PROMPT}\n\nAnalyze the receipt image and return JSON only.`;

    const response = await textCompletion(
        prompt,
        input,
        onToken,
        {
            maxTokens: 2048,
            temperature: 0.5,
        }
    );

    try {
        const parsed = parseAIJSON(response);
        if (parsed?.invalidReceipt) {
            throw buildInvalidReceiptError();
        }
        const normalized = normalizeReceiptData(parsed);
        ensureValidReceiptResult(normalized);
        return normalized;
    } catch (e1) {
        if (e1.message === INVALID_RECEIPT_MESSAGE) throw e1;
        try {
            const normalized = parseLooseReceiptFromText(response);
            ensureValidReceiptResult(normalized);
            return normalized;
        } catch (e2) {
            if (e2.message === INVALID_RECEIPT_MESSAGE) throw e2;
            const rawPreview = typeof response === 'string' ? response.slice(0, 150).replace(/\n/g, ' ') : String(response);
            throw new Error(`AI returned invalid receipt JSON. Raw output: "${rawPreview}..."`);
        }
    }
}

// ─── TEXT-ONLY AI (for Fast Scan / OCR-first flow) ────
// Takes pre-extracted OCR text and parses it with AI (no image/vision model needed)
export async function scanReceiptFromText(ocrText, onToken) {
    const { textCompletion } = require('./localAI');

    if (!ocrText || typeof ocrText !== 'string' || ocrText.trim().length < 10) {
        throw new Error('OCR text is too short to parse as a receipt.');
    }

    const prompt = `Parse the following receipt text (extracted via OCR) into JSON only. No markdown, no explanation.

JSON schema:
{
  "storeName": "string",
  "date": "YYYY-MM-DD",
  "items": [{"name": "string", "quantity": number, "price": number, "category": "food|transport|daily_needs|health|shopping|entertainment|education|bills|rent|beauty|gift|pets|other_spending"}],
  "subtotal": number,
  "serviceCharge": number,
  "tax": number,
  "total": number,
}

Rules:
- For quantity, check left of item name first, then right, if not available, default to 1
- Item prices on the receipt, such as 75,000, must be returned as 75000, do not return 75 only
- Item prices such as 5.50/5,50 must be returned as 5.50
- Store name: usually on very top, skip addresses/phone/NPWP/websites. Sentence with "rd" or "st", or city name is not store name, DO NOT USE IT.
- Category: decide based on item name. If uncertain, use "other_spending"
- Date: ALL DATE MUST BE RETURNED AS YYYY-MM-DD on JSON format
- If the item name are in multiple languages, use English if available.
- Invalid receipt (poster/object/blurry): {"invalidReceipt": true, "reason": "Not a valid receipt"}

Receipt text:
---
${ocrText}
---

Return JSON only.`;

    const response = await textCompletion(
        prompt,
        null,
        onToken,
        {
            maxTokens: 2048,
            temperature: 0.3,
        }
    );

    try {
        const parsed = parseAIJSON(response);
        if (parsed?.invalidReceipt) {
            throw buildInvalidReceiptError();
        }
        const normalized = normalizeReceiptData(parsed);
        ensureValidReceiptResult(normalized);
        return normalized;
    } catch (firstErr) {
        if (firstErr?.message === INVALID_RECEIPT_MESSAGE) throw firstErr;
        try {
            const normalized = parseLooseReceiptFromText(response);
            ensureValidReceiptResult(normalized);
            return normalized;
        } catch {
            throw new Error(`AI returned invalid receipt JSON from OCR text. Response: ${summarizeResponse(response)}`);
        }
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
        const normalized = normalizeReceiptData(parseAIJSON(content));
        ensureValidReceiptResult(normalized);
        return normalized;
    } catch {
        throw new Error(`Cloud AI returned invalid receipt JSON. Response: ${summarizeResponse(content)}`);
    }
}

// ─── Unified scan (local-only) ─
export async function scanReceipt(imageBase64OrText, apiKey, endpoint, onToken, originalUri = null, taskControl = null) {
    if (Platform.OS === 'web') {
        throw new Error('Local AI receipt scanner is only supported on iOS/Android.');
    }

    const throwIfCancelled = () => taskControl?.throwIfCancelled?.();

    try {
        if (taskControl) {
            taskControl.onCancel?.(() => {
                const { stopCurrentCompletion } = require('./localAI');
                if (stopCurrentCompletion) stopCurrentCompletion();
            });
        }

        const localUri = originalUri || imageBase64OrText;
        if (!localUri || !(localUri.startsWith('file://') || localUri.startsWith('/'))) {
            throw new Error('Local receipt scan requires a local file URI from camera/gallery.');
        }

        throwIfCancelled();

        const parsed = await scanReceiptLocal(localUri, onToken);
        throwIfCancelled();
        ensureValidReceiptResult(parsed);
        return { data: parsed, source: 'local-image-direct' };
    } catch (error) {
        const msg = error?.message || 'Unknown local AI error';
        if (msg === INVALID_RECEIPT_MESSAGE || /invalidReceipt/i.test(msg) || /not a valid receipt/i.test(msg)) {
            throw buildInvalidReceiptError();
        }
        throw new Error(msg);
    }
}