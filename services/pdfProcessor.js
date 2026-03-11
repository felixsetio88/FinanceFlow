// PDF Bank Statement Processor
// Parses BCA-style bank statements and other common formats

import { autoCategorize } from '../utils/categories';
import { generateId } from '../utils/helpers';

// Parse BCA bank statement text
function parseBCAStatement(text) {
    const transactions = [];
    const lines = text.split('\n');

    // BCA format patterns:
    // DD/MM  DESCRIPTION  AMOUNT  DB/CR  BALANCE
    // or: DD/MM/YYYY  DESCRIPTION  AMOUNT
    const datePattern = /(\d{2}\/\d{2}(?:\/\d{4})?)\s+/;
    const amountPattern = /[\d,]+\.\d{2}/g;

    let currentYear = new Date().getFullYear();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const dateMatch = line.match(datePattern);
        if (!dateMatch) continue;

        const datePart = dateMatch[1];
        const parts = datePart.split('/');

        let dateStr;
        if (parts.length === 3) {
            dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (parts.length === 2) {
            dateStr = `${currentYear}-${parts[1]}-${parts[0]}`;
        } else {
            continue;
        }

        // Extract amounts
        const amounts = line.match(amountPattern);
        if (!amounts || amounts.length === 0) continue;

        // Get description (text between date and first amount)
        const dateEnd = line.indexOf(dateMatch[0]) + dateMatch[0].length;
        const firstAmountIdx = line.indexOf(amounts[0]);
        let description = line.substring(dateEnd, firstAmountIdx).trim();

        // Clean description
        description = description.replace(/\s+/g, ' ').trim();
        if (!description) description = 'Bank Transaction';

        // Parse amount
        const amountStr = amounts[0].replace(/,/g, '');
        const amount = parseFloat(amountStr) || 0;
        if (amount === 0) continue;

        // Determine if debit or credit
        const upperLine = line.toUpperCase();
        const isDebit = upperLine.includes('DB') || upperLine.includes('DEBIT') || upperLine.includes('TARIKAN') || upperLine.includes('PEMBELIAN') || upperLine.includes('TRANSFER KE');
        const isCredit = upperLine.includes('CR') || upperLine.includes('CREDIT') || upperLine.includes('SETORAN') || upperLine.includes('TRANSFER DR') || upperLine.includes('BUNGA');

        let type = 'spending';
        if (isCredit) {
            type = 'income';
        } else if (isDebit) {
            type = 'spending';
        }

        const category = type === 'income' ? 'other_income' : autoCategorize(description);

        transactions.push({
            id: generateId(),
            type,
            amount,
            category,
            description,
            date: new Date(dateStr).toISOString(),
            items: [],
            photos: [],
            paymentMethod: 'bank',
            source: 'pdf_import',
        });
    }

    return transactions;
}

// Generic bank statement parser
function parseGenericStatement(text) {
    const transactions = [];
    const lines = text.split('\n');

    // Try to find lines with dates and amounts
    const datePatterns = [
        /(\d{4}-\d{2}-\d{2})/,           // YYYY-MM-DD
        /(\d{2}\/\d{2}\/\d{4})/,         // DD/MM/YYYY
        /(\d{2}-\d{2}-\d{4})/,           // DD-MM-YYYY
        /(\d{2}\s\w{3}\s\d{4})/,         // DD Mon YYYY
    ];

    for (const line of lines) {
        if (!line.trim()) continue;

        let dateStr = null;
        for (const pattern of datePatterns) {
            const match = line.match(pattern);
            if (match) {
                dateStr = match[1];
                break;
            }
        }

        if (!dateStr) continue;

        // Find amounts
        const amounts = line.match(/[\d,]+\.?\d{0,2}/g);
        if (!amounts || amounts.length === 0) continue;

        // Get the largest amount as the transaction amount
        const parsedAmounts = amounts.map(a => parseFloat(a.replace(/,/g, '')) || 0).filter(a => a > 0);
        if (parsedAmounts.length === 0) continue;

        const amount = Math.max(...parsedAmounts);

        // Extract description
        let description = line.replace(/[\d,]+\.?\d{0,2}/g, '').replace(dateStr, '').trim();
        description = description.replace(/[|]/g, '').replace(/\s+/g, ' ').trim() || 'Bank Transaction';

        const upperLine = line.toUpperCase();
        const isCredit = upperLine.includes('CR') || upperLine.includes('CREDIT') || upperLine.includes('DEPOSIT') || upperLine.includes('INCOME');

        const type = isCredit ? 'income' : 'spending';
        const category = type === 'income' ? 'other_income' : autoCategorize(description);

        transactions.push({
            id: generateId(),
            type,
            amount,
            category,
            description: description.substring(0, 100),
            date: new Date(dateStr).toISOString(),
            items: [],
            photos: [],
            paymentMethod: 'bank',
            source: 'pdf_import',
        });
    }

    return transactions;
}

export function parseBankStatement(text, bankType = 'auto') {
    if (!text || text.trim().length === 0) {
        return [];
    }

    const upperText = text.toUpperCase();

    // Auto-detect bank
    if (bankType === 'auto') {
        if (upperText.includes('BCA') || upperText.includes('BANK CENTRAL ASIA')) {
            bankType = 'bca';
        }
    }

    switch (bankType) {
        case 'bca':
            return parseBCAStatement(text);
        default:
            return parseGenericStatement(text);
    }
}

// Read PDF text content
// Note: On React Native, we'll use a simpler approach since pdf-parse requires Node.js
// We'll extract text from PDF using a fetch-based approach or send to AI for extraction
export async function extractTextFromPDF(fileUri, apiKey, endpoint) {
    // For React Native, we can use the AI to extract text from PDF
    // Read the file as base64
    const FileSystem = require('expo-file-system');
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
    });

    if (apiKey && endpoint) {
        // Use AI to extract structured data from PDF
        const response = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'qwen-vl-max',
                messages: [
                    {
                        role: 'system',
                        content: `You are a bank statement parser. Extract all transactions from the bank statement PDF/image and return them as a JSON array. Each transaction should have:
{
  "date": "YYYY-MM-DD",
  "description": "string",
  "amount": number (positive),
  "type": "spending" or "income",
  "category": "string"
}
Return ONLY valid JSON array, no other text.`,
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: { url: `data:application/pdf;base64,${base64}` },
                            },
                            {
                                type: 'text',
                                text: 'Extract all transactions from this bank statement. Parse dates, descriptions, amounts, and whether each is income or spending.',
                            },
                        ],
                    },
                ],
                max_tokens: 4000,
                temperature: 0.1,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';
            try {
                const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleaned);
                return parsed.map(t => ({
                    id: generateId(),
                    type: t.type || 'spending',
                    amount: Math.abs(t.amount || 0),
                    category: t.category || autoCategorize(t.description || ''),
                    description: t.description || 'Bank Transaction',
                    date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
                    items: [],
                    photos: [],
                    paymentMethod: 'bank',
                    source: 'pdf_import',
                }));
            } catch {
                // Fallback to text parsing
            }
        }
    }

    // Fallback: try basic text extraction
    // This is limited on React Native but provides a fallback
    return [];
}
