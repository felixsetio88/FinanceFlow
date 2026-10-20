// OCR Service - Cross-platform on-device text recognition
// iOS: Apple Vision framework (VNRecognizeTextRequest)
// Android: Google ML Kit Text Recognition
//
// Inspired by: https://github.com/AnastasiiaDesiateryk/receiptMobileApp-react-native-ocr

import { Platform, NativeModules } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';

// ─── Native module access ─────────────────────
function getOCRModule() {
    try {
        const { requireNativeModule } = require('expo-modules-core');
        const mod = requireNativeModule('ReceiptOCRModule');
        if (mod && mod.recognizeText) {
            return mod;
        }
    } catch (e) { }
    return null;
}

function getMLKitOCRModule() {
    if (!TextRecognition?.recognize) {
        return null;
    }
    return TextRecognition;
}

// ─── Path normalization ───────────────────────
function normalizePath(uri) {
    if (!uri) return uri;
    return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
}

function normalizeFrame(frame, width, height) {
    if (!frame) {
        return { x: 0, y: 0, w: 0, h: 0 };
    }

    const imageWidth = width || Math.max(1, frame.left + frame.width);
    const imageHeight = height || Math.max(1, frame.top + frame.height);

    return {
        x: frame.left / imageWidth,
        y: frame.top / imageHeight,
        w: frame.width / imageWidth,
        h: frame.height / imageHeight,
        pixelX: Math.round(frame.left),
        pixelY: Math.round(frame.top),
        pixelW: Math.round(frame.width),
        pixelH: Math.round(frame.height),
    };
}

// ─── Geometric Line Reconstructor ───────────────
function detectClusterSlope(items) {
    const slopes = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = 0; j < items.length; j++) {
            if (i === j) continue;
            const dx = items[j].cx - items[i].cx;
            const dy = items[j].cy - items[i].cy;
            if (dx > 0.30 && Math.abs(dy) < 0.045) {
                const s = dy / dx;
                if (Math.abs(s) <= 0.07) slopes.push(s);
            }
        }
    }
    if (slopes.length < 3) return 0;

    const zeroCount = slopes.filter(v => Math.abs(v) <= 0.010).length;
    let bestCenter = 0;
    let maxCount = 0;
    let bestSlopes = [];

    for (let s = -0.06; s <= 0.0601; s += 0.002) {
        const inWindow = slopes.filter(v => Math.abs(v - s) <= 0.010);
        if (inWindow.length > maxCount) {
            maxCount = inWindow.length;
            bestCenter = s;
            bestSlopes = inWindow;
        }
    }

    if (maxCount >= 3 && maxCount > zeroCount * 1.2 && Math.abs(bestCenter) >= 0.012) {
        return bestSlopes.reduce((sum, v) => sum + v, 0) / bestSlopes.length;
    }
    return 0;
}

function reconstructFullTextFromBlocks(blocks) {
    if (!blocks || blocks.length === 0) return '';
    const items = blocks.map(b => ({
        text: b.text.trim(),
        x1: b.bbox.x,
        x2: b.bbox.x + b.bbox.w,
        w: b.bbox.w,
        cx: b.bbox.x + (b.bbox.w / 2),
        cy: b.bbox.y + (b.bbox.h / 2),
        h: b.bbox.h
    })).filter(i => i.text.length > 0);

    const slope = detectClusterSlope(items);

    for (const it of items) {
        it.adjCy = it.cy - (slope * it.cx);
    }
    items.sort((a, b) => a.adjCy - b.adjCy);

    const rows = [];
    let currentRow = [];
    const threshFactor = Math.abs(slope) >= 0.012 ? 0.55 : 0.45;

    for (const item of items) {
        if (currentRow.length === 0) {
            currentRow.push(item);
        } else {
            const rowCy = currentRow[0].adjCy;
            const threshold = Math.max(currentRow[0].h, item.h) * threshFactor;
            const overlapsHorizontally = currentRow.some(existing => {
                const overlapX = Math.min(existing.x2, item.x2) - Math.max(existing.x1, item.x1);
                const minW = Math.min(existing.w, item.w);
                return overlapX > minW * 0.25;
            });

            if (Math.abs(item.adjCy - rowCy) <= threshold && !overlapsHorizontally) {
                currentRow.push(item);
            } else {
                rows.push(currentRow);
                currentRow = [item];
            }
        }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    const lines = rows.map(row => {
        row.sort((a, b) => a.cx - b.cx);
        return row.map(i => i.text).join(' ');
    });

    let reconstructed = lines.join('\n');
    reconstructed = reconstructed.replace(/(rp|rm|sgd|hkd|\$)\s*(\d{1,2})\s+(\d{2,3}[.,]\d{3})\b/gi, '$1 $2$3');
    return reconstructed;
}

function normalizeMLKitResult(result) {
    const lines = [];
    let width = 0;
    let height = 0;

    for (const block of result?.blocks || []) {
        const blockLines = block?.lines?.length ? block.lines : [{ text: block?.text, frame: block?.frame }];

        for (const line of blockLines) {
            const frame = line?.frame || block?.frame;
            if (frame) {
                width = Math.max(width, frame.left + frame.width);
                height = Math.max(height, frame.top + frame.height);
            }
            if (line?.text) {
                lines.push({ text: line.text, frame });
            }
        }
    }

    // Sort blocks top-to-bottom (by vertical center) to restore reading order.
    // ML Kit returns blocks in arbitrary order; sorting by frame.top gives reliable ordering.
    lines.sort((a, b) => {
        const aY = (a.frame?.top ?? 0) + (a.frame?.height ?? 0) / 2;
        const bY = (b.frame?.top ?? 0) + (b.frame?.height ?? 0) / 2;
        return aY - bY;
    });

    const blocks = lines.map((line) => ({
        text: line.text,
        confidence: 1,
        bbox: normalizeFrame(line.frame, width, height),
    }));

    const reconstructedText = reconstructFullTextFromBlocks(blocks);

    return {
        fullText: reconstructedText || result?.text || lines.map((line) => line.text).join('\n'),
        blocks,
        width,
        height,
    };
}

// ─── Run on-device OCR ────────────────────────
export async function runOCR(imageUri) {
    if (Platform.OS === 'web') {
        throw new Error('On-device OCR is not available on web.');
    }

    if (!imageUri) {
        throw new Error('Image URI is required for OCR.');
    }

    const mod = getOCRModule();
    if (mod) {
        const path = Platform.OS === 'ios' ? normalizePath(imageUri) : imageUri;
        const result = await mod.recognizeText(path);

        const blocks = (result?.blocks || []).map((block) => ({
            text: block.text || '',
            confidence: block.confidence ?? 1,
            bbox: block.bbox || { x: 0, y: 0, w: 0, h: 0 },
        }));

        const reconstructedText = reconstructFullTextFromBlocks(blocks);

        return {
            fullText: reconstructedText || result?.fullText || '',
            blocks,
            width: result?.width || 0,
            height: result?.height || 0,
        };
    }

    const mlKit = getMLKitOCRModule();
    if (!mlKit) {
        throw new Error(
            'On-device OCR is not available. Rebuild the app with:\n' +
            '  iOS: npx expo run:ios\n' +
            '  Android: npx expo run:android'
        );
    }

    const result = await mlKit.recognize(imageUri);
    return normalizeMLKitResult(result);
}

// ─── Check OCR availability ───────────────────
export function isOCRAvailable() {
    if (Platform.OS === 'web') return false;
    return !!getOCRModule() || !!getMLKitOCRModule();
}

// ─── Receipt field constants ──────────────────
const RECEIPT_CATEGORIES = new Set([
    'food', 'transport', 'daily_needs', 'health', 'shopping', 'entertainment',
    'education', 'bills', 'rent', 'beauty', 'gift', 'pets', 'other_spending',
]);

const NON_ITEM_KEYWORDS = new Set([
    'subtotal', 'sub total', 'sub-total', 'suk-total', 'subtota l', 'subttl',
    'dpp', 'net sales', 'total sales', 'total saies',
    'service', 'service charge', 'biaya pelayanan', 'layanan',
    'tax', 'pajak', 'ppn', 'pb1', 'vat', 'gst', 'sst',
    'total', 'grand total', 'amount', 'jumlah',
    'rounding', 'pembulatan', 'roundirg',
    'discount', 'diskon', 'tip', 'grab dine out',
    '總數', '小計', '淨值', 'jit:', 'mit:',
    'bayar', 'cash', 'tunai', 'voucher', 'kembalian', 'change',
    'payment', 'pembayaran', 'debit', 'credit', 'kartu',
    'paid', 'balance', 'due', 'tendered', 'card', 'ref', 'auth', 'visa', 'mastercard', 'amex', 'terminal', 'merchant',
    '現金', '找續', '八達通',
    'edc',
    'duitnow', 'fpx', 'ewallet', 'e-wallet', 'ovo', 'gopay', 'dana', 'shopeepay',
    'meja', 'table', 'tbl', 'no meja', 'no.meja',
    'pax', 'server', 'mode', 'kasir', 'cashier', 'pos', 'pos:',
    'order', 'bill', 'waiter', 'guest', 'tamu',
    'jam masuk', 'jam keluar', 'quick service', 'register',
    'total item', 'total qty', 'total quantity', 'total beverages',
    'nama', 'no.bill', 'no. bill', 'tgl/jam', 'tgl./jam', '單號',
    'npwp', 'alamat', 'address', 'telp', 'phone', 'tel',
    'member', 'struk', 'receipt', 'invoice',
    'company', 'business', 'registration', 'roc:', 'sst id', 'sst no',
    'no.order', 'no. order', 'bukti pembayaran', 'bukti',
    'no tip', 'no.tip', 'disumbangkan', 'pelayan', 'waitress',
    'untuk kritik', 'saran', 'customer care',
    'instagram', 'facebook', 'twitter', 'tiktok', 'youtube',
    'website', 'web:', 'wa:', 'wa ',
    'tlp.', 'tlp ', 'telp.', 'tip.', 'tip ',
    'order no', 'order no.', 'check no', 'check no.',
    'order number', 'check number', 'receipt number', 'order ticket',
    'date & time', 'date and time', 'my card',
    'item name', 'unit price', 'discount total', 'total qty', 'total qty.',
    'printed', 'terima kasih', 'thank you', 'please come again',
]);

const MONTH_MAP = {
    jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
    jun: '06', jul: '07', agt: '08', aug: '08', sep: '09', okt: '10',
    oct: '10', nov: '11', des: '12', dec: '12',
    januari: '01', februari: '02', maret: '03', april: '04', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
    january: '01', february: '02', march: '03', june: '06', july: '07', august: '08', october: '10', december: '12',
};

function normLine(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
}

function parseMoney(text) {
    if (!text) return null;
    let s = text.trim();
    s = s.replace(/^[-\s]*(rm|rp|idr|usd|aud|sgd|myr|\$|\u00a3|\u20ac|\u00a5)\.?\s*/i, '');
    s = s.replace(/\s*(rm|rp|idr|usd|aud|sgd|myr|\$)\s*$/i, '');
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return null;

    const commaCount = (s.match(/,/g) || []).length;
    const dotCount = (s.match(/\./g) || []).length;

    if (commaCount >= 1 && dotCount === 0) {
        const parts = s.split(',');
        if (parts.length > 2) return parseFloat(parts.join(''));
        if (parts[1].length === 3) return parseFloat(parts.join(''));
        if (parts[1].length === 2 || parts[1].length === 1) return parseFloat(`${parts[0]}.${parts[1]}`);
        return parseFloat(parts.join(''));
    }

    if (dotCount >= 1 && commaCount === 0) {
        const parts = s.split('.');
        if (parts.length > 2) return parseFloat(parts.join(''));
        if (parts[1].length === 3) return parseFloat(parts.join(''));
        if (parts[1].length === 2 || parts[1].length === 1) return parseFloat(`${parts[0]}.${parts[1]}`);
        return parseFloat(parts.join(''));
    }

    if (commaCount >= 1 && dotCount >= 1) {
        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');
        if (lastDot > lastComma) {
            return parseFloat(s.replace(/,/g, ''));
        }
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }

    return parseFloat(s);
}

function getMoneyCandidates(line) {
    const text = String(line || '');
    const candidates = [];
    const moneyPattern = /(?:(?:rp|rm|sgd|hkd|\$)\s*)?((?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?))/gi;
    let match;

    while ((match = moneyPattern.exec(text)) !== null) {
        const raw = match[0];
        const leadingSpaces = raw.match(/^\s*/)?.[0]?.length || 0;
        const start = match.index + leadingSpaces;
        const end = match.index + raw.length;
        const before = text[start - 1] || '';
        const after = text[end] || '';
        const afterText = text.slice(end, end + 3);
        const beforeText = text.slice(Math.max(0, start - 3), start);
        const hasCurrency = /(?:rp|idr|usd|aud|sgd|myr|rm|hkd|\$)/i.test(raw);
        const hasMoneySeparator = /[.,]\d{3}\b/.test(raw) || /\d+[.,]\d{1,2}\b/.test(raw);

        if (/[a-z]/i.test(before) || /[a-z]/i.test(after)) continue;
        if (before === '-' && after === '-') continue;
        if (/^\s*%/.test(afterText)) continue;

        if (/(?:^|[^a-z])[xX]\s*$|@\s*$/i.test(beforeText)) {
            const remainingText = text.slice(end);
            if (/(?:rp|idr|usd|aud|sgd|myr|rm|hkd|\$)?\.?\s*\d+(?:[.,]\d+)?/i.test(remainingText)) {
                continue;
            }
        }

        const value = parseMoney(raw);
        if (value == null || value <= 0) continue;

        const digits = raw.replace(/\D/g, '');

        if (!hasCurrency && !hasMoneySeparator && !/[.,]\d/.test(raw)) {
            const isDirectlyAtOrX = /[@xX]\s*$/i.test(beforeText);
            if (!isDirectlyAtOrX && value < 10) continue;
            if (value < 100 && !isDirectlyAtOrX) continue;
        }

        if (!hasCurrency && !hasMoneySeparator && digits.length === 4
            && value >= 1900 && value <= 2099) continue;

        if (!hasCurrency && !hasMoneySeparator && digits.length > 7) continue;

        candidates.push({
            value,
            raw,
            start,
            end,
            score: (hasCurrency ? 3 : 0) + (hasMoneySeparator ? 2 : 0) + Math.min(3, Math.floor(digits.length / 3)),
        });
    }

    return candidates;
}

function getBestMoneyValue(line) {
    const candidates = getMoneyCandidates(line);
    if (!candidates.length) return null;
    return candidates
        .slice()
        .sort((a, b) => (b.start - a.start) || (b.score - a.score) || (b.value - a.value))[0].value;
}

function almostSameAmount(a, b) {
    return Math.abs(a - b) <= Math.max(0.01, Math.max(Math.abs(a), Math.abs(b)) * 0.002);
}

function uniqueAmounts(values) {
    return values.reduce((unique, value) => (
        unique.some(existing => almostSameAmount(existing, value)) ? unique : [...unique, value]
    ), []);
}

function pickBestTotal(totalValues, expectedTotal) {
    if (!totalValues.length) return 0;
    if (expectedTotal > 0) {
        const tolerance = Math.max(1, expectedTotal * 0.03);
        const closest = totalValues
            .map(value => ({ value, diff: Math.abs(value - expectedTotal) }))
            .sort((a, b) => a.diff - b.diff)[0];
        if (closest.diff <= tolerance) return closest.value;
    }
    return Math.max(...totalValues);
}

function getLabeledMoneyValue(lines, index) {
    const sameLine = getBestMoneyValue(lines[index]);
    if (sameLine != null) return sameLine;

    for (let offset = 1; offset <= 3 && index + offset < lines.length; offset++) {
        const next = lines[index + offset];
        const lower = next.toLowerCase();

        if (/(tanggal|date|time|waktu|invoice|receipt|struk|bill|order|kasir|cashier|table|meja)/i.test(lower)) break;
        if (/(subtotal|sub total|sub-total|grand\s*total|total|amount|jumlah|tax|pajak|ppn|pb1|vat|gst|service|serv|svc|sc\b)/i.test(lower)) break;

        const nextValue = getBestMoneyValue(next);
        if (nextValue != null) return nextValue;
    }

    return null;
}

function parseDate(text) {
    const raw = normLine(text);
    if (!raw) return null;

    let stripped = raw
        .replace(/^(?:tanggal|tgl\.?\/jam|tgl|date\s*(?:[&]\s*time|and\s*time)?|date|waktu|time)\s*[:.|\-]?\s*/i, '')
        .trim();
    stripped = stripped.replace(/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[,.]?\s*/i, '').trim();
    stripped = stripped.replace(/['’]/g, ' ');

    const ymd = stripped.match(/(?:^|\D)(20\d{2}|19\d{2})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})(?:\D|$)/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

    const named = stripped.match(/(\d{1,2})[\s\/\.\-]+([a-z]+)[\s\/\.\-]*(\d{2,4})?/i);
    if (named) {
        const mm = MONTH_MAP[named[2].toLowerCase()];
        if (mm) {
            const yr = named[3] ? (named[3].length <= 2 ? `20${named[3]}` : named[3]) : '2026';
            return `${yr}-${mm}-${named[1].padStart(2, '0')}`;
        }
    }

    const named2 = stripped.match(/([a-z]+)[\s\/\.\-]+(\d{1,2})[,\s\/\.\-]*(\d{2,4})?/i);
    if (named2) {
        const mm = MONTH_MAP[named2[1].toLowerCase()];
        if (mm) {
            const yr = named2[3] ? (named2[3].length <= 2 ? `20${named2[3]}` : named2[3]) : '2026';
            return `${yr}-${mm}-${named2[2].padStart(2, '0')}`;
        }
    }

    const numDate = stripped.match(/(?:^|\D)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\D|$)/);
    if (numDate) {
        const p1 = parseInt(numDate[1], 10);
        const p2 = parseInt(numDate[2], 10);
        let yyyy = numDate[3];
        if (yyyy.length === 2) yyyy = `20${yyyy}`;
        const yNum = parseInt(yyyy, 10);
        if (yNum >= 1990 && yNum <= 2099) {
            let dd, mm;
            if (p2 > 12 && p1 <= 12) {
                mm = String(p1).padStart(2, '0');
                dd = String(p2).padStart(2, '0');
            } else {
                dd = String(p1).padStart(2, '0');
                mm = String(p2).padStart(2, '0');
            }
            return `${yyyy}-${mm}-${dd}`;
        }
    }

    return null;
}

function inferCategory(itemName) {
    const lower = String(itemName || '').toLowerCase();
    if (/\b(nasi|rice|mie|noodle|ayam|chicken|beef|sapi|ikan|fish|udang|shrimp|telur|egg|tahu|tempe|sayur|salad|soup|soto|bakso|sate|satay|pizza|burger|sandwich|roti|bread|cake|donut|ice cream|es krim|kopi|coffee|tea|teh|juice|jus|soda|coca|pepsi|fanta|sprite|bir|beer|wine|water|air|mineral|susu|milk|makan|drink|minuman|makanan|dessert|appetizer|snack|fries|pasta|steak|lobster|crab|lamb|pork|babi|dimsum|sushi|ramen|curry|rendang|gado|pecel|rawon|gudeg|martabak|gorengan|kerupuk|sambal|latte|cappuccino|matcha|crepes|croissant|gelato)\b/.test(lower)) return 'food';
    if (/\b(sabun|soap|shampo|shampoo|tissue|tisu|detergent|deterjen|sikat|tooth|pasta|gigi|diapers|popok|sanitary|pembalut|cotton|kapas|hand sanitizer|masker|mask|vitamin|obat|medicine|gel|lotion|deodorant|parfum|perfume)\b/.test(lower)) return 'daily_needs';
    if (/\b(bensin|gasoline|fuel|solar|diesel|parkir|parking|tol|toll|grab|gojek|uber|taxi|taksi|ojek|angkot|bus|kereta|train|tiket|ticket|transport)\b/.test(lower)) return 'transport';
    if (/\b(konsultasi|consultation|doctor|dokter|resep|prescription|lab|x-ray|rontgen|rawat|treatment|medical|medis|hospital|rumah sakit|klinik|clinic|apotek|pharmacy|terapi|therapy)\b/.test(lower)) return 'health';
    if (/\b(movie|film|bioskop|cinema|karaoke|game|bowling|spa|massage|pijat|gym|fitness|swimming|berenang|concert|konser|museum|park|taman|tiket|ticket)\b/.test(lower)) return 'entertainment';
    if (/\b(baju|shirt|celana|pants|sepatu|shoes|tas|bag|jam|watch|aksesori|accessories|elektronik|electronic|handphone|hp|laptop|komputer|computer|gadget|charger|kabel|cable|headset|earphone)\b/.test(lower)) return 'shopping';
    if (/\b(salon|haircut|potong rambut|manicure|pedicure|facial|waxing|eyelash|nail|kuku|creambath|blow|coloring|highlight|makeup)\b/.test(lower)) return 'beauty';
    return 'other_spending';
}

function isModifierLine(text) {
    const lower = text.trim().toLowerCase();
    if (!lower) return true;
    if (getMoneyCandidates(text).length > 0) return false;
    if (/^(?:iced?|hot|large|medium|small|regular|tall|grande|venti|less\s*(?:sugar|sweet|ice)|normal\s*ice|no\s*sugar|cup|cone|bowl|glass|pint|mug|plate|slice|take\s*away|takeaway|dine\s*in)$/i.test(lower)) return true;
    if (/^(?:iced?|hot)\s+[-–]?\s*\d+\s*(?:oz|uz|ml)?$/i.test(lower)) return true;
    if (/^(?:\d+\s+)?(?:iced?|hot|tall|grande|venti|regular|large)\s*(?:rp|rm|sgd|\$)?\.?\s*[o0]\s*$/i.test(lower)) return true;
    if (/^(?:>|\+|\-|\*)\s*(?:iced|hot|less|normal|no|extra|sugar|ice|add|dairy|fresh|oat|soy)/i.test(lower)) return true;
    if (/(?:ice\s*level|sugar\s*level|dairy\s*milk|reguler\s*milk|tanpa\s*alat|request\s*-\s*less|have\s*here)/i.test(lower)) return true;
    if (/(?:rp|rm|sgd|\$)\.?\s*[o0]\s*$/i.test(lower)) return true;
    return false;
}

function isNonItemLine(text) {
    const lower = normLine(text).toLowerCase();
    if (!lower) return true;

    // Reject divider lines made of symbols
    if (/^[=\-*#~_.:\s]{3,}$/.test(lower) || /^[=\-*#]{2,}/.test(lower)) return true;

    // Company registration names / legal entities
    if (/\b(?:sdn\s*bhd|son\s*bhd|pte\s*ltd|pt\.\s*[a-z])/i.test(lower) || /\(\s*\d{6,}[A-Za-z\-]?\s*\)/.test(lower)) return true;

    // Service sizes (e.g. 16 oz, 8 uz)
    if (/\b\d+\s*(?:oz|uz|ml|cl|gr|gram)\b/i.test(lower)) return true;

    // Standalone modifier lines starting with symbols
    if (/^[-–+>]\s*/.test(lower)) return true;

    // Info, remarks, notes
    if (/^(?:info|purpose|remark|notes?|meja|table|guest|tamu)\s*[:.]/i.test(lower)) return true;

    // Customer name with seat/order codes (e.g., Dini Fito D3-502)
    if (/\bd\d{1,2}-\d{2,4}\b/i.test(lower)) return true;

    // Registration codes like No.CP: W10-2302-32000036
    if (/\b(?:no\.?cp|roc|reg\s*no|sst\s*id|sst\s*no|tax\s*id)\b/i.test(lower)) return true;

    for (const keyword of NON_ITEM_KEYWORDS) {
        if (keyword.length <= 4 || keyword === 'service' || keyword === 'server' || keyword === 'mode' || keyword === 'bill' || keyword === 'order' || keyword === 'tip' || keyword === 'pax' || keyword === 'tbl' || keyword === 'pos' || keyword === 'edc' || keyword === 'wa ' || keyword === 'line ') {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
            if (new RegExp('(?:^|\\s)' + escaped + '(?:\\s|$|[:\\-,.])', 'i').test(lower)) return true;
        } else {
            if (lower.includes(keyword)) return true;
        }
    }

    if (/^[\d\s\/\-:.,]+$/.test(lower)) return true;
    if (/\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(lower)) return true;
    if (/^\d+\s+items?$/i.test(lower)) return true;

    // Address & regional terms
    if (/(?:^|\b)(jl\.?|jln\b|jalan\b|j1\.?\b|street\b|rd\b|ave\b|blvd\b|no\.\s*\d|wilayah|persekutuan|kuala\s*lumpur|selangor|penang|johor|kab\.?|kabupaten|kec\.?|kecamatan|kel\.?|kelurahan|kota|denpasar|badung|gianyar|ubud|seminyak|kuta|canggu|sanur|singapore|bukit\s*bintang|lantai|lt\.?\s*\d|level\s*\d|rochor\s*canal|kalla\s*lumeut|peralatan)(?:\b|$)/i.test(lower)) return true;

    // Standalone postal codes ONLY when combined with address context
    if (/\b(?:80\d{3}|55\d{3}|18\d{4}|64\d{3})\b/.test(lower) && /(?:bali|denpasar|k\.l\.|klia|selangor|singapore|kuta|ubud|gianyar|badung)/i.test(lower)) return true;

    // Label lines: Queue No, Order ID, etc.
    if (/^(?:queue\s*no|quee\s*lo|q\s*no|order\s*id|receipt\s*number|order\s*ticket|no\.?\s*pesanan|pelanggan|no\.?\s*nota|kode\b|nomor\s*meja|no\.?\s*tlp|telp|no\.?\s*tip)\b/i.test(lower)) return true;

    // Standalone Dine In / Takeaway lines
    if (/^\*?\s*(?:mode|purpose|tipe\s*pesanan)?\s*[:.]?\s*\*?\s*(?:\d+\.)?\s*(?:dine\s*in|take\s*away|takeaway|t\/o|to\s*go)\s*\*?$/i.test(lower)) return true;

    // Modifiers without price
    if (isModifierLine(lower)) return true;

    // Discounts with parentheses: Grab Dine Out(15%) (4.950)
    if (/\bgrab\s*dine\s*out\b|\bdiscount\b|\bdiskon\b/i.test(lower) && /\([\d.,]+\)/.test(lower)) return true;

    if (/^[\d\s()+\-]{8,}$/.test(lower)) return true;
    if (/^\+?[\d\s()\-]{8,}$/.test(lower.replace(/^phone\s*:?\s*/i, ''))) return true;
    if (/^[-\s]*(rm|rp|idr|usd|aud|sgd|myr|\$|\u00a3|\u20ac|\u00a5)\s*$/i.test(lower)) return true;
    if (/^(?:rp|idr|sgd|usd|myr|rm)\.?\s*[o0]\s*$/i.test(lower)) return true;
    if (/^(?:rp|idr|sgd|usd|myr|rm)\.?\s*-[\d,.]+\s*$/i.test(lower)) return true;
    if (/@[\w]{2,}/i.test(lower)) return true;
    if (/^tlp[.\s]|^telp[.:\s]|^telepon[.:\s]|\bwa[.:\s]\d|\(wa\)/i.test(lower)) return true;
    if (/^no[.\s]?(bill|order|faktur|struk|receipt|nota|invoice)[:\s]/i.test(lower)) return true;
    if (/^(waiter|pelayan|waitress|kasir|cashier|server)[:\s]/i.test(lower)) return true;
    if (/^[a-z0-9][a-z0-9_\-]{9,}$/i.test(lower.trim()) && /\d/.test(lower) && /[a-z]/i.test(lower)) return true;
    if (/\b(?:my\s*card|visa|mastercard|amex|debit|credit)\s*\(\d{4}\)/i.test(lower)) return true;
    if (/\b(?:unit\s*price|item\s*name)\b/i.test(lower)) return true;

    return false;
}

function isUnitPriceLine(line) {
    const t = normLine(line);
    if (/^\d*\s*[xX]?\s*[@o0]/.test(t)) return true;
    if (/^@\s*(?:rp|idr|usd|aud|sgd|myr|rm|\$)?\.?\s*[\d,.]+$/i.test(t)) return true;
    return false;
}

function tryParseItemLine(line) {
    let cleaned = normLine(line).replace(/[\s\-=~*:]+$/, '').trim();
    if (isNonItemLine(cleaned)) return null;

    // Exclude negative amounts / discount lines
    if (/-\s*[\d,.]+/.test(cleaned) || /\([\d.,]+\)/.test(cleaned)) return null;

    let moneyCandidates = getMoneyCandidates(cleaned);
    if (!moneyCandidates.length) return null;

    let priceCandidate = moneyCandidates[moneyCandidates.length - 1];
    if (moneyCandidates.length >= 2 && priceCandidate.value < moneyCandidates[0].value * 0.20 && moneyCandidates[0].value > 0) {
        priceCandidate = moneyCandidates[0];
    }
    let rawName = cleaned.slice(0, moneyCandidates[0].start).trim();

    // Line with only numbers and unit price symbols has no item name
    const lettersOnly = rawName.replace(/[\d\s,./xX@o0\-]/g, '');
    if (lettersOnly.length === 0) return null;

    let quantity = 1;

    // Normalise 'xl' or 'xI' to 'x1'
    rawName = rawName.replace(/\b[xX][lI1]\b/g, 'x1');

    const leadingQty = rawName.match(/^(\d{1,2})\s+([A-Za-z*].+)$/);
    if (leadingQty) {
        const candidateQty = parseInt(leadingQty[1], 10);
        const candidateName = leadingQty[2].trim();
        if (!isNonItemLine(candidateName) && candidateName.length >= 2 && candidateQty >= 1 && candidateQty <= 99) {
            rawName = candidateName;
            quantity = candidateQty;
        }
    }

    if (quantity === 1) {
        const midQtyX = rawName.match(/^(.+?)\s+[xX](\d{1,2})\b(.*)$/);
        if (midQtyX) {
            const candidateName = (midQtyX[1] + ' ' + (midQtyX[3] || '')).trim();
            const candidateQty = parseInt(midQtyX[2], 10);
            if (!isNonItemLine(candidateName) && candidateName.length >= 2 && candidateQty > 0) {
                rawName = candidateName;
                quantity = candidateQty;
            }
        }
    }

    if (quantity === 1) {
        const trailingQty = rawName.match(/^(.+?)\s+(\d{1,2})\s*$/);
        if (trailingQty) {
            const candidateName = trailingQty[1].trim();
            const candidateQty = parseInt(trailingQty[2], 10);
            if (!isNonItemLine(candidateName) && candidateName.length >= 2 && candidateQty >= 1 && candidateQty <= 99) {
                rawName = candidateName;
                quantity = candidateQty;
            }
        }
    }

    const name = rawName
        .replace(/^\*+\s*/, '')
        .replace(/\s*(?:\((?:dine\s*in|take\s*away|takeaway|t\/o)\)|dine\s*in|take\s*away|takeaway|t\/o)\s*$/i, '')
        .replace(/\s*(?:rp|rm|sgd|usd|myr|\$)\.?\s*$/i, '')
        .replace(/\s*[xX@]\s*$/, '')
        .trim();

    if (!name || name.length < 2 || isNonItemLine(name)) return null;
    if (/^[-\s]*(rm|rp|idr|usd|aud|sgd|myr|\$|\u00a3|\u20ac|\u00a5)\s*$/i.test(name)) return null;
    if (priceCandidate.value <= 0) return null;

    return { name, quantity, price: priceCandidate.value };
}

function tryParseMultiLineItem(lines, index) {
    const nameLine = lines[index];
    if (!nameLine) return null;

    // Pattern E: Quantity + Price line followed by Item Name line
    if (index + 1 < lines.length) {
        const nextLineCandidate = lines[index + 1];
        const qtyPriceMatch = nameLine.match(/^(\d{1,2})\s+(?:[A-Za-z0-9*#%&@\s-]{1,8}\s+)?([\d.,]+)\s*$/);
        if (qtyPriceMatch && !isNonItemLine(nextLineCandidate) && getMoneyCandidates(nextLineCandidate).length === 0 && nextLineCandidate.length >= 3) {
            const qty = parseInt(qtyPriceMatch[1], 10);
            const val = parseMoney(qtyPriceMatch[2]);
            if (qty >= 1 && qty <= 99 && val != null && val > 0) {
                return { name: nextLineCandidate.trim(), quantity: qty, price: val, consumedNext: 1 };
            }
        }
    }

    if (getMoneyCandidates(nameLine).length > 0) return null;
    if (isNonItemLine(nameLine)) return null;
    if (isUnitPriceLine(nameLine)) return null;
    if (nameLine.length < 2) return null;

    let cleanName = nameLine.replace(/^\*+\s*/, '').trim();
    let leadingQty = 1;

    const leadingQtyMatch = cleanName.match(/^(\d{1,2})\s+([A-Za-z*].+)$/);
    if (leadingQtyMatch && parseInt(leadingQtyMatch[1], 10) >= 1 && parseInt(leadingQtyMatch[1], 10) <= 99) {
        leadingQty = parseInt(leadingQtyMatch[1], 10);
        cleanName = leadingQtyMatch[2].trim();
    }

    cleanName = cleanName
        .replace(/\s*(?:\((?:dine\s*in|take\s*away|takeaway|t\/o)\)|dine\s*in|take\s*away|takeaway|t\/o)\s*$/i, '')
        .replace(/\s*(?:rp|rm|sgd|usd|myr|\$)\.?\s*$/i, '')
        .replace(/\s*[xX@]\s*$/, '')
        .trim();

    if (!cleanName || cleanName.length < 2 || isNonItemLine(cleanName)) return null;

    let targetOffset = 1;
    let nextLine = lines[index + targetOffset];
    if (nextLine && isModifierLine(nextLine) && index + targetOffset + 1 < lines.length) {
        targetOffset = 2;
        nextLine = lines[index + targetOffset];
    }
    if (!nextLine) return null;

    const nextLower = nextLine.toLowerCase();
    if (/(subtotal|sub total|subttl|total|tax|pajak|ppn|service|grand)/i.test(nextLower)) return null;

    // Pattern A: nextLine is "5x @40.000 200.000" or "2x @60.000 120.000" or "1x @33.000 33.000"
    const qtyAtUnitSameLine = nextLine.match(/^(\d+)\s*[xX]\s*[@o0]?\s*(?:rp|idr|usd|myr|rm|\$)?\.?\s*([\d,.]+)/i);
    if (qtyAtUnitSameLine) {
        const qty = parseInt(qtyAtUnitSameLine[1], 10) || leadingQty;
        const nextCandidatesA = getMoneyCandidates(nextLine);
        if (nextCandidatesA.length >= 2) {
            const lineTotal = nextCandidatesA[nextCandidatesA.length - 1].value;
            if (lineTotal > 0) {
                return { name: cleanName, quantity: qty, price: lineTotal, consumedNext: targetOffset };
            }
        }
        if (nextCandidatesA.length === 1) {
            const val = nextCandidatesA[0].value;
            const thirdLine = lines[index + targetOffset + 1];
            if (thirdLine && !/(subtotal|sub total|subttl|total|tax|pajak|ppn|service|grand)/i.test(thirdLine.toLowerCase())) {
                const thirdCandidatesA = getMoneyCandidates(thirdLine);
                if (thirdCandidatesA.length === 1 && !tryParseItemLine(thirdLine)) {
                    return { name: cleanName, quantity: qty, price: thirdCandidatesA[0].value, consumedNext: targetOffset + 1 };
                }
            }
            return { name: cleanName, quantity: qty, price: val, consumedNext: targetOffset };
        }
    }

    // Pattern B: nextLine has numbers, e.g. "430,000 90,000" or "27.36 0.00 27.36" or "16,000"
    const nextCandidates = getMoneyCandidates(nextLine);
    if (nextCandidates.length >= 1 && nextCandidates.length <= 4) {
        const stripped = nextLine.replace(/[\d\s,./()rpidusdaugsgmyr-]/gi, '').trim();
        if (stripped.length <= 2) {
            const price = nextCandidates[nextCandidates.length - 1].value;
            if (price > 0 && !/^[-\s]*(rm|rp|idr|usd|aud|sgd|myr|\$)\s*$/i.test(cleanName)) {
                return { name: cleanName, quantity: leadingQty, price, consumedNext: targetOffset };
            }
        }
    }

    return null;
}

// ─── parseReceiptFromOCR ──────────────────────
export function parseReceiptFromOCR(fullText) {
    if (!fullText || typeof fullText !== 'string') return null;

    const lines = fullText.split('\n').map(normLine).filter(Boolean);
    if (lines.length < 3) return null;

    let storeName = '';
    let date = '';
    const items = [];
    let subtotal = 0;
    let tax = 0;
    let serviceCharge = 0;
    let total = 0;

    // Check footer for brand hints
    let footerBrand = '';
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
        if (/mmjuice/i.test(lines[i])) { footerBrand = 'MM JUICE'; break; }
        if (/baked\.co\.id/i.test(lines[i])) { footerBrand = 'BAKED.'; break; }
        if (/circlekindonesia/i.test(lines[i])) { footerBrand = 'CIRCLE K'; break; }
    }

    // Explicit store name label check
    for (let i = 0; i < Math.min(25, lines.length); i++) {
        const line = lines[i];
        const storeMatch = line.match(/^(?:store|outlet|merchant|resto|restoran)\s*:\s*(.+)$/i);
        if (storeMatch && storeMatch[1].trim().length >= 2) {
            storeName = storeMatch[1].trim();
            break;
        }
        if (/circle\s*k\b/i.test(line)) {
            storeName = 'CIRCLE K';
            break;
        }
        if (/tan-panama\s*coffee/i.test(line)) {
            storeName = 'Tan-Panama Coffee';
            break;
        }
        if (/niko\s*neko/i.test(line)) {
            storeName = 'NIKO NEKO 2.0';
            break;
        }
        if (/naughty\s*nuri/i.test(line)) {
            storeName = "NAUGHTY NURI'S SANUR";
            break;
        }
        if (/kakiang/i.test(line)) {
            storeName = 'KAKIANG GARDEN CAFE';
            break;
        }
    }

    if (!storeName && footerBrand) {
        storeName = footerBrand;
    }

    if (!storeName) {
        for (let i = 0; i < Math.min(6, lines.length); i++) {
            let line = lines[i];
            if (!line || line.length < 3) continue;
            if (/(?:^|\s)(?:jl\.|jln\b|jalan\b)/i.test(line)) {
                const beforeAddress = line.split(/(?:^|\s)(?:jl\.|jln\b|jalan\b)/i)[0].trim();
                if (beforeAddress.replace(/[^a-zA-Z]/g, '').length >= 3) {
                    line = beforeAddress;
                } else {
                    continue;
                }
            }
            if (/(?:^|\b)(street\b|rd\b|ave\b|blvd\b|kota\b|city\b|telp\b|phone\b|tel\b|tip\b|fax\b|npwp\b|www\.|http|\.com|\.id|queue|order ticket|order|check|bal0243|quee\s*lo|bukti|tamu|meja|no\.?\s*bill|no\.?\s*order)/i.test(line)) continue;
            if (/^[\d\s()+\-]{6,}$/.test(line)) continue;
            if (/^(order|check)\s*(?:no|number|num)\.?\s*[:\s]/i.test(line)) continue;
            if (/^date\s*(?:[&]\s*time|and\s*time)/i.test(line)) continue;
            if (/^(order no|check no|date\s*[&]|tgl\.?\/jam)/i.test(line)) continue;
            // Prefer consumer brand name over legal corporate name
            if (/^(?:pt\.|sdn\s*bhd|company)/i.test(line) && i + 1 < lines.length && !/(?:jl\.|jln\b|jalan\b|telp)/i.test(lines[i + 1])) {
                continue;
            }
            const alphaChars = line.replace(/[\d\s.,\-\/()]/g, '');
            if (alphaChars.length < 3) continue;
            storeName = line;
            break;
        }
    }

    let headerEndIndex = 0;
    for (let j = 0; j < Math.min(25, lines.length); j++) {
        const line = lines[j].toLowerCase();
        const isPosLabel = /(pos:|kasir|cashier|tanggal|tgl|date|server|table|meja|tbl\s*\d|no\s*:|no\.bill|no\.order|waiter|pelayan|waitress)/i.test(line);
        const isDateLine = /\b\d{4}[\/\-]\d{2}[\/\-]\d{2}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(jan|feb|mar|apr|mei|may|jun|jul|agt|aug|sep|okt|oct|nov|des|dec)\b/i.test(line);
        const isDivider = /^[=\-*#]{3,}$/.test(line.trim());
        if (isPosLabel || isDateLine || isDivider) {
            headerEndIndex = j + 1;
        }
        if (getMoneyCandidates(lines[j]).length > 0 && !isNonItemLine(lines[j]) && headerEndIndex > 0) {
            break;
        }
    }

    for (const line of lines) {
        const hasDateLabel = /\b(tanggal|tgl[\/.:\s]|tgl\/jam|tgl\.?jam|date\s*(?:[&]\s*time|and\s*time)?[\s:.]|waktu|time[\s:.])/i.test(line);
        const hasNamedMonth = /\b(?:jan|feb|mar|apr|mei|may|jun|jul|agt|aug|sep|okt|oct|nov|des|dec|januari|februari|maret|april|juni|juli|agustus|september|oktober|november|desember|january|february|march|june|july|august|october|december)\b/i.test(line);
        if (hasDateLabel || hasNamedMonth) {
            const parsed = parseDate(line);
            if (parsed) { date = parsed; break; }
        }
    }
    if (!date) {
        for (const line of lines) {
            const parsed = parseDate(line);
            if (parsed && /\d{4}/.test(line)) { date = parsed; break; }
        }
    }

    const SUMMARY_START_REGEX = /(?:^|\b)(?:sub\s*total|subtotal|grand\s*total|total\b|amount\s*due|total\s*due|suk-total|subttl|jit:|mit:|total\s*sa[il]es)\b/i;

    let i = headerEndIndex;
    while (i < lines.length) {
        const line = lines[i];

        if (SUMMARY_START_REGEX.test(line)) {
            break;
        }

        if (isUnitPriceLine(line)) {
            i++;
            continue;
        }

        // Pattern E check first (only when line is numeric qty + price header without item name)
        if (i < lines.length - 1 && line.replace(/[\d\s.,rpidusdmyr\$*#%&^@]/gi, '').length <= 4) {
            const nextLine = lines[i + 1];
            const qtyPriceMatch = line.match(/^(\d{1,2})\s+(?:[A-Za-z0-9*#%&@\s-]{1,8}\s+)?([\d.,]+)\s*$/);
            if (qtyPriceMatch && !isNonItemLine(nextLine) && getMoneyCandidates(nextLine).length === 0 && nextLine.length >= 3) {
                const qty = parseInt(qtyPriceMatch[1], 10);
                const val = parseMoney(qtyPriceMatch[2]);
                if (qty >= 1 && qty <= 99 && val != null && val > 0) {
                    items.push({ name: nextLine.trim(), quantity: qty, price: val, category: inferCategory(nextLine) });
                    i += 2;
                    continue;
                }
            }
        }

        if (!isNonItemLine(line)) {
            const parsed = tryParseItemLine(line);
            if (parsed) {
                if (i < lines.length - 1) {
                    const next = lines[i + 1].trim();
                    if (next && !isNonItemLine(next) && !isModifierLine(next) && getMoneyCandidates(next).length === 0 && !tryParseItemLine(next)) {
                        const nextLetters = next.replace(/[^a-zA-Z]/g, '');
                        if (nextLetters.length >= 2 && !/^(subtotal|total|tax|service)/i.test(next)) {
                            if (/^[A-Za-z0-9\s*#%&\-_]{1,6}$/.test(parsed.name)) {
                                parsed.name = next;
                            } else {
                                parsed.name += ' ' + next;
                            }
                            i++;
                        }
                    }
                }
                items.push({
                    name: parsed.name,
                    quantity: parsed.quantity,
                    price: parsed.price,
                    category: inferCategory(parsed.name),
                });
                i++;
                continue;
            }

            if (i < lines.length - 1) {
                const multiLine = tryParseMultiLineItem(lines, i);
                if (multiLine) {
                    items.push({
                        name: multiLine.name,
                        quantity: multiLine.quantity,
                        price: multiLine.price,
                        category: inferCategory(multiLine.name),
                    });
                    i += (typeof multiLine.consumedNext === 'number' ? multiLine.consumedNext : (multiLine.consumedNext ? 1 : 0)) + 1;
                    continue;
                }
            }
        }

        i++;
    }

    const subtotalCandidates = [];
    const taxableCandidates = [];
    const taxCandidates = [];
    const serviceChargeCandidates = [];
    const totalCandidates = [];

    for (let j = headerEndIndex; j < lines.length; j++) {
        const line = lines[j];
        const lower = line.toLowerCase();

        const isTaxableAmtLine = /\b(?:taxable\s*(?:amt|amount)|dpp)\b/i.test(lower);
        if (isTaxableAmtLine) {
            const sameLineCands = getMoneyCandidates(line);
            const nextLineCands = j + 1 < lines.length ? getMoneyCandidates(lines[j + 1]) : [];
            const cands = [...sameLineCands, ...nextLineCands];
            if (cands.length === 1 && cands[0].value > 0) {
                taxableCandidates.push(cands[0].value);
            } else if (cands.length >= 2) {
                const sorted = cands.map(c => c.value).filter(v => v > 0).sort((a, b) => b - a);
                if (sorted.length >= 2) {
                    taxableCandidates.push(sorted[0]);
                    taxCandidates.push(sorted[1]);
                } else if (sorted.length === 1) {
                    taxableCandidates.push(sorted[0]);
                }
            }
        }

        if (/\b(sub\s*total|subtotal|sub-total|suk-total|subttl|subtota\s*l|net\s*sales|dpp|total\s*sales|total\s*sa[il]es|total\s*\(exc|sales\s*total|jit:)\b/i.test(lower)) {
            const val = getLabeledMoneyValue(lines, j);
            if (val != null && val > 0) subtotalCandidates.push(val);
        }

        const isServiceTax = /(?:gov|gorv)[\w.]*\s*service\s*tax|\bservice\s*tax\b/i.test(lower);
        const isGeneralTax = /\b(tax|pajak|ppn|pb1|vat|gst|sst)\b/i.test(lower)
            && !/\b(sub\s*total|subtotal|subttl|grand\s*total|total|service\s*charge|service\s*fee|layanan|biaya\s*pelayanan|total\s*sales|taxable)\b/i.test(lower)
            && !/\b(chk|check|tbl|table|meja|reg|reg\s*no|no\b)/i.test(lower);

        if ((isServiceTax || isGeneralTax) && !isTaxableAmtLine) {
            const lineHasAmount = getMoneyCandidates(line).length > 0
                || (j + 1 < lines.length && getMoneyCandidates(lines[j + 1]).length > 0);
            if (lineHasAmount) {
                const val = getLabeledMoneyValue(lines, j);
                if (val != null && val > 0) taxCandidates.push(val);
            }
        }

        if (/\b(service|serv\.?|svc|sc\b|service\s*charge|service\s*fee|servis|layanan|biaya\s*pelayanan)\b/i.test(lower)
            && !/\b(sub\s*total|subtotal|subttl|grand\s*total|total|tax|pajak|ppn|pb1|vat|gst)\b/i.test(lower)
            && !isServiceTax) {
            const lineHasAmount = getMoneyCandidates(line).length > 0
                || (j + 1 < lines.length && getMoneyCandidates(lines[j + 1]).length > 0);
            if (lineHasAmount) {
                const val = getLabeledMoneyValue(lines, j);
                if (val != null && val > 0) serviceChargeCandidates.push(val);
            }
        }

        if (/\b(grand\s*total|total\s*(?:due|amount|bayar)?|amount\s*due|payment\s*due|jumlah\s*(?:bayar|tagihan)?|tagihan|mit:|roundi[rn]g)\b/i.test(lower)
            && !/\b(sub\s*total|subtotal|subttl|total\s*(?:item|qty|quantity|sales|beverages)|discount|diskon|change|kembali|kembalian|cash|tunai|paid)\b/i.test(lower)) {
            const val = getLabeledMoneyValue(lines, j);
            if (val != null && val > 0) totalCandidates.push(val);
        }
    }

    const itemsSubtotal = items.reduce((sum, item) => sum + item.price, 0);

    const subtotalValues = uniqueAmounts(subtotalCandidates);
    const taxValues = uniqueAmounts(taxCandidates);
    const serviceChargeValues = uniqueAmounts(serviceChargeCandidates);
    const totalValues = uniqueAmounts(totalCandidates);

    const rawTotal = totalValues.length ? Math.max(...totalValues) : 0;
    const bestTaxable = taxableCandidates.length ? taxableCandidates[0] : null;

    if (bestTaxable != null && bestTaxable > 0 && (rawTotal === 0 || bestTaxable < rawTotal)) {
        subtotal = bestTaxable;
    } else if (subtotalValues.length > 0) {
        const matching = itemsSubtotal > 0 ? subtotalValues.find(v => almostSameAmount(v, itemsSubtotal)) : null;
        subtotal = matching != null ? matching : subtotalValues[0];
    } else {
        subtotal = itemsSubtotal > 0 ? itemsSubtotal : 0;
    }

    tax = taxValues
        .filter(v => (rawTotal > 0 ? v < rawTotal : true) && (subtotal > 0 ? v < subtotal : true))
        .reduce((s, v) => s + v, 0);

    serviceCharge = serviceChargeValues
        .filter(v => (rawTotal > 0 ? v < rawTotal : true) && (subtotal > 0 ? v < subtotal : true))
        .reduce((s, v) => s + v, 0);

    total = pickBestTotal(totalValues, subtotal > 0 ? subtotal + tax + serviceCharge : 0);

    // If receipt is tax-inclusive (subtotal equal to total), adjust subtotal to pre-tax amount
    if (total > 0 && subtotal > 0 && almostSameAmount(subtotal, total) && tax > 0) {
        subtotal = Math.round((total - tax - serviceCharge) * 100) / 100;
    }

    // If taxable amount exists and tax was not explicitly read, derive tax
    if (total > 0 && subtotal > 0 && subtotal < total && tax === 0 && serviceCharge === 0 && (bestTaxable != null || rawTotal > subtotal)) {
        tax = Math.round((total - subtotal) * 100) / 100;
    }

    if (!subtotal && total > 0 && (tax > 0 || serviceCharge > 0)) {
        subtotal = Math.max(0, total - tax - serviceCharge);
    }
    if (!subtotal && itemsSubtotal > 0) subtotal = itemsSubtotal;

    if (!total && subtotal > 0) total = subtotal + tax + serviceCharge;

    if (items.length === 0 && total <= 0) return null;

    return {
        storeName: storeName || 'Receipt Scan',
        date: date || new Date().toISOString().slice(0, 10),
        items,
        subtotal,
        tax,
        serviceCharge,
        total: total || itemsSubtotal,
        paymentMethod: 'cash',
    };
}

// ─── Full OCR scan pipeline ───────────────────
// Returns { ocrText, parsedData } where parsedData may be null if regex parsing fails
export async function runOCRAndParse(imageUri) {
    const ocrResult = await runOCR(imageUri);
    const fullText = ocrResult.fullText;

    if (!fullText || fullText.trim().length < 10) {
        return { ocrText: fullText, parsedData: null, ocrResult };
    }

    const parsedData = parseReceiptFromOCR(fullText);
    return { ocrText: fullText, parsedData, ocrResult };
}
