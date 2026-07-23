const generateId = () => Math.random().toString(36).substring(2, 15);
const autoCategorize = (desc) => 'other';
// PDF Bank Statement Processor
// Parses BCA-style bank statements and other common formats.







function buildStatementFocusText(text) {
    const lines = String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return '';

    const keyLines = [];
    for (const line of lines) {
        const hasDate = /(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{2,4})?)/.test(line);
        const hasAmount = /(?:RP\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/i.test(line);
        const hasTxnHint = /(db|cr|debit|credit|transfer|payment|pembelian|tarikan|setoran|saldo|balance|trx|transaction|mutasi)/i.test(line);
        if ((hasDate && hasAmount) || (hasDate && hasTxnHint) || (hasAmount && hasTxnHint)) {
            keyLines.push(line);
        }
    }

    const candidates = keyLines.length > 0 ? keyLines : lines;
    return candidates.slice(0, 300).join('\n');
}

const INCOME_HINT_KEYWORDS = [
    'atm deposit', 'setoran', 'deposit', 'incoming transfer', 'transfer masuk', 'credit', 'cr', 'salary', 'gaji', 'refund', 'interest', 'bunga', 'top up masuk', 'cash in',
];

const SPENDING_HINT_KEYWORDS = [
    'withdraw', 'tarik tunai', 'tarikan', 'transfer keluar', 'payment', 'purchase', 'pembelian', 'debit', 'db', 'bill', 'tagihan', 'cash out', 'biaya', 'fee',
];

function splitStatementRowColumns(line) {
    const raw = String(line || '').trim();
    if (!raw) return [];
    if (raw.includes('|')) {
        return raw.split('|').map((p) => p.trim()).filter(Boolean);
    }
    if (raw.includes('\t')) {
        return raw.split('\t').map((p) => p.trim()).filter(Boolean);
    }
    const wideSplit = raw.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (wideSplit.length >= 3) return wideSplit;
    return raw.split(/\s+/).map((p) => p.trim()).filter(Boolean);
}

function buildStatementRows(text) {
    const lines = String(text || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !isLikelyMetadataLine(line));

    const rows = [];
    let current = '';
    const startsRowRegex = /^(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{2,4})?)\b/;

    for (const line of lines) {
        if (startsRowRegex.test(line)) {
            if (current) rows.push(current);
            current = line;
        } else if (current) {
            current = `${current} | ${line}`;
        } else {
            rows.push(line);
        }
    }

    if (current) rows.push(current);
    return rows;
}

function getMappedColumn(line, indexOneBased) {
    const idx = Number(indexOneBased) - 1;
    if (!Number.isInteger(idx) || idx < 0) return '';
    const cols = splitStatementRowColumns(line);
    return cols[idx] || '';
}

function inferTypeFromDescription(description) {
    const lower = String(description || '').toLowerCase();
    if (!lower) return null;
    if (INCOME_HINT_KEYWORDS.some((k) => lower.includes(k))) return 'income';
    if (SPENDING_HINT_KEYWORDS.some((k) => lower.includes(k))) return 'spending';
    return null;
}

function inferTypeFromToken(token) {
    const lower = String(token || '').toLowerCase();
    if (!lower) return null;
    if (/\b(cr|credit|setoran|deposit|incoming|masuk|in)\b/.test(lower)) return 'income';
    if (/\b(db|debit|payment|tarikan|withdraw|keluar|out)\b/.test(lower)) return 'spending';
    return inferTypeFromDescription(lower);
}

function isBalanceOnlyRow(line) {
    const lower = String(line || '').toLowerCase();
    return /(saldo\s*awal|saldo\s*akhir|opening\s*balance|closing\s*balance|balance\s*only|saldo\b)/i.test(lower)
        && !/\b(db|cr|debit|credit|setoran|deposit|tarikan|withdraw|payment|transfer)\b/i.test(lower);
}

function extractRowAmount(line, parsedBalance = 0) {
    // Strip bank reference codes first so their embedded digits aren't parsed as money.
    const cleanLine = stripBankReferenceCodes(stripDateTimeTokens(String(line || '')));
    const tokens = cleanLine.match(/(?:RP\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/gi) || [];
    if (tokens.length === 0) return 0;

    const withDbCr = cleanLine.match(/((?:RP\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)\s*(DB|CR|DEBIT|CREDIT)/i);
    if (withDbCr?.[1]) {
        const parsed = normalizeAmountToken(withDbCr[1]);
        if (parsed > 0) return parsed;
    }

    if (parsedBalance > 0 && tokens.length >= 2) {
        const candidate = normalizeAmountToken(tokens[tokens.length - 2]);
        if (candidate > 0) return candidate;
    }

    const values = tokens.map((token) => normalizeAmountToken(token)).filter((value) => value > 0);
    if (values.length === 0) return 0;

    const meaningful = values.filter((value) => value >= 10);
    if (meaningful.length > 0) {
        return Math.min(...meaningful);
    }

    return values[0];
}

function extractRowBalance(line) {
    const tokens = String(line || '').match(/(?:RP\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/gi) || [];
    if (tokens.length === 0) return 0;
    return normalizeAmountToken(tokens[tokens.length - 1]);
}

function extractRowDescription(line) {
    let text = String(line || '');
    text = text.replace(/(?:\d{4})[-/](?:\d{1,2})[-/](?:\d{1,2})/g, ' ');
    text = text.replace(/(?:\d{1,2})[-/](?:\d{1,2})(?:[-/](?:\d{2,4}))?/g, ' ');
    // Strip BCA reference codes before removing generic numbers
    text = text.replace(/\b\d{4}\/[A-Z]+\/[A-Z]+\d+\b/gi, ' ');
    text = text.replace(/\bWSID:[A-Z]+\d+\b/gi, ' ');
    text = text.replace(/(?:RP\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/gi, ' ');
    text = text.replace(/\b(DB|CR|DEBIT|CREDIT)\b/gi, ' ');
    text = text.replace(/[|]/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}

function parseStatementWithUserMapping(text, parseHints = {}) {
    if (!parseHints?.enabled) return [];

    const fields = parseHints.rowFields || {};
    const columns = parseHints.columns || {};
    const dateFormat = parseHints.dateFormat === 'us' ? 'us' : 'international';
    const lines = buildStatementRows(text);
    const out = [];
    let previousBalance = null;

    for (const line of lines) {
        if (isLikelyMetadataLine(line)) continue;
        if (isBalanceOnlyRow(line)) {
            previousBalance = extractRowBalance(line) || previousBalance;
            continue;
        }

        const dateCell = fields.date ? getMappedColumn(line, columns.date) : '';
        const typeCell = fields.transactionType ? getMappedColumn(line, columns.transactionType) : '';
        const descCell = fields.description ? getMappedColumn(line, columns.description) : '';
        const amountCell = fields.amount ? getMappedColumn(line, columns.amount) : '';
        const totalBalanceCell = fields.totalBalance ? getMappedColumn(line, columns.totalBalance) : '';

        const dateStr = parseDateFromLine(dateCell || line, dateFormat);
        if (!dateStr) continue;

        const rowBalance = normalizeAmountToken(totalBalanceCell || '') || extractRowBalance(line);
        const description = (descCell && !/^[\d.,\s-]+$/.test(descCell)) ? descCell.trim() : extractRowDescription(line);
        if (!description || description.length < 2) continue;

        const parsedAmount = normalizeAmountToken(amountCell || '') || extractRowAmount(line, rowBalance);
        const parsedBalance = rowBalance;

        let amount = parsedAmount;
        let type = inferTypeFromToken(typeCell) || inferTypeFromDescription(description) || null;

        if ((!amount || amount <= 0) && previousBalance != null && parsedBalance > 0) {
            const delta = parsedBalance - previousBalance;
            if (Math.abs(delta) > 0.0001) {
                amount = Math.abs(delta);
                if (!type) type = delta > 0 ? 'income' : 'spending';
            }
        }

        if (!type && amount > 0) {
            const upper = `${line} ${description}`.toUpperCase();
            if (/\b(CR|CREDIT|SETORAN|DEPOSIT|MASUK)\b/.test(upper)) type = 'income';
            else type = 'spending';
        }

        if (parsedBalance > 0) {
            previousBalance = parsedBalance;
        }

        if (!amount || amount <= 0) continue;

        const isoDate = Number.isNaN(new Date(dateStr).getTime())
            ? new Date().toISOString()
            : new Date(dateStr).toISOString();
        const normalizedType = type === 'income' ? 'income' : 'spending';

        out.push({
            id: generateId(),
            type: normalizedType,
            amount,
            category: normalizedType === 'income' ? 'other_income' : autoCategorize(description),
            description: description.substring(0, 120),
            date: isoDate,
            items: [],
            photos: [],
            paymentMethod: 'bank',
            source: 'pdf_import',
        });
    }

    return dedupeTransactions(out);
}

function parseLooseStatementRows(text, dateFormat = 'international') {
    const rows = buildStatementRows(text);
    const out = [];
    let previousBalance = null;

    for (const row of rows) {
        if (isLikelyMetadataLine(row)) continue;
        if (isBalanceOnlyRow(row)) {
            const balanceOnly = extractRowBalance(row);
            if (balanceOnly > 0) previousBalance = balanceOnly;
            continue;
        }

        const parsedDate = parseDateFromLine(row, dateFormat);
        if (!parsedDate) continue;

        const rowBalance = extractRowBalance(row);
        let amount = extractRowAmount(row, rowBalance);

        if ((!amount || amount <= 0) && previousBalance != null && rowBalance > 0) {
            const delta = rowBalance - previousBalance;
            if (Math.abs(delta) > 0.0001) {
                amount = Math.abs(delta);
            }
        }

        if (!amount || amount <= 0) continue;

        const description = extractRowDescription(row) || 'Bank Transaction';
        if (!description || description.length < 2) continue;

        const inferred = inferTypeFromToken(row) || inferTypeFromDescription(description);
        let type = inferred;
        if (!type && previousBalance != null && rowBalance > 0) {
            const delta = rowBalance - previousBalance;
            if (Math.abs(delta) > 0.0001) {
                type = delta > 0 ? 'income' : 'spending';
            }
        }
        if (!type) type = 'spending';

        if (rowBalance > 0) {
            previousBalance = rowBalance;
        }

        out.push({
            id: generateId(),
            type,
            amount,
            category: type === 'income' ? 'other_income' : autoCategorize(description),
            description: description.substring(0, 120),
            date: new Date(parsedDate).toISOString(),
            items: [],
            photos: [],
            paymentMethod: 'bank',
            source: 'pdf_import',
        });
    }

    return dedupeTransactions(out);
}

function buildMappingHintText(parseHints = {}) {
    if (!parseHints?.enabled) return '';
    const fields = parseHints.rowFields || {};
    const columns = parseHints.columns || {};
    const enabledFields = Object.entries(fields).filter(([, enabled]) => !!enabled);
    if (enabledFields.length === 0) return '';

    const lines = enabledFields.map(([field]) => {
        const col = Number(columns[field]);
        const suffix = Number.isFinite(col) && col > 0 ? `column ${col}` : 'unknown column';
        return `- ${field}: ${suffix}`;
    });

    const dateFormat = parseHints.dateFormat === 'us' ? 'US (MM/DD/YY)' : 'International (DD/MM/YY)';
    return `\nUser-provided row mapping (use this strongly):\n${lines.join('\n')}\nDate format: ${dateFormat}.\nIf totalBalance column is present and amount is missing/ambiguous, infer transaction amount from balance delta vs previous row.\nWhen balance increases, classify as income. When balance decreases, classify as spending.`;
}

function buildMappedRowsPreview(text, parseHints = {}, maxRows = 80) {
    if (!parseHints?.enabled) return '';

    const fields = parseHints.rowFields || {};
    const columns = parseHints.columns || {};
    const rows = buildStatementRows(text).slice(0, maxRows);
    const out = [];

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const dateCell = fields.date ? getMappedColumn(row, columns.date) : '';
        const typeCell = fields.transactionType ? getMappedColumn(row, columns.transactionType) : '';
        const descCell = fields.description ? getMappedColumn(row, columns.description) : '';
        const amountCell = fields.amount ? getMappedColumn(row, columns.amount) : '';
        const balanceCell = fields.totalBalance ? getMappedColumn(row, columns.totalBalance) : '';

        if (!dateCell && !typeCell && !descCell && !amountCell && !balanceCell) continue;

        out.push(
            `Row ${i + 1} | date="${dateCell}" | typeCell="${typeCell}" | descriptionCell="${descCell}" | amountCell="${amountCell}" | balanceCell="${balanceCell}"`
        );
    }

    if (out.length === 0) return '';
    return `\nMapped rows preview (trust this schema):\n${out.join('\n')}`;
}

async function parseStatementWithLocalAI(text, parseHints = null) {
    try {
        const { textCompletion, validateActiveModelForTask } = require('./localAI');
        validateActiveModelForTask('pdf-read');

        const focusedText = buildStatementFocusText(text);

        // Keep a larger window to preserve row context from long statements.
        const maxTextLength = 12000;
        let truncatedText = focusedText;
        if (focusedText.length > maxTextLength) {
            const half = Math.floor(maxTextLength / 2);
            const head = focusedText.substring(0, half);
            const tail = focusedText.substring(focusedText.length - half);
            truncatedText = `${head}\n...\n${tail}`;
        }

        const mappingHint = buildMappingHintText(parseHints) || '\nNo user-provided column mapping is available. Infer fields from each statement row.\n';
        const mappedRowsPreview = buildMappedRowsPreview(truncatedText, parseHints);

        const prompt = `You are a strict financial data extraction engine.
Extract bank statement transactions from the text below.

Return ONLY valid JSON with this shape:
{
    "transactions": [
        {
            "date": "YYYY-MM-DD",
            "type": "income" | "spending",
            "amount": 12345.67,
            "description": "merchant or transfer details"
        }
    ]
}

Extraction rules:
1) Include only real transaction rows. Ignore headers, totals, opening/closing balance-only lines, metadata, and notes.
2) "type" must be:
     - "income" for credit/incoming/deposit/salary/refund/balance increase.
     - "spending" for debit/payment/withdrawal/transfer out/balance decrease.
3) "amount" must be a positive number only (no currency symbols, no commas as thousands separators).
4) "description" must be concise and meaningful from the row text.
5) "date" must be normalized to YYYY-MM-DD.
6) If any row is ambiguous and cannot be resolved with confidence, skip that row.
7) If the statement is not in English, infer meaning from local keywords and still classify correctly.
8) Do not include markdown code fences and do not include extra keys.
9) ONE ROW = ONE TRANSACTION. Never emit two separate transactions from a single statement row. If a row is ambiguous, emit only the most confident interpretation.
10) AMOUNT COLUMN RULE: The "amount" field MUST come only from a dedicated debit/credit/mutasi/amount column — NEVER from the description/keterangan/narasi/reference column. Description columns contain text like merchant names, reference IDs (e.g. FTSCY/WS..., WSID..., TRF/..., INV/..., REF/..., account numbers, phone numbers). These are NOT amounts.
11) If the statement has columns like: TANGGAL | KETERANGAN | MUTASI | SALDO — the amount is MUTASI, not any number inside KETERANGAN.
12) Ignore all numeric reference codes inside description/narasi/keterangan fields (e.g. 0812345678, 1234567890, REF123456). These are identifiers, not money.
13) DB/DEBIT in amount/type cell means spending, CR/CREDIT means income.
14) If you cannot determine a reliable amount for a row, skip it entirely.
`;

        const raw = await textCompletion(prompt, null, null, {
            maxTokens: 1200,
            temperature: 0.1,
        });

        const cleaned = String(raw || '').replace(/```json?\n?/gi, '').replace(/```/g, '').trim();
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);

        let parsed;
        try {
            parsed = JSON.parse(arrayMatch ? arrayMatch[0] : (objectMatch ? objectMatch[0] : cleaned));
        } catch (parseErr) {
            // If JSON parsing fails, salvage complete and partial transaction objects.
            console.warn('JSON parse failed, attempting fallback:', parseErr.message);
            const txMatches = cleaned.match(/\{[\s\S]*?\}/g) || [];
            const parsedTx = txMatches
                .map((txStr) => {
                    try {
                        return JSON.parse(txStr);
                    } catch {
                        return null;
                    }
                })
                .filter((tx) => tx && (tx.type || tx.amount || tx.description || tx.date));

            if (parsedTx.length === 0) {
                const fragments = cleaned.split(/"type"\s*:/i).slice(1);
                for (const fragment of fragments) {
                    const segment = fragment.slice(0, 600);
                    const typeMatch = segment.match(/^\s*"?([a-z_ ]{2,20})"?/i);
                    const amountMatch = segment.match(/"amount"\s*:\s*"?(-?[0-9][0-9.,]*)"?/i);
                    const descMatch = segment.match(/"description"\s*:\s*"([^"\n]{2,200})"/i);
                    const dateMatch = segment.match(/"date"\s*:\s*"([^"\n]{4,40})"/i);
                    if (!amountMatch || !descMatch) continue;

                    parsedTx.push({
                        type: typeMatch?.[1] || 'spending',
                        amount: amountMatch[1],
                        description: descMatch[1],
                        date: dateMatch?.[1] || new Date().toISOString().slice(0, 10),
                    });
                }
            }

            if (parsedTx.length === 0) {
                return [];
            }

            parsed = {
                transactions: parsedTx,
            };
        }

        const txs = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.transactions) ? parsed.transactions : []);

        return txs
            .map((tx) => {
                const amount = normalizeAmountToken(tx?.amount ?? tx?.a);
                const dateRaw = String((tx?.date ?? tx?.d) || '').trim();
                const dateParsed = parseDateFromLine(dateRaw, parseHints?.dateFormat === 'us' ? 'us' : 'international') || dateRaw;
                const isoDate = Number.isNaN(new Date(dateParsed).getTime())
                    ? new Date().toISOString()
                    : new Date(dateParsed).toISOString();
                const typeRaw = String((tx?.type ?? tx?.t) || '').toLowerCase();
                const type = typeRaw === 'income' || typeRaw === 'i' ? 'income' : 'spending';
                const description = String((tx?.description ?? tx?.x) || 'Bank Transaction').trim() || 'Bank Transaction';
                return {
                    id: generateId(),
                    type,
                    amount,
                    category: type === 'income' ? 'other_income' : autoCategorize(description),
                    description: description.substring(0, 120),
                    date: isoDate,
                    items: [],
                    photos: [],
                    paymentMethod: 'bank',
                    source: 'pdf_import',
                };
            })
            .filter((tx) => tx.amount > 0);
    } catch (_) {
        return [];
    }
}

function toSafePdfPath(name = 'statement.pdf') {
    const safeName = String(name)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_');
    return safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`;
}

function base64ToBinaryString(base64Text) {
    try {
        return Buffer.from(String(base64Text || ''), 'base64').toString('latin1');
    } catch {
        return '';
    }
}

function binaryStringToBytes(binary) {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
}

function decodePdfEscapedString(text) {
    return text
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
}

function decodePdfHexString(hexText) {
    const cleaned = String(hexText || '').replace(/[^0-9A-Fa-f]/g, '');
    if (!cleaned) return '';

    const evenHex = cleaned.length % 2 === 0 ? cleaned : `${cleaned}0`;
    const bytes = [];
    for (let i = 0; i < evenHex.length; i += 2) {
        bytes.push(parseInt(evenHex.slice(i, i + 2), 16));
    }

    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        let out = '';
        for (let i = 2; i + 1 < bytes.length; i += 2) {
            out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
        }
        return out;
    }

    return String.fromCharCode(...bytes);
}

function extractTextOperators(sourceText) {
    const out = [];

    const tjMatches = sourceText.matchAll(/\(([^)]*)\)\s*Tj/g);
    for (const match of tjMatches) {
        const value = decodePdfEscapedString(match[1] || '').trim();
        if (value.length >= 2) out.push(value);
    }

    const tjArrayMatches = sourceText.matchAll(/\[(.*?)\]\s*TJ/gs);
    for (const match of tjArrayMatches) {
        const arr = match[1] || '';
        const parts = arr.matchAll(/\(([^)]*)\)/g);
        let merged = '';
        for (const part of parts) {
            merged += decodePdfEscapedString(part[1] || '');
        }
        merged = merged.trim();
        if (merged.length >= 2) out.push(merged);
    }

    const hexTjMatches = sourceText.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g);
    for (const match of hexTjMatches) {
        const value = decodePdfHexString(match[1] || '').trim();
        if (value.length >= 2) out.push(value);
    }

    const hexTjArrayMatches = sourceText.matchAll(/\[(.*?)\]\s*TJ/gs);
    for (const match of hexTjArrayMatches) {
        const arr = match[1] || '';
        const parts = arr.matchAll(/<([0-9A-Fa-f\s]+)>/g);
        let merged = '';
        for (const part of parts) {
            merged += decodePdfHexString(part[1] || '');
        }
        merged = merged.trim();
        if (merged.length >= 2) out.push(merged);
    }

    return out;
}

function extractPrintableBlocks(sourceText) {
    return (sourceText.match(/[\x20-\x7E]{4,}/g) || [])
        .map((x) => x.trim())
        .filter(Boolean);
}

function extractLikelyPdfText(rawBinary) {
    const collected = [];

    // Pass 1: direct text operators + printable blocks from full content.
    collected.push(...extractTextOperators(rawBinary));
    collected.push(...extractPrintableBlocks(rawBinary));

    // Pass 2: inspect each PDF stream, inflate Flate streams when possible.
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    const streamMatches = rawBinary.matchAll(streamRegex);

    for (const match of streamMatches) {
        const fullMatch = match[0] || '';
        const streamBody = match[1] || '';
        const streamStart = match.index || 0;

        const headerWindowStart = Math.max(0, streamStart - 260);
        const headerWindow = rawBinary.slice(headerWindowStart, streamStart);
        const isFlate = /\/FlateDecode/i.test(headerWindow);

        let streamText = streamBody;
        if (isFlate) {
            try {
                const inflated = pako.inflate(binaryStringToBytes(streamBody), { to: 'string' });
                if (inflated) streamText = inflated;
            } catch (_) {
                // Keep original stream body as fallback.
            }
        }

        if (!streamText || streamText === fullMatch) continue;
        collected.push(...extractTextOperators(streamText));
        collected.push(...extractPrintableBlocks(streamText));
    }

    return collected.join('\n');
}

function normalizeAmountToken(token) {
    if (!token) return 0;
    let s = String(token).trim().replace(/[^0-9.,-]/g, '');
    if (!s) return 0;
    
    // Clean any trailing separators
    s = s.replace(/[.,]+$/, '');

    // If it ends with exactly 1 or 2 digits preceded by a dot or comma, 
    // treat that last separator as the decimal point.
    if (/(?:[.,])\d{1,2}$/.test(s)) {
        const lastSeparatorIndex = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
        const integerPart = s.substring(0, lastSeparatorIndex).replace(/[.,]/g, '');
        const decimalPart = s.substring(lastSeparatorIndex + 1);
        s = integerPart + '.' + decimalPart;
    } else {
        // No decimal places, just strip all separators
        s = s.replace(/[.,]/g, '');
    }

    const value = parseFloat(s);
    return isNaN(value) ? 0 : value;
}

function stripDateTimeTokens(line) {
    return line
        .replace(/(\d{4})[-/](\d{2})[-/](\d{2})/g, ' ')
        .replace(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/g, ' ')
        .replace(/(\d{2})-(\d{2})-(\d{4})/g, ' ')
        .replace(/(\d{2})\s([A-Za-z]{3})\s(\d{4})/g, ' ')
        .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, ' ');
}

/**
 * Strip alphanumeric bank reference codes that contain embedded digits which
 * the amount regex would otherwise treat as money values.
 *
 * Patterns eliminated:
 *   - BCA e-banking refs: 0302/FTSCY/WS95271, 0402/FTSCY/WS95031
 *   - BCA CDM refs:       WSID:ZTA31, WSID:ZUK81
 *   - Generic ref formats: WS95271, REF123456, INV/123456, TRF/00123
 *   - Sequence numbers embedded in slash paths: 0302/FTSCY/WS95271
 */
function stripBankReferenceCodes(line) {
    return line
        // BCA-style slash-separated reference chains: 0302/FTSCY/WS95271, allows $ for OCR S errors
        .replace(/\b\d{4}\/[A-Z]+\/[A-Z$0-9]+\b/gi, ' ')
        // BCA CDM reference codes: WSID:ZTA31, WSID-ZUK81 (allows WSIO misread)
        .replace(/\bWSI[DO][-:][A-Z0-9]+\b/gi, ' ')
        // Standalone alphanumeric reference codes starting with letters followed by digits
        // e.g. WS95271, ZTA31, ZUK81, NijHkm 7523475 (merchant ref numbers)
        .replace(/\b[A-Z]{2,}[0-9]{2,}\b/gi, ' ')
        // Long purely numeric reference strings (7+ digits) that are not amounts
        // e.g. "7523475" merchant code — real amounts rarely exceed 6 digits in IDR context here
        // Only strip if NOT preceded by currency context
        .replace(/(?<![,.])\b\d{7,}\b(?![.,]\d)/g, ' ');
}

function isLikelyMetadataLine(line) {
    const upper = line.toUpperCase();
    const metadataHints = [
        'RDF:',
        'XMLNS',
        'XMP:',
        'CREATEDATE',
        'MODIFYDATE',
        '/MODDATE',
        'METADATA',
        'HTTP://',
        'HTTPS://',
        'WWW.W3.ORG',
        '<?XPACKET',
        'PDF/A',
        'ADOBE',
        '/TYPE',
        '/CATALOG',
        '/PAGES',
        '/FONT',
        '/CREATOR',
        '/TITLE',
        '/PRODUCER',
        '<<',
        '>>',
        'OBJ',
        'ENDOBJ',
        'STREAM',
        'ENDSTREAM',
        'XREF',
        'TRAILER',
    ];

    return metadataHints.some((hint) => upper.includes(hint));
}

function pickLikelyAmountFromLine(line) {
    // Step 1: strip date tokens and bank reference codes to avoid false positives.
    const lineWithoutDate = stripDateTimeTokens(line);
    const lineClean = stripBankReferenceCodes(lineWithoutDate);

    const hasOnlyBalanceContext = /(saldo|balance|available|saldo awal|saldo akhir)/i.test(lineClean)
        && !/(db|cr|debit|credit|transfer|payment|tarikan|pembelian|setoran|trx|transaction)/i.test(lineClean);
    if (hasOnlyBalanceContext) return 0;

    // Step 2: highest-confidence path — amount explicitly followed by DB or CR marker.
    // BCA format: "600,397.00 DB"  or  "50,000.00 CR"
    const dbcrMatch = lineClean.match(/((?:RP\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?)\s*(DB|CR|DEBIT|CREDIT)\b/i);
    if (dbcrMatch?.[1]) {
        const v = normalizeAmountToken(dbcrMatch[1]);
        if (v > 0) return v;
    }

    const amountTokens = lineClean.match(/(?:RP\s*)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/gi) || [];
    if (amountTokens.length === 0) return 0;

    const values = amountTokens
        .map((token) => normalizeAmountToken(token))
        .filter((val) => val > 0);

    if (values.length === 0) return 0;

    // Step 3: filter out implausibly large values that are almost certainly the
    // running SALDO (balance) column rather than the transaction MUTASI (amount).
    // Real transaction amounts in Indonesian retail banking are well under 100M IDR.
    // The saldo column values are typically 60M–70M+ in this statement.
    // We pick the smallest "reasonable" amount so we don't accidentally pick the balance.
    const nonTiny = values.filter((v) => v >= 100);
    if (nonTiny.length > 0) {
        // When multiple candidates exist, prefer the smallest — the transaction amount
        // is always smaller than the running balance.
        return Math.min(...nonTiny);
    }

    const anyNonTiny = values.filter((v) => v >= 10);
    if (anyNonTiny.length > 0) return Math.min(...anyNonTiny);

    return values[0];
}

function parseDateFromLine(line, dateFormat = 'international') {
    const currentYear = new Date().getFullYear();
    const useUS = dateFormat === 'us';

    const ymd = line.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (ymd) {
        return `${ymd[1]}-${String(ymd[2]).padStart(2, '0')}-${String(ymd[3]).padStart(2, '0')}`;
    }

    const dmySlash = line.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (dmySlash) {
        const yy = dmySlash[3];
        const year = !yy ? String(currentYear) : yy.length === 2 ? `20${yy}` : yy;
        const mm = useUS ? dmySlash[1] : dmySlash[2];
        const dd = useUS ? dmySlash[2] : dmySlash[1];
        return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }

    const dmyDash = line.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
    if (dmyDash) {
        const yy = dmyDash[3];
        const year = yy.length === 2 ? `20${yy}` : yy;
        const mm = useUS ? dmyDash[1] : dmyDash[2];
        const dd = useUS ? dmyDash[2] : dmyDash[1];
        return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }

    const mon = line.match(/(\d{1,2})\s([A-Za-z]{3,9})(?:\s(\d{2,4}))?/);
    if (mon) {
        const monthMap = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
            mei: '05', agt: '08', okt: '10', des: '12',
            maret: '03', april: '04', juni: '06', juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12',
        };
        const mm = monthMap[mon[2].toLowerCase()] || null;
        if (!mm) return null;
        const yy = mon[3];
        const year = !yy ? String(currentYear) : yy.length === 2 ? `20${yy}` : yy;
        return `${year}-${mm}-${String(mon[1]).padStart(2, '0')}`;
    }

    return null;
}

// Parse BCA bank statement text.
function parseBCAStatement(text, dateFormat = 'international') {
    const transactions = [];
    // Use buildStatementRows so that continuation lines (e.g. the raw amount line
    // "600397.00" and the beneficiary name "FLIPTECH LENTERA I" that follow the
    // date-prefixed line) are merged into a single row before parsing.
    const rows = buildStatementRows(text);
    let previousBalance = null;

    for (const row of rows) {
        if (isLikelyMetadataLine(row)) continue;
        if (isBalanceOnlyRow(row)) {
            const bal = extractRowBalance(row);
            if (bal > 0) previousBalance = bal;
            continue;
        }

        const dateStr = parseDateFromLine(row, dateFormat);
        if (!dateStr) continue;

        let amount = pickLikelyAmountFromLine(row);

        // Balance-delta fallback: when no reliable standalone amount is found,
        // derive the transaction amount from the change in running balance.
        const rowBalance = extractRowBalance(row);
        if ((!amount || amount <= 0) && previousBalance != null && rowBalance > 0) {
            const delta = rowBalance - previousBalance;
            if (Math.abs(delta) > 0.0001) {
                amount = Math.abs(delta);
            }
        }

        if (!amount || amount <= 0) {
            if (rowBalance > 0) previousBalance = rowBalance;
            continue;
        }

        const upperRow = row.toUpperCase();
        const isDebit =
            upperRow.includes(' DB ') ||
            upperRow.endsWith(' DB') ||
            upperRow.includes('DEBIT') ||
            upperRow.includes('TARIKAN') ||
            upperRow.includes('PEMBELIAN') ||
            upperRow.includes('TRANSFER KE');
        const isCredit =
            upperRow.includes(' CR ') ||
            upperRow.endsWith(' CR') ||
            upperRow.includes('CREDIT') ||
            upperRow.includes('SETORAN') ||
            upperRow.includes('TRANSFER DR') ||
            upperRow.includes('BUNGA');

        // If DB/CR not on this row, fall back to balance delta direction.
        let type;
        if (isCredit) {
            type = 'income';
        } else if (isDebit) {
            type = 'spending';
        } else if (previousBalance != null && rowBalance > 0) {
            type = rowBalance > previousBalance ? 'income' : 'spending';
        } else {
            type = 'spending';
        }

        if (rowBalance > 0) previousBalance = rowBalance;

        let description = row
            .replace(/(\d{4})[-/](\d{2})[-/](\d{2})/, '')
            .replace(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/, '')
            // Remove amount patterns WITH optional DB/CR suffix
            .replace(/(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?\s*(?:DB|CR)?\b/gi, '')
            .replace(/\b(DB|CR|DEBIT|CREDIT)\b/gi, '')
            // Remove BCA reference codes
            .replace(/\b\d{4}\/[A-Z]+\/[A-Z]+\d+\b/gi, '')
            .replace(/\bWSID:[A-Z]+\d+\b/gi, '')
            .replace(/[|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!description) description = 'Bank Transaction';

        transactions.push({
            id: generateId(),
            type,
            amount,
            category: type === 'income' ? 'other_income' : autoCategorize(description),
            description: description.substring(0, 120),
            date: new Date(dateStr).toISOString(),
            items: [],
            photos: [],
            paymentMethod: 'bank',
            source: 'pdf_import',
        });
    }

    return transactions;
}

// Generic bank statement parser.
function parseGenericStatement(text, dateFormat = 'international') {
    const transactions = [];
    const lines = text.split(/\n+/);

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line) continue;
        if (isLikelyMetadataLine(line)) continue;

        const next = (lines[i + 1] || '').trim();
        const joined = next ? `${line} ${next}` : line;

        const dateStr = parseDateFromLine(line, dateFormat) || parseDateFromLine(joined, dateFormat);
        if (!dateStr) continue;

        const amount = pickLikelyAmountFromLine(joined);
        if (!amount) continue;

        const upperLine = joined.toUpperCase();
        const isCredit =
            upperLine.includes('CR') ||
            upperLine.includes('CREDIT') ||
            upperLine.includes('DEPOSIT') ||
            upperLine.includes('INCOME') ||
            upperLine.includes('SETORAN') ||
            upperLine.includes('MASUK');

        const type = isCredit ? 'income' : 'spending';

        let description = joined
            .replace(/(\d{4})[-/](\d{2})[-/](\d{2})/, '')
            .replace(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/, '')
            .replace(/(\d{2})-(\d{2})-(\d{4})/, '')
            .replace(/(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?/g, '')
            .replace(/\b(DB|CR|DEBIT|CREDIT)\b/gi, '')
            .replace(/[|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!description) description = 'Bank Transaction';

        transactions.push({
            id: generateId(),
            type,
            amount,
            category: type === 'income' ? 'other_income' : autoCategorize(description),
            description: description.substring(0, 120),
            date: new Date(dateStr).toISOString(),
            items: [],
            photos: [],
            paymentMethod: 'bank',
            source: 'pdf_import',
        });
    }

    return transactions;
}

function dedupeTransactions(transactions) {
    const seen = new Set();
    const out = [];

    // Pass 1: exact dedup by type+amount+date+description
    const exactDeduped = [];
    for (const tx of transactions) {
        const key = `${tx.type}|${tx.amount}|${tx.date.slice(0, 10)}|${tx.description.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        exactDeduped.push(tx);
    }

    // Pass 2: same-date + same-description (normalized) → keep highest amount.
    // This handles the AI double-row bug where one correct entry and one
    // wrong entry (amount pulled from description) appear for the same transaction.
    const descDateMap = new Map();
    for (const tx of exactDeduped) {
        const descNorm = tx.description.toLowerCase().replace(/\s+/g, ' ').trim();
        const dateKey = tx.date.slice(0, 10);
        const groupKey = `${dateKey}|${descNorm}`;
        const existing = descDateMap.get(groupKey);
        if (!existing || tx.amount > existing.amount) {
            descDateMap.set(groupKey, tx);
        }
    }

    return Array.from(descDateMap.values());
}

function stripMetadataNoise(text) {
    return text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !isLikelyMetadataLine(line))
        .join('\n');
}

function normalizeStatementText(text) {
    return String(text || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\u0000/g, ' ')
        .replace(/\u00a0/g, ' ')
        // Keep tabs and internal multiple spaces because they represent table columns.
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function splitStatementTextForParsing(text, maxLines = 180, maxChars = 9000) {
    const normalized = normalizeStatementText(text);
    if (!normalized) return [''];

    const lines = normalized.split('\n');
    const chunks = [];
    let current = [];
    let currentChars = 0;

    const flush = () => {
        if (current.length === 0) return;
        chunks.push(current.join('\n'));
        current = [];
        currentChars = 0;
    };

    for (const line of lines) {
        const nextChars = currentChars + line.length + 1;
        if (current.length >= maxLines || nextChars > maxChars) {
            flush();
        }
        current.push(line);
        currentChars += line.length + 1;
    }
    flush();

    return chunks.length > 0 ? chunks : [normalized];
}

async function processStatementChunkTexts(chunkTexts, fileMeta = {}, extractionLog = null) {
    const forceAI = fileMeta.forceAI === true;
    const enforceMappedColumns = fileMeta.enforceMappedColumns === true;
    const shouldTryAIFirst = forceAI || fileMeta.preferAIFallback === true;

    const normalizedChunks = Array.isArray(chunkTexts) && chunkTexts.length > 0
        ? chunkTexts.map((chunkText) => stripMetadataNoise(String(chunkText || ''))).filter(Boolean)
        : [];

    const effectiveChunks = normalizedChunks.length > 0 ? normalizedChunks : [''];

    const runAIParser = async (phase = 'default') => {
        const aiParsedTransactions = [];
        const startedAt = Date.now();
        let modelId = 'unknown';

        try {
            const { getActiveModelId } = require('./localAI');
            modelId = await getActiveModelId();
        } catch {
            // Keep unknown when model id can't be resolved.
        }

        for (const chunkText of effectiveChunks) {
            try {
                const parsed = await parseStatementWithLocalAI(chunkText, fileMeta.parseHints || null);
                if (parsed.length > 0) {
                    aiParsedTransactions.push(...parsed);
                }
            } catch (aiErr) {
                console.warn('AI parsing failed for chunk, continuing:', aiErr.message);
            }
        }

        const deduped = dedupeTransactions(aiParsedTransactions);
        if (extractionLog) {
            extractionLog.stages.aiParser = {
                attempted: true,
                phase,
                modelId,
                chunks: effectiveChunks.length,
                transactions: deduped.length,
                durationMs: Date.now() - startedAt,
                forced: forceAI,
            };
            fileMeta.extractionLog = extractionLog;
        }

        return deduped;
    };

    if (fileMeta.parseHints?.enabled) {
        const mapped = [];
        for (const chunkText of effectiveChunks) {
            const parsed = parseStatementWithUserMapping(chunkText, fileMeta.parseHints);
            if (parsed.length > 0) mapped.push(...parsed);
        }
        if (mapped.length > 0) {
            if (extractionLog) {
                extractionLog.stages.mappingApplied = {
                    enabled: true,
                    transactions: mapped.length,
                    enforced: enforceMappedColumns,
                };
                fileMeta.extractionLog = extractionLog;
            }
            if (enforceMappedColumns) {
                return dedupeTransactions(mapped);
            }
        }
    }

    if (shouldTryAIFirst) {
        const aiPrimary = await runAIParser('primary');
        if (aiPrimary.length > 0) {
            return aiPrimary;
        }
    }

    // Deterministic parser pass first for OCR text to avoid AI hallucination and improve
    // amount/type accuracy when statement rows are tabular.
    if (fileMeta.useNativeOcr) {
        const deterministic = [];
        for (const chunkText of effectiveChunks) {
            const autoParsed = parseBankStatement(chunkText, 'auto', {
                dateFormat: fileMeta.parseHints?.dateFormat || 'international',
            });
            if (autoParsed.length > 0) deterministic.push(...autoParsed);

            const looseParsed = parseLooseStatementRows(chunkText, fileMeta.parseHints?.dateFormat || 'international');
            if (looseParsed.length > 0) deterministic.push(...looseParsed);
        }

        const deterministicTx = dedupeTransactions(deterministic);
        if (deterministicTx.length > 0) {
            if (extractionLog) {
                extractionLog.stages.deterministicOcrParse = {
                    transactions: deterministicTx.length,
                };
                fileMeta.extractionLog = extractionLog;
            }
            return deterministicTx;
        }
    }

    if (!shouldTryAIFirst) {
        const aiSecondary = await runAIParser('secondary');
        if (aiSecondary.length > 0) {
            return aiSecondary;
        }
    }

    if (!fileMeta.preferAIFallback) {
        const parsedLocal = [];
        for (const chunkText of effectiveChunks) {
            const parsedAuto = parseBankStatement(chunkText, 'auto', {
                dateFormat: fileMeta.parseHints?.dateFormat || 'international',
            });
            if (parsedAuto.length > 0) parsedLocal.push(...parsedAuto);
        }
        if (parsedLocal.length > 0) return dedupeTransactions(parsedLocal);

        const parsedGeneric = [];
        for (const chunkText of effectiveChunks) {
            const parsed = parseBankStatement(chunkText, 'generic', {
                dateFormat: fileMeta.parseHints?.dateFormat || 'international',
            });
            if (parsed.length > 0) parsedGeneric.push(...parsed);
        }
        if (parsedGeneric.length > 0) return dedupeTransactions(parsedGeneric);
    }

    const parsedGeneric = [];
    for (const chunkText of effectiveChunks) {
        const parsed = parseBankStatement(chunkText, 'generic', {
            dateFormat: fileMeta.parseHints?.dateFormat || 'international',
        });
        if (parsed.length > 0) parsedGeneric.push(...parsed);
    }
    if (parsedGeneric.length > 0) return dedupeTransactions(parsedGeneric);

    const parsedLoose = [];
    for (const chunkText of effectiveChunks) {
        const parsed = parseLooseStatementRows(chunkText, fileMeta.parseHints?.dateFormat || 'international');
        if (parsed.length > 0) parsedLoose.push(...parsed);
    }
    if (parsedLoose.length > 0) {
        if (extractionLog) {
            extractionLog.stages.looseRowFallback = {
                transactions: parsedLoose.length,
            };
            fileMeta.extractionLog = extractionLog;
        }
        return dedupeTransactions(parsedLoose);
    }

    return [];
}

async function parsePdfStatementText(text, fileMeta = {}) {
    const chunks = splitStatementTextForParsing(text);
    return processStatementChunkTexts(chunks, fileMeta, fileMeta.extractionLog || null);
}

function parseBankStatement(text, bankType = 'auto', options = {}) {
    if (!text || text.trim().length === 0) {
        return [];
    }

    const upperText = text.toUpperCase();
    let detectedType = bankType;
    const dateFormat = options.dateFormat === 'us' ? 'us' : 'international';

    if (detectedType === 'auto') {
        if (upperText.includes('BCA') || upperText.includes('BANK CENTRAL ASIA')) {
            detectedType = 'bca';
        } else {
            detectedType = 'generic';
        }
    }

    const parsed = detectedType === 'bca'
        ? parseBCAStatement(text, dateFormat)
        : parseGenericStatement(text, dateFormat);

    return dedupeTransactions(parsed);
}

// Read PDF text content locally.
// This implementation tries raw printable extraction and Flate stream decompression.
async function extractTextFromPDF(fileUri, fileMeta = {}) {
    const FileSystem = require('expo-file-system');

    if (!fileUri) {
        throw new Error('No PDF file URI was provided.');
    }

    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!cacheDir) {
        throw new Error('Could not access app cache directory.');
    }

    const extractionLog = {
        fileUri,
        fileName: fileMeta.name,
        useOcr: fileMeta.useNativeOcr,
        timestamp: new Date().toISOString(),
        stages: {},
    };

    const targetUri = `${cacheDir}${Date.now()}_${toSafePdfPath(fileMeta.name || 'statement.pdf')}`;

    const uriCandidates = [fileUri];
    if (fileUri.includes(' ')) {
        uriCandidates.push(encodeURI(fileUri));
    }

    let readableUri = fileUri;
    for (const candidateUri of uriCandidates) {
        try {
            await FileSystem.copyAsync({ from: candidateUri, to: targetUri });
            const copiedInfo = await FileSystem.getInfoAsync(targetUri);
            if (copiedInfo.exists) {
                readableUri = targetUri;
                break;
            }
        } catch (_) {
            // Try next URI candidate.
        }

        const candidateInfo = await FileSystem.getInfoAsync(candidateUri);
        if (candidateInfo.exists) {
            readableUri = candidateUri;
            break;
        }
    }

    const fileInfo = await FileSystem.getInfoAsync(readableUri);
    if (!fileInfo.exists) {
        throw new Error('Selected PDF is no longer accessible. Please pick the file again.');
    }

    try {
        const extracted = await extractPdfTextChunks(readableUri, { maxPagesPerChunk: 2 });
        let combinedText = normalizeStatementText(extracted.text || '');

        extractionLog.stages.pdfExtracted = {
            length: combinedText.length,
            lines: combinedText ? combinedText.split('\n').length : 0,
            preview: combinedText.substring(0, 200),
            pageCount: extracted.pageCount,
            chunks: extracted.chunks.length,
        };

        extractionLog.stages.pdfChunks = extracted.chunks.map((chunk) => ({
            startPage: chunk.startPage,
            endPage: chunk.endPage,
            length: chunk.length,
            preview: chunk.text.substring(0, 120),
        }));

        if (!combinedText) {
            const base64Raw = await FileSystem.readAsStringAsync(readableUri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            const rawBinary = base64ToBinaryString(base64Raw);
            const fallbackText = normalizeStatementText(extractLikelyPdfText(rawBinary) || '');

            extractionLog.stages.rawPdfFallback = {
                length: fallbackText.length,
                lines: fallbackText ? fallbackText.split('\n').length : 0,
                preview: fallbackText.substring(0, 200),
            };

            combinedText = fallbackText;
        }

        if (!combinedText) {
            fileMeta.extractionLog = extractionLog;
            return [];
        }

        let cleanedExtracted = stripMetadataNoise(combinedText);
        extractionLog.stages.afterMetadataClean = {
            length: cleanedExtracted.length,
            lines: cleanedExtracted.split('\n').length,
        };

        // Use OCR+AI mode as a strict PDF text extraction + AI pipeline.
        // The page extraction is already split into max 2-page chunks.
        extractionLog.stages.ocrCheckNeeded = !!fileMeta.useNativeOcr;

        fileMeta.extractionLog = extractionLog;

        const chunkTexts = extracted.chunks.length > 0
            ? extracted.chunks.map((chunk) => stripMetadataNoise(normalizeStatementText(chunk.text))).filter(Boolean)
            : [cleanedExtracted];

        return processStatementChunkTexts(chunkTexts, fileMeta, extractionLog);
    } catch (extractionErr) {
        extractionLog.stages.ocrFailed = extractionErr?.message || 'PDF extraction failed';
        fileMeta.extractionLog = extractionLog;
        throw extractionErr;
    }
}

module.exports = { parseBankStatement };
