// OCR Service - Cross-platform on-device text recognition
// iOS: Apple Vision framework (VNRecognizeTextRequest)
// Android: Google ML Kit Text Recognition
//
// Inspired by: https://github.com/AnastasiiaDesiateryk/receiptMobileApp-react-native-ocr

import { Platform, NativeModules } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';

// ─── Native module access ─────────────────────
function getOCRModule() {
    const mod = NativeModules.ReceiptOCRModule;
    if (!mod?.recognizeText) {
        return null;
    }
    return mod;
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
function reconstructFullTextFromBlocks(blocks) {
    if (!blocks || blocks.length === 0) return '';

    // Calculate center coordinates
    const items = blocks.map(b => {
        return {
            text: b.text.trim(),
            cx: b.bbox.x + (b.bbox.w / 2),
            cy: b.bbox.y + (b.bbox.h / 2),
            h: b.bbox.h
        };
    }).filter(i => i.text.length > 0);

    // Sort vertically
    items.sort((a, b) => a.cy - b.cy);

    const rows = [];
    let currentRow = [];

    for (const item of items) {
        if (currentRow.length === 0) {
            currentRow.push(item);
        } else {
            const rowCy = currentRow[0].cy;
            // Two blocks belong to the same line if their vertical centers are within half their height of each other
            const threshold = Math.max(currentRow[0].h, item.h) * 0.5;

            if (Math.abs(item.cy - rowCy) <= threshold) {
                currentRow.push(item);
            } else {
                rows.push(currentRow);
                currentRow = [item];
            }
        }
    }
    if (currentRow.length > 0) {
        rows.push(currentRow);
    }

    // Sort horizontally within each row and join
    const lines = rows.map(row => {
        row.sort((a, b) => a.cx - b.cx);
        return row.map(i => i.text).join(' ');
    });

    return lines.join('\n');
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

// Keywords that mark a line as a summary/footer row — not a purchasable item.
// Checked as whole-word substring matches (case-insensitive).
const NON_ITEM_KEYWORDS = new Set([
    // Totals / summary
    'subtotal', 'sub total', 'sub-total',
    'dpp', 'net sales', 'total sales',
    'service', 'service charge',
    'tax', 'pajak', 'ppn', 'pb1', 'vat', 'gst',
    'sst',          // Malaysia Sales & Service Tax (e.g. "SST (6.00%)")
    'total', 'grand total', 'amount', 'jumlah',
    'rounding', 'pembulatan',
    'discount', 'diskon', 'tip',
    '總數', '小計', '淨值', // Chinese totals
    // Payment methods / change
    'bayar', 'cash', 'tunai', 'voucher', 'kembalian', 'change',
    'payment', 'pembayaran', 'debit', 'credit', 'kartu',
    'paid', 'balance', 'due', 'tendered', 'card', 'ref', 'auth', 'visa', 'mastercard', 'amex', 'terminal', 'merchant',
    '現金', '找續', '八達通', // Chinese payments
    'edc',          // EDC payment terminal (e.g. "EDC MANDIRI")
    'duitnow', 'fpx', 'ewallet', 'e-wallet', 'ovo', 'gopay', 'dana', 'shopeepay',  // e-wallets
    // Restaurant / POS metadata
    'meja', 'table', 'tbl', 'no meja', 'no.meja',  // table number
    'pax',          // party size (e.g. "PAX: 3")
    'server',       // waiter name
    'mode',         // service mode (e.g. "TAKEAWAY")
    'kasir', 'cashier', 'pos', 'pos:',
    'order', 'bill', 'waiter',
    'guest', 'tamu',
    'jam masuk', 'jam keluar',    // time in/out
    'quick service', 'takeaway', 'dine in',
    'register',     // "Register #: 3"
    // Item count summary lines
    'total item', 'total qty', 'total quantity',
    // (do NOT add bare 'item' here — too broad, blocks real item lines)
    // Header / store meta
    'nama', 'no.bill', 'no. bill', 'tgl/jam', 'tgl./jam',
    '單號', // Chinese order no
    'npwp', 'alamat', 'address', 'telp', 'phone', 'tel',
    'member', 'struk', 'receipt', 'invoice',
    'company', 'business', 'registration',  // e.g. "Business Registration Number"
    'sst id', 'sst no',                     // Malaysian SST tax ID lines
    // Indonesian restaurant-specific POS metadata
    'no.order', 'no. order', 'no.bill', 'no. bill',
    'bukti pembayaran', 'bukti',            // "BUKTI PEMBAYARAN" = Payment Receipt
    'no tip', 'no.tip',                     // "No.Tip" = Tip number (POS)
    'disumbangkan',                         // donated/discarded amount
    'pelayan', 'waiter', 'waitress',        // waiter name line
    'untuk kritik', 'saran',                // feedback request footer
    'customer care',                        // customer care line
    // Social media / contact footer
    'instagram', 'facebook', 'twitter', 'tiktok', 'youtube', 'line ',
    'website', 'web:', 'wa:', 'wa ',        // WhatsApp footer
    'tlp.', 'tlp ', 'telp.',               // phone prefix (Indonesian)
    // Digital receipt / app receipt labels
    'order no', 'order no.', 'check no', 'check no.',
    'order number', 'check number',
    'date & time', 'date and time', 'date & time',
    'my card',                              // e.g. "My Card (7108)" payment line
    'item name',                            // table column header
    'unit price',                           // table column header
    'discount total',                       // Starbucks "Discount Total"
    'total qty', 'total qty.',              // Starbucks "Total Qty."
    // Footer
    'printed',          // "Printed Mar 17, 2025"
    'terima kasih', 'thank you', 'thanks',
    'see you', 'please come',
    'email', 'www.', 'http',
    'cashback', 'scan to',  // cashback QR section
    'sst summary',          // SST summary table footer
]);

const MONTH_MAP = {
    jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
    jun: '06', jul: '07', agt: '08', aug: '08', sep: '09',
    okt: '10', oct: '10', nov: '11', des: '12', dec: '12',
    januari: '01', februari: '02', maret: '03', april: '04',
    juni: '06', juli: '07', agustus: '08', september: '09',
    oktober: '10', november: '11', desember: '12',
    january: '01', february: '02', march: '03', june: '06',
    july: '07', august: '08', october: '10', december: '12',
};

// ─── Parse helpers ────────────────────────────
function normLine(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

// ─── parseMoney ───────────────────────────────
// Converts a raw OCR number string to a JS number.
// Handles: comma-thousands (75,000), dot-thousands (75.000),
//          space-thousands (75 000), mixed (1,234.56 / 1.234,56),
//          simple decimal (5.50 / 5,50), plain integer (75000).
function parseMoney(raw) {
    if (!raw) return null;

    // Strip currency symbols, preserve internal spaces
    const withoutCurrency = String(raw)
        .replace(/(?:rp|idr|usd|aud|sgd|myr)\.?\s*/ig, '')
        .replace(/[^\d,.\-\s]/g, '')
        .trim();

    if (!withoutCurrency) return null;

    // Space-separated thousands: "75 000", "1 234 567"
    // Must be: digits, then one or more groups of exactly 3 digits separated by a single space.
    const spaceThousands = withoutCurrency.match(/^(\d{1,3}(?:\s\d{3})+)$/);
    if (spaceThousands) {
        return parseInt(spaceThousands[1].replace(/\s/g, ''), 10);
    }

    // Strip spaces for remaining patterns
    const cleaned = withoutCurrency.replace(/\s/g, '');
    if (!cleaned) return null;

    // 75,000 or 1,234,567 — comma-thousands
    const thousandsComma = cleaned.match(/^(\d{1,3}(?:,\d{3})+)$/);
    if (thousandsComma) return parseFloat(thousandsComma[1].replace(/,/g, ''));

    // 75.000 or 1.234.567 — dot-thousands
    const thousandsDot = cleaned.match(/^(\d{1,3}(?:\.\d{3})+)$/);
    if (thousandsDot) return parseFloat(thousandsDot[1].replace(/\./g, ''));

    // 1,234.56 — comma-thousands, dot-decimal
    const mixedCommaDot = cleaned.match(/^(\d{1,3}(?:,\d{3})*\.\d{1,2})$/);
    if (mixedCommaDot) return parseFloat(mixedCommaDot[1].replace(/,/g, ''));

    // 1.234,56 — dot-thousands, comma-decimal
    const mixedDotComma = cleaned.match(/^(\d{1,3}(?:\.\d{3})*,\d{1,2})$/);
    if (mixedDotComma) return parseFloat(mixedDotComma[1].replace(/\./g, '').replace(',', '.'));

    // 5.50 or 5,50 — simple decimal (exactly 1 or 2 decimal digits)
    const simpleDecimal = cleaned.match(/^(\d+)[.,](\d{1,2})$/);
    if (simpleDecimal) return parseFloat(`${simpleDecimal[1]}.${simpleDecimal[2]}`);

    // Plain integer
    const plainInt = cleaned.match(/^(\d+)$/);
    if (plainInt) return parseInt(plainInt[1], 10);

    return null;
}

// ─── getMoneyCandidates ───────────────────────
// Scans a line for all plausible monetary tokens and returns them with metadata.
// Supports: comma/dot/space thousands, explicit currency prefixes.
function getMoneyCandidates(line) {
    const text = String(line || '');
    const candidates = [];

    // Pattern covers (most-specific first to avoid partial matches):
    //   1. Currency-prefixed with thousands: "Rp 75.000", "IDR1,234,567"
    //   2. Plain thousands (comma/dot/space): "75,000" "75.000" "75 000" "1 234 567"
    //   3. Currency-prefixed plain: "Rp 5000", "IDR50"
    //   4. Decimal without thousands: "5.50", "5,50"
    //   5. Plain integer (filtered by value threshold below)
    const moneyPattern = /(?:rp|idr|usd|aud|sgd|myr)\.?\s*-?\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|-?\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|(?:rp|idr|usd|aud|sgd|myr)\.?\s*-?\d+(?:[.,]\d{1,2})?|-?\d+[.,]\d{1,2}|-?\d+/gi;
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
        const hasCurrency = /(?:rp|idr|usd|aud|sgd|myr)/i.test(raw);
        // Include space-thousands in hasMoneySeparator
        const hasMoneySeparator = /[.,\s]\d{3}\b/.test(raw) || /\d+[.,]\d{2}\b/.test(raw);

        // Skip if token is embedded in a word
        if (/[a-z]/i.test(before) || /[a-z]/i.test(after)) continue;
        // Skip percentages: "10%"
        if (/^\s*%/.test(afterText)) continue;
        // Skip unit prices after "x" or "@": "2x25000"
        if (/(?:^|[^a-z])[xX]\s*$|@\s*$/i.test(beforeText)) continue;

        const value = parseMoney(raw);
        if (value == null || value <= 0) continue;

        const digits = raw.replace(/\D/g, '');

        // Without a currency marker or money-style separator, require value >= 100
        // to avoid matching table numbers, order IDs, quantities, etc.
        if (!hasCurrency && !hasMoneySeparator && value < 100) continue;

        // Reject bare 4-digit year numbers (1900–2099) that have NO thousands separator
        // — these come from timestamps / "Printed Mar 17, 2025" / PAX lines.
        if (!hasCurrency && !hasMoneySeparator && digits.length === 4
            && value >= 1900 && value <= 2099) continue;

        // Reject extremely long digit sequences (>7 raw digits) without proper thousands
        // separators — these are reference numbers, registration codes, receipt IDs, etc.
        // 7 digits = 1 million, which is the limit for Indonesian receipts without separators.
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
    // Prefer rightmost high-scoring candidate (price is usually at end of line)
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

// ─── getLabeledMoneyValue ─────────────────────
// For a label line (e.g. "TOTAL", "Tax"), find the amount on the same line
// or on up to 3 following lines (handles thermal receipts that split label / "Rp" / amount).
function getLabeledMoneyValue(lines, index) {
    const sameLine = getBestMoneyValue(lines[index]);
    if (sameLine != null) return sameLine;

    for (let offset = 1; offset <= 3 && index + offset < lines.length; offset++) {
        const next = lines[index + offset];
        const lower = next.toLowerCase();

        // Stop if we hit a new section header
        if (/(tanggal|date|time|waktu|invoice|receipt|struk|bill|order|kasir|cashier|table|meja)/i.test(lower)) break;
        if (/(subtotal|sub total|sub-total|grand\s*total|total|amount|jumlah|tax|pajak|ppn|pb1|vat|gst|service|serv|svc|sc\b)/i.test(lower)) break;

        const nextValue = getBestMoneyValue(next);
        if (nextValue != null) return nextValue;
    }

    return null;
}

// ─── parseDate ────────────────────────────────
function parseDate(text) {
    const raw = normLine(text);
    if (!raw) return null;

    // Strip date label prefixes — including "Date & Time", "Tgl./Jam"
    let stripped = raw
        .replace(/^(?:tanggal|tgl\.?\/jam|tgl|date\s*(?:[&]\s*time|and\s*time)?|date|waktu|time)\s*[:.|\-]?\s*/i, '')
        .trim();
    stripped = stripped.replace(/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[,.]?\s*/i, '').trim();

    // Named month DD MMM YY[YY]: "17 Mar 2026" or "17 Maret 26"
    const named = stripped.match(/(\d{1,2})\s+([a-z]+)\s+(\d{2,4})/i);
    if (named) {
        const mm = MONTH_MAP[named[2].toLowerCase()];
        if (mm) {
            const yyyy = named[3].length <= 2 ? `20${named[3]}` : named[3];
            return `${yyyy}-${mm}-${named[1].padStart(2, '0')}`;
        }
    }

    // Named month MMM DD, YY[YY]: "March 17, 2026" or "Jun 21, 26"
    const named2 = stripped.match(/([a-z]+)\s+(\d{1,2})[,\s]+(\d{2,4})/i);
    if (named2) {
        const mm = MONTH_MAP[named2[1].toLowerCase()];
        if (mm) {
            const yyyy = named2[3].length <= 2 ? `20${named2[3]}` : named2[3];
            return `${yyyy}-${mm}-${named2[2].padStart(2, '0')}`;
        }
    }

    // Numeric DMY: 17/03/2026, 17-03-26
    const dmy = stripped.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmy) {
        const dd = dmy[1].padStart(2, '0');
        const mm = dmy[2].padStart(2, '0');
        const yyyy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
        return `${yyyy}-${mm}-${dd}`;
    }

    // YMD: 2026-03-17
    const ymd = stripped.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;

    return null;
}

// ─── inferCategory ────────────────────────────
function inferCategory(itemName) {
    const lower = String(itemName || '').toLowerCase();

    if (/\b(nasi|rice|mie|noodle|ayam|chicken|beef|sapi|ikan|fish|udang|shrimp|telur|egg|tahu|tempe|sayur|salad|soup|soto|bakso|sate|satay|pizza|burger|sandwich|roti|bread|cake|donut|ice cream|es krim|kopi|coffee|tea|teh|juice|jus|soda|coca|pepsi|fanta|sprite|bir|beer|wine|water|air|mineral|susu|milk|makan|drink|minuman|makanan|dessert|appetizer|snack|fries|pasta|steak|lobster|crab|lamb|pork|babi|dimsum|sushi|ramen|curry|rendang|gado|pecel|rawon|gudeg|martabak|gorengan|kerupuk|sambal)\b/.test(lower)) return 'food';
    if (/\b(sabun|soap|shampo|shampoo|tissue|tisu|detergent|deterjen|sikat|tooth|pasta|gigi|diapers|popok|sanitary|pembalut|cotton|kapas|hand sanitizer|masker|mask|vitamin|obat|medicine|gel|lotion|deodorant|parfum|perfume)\b/.test(lower)) return 'daily_needs';
    if (/\b(bensin|gasoline|fuel|solar|diesel|parkir|parking|tol|toll|grab|gojek|uber|taxi|taksi|ojek|angkot|bus|kereta|train|tiket|ticket|transport)\b/.test(lower)) return 'transport';
    if (/\b(konsultasi|consultation|doctor|dokter|resep|prescription|lab|x-ray|rontgen|rawat|treatment|medical|medis|hospital|rumah sakit|klinik|clinic|apotek|pharmacy|terapi|therapy)\b/.test(lower)) return 'health';
    if (/\b(movie|film|bioskop|cinema|karaoke|game|bowling|spa|massage|pijat|gym|fitness|swimming|berenang|concert|konser|museum|park|taman|tiket|ticket)\b/.test(lower)) return 'entertainment';
    if (/\b(baju|shirt|celana|pants|sepatu|shoes|tas|bag|jam|watch|aksesori|accessories|elektronik|electronic|handphone|hp|laptop|komputer|computer|gadget|charger|kabel|cable|headset|earphone)\b/.test(lower)) return 'shopping';
    if (/\b(salon|haircut|potong rambut|manicure|pedicure|facial|waxing|eyelash|nail|kuku|creambath|blow|coloring|highlight|makeup)\b/.test(lower)) return 'beauty';

    return 'other_spending';
}

// ─── isNonItemLine ────────────────────────────
// Returns true if the line is a header, footer, label, address, or otherwise
// not a purchasable item line.
function isNonItemLine(text) {
    const lower = normLine(text).toLowerCase();
    if (!lower) return true;

    // Match against the NON_ITEM_KEYWORDS set using whole-word boundary checks.
    // Using .includes() was intentional for multi-word keywords like "service charge",
    // BUT it causes false positives for short tokens like "sc" (matches "scoop"),
    // "server" (matches "servers"), "mode" (matches "smoothie"), "bill" (matches "billed").
    // We use a word-boundary regex for short/ambiguous keywords, and .includes() for
    // longer multi-word phrases that are unambiguous.
    for (const keyword of NON_ITEM_KEYWORDS) {
        if (keyword.length <= 4 || keyword === 'service' || keyword === 'server' || keyword === 'mode' || keyword === 'bill' || keyword === 'order' || keyword === 'tip' || keyword === 'pax' || keyword === 'tbl' || keyword === 'pos' || keyword === 'edc') {
            // For short or ambiguous keywords, require word boundaries
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
            if (new RegExp('(?:^|\\s)' + escaped + '(?:\\s|$|[:\\-,.])', 'i').test(lower)) return true;
        } else {
            if (lower.includes(keyword)) return true;
        }
    }

    // Lines that are PURELY numeric / date-like (no alphabetic item name present).
    if (/^[\d\s\/\-:.,]+$/.test(lower)) return true;

    // Lines that look like timestamps: contain time pattern HH:MM or HH:MM:SS
    // e.g. "Mar 17, 2025 7:43:59 PM" — has time → header/footer, not an item
    if (/\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(lower)) return true;

    // "6 item", "4 items", "Total 4 item" — item-count summary lines
    if (/^\d+\s+items?$/i.test(lower)) return true;

    // Address lines — covers Indonesian/Malaysian formats and bare street prefixes.
    // Using a start-anchored OR word-boundary check since "JL." often starts the line.
    if (/(?:^|\b)(jl\.?|jln\.?|jalan|street|rd\b|ave\b|blvd|no\.\s*\d|wilayah|persekutuan|sdn\s*bhd|kuala\s*lumpur|selangor|penang|johor)(?:\b|$)/i.test(lower)) return true;

    // Phone numbers: 8+ chars of digits, spaces, and call-formatting only
    if (/^[\d\s()+\-]{8,}$/.test(lower)) return true;
    // Phone with country code prefix: "+62-361 - 280734", "+60 12-345 6789"
    if (/^\+?[\d\s()\-]{8,}$/.test(lower.replace(/^phone\s*:?\s*/i, ''))) return true;

    // Lines that are ONLY a currency symbol (possibly with dash/space): "RM", "- RM", "Rp", "IDR"
    // These appear when the label is on one line and "RM <amount>" is on the next.
    if (/^[-\s]*(rm|rp|idr|usd|aud|sgd|myr|\$|\u00a3|\u20ac|\u00a5)\s*$/i.test(lower)) return true;

    // Currency symbol followed only by zero/letter-O (OCR confuses 0 with O): "Rp. O", "Rp. 0"
    if (/^(?:rp|idr|sgd|usd|myr|rm)\.?\s*[o0]\s*$/i.test(lower)) return true;

    // Standalone negative Rp. amounts are discount/adjustment lines, not items
    if (/^(?:rp|idr|sgd|usd|myr|rm)\.?\s*-[\d,.]+\s*$/i.test(lower)) return true;

    // Social media handles: lines containing "@" followed by alphanumeric (e.g. "@MMJuice")
    if (/@[a-z0-9_]{2,}/i.test(lower)) return true;

    // Indonesian phone prefix patterns: "Tlp. 0811-191 176 (WA)", "Telp: 0361-280734"
    if (/^tlp[.\s]|^telp[.:\s]|^telepon[.:\s]|\bwa[.:\s]\d|\(wa\)/i.test(lower)) return true;

    // Lines that are purely a POS order/bill reference number
    // e.g. "NO.BILL : 260626185311007", "NO ORDER : 053260626..."
    if (/^no[.\s]?(bill|order|faktur|struk|receipt|nota|invoice)[:\s]/i.test(lower)) return true;

    // Indonesian POS waiter/cashier label lines: "Waiter : NI MADE ARIANI"
    if (/^(waiter|pelayan|waitress|kasir|cashier|server)[:\s]/i.test(lower)) return true;

    // Alphanumeric reference/order codes: "SSC9R178203434280SC9R-020", "SC9R_1782034310"
    // Condition: 10+ chars, contains both digits and letters, no spaces.
    if (/^[a-z0-9][a-z0-9_\-]{9,}$/i.test(lower.trim()) && /\d/.test(lower) && /[a-z]/i.test(lower)) return true;

    // Payment card reference lines: "My Card (7108)", "Visa (1234)"
    if (/\b(?:my\s*card|visa|mastercard|amex|debit|credit)\s*\(\d{4}\)/i.test(lower)) return true;

    // Receipt column header lines: "Qty Item Name Unit Price Amount"
    if (/\b(?:unit\s*price|item\s*name)\b/i.test(lower)) return true;

    return false;
}

// ─── isUnitPriceLine ─────────────────────────
// Detects continuation lines that show qty × unit-price but are NOT standalone items.
// Examples: "5x @40.000", "@48.500", "1x @Rp 25.000", "2 x @12.500 25.000"
function isUnitPriceLine(line) {
    const t = normLine(line);
    // Starts with optional qty then @price
    if (/^\d*\s*[xX]?\s*@/.test(t)) return true;
    // Starts with "Nx " and the next token is @
    if (/^\d+\s*[xX]\s+@/.test(t)) return true;
    return false;
}

// ─── tryParseItemLine ─────────────────────────
// Attempts to extract { name, quantity, price } from a single OCR line.
// Returns null if the line doesn't look like a priced item.
// Handles the most common thermal-receipt layouts:
//   A) "2 x Nasi Goreng          35,000"   (leading qty)
//   B) "Nasi Goreng 2 x 17,500   35,000"   (trailing qty + unit + line-total)
//   C) "Nasi Goreng               35,000"   (no qty)
//   D) "2x Nasi Goreng            35,000"   (compact leading qty)
//   E) "Nasi Goreng         2     35,000"   (qty right of name, before price)
function tryParseItemLine(line) {
    // Use the money-candidate engine — most reliable for varied number formats
    const moneyCandidates = getMoneyCandidates(line);
    if (!moneyCandidates.length) return null;

    // The rightmost money candidate is the line-total (price we want)
    const priceCandidate = moneyCandidates[moneyCandidates.length - 1];
    // The second-from-right (if present and before the price) may be unit price
    const unitCandidate = moneyCandidates.length >= 2
        ? moneyCandidates[moneyCandidates.length - 2]
        : null;

    let rawName = line.slice(0, priceCandidate.start).trim();
    let quantity = 1;

    // Layout A / D: leading "2 x", "2x", "2 X" before the item name
    const leadingQtyX = rawName.match(/^(\d+)\s*[xX]\s+(.+)$/);
    if (leadingQtyX) {
        quantity = parseInt(leadingQtyX[1], 10) || 1;
        rawName = leadingQtyX[2].trim();
    } else {
        // Layout F: leading plain qty (no x) — "1 ITEM NAME" or "2 Nasi Goreng"
        // Only when qty is 1-99 and the rest is a valid name (>= 2 alpha chars)
        const leadingQtyNoX = rawName.match(/^(\d{1,2})\s+([A-Za-z*].+)$/);
        if (leadingQtyNoX) {
            const candidateQty = parseInt(leadingQtyNoX[1], 10);
            const candidateName = leadingQtyNoX[2].trim();
            if (candidateQty >= 1 && candidateQty <= 99
                && candidateName.length >= 2 && !isNonItemLine(candidateName)) {
                quantity = candidateQty;
                rawName = candidateName;
            }
        }

        // Layout B: "Name  qty x unitPrice  lineTotal" — qty embedded before unit price
        if (quantity === 1 && unitCandidate && unitCandidate.end <= priceCandidate.start) {
            const segment = line.slice(0, unitCandidate.start).trim();
            const trailingQtyX = segment.match(/^(.+?)\s+(\d+)\s*[xX@]?\s*$/);
            if (trailingQtyX) {
                const candidateName = trailingQtyX[1].trim();
                const candidateQty = parseInt(trailingQtyX[2], 10);
                if (!isNonItemLine(candidateName) && candidateName.length >= 2 && candidateQty > 0) {
                    rawName = candidateName;
                    quantity = candidateQty;
                }
            }
        }

        if (quantity === 1) {
            // Layout E: trailing qty before price — "Name    2    35,000"
            const trailingQty = rawName.match(/^(.+?)\s+(\d{1,2})\s*$/);
            if (trailingQty) {
                const candidateName = trailingQty[1].trim();
                const candidateQty = parseInt(trailingQty[2], 10);
                // Only treat as qty if it's a small number (1-99) and name is valid
                if (!isNonItemLine(candidateName) && candidateName.length >= 2 && candidateQty >= 1 && candidateQty <= 99) {
                    rawName = candidateName;
                    quantity = candidateQty;
                }
            }
        }
    }

    // Final name cleanup: strip leading "*" (NIKO NEKO style) and trailing x/@
    const name = rawName.replace(/^\*+\s*/, '').replace(/\s*[xX@]\s*$/, '').trim();

    if (!name || name.length < 2 || isNonItemLine(name)) return null;
    // Reject names that are purely a currency symbol (e.g. "RM", "- RM", "Rp")
    if (/^[-\s]*(rm|rp|idr|usd|aud|sgd|myr|\$|\u00a3|\u20ac|\u00a5)\s*$/i.test(name)) return null;
    if (priceCandidate.value <= 0) return null;

    return { name, quantity, price: priceCandidate.value };
}

// ─── tryParseMultiLineItem ────────────────────
// Handles receipts where item name and price are on separate lines.
// Patterns:
//   line[i]:   "Dubai Chewy Bomb"          ← name-only
//   line[i+1]: "5x @40.000"               ← qty × unit  (STUFFED format, line total on i+2)
//   line[i+2]: "200.000"                  ← line total   (STUFFED format)
//   OR
//   line[i+1]: "5x @40.000   200.000"     ← qty × @unit lineTotal on same line
//   OR
//   line[i+1]: "1  x  35,000"             ← qty × price
//   OR
//   line[i+1]: "35,000"                   ← price only
function tryParseMultiLineItem(lines, index) {
    const nameLine = lines[index];
    const nextLine = lines[index + 1];
    if (!nameLine || !nextLine) return null;

    // Name line must have no money candidates on it
    if (getMoneyCandidates(nameLine).length > 0) return null;
    if (isNonItemLine(nameLine)) return null;
    if (isUnitPriceLine(nameLine)) return null;
    if (nameLine.length < 2) return null;

    // Clean name: strip leading asterisk (NIKO NEKO style: *REN / Matcha - Latte)
    const cleanName = nameLine.replace(/^\*+\s*/, '').trim();
    if (!cleanName || cleanName.length < 2) return null;

    const nextLower = nextLine.toLowerCase();

    // Next line is a section-summary line — stop
    if (/(subtotal|sub total|total|tax|pajak|ppn|service|grand)/i.test(nextLower)) return null;

    // Pattern A: "5x @40.000   200.000" — qty × @unitPrice   lineTotal (on same next line)
    // Use the RIGHTMOST money candidate as the line total, not the unit price.
    const qtyAtUnitSameLine = nextLine.match(/^(\d+)\s*[xX]\s*@\s*([\d,.]+)/);
    if (qtyAtUnitSameLine) {
        const qty = parseInt(qtyAtUnitSameLine[1], 10) || 1;
        const nextCandidatesA = getMoneyCandidates(nextLine);
        if (nextCandidatesA.length >= 2) {
            // Two or more money values: rightmost is the line total
            const lineTotal = nextCandidatesA[nextCandidatesA.length - 1].value;
            if (lineTotal > 0) {
                return { name: cleanName, quantity: qty, price: lineTotal, consumedNext: true };
            }
        }
        // Only @unit present on the next line (line total is on the line AFTER)
        // Pattern A2: Name / "5x @40.000" / "200.000"
        const unitPrice = parseMoney(qtyAtUnitSameLine[2]);
        if (unitPrice != null && unitPrice > 0) {
            const thirdLine = lines[index + 2];
            if (thirdLine) {
                const thirdLower = thirdLine.toLowerCase();
                if (!/(subtotal|sub total|total|tax|pajak|ppn|service|grand)/i.test(thirdLower)) {
                    const thirdCandidatesA = getMoneyCandidates(thirdLine);
                    if (thirdCandidatesA.length === 1) {
                        // The lone value on line[i+2] is the line total
                        const lineTotal = thirdCandidatesA[0].value;
                        const expectedTotal = qty * unitPrice;
                        // Accept if it's close to qty * unitPrice (within 5 IDR for rounding)
                        // OR if it's simply a plausible amount (> unitPrice)
                        if (lineTotal > 0 && (Math.abs(lineTotal - expectedTotal) <= 5 || lineTotal >= unitPrice)) {
                            return { name: cleanName, quantity: qty, price: lineTotal, consumedNext: 2 };
                        }
                    }
                }
            }
            // Fallback: compute line total from qty × unitPrice
            return { name: cleanName, quantity: qty, price: qty * unitPrice, consumedNext: true };
        }
    }

    // Pattern B: "1 x 35,000  35,000" or "2 x 17,500" (qty × unit, no @)
    // Use RIGHTMOST candidate (line total), not leftmost (unit price).
    const qtyXUnit = nextLine.match(/^(\d+)\s*[xX]\s*([\d,.\s]+)/);
    if (qtyXUnit) {
        const qty = parseInt(qtyXUnit[1], 10) || 1;
        const moneyCandidates = getMoneyCandidates(nextLine);
        if (moneyCandidates.length >= 2) {
            // Rightmost is line total
            const lineTotal = moneyCandidates[moneyCandidates.length - 1].value;
            if (lineTotal > 0) return { name: cleanName, quantity: qty, price: lineTotal, consumedNext: true };
        }
        if (moneyCandidates.length === 1) {
            // Only one value — could be unit price; compute total
            const unitPrice = moneyCandidates[0].value;
            if (unitPrice > 0) return { name: cleanName, quantity: qty, price: qty * unitPrice, consumedNext: true };
        }
    }

    // Pattern C: next line is purely a price (single money token + optional currency prefix)
    // Only if nextLine is not a non-item line (address, summary, etc.)
    const nextCandidates = getMoneyCandidates(nextLine);
    if (!isNonItemLine(nextLine) && nextCandidates.length === 1) {
        const stripped = nextLine.replace(/[\d\s,./()rpidusdaugsgmyr-]/gi, '').trim();
        if (stripped.length <= 2) { // Mostly just a number (± currency prefix)
            const price = nextCandidates[0].value;
            // Sanity-check: the name must not be a bare currency symbol
            if (price > 0 && !/^[-\s]*(rm|rp|idr|usd|aud|sgd|myr|\$)\s*$/i.test(cleanName)) {
                return { name: cleanName, quantity: 1, price, consumedNext: true };
            }
        }
    }

    // Pattern D: 3-line item — name on line[i], description on line[i+1], price row on line[i+2]
    // Common in Malaysian POS (NIKO NEKO):
    //   *REN / Matcha - Latte
    //   Ice, Have Here, Fresh Milk, No Sugar
    //   27.36    1    0.00       27.36
    // GUARD: only trigger when line[i+1] has no money AND line[i+2] has money AND
    //        the price candidate is a plausible item amount (not a phone number or ID).
    const thirdLine = lines[index + 2];
    if (thirdLine && nextCandidates.length === 0) {
        const thirdLower = thirdLine.toLowerCase();
        if (!/(subtotal|sub total|total|tax|pajak|ppn|service|grand)/i.test(thirdLower)
            && !isNonItemLine(thirdLine)) {
            const thirdCandidates = getMoneyCandidates(thirdLine);
            if (thirdCandidates.length > 0) {
                // Rightmost candidate on the price row is the line total (amount column)
                const price = thirdCandidates[thirdCandidates.length - 1].value;
                // Reject implausibly large values that are likely phone numbers or reference IDs
                // (phone numbers like 280734 have 6+ digits without a thousands separator)
                const priceRaw = thirdCandidates[thirdCandidates.length - 1].raw;
                const priceDigits = priceRaw.replace(/\D/g, '');
                const hasSeparator = /[.,\s]\d{3}/.test(priceRaw);
                if (!hasSeparator && priceDigits.length >= 6) {
                    // Bare 6+ digit number without thousands separator = likely a reference/phone
                    return null;
                }
                // Try to extract qty from the price row (second number from left is often qty)
                let qty = 1;
                if (thirdCandidates.length >= 2) {
                    // Look for a small integer between the first and last candidates (qty column)
                    const qtyMatch = thirdLine.match(/[\d,.]+\s+(\d{1,2})\s+/);
                    if (qtyMatch) {
                        const candidateQty = parseInt(qtyMatch[1], 10);
                        if (candidateQty >= 1 && candidateQty <= 99) qty = candidateQty;
                    }
                }
                if (price > 0) {
                    return { name: cleanName, quantity: qty, price, consumedNext: 2 };
                }
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

    // ─── Store name ───────────────────────────────────
    // The store name is usually the first meaningful line at the very top,
    // before any addresses, NPWP, or phone numbers.
    // We also record how many consecutive header lines appear at the top so the
    // item parser can skip them (e.g. "PT. CASA LOCA / NAUGHTY NURI'S SANUR / address / phone").
    let headerEndIndex = 0; // lines[0..headerEndIndex-1] are header, skip in item loop
    for (let i = 0; i < Math.min(6, lines.length); i++) {
        const line = lines[i];
        if (!line || line.length < 3) continue;
        if (/\b(jl\.|jln|jalan|street|rd\b|ave\b|blvd|kota|city|telp|phone|tel\b|fax|npwp|www\.|http|\.com|\.id)\b/i.test(line)) continue;
        if (/^[\d\s()+\-]{6,}$/.test(line)) continue;
        // Skip POS label lines that look like field names, not store names
        if (/^(order|check)\s*(?:no|number|num)\.?\s*[:\s]/i.test(line)) continue;
        if (/^date\s*(?:[&]\s*time|and\s*time)/i.test(line)) continue;
        if (/^(order no|check no|date\s*[&]|tgl\.?\/jam)/i.test(line)) continue;
        // Skip lines that are mostly numbers/punctuation
        const alphaChars = line.replace(/[\d\s.,\-\/()]/g, '');
        if (alphaChars.length < 3) continue;
        storeName = line;
        break;
    }

    // Mark the entire top header block (store name + tagline + address + phone)
    // as off-limits for item parsing. We scan forward from line 0 until we find
    // the first line that looks like it could be a date, a POS label, or an item.
    // A conservative upper bound: never skip more than 20 lines for complex Indonesian headers.
    for (headerEndIndex = 0; headerEndIndex < Math.min(20, lines.length); headerEndIndex++) {
        const line = lines[headerEndIndex].toLowerCase();
        // Stop at POS labels, date lines, or divider lines
        const isPosLabel = /(pos:|kasir|cashier|tanggal|tgl|date|server|table|meja|tbl\s*\d|no\s*:|no\.bill|no\.order|waiter|pelayan|waitress)/i.test(line);
        const isDateLine = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(jan|feb|mar|apr|mei|may|jun|jul|agt|aug|sep|okt|oct|nov|des|dec)\b/i.test(line);
        const isDivider = /^[-=*]{3,}$/.test(line.trim());
        if (isPosLabel || isDateLine || isDivider) break;
        // Stop if the line has a money candidate (could be a priced item)
        if (getMoneyCandidates(lines[headerEndIndex]).length > 0) break;
    }

    // ─── Date ─────────────────────────────────────────
    // Phase 1: prefer lines with explicit date label or named month (more reliable)
    for (const line of lines) {
        // Detect "Date & Time" label as well as standard date labels
        const hasDateLabel = /\b(tanggal|tgl[\/.:\s]|tgl\/jam|tgl\.?jam|date\s*(?:[&]\s*time|and\s*time)?[\s:.]|waktu|time[\s:.])/i.test(line);
        const hasNamedMonth = /\b(?:jan|feb|mar|apr|mei|may|jun|jul|agt|aug|sep|okt|oct|nov|des|dec|januari|februari|maret|april|juni|juli|agustus|september|oktober|november|desember|january|february|march|june|july|august|october|december)\b/i.test(line);
        if (hasDateLabel || hasNamedMonth) {
            const parsed = parseDate(line);
            if (parsed) { date = parsed; break; }
        }
    }
    // Phase 2: fallback — any line with a full 4-digit year
    if (!date) {
        for (const line of lines) {
            const parsed = parseDate(line);
            if (parsed && /\d{4}/.test(line)) { date = parsed; break; }
        }
    }

    // ─── Items ────────────────────────────────────────
    // Start AFTER the header block (store name, address, phone) to avoid parsing
    // those lines as items (e.g. "NAUGHTY NURI'S SANUR" being treated as an item name).
    let i = headerEndIndex;

    while (i < lines.length) {
        const line = lines[i];

        // Skip unit-price continuation lines (e.g. "5x @40.000", "@48.500")
        if (isUnitPriceLine(line)) {
            i++;
            continue;
        }

        // ── Try single-line item first ──
        if (!isNonItemLine(line)) {
            const parsed = tryParseItemLine(line);
            if (parsed) {
                items.push({
                    name: parsed.name,
                    quantity: parsed.quantity,
                    price: parsed.price,
                    category: inferCategory(parsed.name),
                });
                i++;
                continue;
            }

            // ── Try two-line item ──
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

    // ─── Totals: subtotal, tax, service charge, grand total ──
    const subtotalCandidates = [];
    const taxCandidates = [];
    const serviceChargeCandidates = [];
    const totalCandidates = [];

    for (let j = headerEndIndex; j < lines.length; j++) {
        const line = lines[j];
        const lower = line.toLowerCase();

        // Subtotal
        // Matches: subtotal, sub total, total sales (exc. tax), net sales, DPP, etc.
        if (/\b(sub\s*total|subtotal|sub-total|net\s*sales|dpp|total\s*sales|total\s*\(exc|sales\s*total)\b/i.test(lower)) {
            const val = getLabeledMoneyValue(lines, j);
            if (val != null && val > 0) subtotalCandidates.push(val);
        }

        // Tax — but not if the same line also mentions totals/service
        // Also catches Malaysia SST (6.00%) lines
        if (/\b(tax|pajak|ppn|pb1|vat|gst|sst)\b/i.test(lower)
            && !/\b(sub\s*total|subtotal|sub-total|grand\s*total|total|service|serv|svc|total\s*sales)\b/i.test(lower)
            && !/\b(chk|check|tbl|table|meja)\b/i.test(lower)) {
            // Skip percentage-only lines like "PPN 11%" with no amount
            const lineHasAmount = getMoneyCandidates(line).length > 0
                || (j + 1 < lines.length && getMoneyCandidates(lines[j + 1]).length > 0);
            if (lineHasAmount) {
                const val = getLabeledMoneyValue(lines, j);
                if (val != null && val > 0) taxCandidates.push(val);
            }
        }

        // Service charge
        if (/\b(service|serv\.?|svc|sc\b|service\s*charge|service\s*fee|servis|layanan)\b/i.test(lower)
            && !/\b(sub\s*total|subtotal|sub-total|grand\s*total|total|tax|pajak|ppn|pb1|vat|gst)\b/i.test(lower)) {
            const lineHasAmount = getMoneyCandidates(line).length > 0
                || (j + 1 < lines.length && getMoneyCandidates(lines[j + 1]).length > 0);
            if (lineHasAmount) {
                const val = getLabeledMoneyValue(lines, j);
                if (val != null && val > 0) serviceChargeCandidates.push(val);
            }
        }

        // Grand total — catches: TOTAL, Grand Total, Total Due, RM 90.00 after TOTAL label, etc.
        // Also matches standalone "TOTAL" label (common on Malaysian receipts)
        if (/^total$|\b(grand\s*total|total\s*(?:due|amount|bayar)?|amount\s*due|jumlah\s*(?:bayar|tagihan)?|tagihan)\b/i.test(lower)
            && !/\b(sub\s*total|subtotal|sub-total|total\s*(?:item|qty|quantity|sales)|discount|diskon|change|kembali|kembalian|cash|tunai|paid)\b/i.test(lower)) {
            const val = getLabeledMoneyValue(lines, j);
            if (val != null && val > 0) totalCandidates.push(val);
        }
    }

    // ─── Resolve amounts ──────────────────────────────
    const itemsSubtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const subtotalValues = uniqueAmounts(subtotalCandidates);
    const taxValues = uniqueAmounts(taxCandidates);
    const serviceChargeValues = uniqueAmounts(serviceChargeCandidates);
    const totalValues = uniqueAmounts(totalCandidates);

    // Use the last subtotal found (most receipts only have one)
    subtotal = subtotalValues.length ? subtotalValues[subtotalValues.length - 1] : 0;
    // Sum distinct tax lines (some receipts split PB1 + PPN; some repeat tax summary rows)
    tax = taxValues.length ? taxValues.reduce((s, v) => s + v, 0) : 0;
    // Sum distinct service charge lines
    serviceCharge = serviceChargeValues.length ? serviceChargeValues.reduce((s, v) => s + v, 0) : 0;
    // Prefer a total that reconciles with subtotal + tax + service, then fall back to largest labeled total.
    total = pickBestTotal(totalValues, subtotal > 0 ? subtotal + tax + serviceCharge : 0);

    // Derive subtotal from total when missing
    if (!subtotal && total > 0 && (tax > 0 || serviceCharge > 0)) {
        subtotal = Math.max(0, total - tax - serviceCharge);
    }
    if (!subtotal && itemsSubtotal > 0) subtotal = itemsSubtotal;

    // Derive total from subtotal when missing
    if (!total && subtotal > 0) total = subtotal + tax + serviceCharge;

    // Guard: need at least items or a total
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
